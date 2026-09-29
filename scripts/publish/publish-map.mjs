// Publishes the public map as files, so visitors never ask the database.
//
//   node scripts/publish/publish-map.mjs            writes public/data/
//
// Three things (shape A of docs/review-2026-09-29.md, section 8, stage 7 of the
// clean-up; since 2026-09-29):
//   data/index.json         schema 2: every route, its names, every hotspot,
//                           the links, and each direction's *overview* — its
//                           line thinned at 5 m with 5-decimal coordinates,
//                           a quarter of the points, invisible at the zooms
//                           the whole map is seen at — and its length in
//                           metres, measured on the full line, so a trip's
//                           Kilometer and fare never read an overview. The
//                           map draws from it.
//   data/lines/<id>.json    each direction's full line (below), fetched when
//                           the direction is lit or opened.
//   data/map.json           schema 1, everything in full as before, for one
//                           release: an installed app that has not updated
//                           reads it. Drop it a month at least after the
//                           index ships (src/commuter/mapFile.ts has the
//                           rule), with its commit line in the workflow.
// A line file of a direction that no longer exists is removed.
//
// Reads the public tables over Supabase's REST API with the publishable key
// (from .env.production, or SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY in the
// environment), exactly the columns the public map shows: no owner ids, no
// control points, no segments. Each direction's line is thinned to within
// half a metre of the original and rounded to 6 decimals (about 0.1 m): the
// router's points every metre or two on a straight road go, the bends
// stay. It was 5 m and 5 decimals until 2026-09-25, when the owner zoomed
// to a street and saw the lines cut the corners and the two routes that
// share the road out of Tala braid across each other, each thinned on its
// own; at zoom 20 five metres is sixty pixels. A hotspot's point and box
// are rounded to 6 decimals as well: the editor saves them with 15 or
// more, and those digits were half the file.
//
// The file is written the same way every time: fixed key order, fixed row
// order, and `published_at` is carried over from the previous file when
// nothing else changed. So a run on unchanged data writes a byte-identical
// file, and the workflow that runs this daily commits only real changes.
//
// The script checks its own work before writing: every original point must
// lie within half a metre of the thinned line, or it fails. And it refuses to
// publish a map that shrank suddenly — a table that answers with no rows is a
// normal HTTP 200, so without this a policy slip would blank the public map
// and deploy it. `--force` overrides that one check, for a deliberate removal.
//
// No dependencies: Node's own fetch, zlib and fs. Keep it that way, so the
// workflow needs no `npm ci`.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

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
const DATA = join(root, 'public', 'data')
const OUT = join(DATA, 'map.json')
const INDEX = join(DATA, 'index.json')
const LINES = join(DATA, 'lines')
const FORCE = process.argv.includes('--force')

/**
 * Douglas–Peucker tolerance. With 6-decimal rounding (≤ 0.08 m) the total
 * stays under half a metre: the lit line is 10 px wide at zoom 20, where a
 * pixel is 7 cm, so the drawn line never leaves its own width.
 */
const SIMPLIFY_M = 0.3
const MAX_DEVIATION_M = 0.5
/**
 * The overview in the index: 5 m and 5 decimals (about 1 m), the file's diet
 * before 2026-09-25. At zoom 14 a pixel is 7 m, so it is the full line to the
 * eye until a direction is lit, and then the full line is there.
 */
const OVERVIEW_M = 5
const OVERVIEW_MAX_DEVIATION_M = 7
/** A collection that lost more than this share of its rows since the last file is not published without --force. */
const MAX_SHRINK = 0.3
/** PostgREST answers at most this many rows per request; ask page by page. */
const PAGE = 1000
const TIMEOUT_MS = 30_000

/** The data's licence, written into the file itself. See README.md, "Data and licence". */
/** map.json's shape, 1: the older apps read it as it is, so it stays 1 (src/commuter/mapFile.ts has the rules). */
const SCHEMA = 1
/** The index's shape; must equal MAP_FILE_SCHEMA in src/commuter/mapFile.ts. */
const INDEX_SCHEMA = 2
const LICENSE = 'ODbL-1.0'
const ATTRIBUTION =
  'Route data © ParaPo contributors, ODbL (https://opendatacommons.org/licenses/odbl/1-0/). ' +
  'Derived from OpenStreetMap, © OpenStreetMap contributors.'

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

/** Great-circle metres, as the app measures them (src/shared/geo/geo.ts, haversine). */
function haversine([lng1, lat1], [lng2, lat2]) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a))
}
/** A published line's length, as the app's lineLength measures it, to the centimetre. */
function lineMetres(coords) {
  let m = 0
  for (let i = 1; i < coords.length; i++) m += haversine(coords[i - 1], coords[i])
  return Math.round(m * 100) / 100
}

/** Six decimals: about 0.1 m, for a line's points and a hotspot's corners alike. */
const round6 = (n) => Math.round(n * 1e6) / 1e6
/** Five decimals, about 1 m: the overview's. */
const round5 = (n) => Math.round(n * 1e5) / 1e5
/** A Point or Polygon with every coordinate rounded to 6 decimals; anything else as it came. */
function roundGeometry(g) {
  if (!g || typeof g !== 'object') return g
  if (g.type === 'Point' && Array.isArray(g.coordinates)) {
    return { ...g, coordinates: g.coordinates.map(round6) }
  }
  if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
    return { ...g, coordinates: g.coordinates.map((ring) => ring.map((c) => c.map(round6))) }
  }
  return g
}

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
    'route_variant?select=id,route_id,direction_name,origin_terminal,destination_terminal,shape,confidence,reversed,' +
      'route:route(id,signboard,long_name,mode,fare_note,head_stop_id,tail_stop_id,via)&order=id.asc',
  ),
  rest('stop?select=id,name,informal,aliases,kind,point,area,note,created_at&order=id.asc'),
  rest('route_stop?select=route_variant_id,stop_id,stop_sequence&order=route_variant_id.asc,stop_sequence.asc,stop_id.asc'),
])

// ---------------------------------------------------------------- assemble

// Names are generated from the hotspots at each route's ends and never stored
// (PLAN.md, "Naming and creating a route", 2026-09-21). The file carries the
// generated strings so visitors need no join; a renamed hotspot shows on the
// next publish. Mirrors routeName / directionName in src/shared/model/routes.ts.
const DASH = '–'
// A hotspot's informal name — what people say — is what a route name reads;
// the name on the ground is the fallback. Mirrors stopLabel in src/shared/model/stops.ts (0007).
const stopLabel = (s) => (s.informal && s.informal.trim()) || s.name
const stopName = new Map(stopRows.map((s) => [s.id, stopLabel(s)]))
const routeName = (head, tail, via) =>
  via && via.trim() ? `${head} ${DASH} ${tail} via ${via.trim()}` : `${head} ${DASH} ${tail}`
const directionName = (head, tail, reversed) => (reversed ? `${tail} → ${head}` : `${head} → ${tail}`)

const stats = []
/** Each direction's overview, by id: its line at 5 m, 5 decimals. */
const overviews = new Map()
const variants = variantRows.map((v) => {
  if (!v.route) {
    fail(`FAIL  direction ${v.id} came without its route: is the route table still readable?`)
  }
  const head = stopName.get(v.route.head_stop_id)
  const tail = stopName.get(v.route.tail_stop_id)
  if (!head || !tail) {
    // The foreign keys make this impossible unless the stop table was not fully readable.
    fail(`FAIL  route ${v.route.id}: an end hotspot is missing from the stop rows (${v.route.head_stop_id}, ${v.route.tail_stop_id})`)
  }
  const name = routeName(head, tail, v.route.via)
  const direction = directionName(head, tail, v.reversed)
  const coords = Array.isArray(v.shape?.coordinates) ? v.shape.coordinates : []
  let shape = null
  if (coords.length > 1) {
    const k = mPerDegLng(coords[0][1])
    const slim = simplify(coords, SIMPLIFY_M, k).map(([x, y]) => [round6(x), round6(y)])
    const dev = maxDeviation(coords, slim, k)
    if (dev > MAX_DEVIATION_M) {
      fail(`FAIL  "${name}" ${direction}: simplified line strays ${dev.toFixed(1)} m from the original`)
    }
    // The overview is thinned from the original, not from the full line, and
    // checked the same way against its own, looser bound.
    const rough = simplify(coords, OVERVIEW_M, k).map(([x, y]) => [round5(x), round5(y)])
    const roughDev = maxDeviation(coords, rough, k)
    if (roughDev > OVERVIEW_MAX_DEVIATION_M) {
      fail(`FAIL  "${name}" ${direction}: its overview strays ${roughDev.toFixed(1)} m from the original`)
    }
    stats.push({ name: `${name} · ${direction}`, before: coords.length, after: slim.length, overview: rough.length, dev })
    shape = { type: 'LineString', coordinates: slim }
    overviews.set(v.id, { type: 'LineString', coordinates: rough })
  }
  // Key order is the file's contract; keep it fixed. A direction with no line
  // yet is published as it is — shape null — so a card can offer the flip and
  // say the return trip is not mapped yet.
  return {
    id: v.id,
    route_id: v.route_id,
    direction_name: direction,
    origin_terminal: v.origin_terminal,
    destination_terminal: v.destination_terminal,
    shape,
    reversed: v.reversed,
    confidence: v.confidence,
    route: {
      id: v.route.id,
      signboard: v.route.signboard,
      long_name: v.route.long_name,
      mode: v.route.mode,
      fare_note: v.route.fare_note,
      head_stop_id: v.route.head_stop_id,
      tail_stop_id: v.route.tail_stop_id,
      via: v.route.via,
      name,
    },
  }
})

const stops = stopRows.map((s) => ({
  id: s.id,
  name: s.name,
  informal: s.informal ?? null,
  aliases: Array.isArray(s.aliases) ? s.aliases : [],
  kind: s.kind,
  point: roundGeometry(s.point),
  area: roundGeometry(s.area),
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
let previousText = null
try {
  previousText = readFileSync(OUT, 'utf8')
  previous = JSON.parse(previousText)
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

// The terms travel inside the file, so no copy can arrive without them. The
// shape number first: an installed app reads whatever this path serves, and
// checks the number against the one it knows (src/commuter/mapFile.ts has the
// rules for changing it — a new shape goes to a new path).
const file = JSON.stringify({ schema: SCHEMA, published_at, license: LICENSE, attribution: ATTRIBUTION, ...body }) + '\n'
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, file)

// The index: the same rows with each line's overview in place of the line,
// under its own key — the reader knows an overview when it sees one.
const indexBody = {
  variants: variants.map(({ shape, ...v }) => {
    const { route, ...rest } = v
    return { ...rest, overview: overviews.get(v.id) ?? null, metres: shape ? lineMetres(shape.coordinates) : null, route }
  }),
  stops,
  links,
}
const indexFile =
  JSON.stringify({ schema: INDEX_SCHEMA, published_at, license: LICENSE, attribution: ATTRIBUTION, ...indexBody }) + '\n'
const previousIndex = existsSync(INDEX) ? readFileSync(INDEX, 'utf8') : null
writeFileSync(INDEX, indexFile)

// A line per drawn direction, written only when it changed, and the files of
// directions gone removed, so an unchanged map touches nothing.
mkdirSync(LINES, { recursive: true })
const lineFiles = new Set()
let linesWritten = 0
for (const v of variants) {
  if (!v.shape) continue
  const path = join(LINES, `${v.id}.json`)
  // No date in it: a line file changes only when its line does.
  const text = JSON.stringify({ schema: INDEX_SCHEMA, id: v.id, shape: v.shape }) + '\n'
  lineFiles.add(`${v.id}.json`)
  if (existsSync(path) && readFileSync(path, 'utf8') === text) continue
  writeFileSync(path, text)
  linesWritten++
}
let linesRemoved = 0
for (const f of readdirSync(LINES)) {
  if (f.endsWith('.json') && !lineFiles.has(f)) {
    rmSync(join(LINES, f))
    linesRemoved++
  }
}

// ------------------------------------------------------------------ report

for (const s of stats) console.log(`  ${s.name}: ${s.before} → ${s.after} points, within ${s.dev.toFixed(1)} m; overview ${s.overview}`)
const gz = gzipSync(Buffer.from(file)).length
console.log(
  // By the bytes, not the map content: new terms in an unchanged map are still a change to commit.
  `${previousText === file ? 'Unchanged' : 'Wrote'} public/data/map.json: ${variants.length} direction(s), ${stops.length} hotspot(s), ` +
    `${links.length} link(s); ${file.length} bytes, ${gz} gzipped; published_at ${published_at}`,
)
const indexGz = gzipSync(Buffer.from(indexFile)).length
console.log(
  `${previousIndex === indexFile ? 'Unchanged' : 'Wrote'} public/data/index.json: ${indexFile.length} bytes, ${indexGz} gzipped; ` +
    `lines/: ${lineFiles.size} file(s), ${linesWritten} written, ${linesRemoved} removed`,
)
