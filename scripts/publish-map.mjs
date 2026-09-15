// Publishes the public map as one file, so visitors never ask the database.
//
//   node scripts/publish-map.mjs            writes public/data/map.json
//
// Reads the public tables over Supabase's REST API with the publishable key
// (from .env.production, or SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY in the
// environment), exactly the columns the public map shows: no owner ids, no
// control points, no segments. Each direction's line is simplified to within
// 5 m of the original and rounded to 5 decimals (about 1 m), which makes it
// several times smaller and looks the same at any zoom the map offers.
//
// The file is written the same way every time: fixed key order, fixed row
// order, and `published_at` is carried over from the previous file when
// nothing else changed. So a run on unchanged data writes a byte-identical
// file, and the workflow that runs this daily commits only real changes.
//
// The script checks its own work before writing: every original point must
// lie within 5 m of the simplified line, or it fails. And it refuses to
// publish a map that shrank suddenly — a table that answers with no rows is a
// normal HTTP 200, so without this a policy slip would blank the public map
// and deploy it. `--force` overrides that one check, for a deliberate removal.
//
// No dependencies: Node's own fetch, zlib and fs. Keep it that way, so the
// workflow needs no `npm ci`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Says why, sets the exit code and stops. Not process.exit(): on Windows, Node 24 asserts when that runs with a fetch timeout still pending. */
function fail(message) {
  console.error(message)
  process.exitCode = 1
  throw new Stop()
}
class Stop extends Error {}
process.on('uncaughtException', (e) => {
  if (!(e instanceof Stop)) {
    console.error(e)
    process.exitCode = 1
  }
})
const OUT = join(root, 'public', 'data', 'map.json')
const FORCE = process.argv.includes('--force')

/** Douglas–Peucker tolerance. With 5-decimal rounding (≤ 0.8 m) the total stays under 5 m. */
const SIMPLIFY_M = 4.2
const MAX_DEVIATION_M = 5
/** A collection that lost more than this share of its rows since the last file is not published without --force. */
const MAX_SHRINK = 0.3
/** PostgREST answers at most this many rows per request; ask page by page. */
const PAGE = 1000
const TIMEOUT_MS = 30_000

// ------------------------------------------------------------------ config

/** KEY=value lines; a quoted value keeps what is inside the quotes; # starts a comment. */
function readEnvFile(path) {
  const out = {}
  if (!existsSync(path)) return out
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#]*?))\s*(?:#.*)?$/.exec(line)
    if (m) out[m[1]] = m[2] ?? m[3] ?? m[4] ?? ''
  }
  return out
}

const envFile = readEnvFile(join(root, '.env.production'))
const URL_BASE = process.env.SUPABASE_URL ?? envFile.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? envFile.VITE_SUPABASE_PUBLISHABLE_KEY
if (!URL_BASE || !KEY) {
  fail('No Supabase URL and publishable key: set them in .env.production or the environment.')
}

/** One page of a table, with a timeout and one retry: a hung connection must not hold the daily job. */
async function page(path, from) {
  const attempt = async () => {
    const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + PAGE - 1}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok && res.status !== 206) throw new Error(`${path.split('?')[0]}: HTTP ${res.status} ${await res.text()}`)
    return res.json()
  }
  try {
    return await attempt()
  } catch (e) {
    if (e instanceof Error && /HTTP 4\d\d/.test(e.message)) throw e
    return attempt()
  }
}

/** Every row of a table, however many. */
async function rest(path) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const chunk = await page(path, from)
    rows.push(...chunk)
    if (chunk.length < PAGE) return rows
  }
}

// ---------------------------------------------------------------- geometry

const M_PER_DEG_LAT = 110_574
const mPerDegLng = (lat) => 111_320 * Math.cos((lat * Math.PI) / 180)

/** Metres from p to the segment a–b, in a local flat frame around lat0. */
function distToSegment(p, a, b, k) {
  const px = (p[0] - a[0]) * k
  const py = (p[1] - a[1]) * M_PER_DEG_LAT
  const bx = (b[0] - a[0]) * k
  const by = (b[1] - a[1]) * M_PER_DEG_LAT
  const len2 = bx * bx + by * by
  let t = len2 ? (px * bx + py * by) / len2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - bx * t, py - by * t)
}

/** Douglas–Peucker: keep the points that hold the line within `epsilon` metres. */
function simplify(coords, epsilon, k) {
  if (coords.length <= 2) return coords.slice()
  const keep = new Array(coords.length).fill(false)
  keep[0] = keep[coords.length - 1] = true
  const stack = [[0, coords.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let worst = -1
    let worstD = epsilon
    for (let i = a + 1; i < b; i++) {
      const d = distToSegment(coords[i], coords[a], coords[b], k)
      if (d > worstD) {
        worstD = d
        worst = i
      }
    }
    if (worst >= 0) {
      keep[worst] = true
      stack.push([a, worst], [worst, b])
    }
  }
  return coords.filter((_, i) => keep[i])
}

const round5 = (n) => Math.round(n * 1e5) / 1e5

/**
 * The largest distance from any original point to the simplified line. Every
 * segment is tried for every point: a route that doubles back on itself has
 * its nearest segment anywhere, and a few hundred by a hundred is nothing.
 */
function maxDeviation(original, simplified, k) {
  let worst = 0
  for (const p of original) {
    let best = Infinity
    for (let i = 0; i + 1 < simplified.length; i++) {
      const d = distToSegment(p, simplified[i], simplified[i + 1], k)
      if (d < best) best = d
    }
    if (best > worst) worst = best
  }
  return worst
}

// ------------------------------------------------------------------- fetch

// Rows ordered by id, not by when they were saved: re-saving a direction with
// the same geometry must not reorder the file and commit a change nobody can
// see. (The map draws them in file order, which nothing depends on.)
const [variantRows, stopRows, linkRows] = await Promise.all([
  rest(
    'route_variant?select=id,route_id,direction_name,origin_terminal,destination_terminal,shape,confidence,' +
      'route:route(id,signboard,long_name,mode,fare_note)&order=id.asc',
  ),
  rest('stop?select=id,name,kind,point,area,note,created_at&order=id.asc'),
  rest('route_stop?select=route_variant_id,stop_id,stop_sequence&order=route_variant_id.asc,stop_sequence.asc,stop_id.asc'),
])

// ---------------------------------------------------------------- assemble

const stats = []
const variants = variantRows.map((v) => {
  if (!v.route) {
    fail(`FAIL  direction ${v.id} (${v.direction_name}) came without its route: is the route table still readable?`)
  }
  const coords = Array.isArray(v.shape?.coordinates) ? v.shape.coordinates : []
  let shape = null
  if (coords.length > 1) {
    const k = mPerDegLng(coords[0][1])
    const slim = simplify(coords, SIMPLIFY_M, k).map(([x, y]) => [round5(x), round5(y)])
    const dev = maxDeviation(coords, slim, k)
    if (dev > MAX_DEVIATION_M) {
      fail(`FAIL  "${v.route?.signboard}" ${v.direction_name}: simplified line strays ${dev.toFixed(1)} m from the original`)
    }
    stats.push({ name: `${v.route?.signboard} · ${v.direction_name}`, before: coords.length, after: slim.length, dev })
    shape = { type: 'LineString', coordinates: slim }
  }
  // Key order is the file's contract; keep it fixed.
  return {
    id: v.id,
    route_id: v.route_id,
    direction_name: v.direction_name,
    origin_terminal: v.origin_terminal,
    destination_terminal: v.destination_terminal,
    shape,
    confidence: v.confidence,
    route: {
      id: v.route.id,
      signboard: v.route.signboard,
      long_name: v.route.long_name,
      mode: v.route.mode,
      fare_note: v.route.fare_note,
    },
  }
})

const stops = stopRows.map((s) => ({
  id: s.id,
  name: s.name,
  kind: s.kind,
  point: s.point,
  area: s.area,
  note: s.note,
  created_at: s.created_at,
}))

const links = linkRows.map((l) => ({
  route_variant_id: l.route_variant_id,
  stop_id: l.stop_id,
  stop_sequence: l.stop_sequence,
}))

// `published_at` is carried over when nothing else changed, so an unchanged
// map is a byte-identical file and the daily workflow has nothing to commit.
const body = { variants, stops, links }
let previous = null
try {
  previous = JSON.parse(readFileSync(OUT, 'utf8'))
} catch {}

// A map that shrank suddenly is far more likely a read that went wrong (a
// policy change, a table made private) than a clear-out. Refuse it unless told.
if (previous && !FORCE) {
  for (const key of ['variants', 'stops', 'links']) {
    const before = Array.isArray(previous[key]) ? previous[key].length : 0
    const after = body[key].length
    if (before > 0 && after < before * (1 - MAX_SHRINK)) {
      fail(
        `FAIL  ${key}: ${before} → ${after} rows, more than ${MAX_SHRINK * 100}% fewer than the published file. ` +
          'Not publishing. If the removal is deliberate, run with --force.',
      )
    }
  }
}

const same =
  previous && JSON.stringify({ variants: previous.variants, stops: previous.stops, links: previous.links }) === JSON.stringify(body)
const published_at = same ? previous.published_at : new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

const file = JSON.stringify({ published_at, ...body }) + '\n'
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, file)

// ------------------------------------------------------------------ report

for (const s of stats) console.log(`  ${s.name}: ${s.before} → ${s.after} points, within ${s.dev.toFixed(1)} m`)
const gz = gzipSync(Buffer.from(file)).length
console.log(
  `${same ? 'Unchanged' : 'Wrote'} public/data/map.json: ${variants.length} direction(s), ${stops.length} hotspot(s), ` +
    `${links.length} link(s); ${file.length} bytes, ${gz} gzipped; published_at ${published_at}`,
)
