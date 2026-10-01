// The studio's save flows, signed in, against a stand-in for the database.
//
//   npm run dev                          (in another terminal)
//   node tests/e2e/save-test.mjs         # against http://localhost:5173
//
// The other suites run signed out, so until 2026-09-29 nothing in
// routesWrite.ts or stopsWrite.ts ran under a check (docs/review-2026-09-29.md,
// section 4). This one grew from the stand-in the review drove them with
// (studio-standin.mjs): the tables are today's published map plus 500 hintuans far
// off the map, held in memory and answered the way PostgREST answers — the
// filters the studio sends, its unique indexes (409, code 23505), its foreign
// keys and cascades — and a stored session is faked so ✓ Done opens the save
// panel. The basemap is a flat grey and the router has no roads, so every
// line is freehand and the suite needs no network, no account and no router.
// Nothing reaches the live tables.
//
// What it checks, each against the finding it guards (the review's numbers):
// the pill counts routes (7) and the stop table is read once a load (6); a
// route saved with its slot, the return trip offered while the slot is empty
// and written into it (2); an edit that writes one row and offers no return
// trip (2); a delete that empties the direction into a slot and a redraw that
// fills it again (3), a refused step of it said (16); every request line
// short with 500 hintuans (4); a hotspot saved with its links, and the
// directions read again after it (8); a route's end refused a delete in
// words (15);
// undo to no points leaving no draft (12); a link sync that fails and a retry
// that updates rather than inserts (13); the drawing keys alive after signing
// in from Done (9); no React warnings (the duplicate key). And the camera
// with the cards, the public map's in the studio too (the owner, 2026-09-30):
// a trip opened on its whole route, beside the card.
import { chromium } from 'playwright'
import { readPublished } from './lib/big-map.mjs'
import { BASE, bareStyle, harness } from './lib/harness.mjs'

/** The project ref in VITE_SUPABASE_URL, which names the storage key. */
const PROJECT_REF = 'smzwbqxttdyvohuizynl'
/** A request line past this is trouble at the gateway; the link sync once sent 19 kB. */
const URL_LIMIT = 2000

const { check, tally } = harness()

// ------------------------------------------------------------- the tables
const m = readPublished()
const now = '2026-09-25T12:00:00+00:00'
const OWNER = '11111111-1111-4111-8111-111111111111'
const route = new Map()
for (const v of m.variants) {
  route.set(v.route.id, {
    id: v.route.id, owner_id: OWNER, signboard: v.route.signboard ?? null, route_code: null, short_name: null,
    long_name: v.route.long_name ?? null, mode: v.route.mode, fare_note: v.route.fare_note ?? null, fare_as_of: null,
    head_stop_id: v.route.head_stop_id, tail_stop_id: v.route.tail_stop_id, via: v.route.via ?? null, created_at: now, updated_at: now,
  })
}
const tables = {
  route: [...route.values()],
  route_variant: m.variants.map((v) => ({
    id: v.id, route_id: v.route_id, owner_id: OWNER, direction_name: null, origin_terminal: null, destination_terminal: null,
    shape: v.shape,
    // 0009's overview: the published file's line is thinned already, and serves.
    overview: v.shape,
    control_points: v.shape ? [v.shape.coordinates[0], v.shape.coordinates.at(-1)] : [],
    segments: v.shape ? [{ snap: 'snapped', coordinates: v.shape.coordinates, streets: [] }] : [],
    reversed: v.reversed, confidence: v.confidence ?? 'drawn', borrowed_from: null, borrowed_part: null, borrowed_m: null,
    signboards: [], created_at: now, updated_at: now,
  })),
  stop: m.stops.map((s) => ({ ...s, owner_id: OWNER, created_at: now })),
  route_stop: m.links.map((l) => ({ route_variant_id: l.route_variant_id, stop_id: l.stop_id, stop_sequence: l.stop_sequence })),
}

// Everything is placed from the data's own box: the empty ground east of it,
// where the suite draws, and the 500 extra hintuans further east still.
const all = m.variants.flatMap((v) => v.shape?.coordinates ?? [])
const east = Math.max(...all.map((c) => c[0]))
const south = Math.min(...all.map((c) => c[1]))
const north = Math.max(...all.map((c) => c[1]))
const A = [east + 0.03, (south + north) / 2]
const at = (dx, dy) => [A[0] + dx, A[1] + dy]
const square = ([x, y], r) => ({ type: 'Polygon', coordinates: [[[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r], [x - r, y - r]]] })
for (let i = 0; i < 500; i++) {
  const c = [east + 0.2 + (i % 25) * 0.004, south + Math.floor(i / 25) * 0.004]
  tables.stop.push({
    id: `far-${String(i).padStart(3, '0')}-0000-4000-8000-000000000000`, name: `Far ${i}`, informal: null, aliases: [], kind: 'hintuan',
    point: { type: 'Point', coordinates: c }, area: square(c, 0.0003), note: null, owner_id: OWNER, created_at: now,
  })
}

// ---------------------------------------------------------- the stand-in
/** Split a select on its top-level commas: `id,route_variant(id,reversed)`. */
const splitTop = (s) => {
  const out = []
  let depth = 0, cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = '' } else cur += ch
  }
  if (cur) out.push(cur)
  return out
}
/** A row as a select asks for it, embedding `route:route(*)` and `route_variant(…)`. */
const shapeRow = (table, row, select) => {
  if (!select || select === '*') return { ...row }
  const out = {}
  for (const item of splitTop(select)) {
    const emb = item.match(/^(?:(\w+):)?(\w+)\((.*)\)$/)
    if (!emb) { if (item in row) out[item] = row[item]; continue }
    const [, alias, rel, inner] = emb
    if (table === 'route_variant' && rel === 'route') {
      const r = tables.route.find((x) => x.id === row.route_id)
      out[alias ?? rel] = r ? shapeRow('route', r, inner) : null
    } else if (table === 'route' && rel === 'route_variant') {
      out[alias ?? rel] = tables.route_variant.filter((v) => v.route_id === row.id).map((v) => shapeRow('route_variant', v, inner))
    }
  }
  return out
}
const unquote = (s) => s.replace(/^"(.*)"$/, '$1')
/** The filters the studio sends: eq, is.null, not.is.null, in.(…). */
const matches = (row, params) => {
  for (const [k, v] of params) {
    if (['select', 'order', 'offset', 'limit', 'columns', 'on_conflict'].includes(k)) continue
    const val = row[k]
    if (v.startsWith('eq.')) { if (String(val) !== v.slice(3)) return false }
    else if (v === 'is.null') { if (val !== null && val !== undefined) return false }
    else if (v === 'not.is.null') { if (val === null || val === undefined) return false }
    else if (v.startsWith('in.(')) { if (!v.slice(4, -1).split(',').map(unquote).includes(String(val))) return false }
    else throw new Error(`the stand-in does not know the filter ${k}=${v}`)
  }
  return true
}
/** Refusals, as Postgres words them: the unique indexes and foreign keys the studio meets. */
const refuse = (code, message) => ({ status: 409, body: { code, message, details: null, hint: null } })
const conflictOf = (table, row, except = null) => {
  const others = tables[table].filter((r) => r !== except)
  if (table === 'route' && others.some((r) => r.head_stop_id === row.head_stop_id && r.tail_stop_id === row.tail_stop_id && (r.via ?? '') === (row.via ?? '')))
    return refuse('23505', 'duplicate key value violates unique constraint "route_ends_unique"')
  if (table === 'route_variant' && others.some((r) => r.route_id === row.route_id && r.reversed === row.reversed))
    return refuse('23505', 'duplicate key value violates unique constraint "route_variant_one_per_direction"')
  if (table === 'route_stop' && others.some((r) => r.route_variant_id === row.route_variant_id && r.stop_id === row.stop_id))
    return refuse('23505', 'duplicate key value violates unique constraint "route_stop_pkey"')
  return null
}
/** Deletes, with the schema's cascades (0001, 0006, 0008). */
const remove = (table, rows) => {
  if (table === 'stop' && rows.some((s) => tables.route.some((r) => r.head_stop_id === s.id || r.tail_stop_id === s.id)))
    return refuse('23503', 'update or delete on table "stop" violates foreign key constraint "route_head_stop_id_fkey" on table "route"')
  const gone = new Set(rows)
  tables[table] = tables[table].filter((r) => !gone.has(r))
  if (table === 'route') remove('route_variant', tables.route_variant.filter((v) => rows.some((r) => r.id === v.route_id)))
  if (table === 'route_variant') {
    const ids = new Set(rows.map((r) => r.id))
    tables.route_stop = tables.route_stop.filter((l) => !ids.has(l.route_variant_id))
    for (const v of tables.route_variant) if (ids.has(v.borrowed_from)) v.borrowed_from = null
  }
  if (table === 'stop') {
    const ids = new Set(rows.map((r) => r.id))
    tables.route_stop = tables.route_stop.filter((l) => !ids.has(l.stop_id))
  }
  return null
}
let seq = 0
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
const fill = (table, r) =>
  table === 'route' ? { id: newId(), owner_id: OWNER, signboard: null, route_code: null, short_name: null, long_name: null, mode: 'jeepney', fare_note: null, fare_as_of: null, via: null, created_at: now, updated_at: now, ...r }
  : table === 'route_variant' ? { id: newId(), owner_id: OWNER, direction_name: null, origin_terminal: null, destination_terminal: null, confidence: 'drawn', overview: null, borrowed_from: null, borrowed_part: null, borrowed_m: null, signboards: [], created_at: now, updated_at: now, ...r }
  : table === 'stop' ? { id: newId(), owner_id: OWNER, informal: null, aliases: [], note: null, created_at: now, ...r }
  : { ...r }

/** Every request the page sent to the tables, in order. */
const log = []
/** The next request matching `when` is refused with a 500, once. */
let fault = null

const serve = async (req) => {
  const u = new URL(req.url())
  const table = u.pathname.split('/rest/v1/')[1]
  const method = req.method()
  const body = req.postData() ? JSON.parse(req.postData()) : null
  log.push({ method, table, url: req.url(), query: decodeURIComponent(u.search), body })
  if (fault && fault(method, table, u)) {
    fault = null
    return { status: 500, body: { code: 'XX000', message: 'the stand-in refused this one, on purpose', details: null, hint: null } }
  }
  const params = [...u.searchParams]
  const select = u.searchParams.get('select')
  const one = /vnd\.pgrst\.object/.test(req.headers().accept ?? '')
  const prefer = req.headers().prefer ?? ''
  const rows = tables[table].filter((r) => matches(r, params))
  const answer = (out) => {
    const shaped = out.map((r) => shapeRow(table, r, select))
    if (one) return shaped.length === 1 ? { status: 200, body: shaped[0] } : { status: 406, body: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${shaped.length} rows`, hint: null } }
    return { status: method === 'POST' ? 201 : 200, body: shaped }
  }
  if (method === 'GET' || method === 'HEAD') {
    const offset = Number(u.searchParams.get('offset') ?? 0)
    const limit = Number(u.searchParams.get('limit') ?? 1000)
    const page = rows.slice(offset, offset + Math.min(limit, 1000))
    const range = page.length ? `${offset}-${offset + page.length - 1}/${rows.length}` : `*/${rows.length}`
    if (method === 'HEAD') return { status: 200, body: null, range }
    return { ...answer(page), range }
  }
  if (method === 'DELETE') {
    const no = remove(table, rows)
    return no ?? { status: 204, body: null }
  }
  if (method === 'PATCH') {
    for (const r of rows) {
      const next = { ...r, ...body }
      const no = conflictOf(table, next, r)
      if (no) return no
      Object.assign(r, body, table === 'stop' ? {} : { updated_at: now })
    }
    return answer(rows)
  }
  // POST: an insert, or an upsert when it says so.
  const list = Array.isArray(body) ? body : [body]
  const merge = /resolution=merge-duplicates/.test(prefer)
  const made = []
  for (const r of list) {
    const row = fill(table, r)
    const no = conflictOf(table, row)
    if (no && merge && table === 'route_stop') {
      Object.assign(tables.route_stop.find((l) => l.route_variant_id === row.route_variant_id && l.stop_id === row.stop_id), row)
      continue
    }
    if (no) { for (const x of made) tables[table].splice(tables[table].indexOf(x), 1); return no }
    tables[table].push(row)
    made.push(row)
  }
  return answer(made)
}

// The signboards bucket (0010), as Storage answers: an upload (the file in a
// form), the public read, and a delete by names.
const bucket = new Map()
const storage = async (r) => {
  const req = r.request()
  const u = new URL(req.url())
  const name = decodeURIComponent(u.pathname.split('/').pop())
  log.push({ method: req.method(), table: 'storage', url: req.url(), query: u.pathname, body: null })
  if (req.method() === 'GET' && u.pathname.includes('/object/public/signboards/')) {
    return bucket.has(name) ? r.fulfill({ status: 200, contentType: 'image/svg+xml', body: bucket.get(name) }) : r.fulfill({ status: 400, body: '{"error":"not_found"}' })
  }
  if (req.method() === 'DELETE') {
    for (const n of JSON.parse(req.postData() ?? '{}').prefixes ?? []) bucket.delete(n)
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  }
  const svg = (req.postDataBuffer()?.toString('utf8') ?? '').match(/<svg[\s\S]*<\/svg>/)?.[0] ?? ''
  bucket.set(name, svg)
  return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ Key: `signboards/${name}`, Id: name }) })
}

// ------------------------------------------------------------ the session
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const exp = Math.floor(Date.now() / 1000) + 6 * 3600
const user = { id: OWNER, aud: 'authenticated', role: 'authenticated', email: 'owner@example.com', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: now, updated_at: now }
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: OWNER, aud: 'authenticated', role: 'authenticated', email: user.email, exp, iat: exp - 3600, session_id: 'standin' })}.standin`
const session = { access_token: jwt, refresh_token: 'standin', token_type: 'bearer', expires_in: 6 * 3600, expires_at: exp, user }

// ------------------------------------------------------------ the browser
const b = await chromium.launch()
const warnings = []
/** A page on the stand-in; `signedIn` stores the faked session before the app starts. */
async function open(signedIn, path) {
  const context = await b.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  page.on('pageerror', (e) => warnings.push('pageerror: ' + String(e)))
  page.on('console', (msg) => { if (msg.type() === 'error' && /Warning|key/.test(msg.text())) warnings.push(msg.text().slice(0, 160)) })
  page.on('dialog', (d) => d.accept())
  await bareStyle(page, '#e8e8e8')
  await page.route(/\/rest\/v1\//, async (r) => {
    const out = await serve(r.request())
    const headers = { 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*' }
    if (out.range) headers['content-range'] = out.range
    await r.fulfill({ status: out.status, contentType: 'application/json', headers, body: out.body === null ? '' : JSON.stringify(out.body) })
  })
  await page.route(/\/storage\/v1\/object\//, storage)
  await page.route(/\/auth\/v1\/user/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }))
  await page.route(/\/auth\/v1\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...session, user }) }))
  await page.route(/router\.project-osrm\.org|routing\.openstreetmap\.de/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'NoRoute', routes: [] }) }))
  await page.addInitScript(
    ({ key, s }) => {
      window.__src = async (id) => { const src = window.__map?.getSource(id); return src ? await src.getData() : null }
      if (s && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(s))
    },
    { key: `sb-${PROJECT_REF}-auth-token`, s: signedIn ? session : null },
  )
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
  for (let i = 0; i < 100 && ((await page.evaluate(async () => (await window.__src('saved-routes'))?.features?.length ?? 0)) === 0); i++) await page.waitForTimeout(100)
  await page.waitForTimeout(500)
  return page
}

const page = await open(true, '/studio/')
const body = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ')
const since = (n) => log.slice(n)
const writesSince = (n) => since(n).filter((w) => w.method !== 'GET' && w.method !== 'HEAD')
const said = (ws) => ws.map((w) => `${w.method} ${w.table}${w.query.slice(0, 70)}`).join(' · ')
/** Put the map on a place, at a zoom, and give back where a [lng, lat] lands on the page. */
const go = async (c, zoom) => { await page.evaluate(([c, z]) => window.__map.jumpTo({ center: c, zoom: z }), [c, zoom]); await page.waitForTimeout(400) }
const box = await page.locator('canvas.maplibregl-canvas').boundingBox()
/**
 * Where a [lng, lat] lands on the page once the camera is at rest: it glides
 * with the cards, as on the public map, since 2026-10-01 (the trip opening on
 * its whole route), and a point read mid-glide is clicked where it no longer is.
 */
const px = async (ll) => {
  await page.waitForFunction(() => !window.__map.isMoving(), null, { timeout: 3000 }).catch(() => {})
  const p = await page.evaluate((ll) => { const q = window.__map.project(ll); return [q.x, q.y] }, ll)
  return [box.x + p[0], box.y + p[1]]
}
const clickAt = async (ll, wait = 250) => { const [x, y] = await px(ll); await page.mouse.click(x, y); await page.waitForTimeout(wait) }
const idle = () => page.waitForFunction(() => !document.body.innerText.includes('snapping…'), null, { timeout: 15000 }).catch(() => {})
const pointsShown = async () => Number((await body()).match(/(\d+) points?\b/)?.[1] ?? 0)
const done = async () => { await idle(); await page.getByRole('button', { name: /Done/ }).click(); await page.waitForTimeout(600) }
const saveButton = () => page.getByRole('button', { name: /^(Save|Update)$/ })
const toast = () => page.getByTestId('toast').filter({ hasText: /^Saved/ })
const returnTrip = () => page.getByRole('button', { name: 'Draw the return trip' })
const dismissToasts = async () => {
  for (const d of await page.getByRole('button', { name: 'Dismiss' }).all()) await d.click().catch(() => {})
  await page.waitForTimeout(200)
}
const waitFor = async (fn, ms = 5000) => { for (let t = 0; t < ms; t += 100) { if (await fn()) return true; await page.waitForTimeout(100) } return false }
const variantsOf = (routeId) => tables.route_variant.filter((v) => v.route_id === routeId)

// The ground the suite draws on, at street level: two hintuans 900 m apart,
// a route between them, its return trip by another street.
const P1 = at(-0.004, 0), P2 = at(0.004, 0)
const OUT = [P1, at(0, 0.0012), P2]
const BACK = [P2, at(0, -0.0015), P1]
const VIA = [P1, at(0, 0.003), P2]
const R = 0.0004

// ---- 1. The load: the pill and the reads
const loadReads = [...log]
const listReads = loadReads.filter((w) => w.method === 'GET' && w.table === 'route_variant' && /route:route/.test(w.query)).length
const stopReads = loadReads.filter((w) => w.method === 'GET' && w.table === 'stop').length
check('the stop table is read once for each read of the direction list, not twice (6)', stopReads > 0 && stopReads <= listReads, `${stopReads} stop read(s), ${listReads} list read(s)`)
const routesToday = tables.route.length
check('the pill counts routes, not directions (7)', (await body()).includes(`${routesToday} routes`), `want "${routesToday} routes"; ${(await body()).match(/\d+ routes?/)?.[0]}`)

// ---- 2. Two hintuans, traced and saved
async function hintuan(c, name) {
  await go(c, 17)
  await page.getByRole('button', { name: '+ New hotspot' }).click()
  await page.getByRole('menuitem', { name: /Hintuan/ }).click()
  await page.waitForTimeout(200)
  for (const [dx, dy] of [[-R, -R], [R, -R], [R, R], [-R, R]]) await clickAt([c[0] + dx, c[1] + dy], 150)
  await done()
  await page.getByPlaceholder('SM Fairview Ilalim').fill(name)
  const n = log.length
  await page.getByRole('button', { name: 'Save hintuan' }).click()
  await waitFor(async () => (await page.getByRole('button', { name: 'Save hintuan' }).count()) === 0)
  await page.waitForTimeout(500)
  await dismissToasts()
  return writesSince(n)
}
let w = await hintuan(P1, 'Stand-in Head')
const head = tables.stop.find((s) => s.name === 'Stand-in Head')
check('a hintuan traced and saved is one stop row', !!head && w.filter((x) => x.method === 'POST' && x.table === 'stop').length === 1, said(w))
check('  its links are replaced by its own id: none, where no line passes', w.some((x) => x.method === 'DELETE' && x.table === 'route_stop' && x.query.includes(`stop_id=eq.${head?.id}`)) && !w.some((x) => x.method === 'POST' && x.table === 'route_stop'), said(w))
let nTail = log.length
await hintuan(P2, 'Stand-in Tail')
const tail = tables.stop.find((s) => s.name === 'Stand-in Tail')
check('a second one', !!tail)
check(
  '  a saved hotspot reads the directions again, so a renamed end renames its routes (8)',
  log.slice(nTail).some((x) => x.method === 'GET' && x.table === 'route_variant' && /route:route/.test(x.query)),
  said(log.slice(nTail)),
)

// ---- 3. A route between them, saved with its slot
async function drawLine(points) {
  await go(at(0, 0), 15)
  await page.getByRole('button', { name: '+ New Route' }).click()
  await page.waitForTimeout(200)
  for (const p of points) await clickAt(p, 300)
  await done()
}
await drawLine(OUT)
check('Done opens the save panel, the ends guessed from where the line runs', (await page.getByTestId('save-head').inputValue()) !== '' && (await page.getByTestId('save-tail').inputValue()) !== '')
let n = log.length
await saveButton().click()
await waitFor(async () => (await toast().count()) > 0)
w = writesSince(n)
const outRoute = tables.route.find((r) => r.head_stop_id === head?.id && r.tail_stop_id === tail?.id)
check('a new route is one route row and two directions, one of them an empty slot', !!outRoute && variantsOf(outRoute.id).length === 2 && variantsOf(outRoute.id).filter((v) => v.shape === null).length === 1, said(w))
const outV = outRoute && variantsOf(outRoute.id).find((v) => v.shape)
check('  the save writes the overview beside the line, from the same points (0009)', !!outV?.overview && outV.overview.coordinates.length >= 2 && outV.overview.coordinates.length <= outV.shape.coordinates.length && String(outV.overview.coordinates[0][0]).split('.')[1].length <= 5, `${outV?.overview?.coordinates.length} of ${outV?.shape?.coordinates.length} points`)
check('  the line is linked to the two hintuans it runs between', ['Stand-in Head', 'Stand-in Tail'].every((nm) => tables.route_stop.some((l) => l.route_variant_id === outV?.id && l.stop_id === tables.stop.find((s) => s.name === nm)?.id)))
const longest = since(n).reduce((a, x) => (x.url.length > a.url.length ? x : a), { url: '' })
check(`  no request line over ${URL_LIMIT} characters with ${tables.stop.length} hotspots (4)`, longest.url.length <= URL_LIMIT, `${longest.url.length}: ${longest.method} ${longest.table}${longest.query.slice(0, 60)}`)
check('  the hintuans are read in pages, not in one bare request (4)', since(n).some((x) => x.method === 'GET' && x.table === 'stop' && /kind=eq\.hintuan/.test(x.query) && /offset=0/.test(x.query) && /limit=/.test(x.query)))
check('  the draft is gone', (await page.evaluate(() => localStorage.getItem('parapo.draft.v1'))) === null)
await waitFor(async () => (await returnTrip().count()) > 0)
check('  the toast offers the return trip: the route has an empty slot (2)', (await returnTrip().count()) === 1, (await toast().innerText().catch(() => '')).replace(/\s+/g, ' '))
check('  the pill counts one route more (7)', (await body()).includes(`${routesToday + 1} routes`), (await body()).match(/\d+ routes?/)?.[0])

// ---- 4. The return trip, into the slot
await returnTrip().click()
await page.waitForTimeout(200)
for (const p of BACK) await clickAt(p, 300)
await done()
check('the return trip opens as "Draw the return trip"', (await body()).includes('Draw the return trip'))
n = log.length
await saveButton().click()
await waitFor(async () => (await toast().count()) > 0)
w = writesSince(n)
const backV = variantsOf(outRoute?.id).find((v) => v !== outV)
check('  it fills the slot: one update, only of an empty row, no new route (2)', w.some((x) => x.method === 'PATCH' && x.table === 'route_variant' && /shape=is\.null/.test(x.query)) && !w.some((x) => x.method === 'POST' && (x.table === 'route' || x.table === 'route_variant')), said(w))
check('  both directions are drawn, still two rows', variantsOf(outRoute?.id).length === 2 && variantsOf(outRoute?.id).every((v) => v.shape), `${variantsOf(outRoute?.id).map((v) => (v.shape ? 'drawn' : 'slot'))}`)
await page.waitForTimeout(1200)
check('  and the toast offers no return trip: there is no slot left (2)', (await toast().count()) === 1 && (await returnTrip().count()) === 0)
await dismissToasts()

// ---- 5. Edit a direction
async function openCard(ll) {
  await go(at(0, 0), 15)
  await clickAt(ll, 700)
}
await openCard(OUT[1])
check('a tap on the line opens its card, with Edit route', (await page.getByRole('button', { name: 'Edit route' }).count()) === 1)
// The camera with the cards, as on the public map (the owner, 2026-09-30:
// "most of the interaction of public map should be in studio"): the trip
// opens on its whole route, every corner of it on the map beside the card
// floating in the corner, in the middle of the room the card leaves. Tapped,
// the route sat in the middle of the whole map: a camera that stays put fails.
await page.waitForFunction(() => !window.__map.isMoving(), null, { timeout: 3000 }).catch(() => {})
const framed = await page.evaluate((line) => {
  const m = window.__map
  const c = m.getCanvas().getBoundingClientRect()
  const card = document.querySelector('[data-testid="card"]').getBoundingClientRect()
  const pts = line.map((p) => m.project(p)).map((q) => ({ x: c.left + q.x, y: c.top + q.y }))
  const box = {
    left: Math.min(...pts.map((q) => q.x)),
    right: Math.max(...pts.map((q) => q.x)),
    top: Math.min(...pts.map((q) => q.y)),
    bottom: Math.max(...pts.map((q) => q.y)),
  }
  const onMap = box.left >= c.left - 2 && box.right <= c.right + 2 && box.top >= c.top - 2 && box.bottom <= c.bottom + 2
  const besideCard = box.left >= card.right - 2
  const centred = Math.abs((box.left + box.right) / 2 - (card.right + c.right) / 2) <= 20
  return { onMap, besideCard, centred, box: Object.fromEntries(Object.entries(box).map(([k, x]) => [k, Math.round(x)])), cardRight: Math.round(card.right), zoom: +m.getZoom().toFixed(2) }
}, OUT)
check('  the camera takes in the whole route, beside the card in the corner', framed.onMap && framed.besideCard && framed.centred, JSON.stringify(framed))
await page.getByRole('button', { name: 'Edit route' }).click()
await waitFor(async () => (await pointsShown()) === OUT.length)
check('  Edit route loads its points', (await pointsShown()) === OUT.length, `${await pointsShown()} points`)
// Back where the suite measured its ground: the trip's overview left the
// camera beside a card that is gone now.
await go(at(0, 0), 15)
await clickAt(at(0.0055, 0.0005), 300)
await waitFor(async () => (await pointsShown()) === OUT.length + 1)
check('  a click past its tail adds a point', (await pointsShown()) === OUT.length + 1, `${await pointsShown()} points`)
await done()
check('  the panel says it updates this direction', (await body()).includes('Update this direction'))
n = log.length
const rowsBefore = tables.route_variant.length
await saveButton().click()
await waitFor(async () => (await toast().count()) > 0)
w = writesSince(n)
check('  Update writes that one row, by its id', w.some((x) => x.method === 'PATCH' && x.table === 'route_variant' && x.query.includes(`id=eq.${outV?.id}`)) && !w.some((x) => x.method === 'POST' && x.table !== 'route_stop'), said(w))
check('  no row added or lost', tables.route_variant.length === rowsBefore)
await page.waitForTimeout(1200)
check('  and no return trip is offered for a route drawn both ways (2)', (await toast().count()) === 1 && (await returnTrip().count()) === 0)
await dismissToasts()

// ---- 5b. Signboards, per direction (0010, the owner's ask of 2026-10-01)
const outRow = () => tables.route_variant.find((v) => v.id === outV?.id)
const items = () => page.getByTestId('signboard-item')
const upload = (name, text) => page.getByTestId('signboard-file').setInputFiles({ name, mimeType: 'image/svg+xml', buffer: Buffer.from(text) })
await openCard(OUT[1])
const editor = page.getByTestId('signboard-editor')
check('the trip card has a Signboard for the direction on show, Papunta', (await editor.count()) === 1 && /Signboard · Papunta/.test(await editor.innerText()) && (await items().count()) === 0)
n = log.length
await upload('evil.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 98 40" onload="alert(1)"><script>alert(2)</script><rect width="98" height="40" fill="#111"/><a href="https://example.com"><text>X</text></a></svg>')
await waitFor(async () => (await items().count()) === 1)
const firstBoard = outRow()?.signboards?.[0]
const stored = bucket.get(firstBoard) ?? ''
check('  an upload lands in the bucket cleaned: no script, no handler, no link out', /^[0-9a-f-]{36}\.svg$/.test(firstBoard ?? '') && stored.includes('<rect width="98" height="40" fill="#111"/>') && !/script|onload|alert|example\.com/.test(stored), stored.slice(0, 160))
check('  and is listed on the direction, file first and then the row', (await items().count()) === 1 && since(n).findIndex((x) => x.table === 'storage') < since(n).findIndex((x) => x.method === 'PATCH' && x.table === 'route_variant'), said(since(n)))
await waitFor(async () => (await page.getByTestId('trip-signboard').count()) === 1)
check('  the card above shows it as visitors will', (await page.getByTestId('trip-signboard').count()) === 1 && /\/storage\/v1\/object\/public\/signboards\//.test((await page.getByTestId('trip-signboard').getAttribute('src')) ?? ''))
await upload('second.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 98 40"><rect width="98" height="40" fill="#222"/></svg>')
await waitFor(async () => (await items().count()) === 2)
const second = outRow()?.signboards?.[1]
await page.getByRole('button', { name: 'Move signboard 2 earlier' }).click()
await waitFor(async () => outRow()?.signboards?.[0] === second)
check('  a second goes last, and ‹ moves it first', outRow()?.signboards?.join() === [second, firstBoard].join(), JSON.stringify(outRow()?.signboards))
n = log.length
await upload('note.svg', 'just words, not a drawing')
await waitFor(async () => (await page.getByRole('alert').filter({ hasText: 'note.svg' }).count()) === 1)
check('  a file that is not an SVG is refused in words, and nothing is sent', (await page.getByRole('alert').filter({ hasText: 'note.svg' }).count()) === 1 && writesSince(n).length === 0 && !since(n).some((x) => x.table === 'storage'), said(since(n)))
await page.getByRole('button', { name: 'Remove signboard 1' }).click()
await waitFor(async () => (await items().count()) === 1)
check('  ✕ takes it off the direction and out of the bucket', outRow()?.signboards?.join() === firstBoard && !bucket.has(second), JSON.stringify(outRow()?.signboards))
await page.getByRole('button', { name: 'Remove signboard 1' }).click()
await waitFor(async () => (await items().count()) === 0 && (await page.getByTestId('trip-signboards').count()) === 0)
check('  and the last one leaves none', outRow()?.signboards?.length === 0 && bucket.size === 0 && (await page.getByTestId('trip-signboards').count()) === 0, `${JSON.stringify(outRow()?.signboards)}; ${bucket.size} in the bucket; ${await page.getByTestId('trip-signboards').count()} row(s) on the card`)

// ---- 6. Delete a direction, then draw it again
await openCard(OUT[1])
// A refused step — here the count that decides whether the route goes — is
// said, not swallowed (16): it was read by nobody. Delete again finishes it.
fault = (method, table) => method === 'HEAD' && table === 'route_variant'
await page.getByRole('button', { name: 'Delete' }).click()
await waitFor(async () => /refused this one, on purpose/.test(await body()))
check('a refused step of the delete is said, not swallowed (16)', fault === null && /refused this one, on purpose/.test(await body()), (await body()).slice(-160))
await dismissToasts()
n = log.length
await page.getByRole('button', { name: 'Delete' }).click()
await waitFor(async () => (await page.getByRole('button', { name: 'Edit route' }).count()) === 0)
await page.waitForTimeout(500)
w = writesSince(n)
check('Delete empties the direction into a slot: the row stays, with no line (3)', variantsOf(outRoute?.id).length === 2 && variantsOf(outRoute?.id).find((v) => v.id === outV?.id)?.shape === null, said(w))
check('  its links go with its line, and its overview', !tables.route_stop.some((l) => l.route_variant_id === outV?.id) && variantsOf(outRoute?.id).find((v) => v.id === outV?.id)?.overview === null)
check('  the route stays: its other way is drawn', tables.route.some((r) => r.id === outRoute?.id) && !w.some((x) => x.method === 'DELETE' && x.table === 'route'))
check('  and Delete again finishes it, no error shown', !/error|refused/i.test(await body()))
await drawLine(OUT)
check('  the panel says this fills the route\'s empty slot', (await page.getByTestId('save-same-ends').count()) === 1 && !/already has/.test(await page.getByTestId('save-same-ends').innerText()))
n = log.length
await saveButton().click()
await waitFor(async () => (await toast().count()) > 0 || /already has this direction drawn/.test(await body()))
w = writesSince(n)
check('+ New Route with the same ends fills the slot again, not "already drawn" (3)', (await toast().count()) === 1 && !/already has this direction drawn/.test(await body()), (await body()).slice(-160))
check('  one route, two drawn directions', tables.route.filter((r) => r.id === outRoute?.id).length === 1 && variantsOf(outRoute?.id).length === 2 && variantsOf(outRoute?.id).every((v) => v.shape), said(w))
await dismissToasts()

// ---- 7. A route's end is refused a delete, in words
await go(P1, 17)
await clickAt([P1[0] - R * 0.7, P1[1] + R * 0.7], 700)
const card = page.getByRole('button', { name: 'Edit hintuan' })
if ((await card.count()) === 0) {
  const row = page.getByRole('button', { name: /Stand-in Head/ })
  if (await row.count()) { await row.first().click(); await page.waitForTimeout(500) }
}
check('a tap inside the hintuan opens its card', (await card.count()) === 1)
n = log.length
if (await card.count()) {
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.waitForTimeout(500)
}
check('  deleting a route\'s end is refused, naming the route (15)', /Stand-in Head.*is where .* ends?\. Delete .* first/.test(await body()), (await body()).slice(-200))
check('  and nothing is sent to the database', !writesSince(n).some((x) => x.method === 'DELETE' && x.table === 'stop'), said(writesSince(n)))
await dismissToasts()
await page.keyboard.press('Escape')

// ---- 8. Undo to no points leaves no draft
await go(at(0, 0), 15)
await page.getByRole('button', { name: '+ New Route' }).click()
await clickAt(OUT[0], 300)
await clickAt(OUT[1], 300)
await idle()
const drafted = (await page.evaluate(() => localStorage.getItem('parapo.draft.v1'))) !== null
await page.keyboard.press('Control+z')
await page.keyboard.press('Control+z')
await page.waitForTimeout(400)
check('undo down to no points leaves no draft to come back on reload (12)', drafted && (await page.evaluate(() => localStorage.getItem('parapo.draft.v1'))) === null)
await page.getByTitle('Discard this route').click()
await page.waitForTimeout(300)

// ---- 9. A link sync that fails, and the retry
await drawLine(VIA)
await page.getByPlaceholder('Zabarte').fill('Stand-in Road')
fault = (method, table, u) => method === 'GET' && table === 'route_stop' && u.searchParams.has('route_variant_id')
n = log.length
await saveButton().click()
await waitFor(async () => /links are not/.test(await body()))
w = writesSince(n)
check('a link sync that fails says the line is saved and its links are not (13)', /The line is saved, but its hintuan links are not/.test(await body()), (await body()).slice(-200))
const viaRoute = tables.route.find((r) => r.via === 'Stand-in Road')
check('  the route and its directions are in', !!viaRoute && variantsOf(viaRoute.id).length === 2, said(w))
check('  and its ends are locked while the save is finished: the retry would not write them', await page.getByTestId('save-head').isDisabled())
n = log.length
await saveButton().click()
await waitFor(async () => (await toast().count()) > 0)
w = writesSince(n)
check('  Save again updates the row it wrote, and inserts nothing (13)', w.some((x) => x.method === 'PATCH' && x.table === 'route_variant' && /id=eq\./.test(x.query)) && !w.some((x) => x.method === 'POST' && (x.table === 'route' || x.table === 'route_variant')) && (await toast().count()) === 1, said(w))
check('  still one route for these ends and that via', tables.route.filter((r) => r.via === 'Stand-in Road').length === 1)
await dismissToasts()

// ---- 10. Edit route changes the route's facts (stage 11, the owner's ask)
await hintuan(at(-0.004, 0.006), 'Stand-in Phase')
const phase = tables.stop.find((s) => s.name === 'Stand-in Phase')
await openCard(OUT[1])
await page.getByRole('button', { name: 'Edit route' }).click()
await waitFor(async () => (await pointsShown()) > 0)
await done()
check('Edit route unlocks the ends and the facts', (await page.getByTestId('save-head').isEnabled()) && (await page.getByPlaceholder('Zabarte').isEnabled()) && (await page.getByPlaceholder('Fairview – Tala').isEnabled()))
await page.getByTestId('save-head').selectOption({ label: 'Stand-in Phase' })
await page.getByPlaceholder('Fairview – Tala').fill('Phase – Tail')
check('  the panel says the change is to both directions', /a change here is a change to both directions/.test(await body()))
n = log.length
const backId = variantsOf(outRoute?.id).find((v) => v.id !== outV?.id)?.id
// A terminal link the owner set on this direction, as a hotspot's checklist
// would: Edit route must leave it where it is.
const aTerminal = tables.stop.find((s) => s.kind === 'terminal')
if (aTerminal && outV) tables.route_stop.push({ route_variant_id: outV.id, stop_id: aTerminal.id, stop_sequence: 0 })
await saveButton().click()
await waitFor(async () => (await toast().count()) > 0)
w = writesSince(n)
const edited = tables.route.find((r) => r.id === outRoute?.id)
check('  Update writes the route row — its new head, its signboard — then the direction', edited?.head_stop_id === phase?.id && edited?.signboard === 'Phase – Tail' && w.findIndex((x) => x.method === 'PATCH' && x.table === 'route') < w.findIndex((x) => x.method === 'PATCH' && x.table === 'route_variant'), said(w))
check('  the name follows the new end', (await toast().innerText()).includes('Stand-in Phase – Stand-in Tail'), (await toast().innerText()).replace(/\s+/g, ' '))
const terminals = new Set(tables.stop.filter((s) => s.kind === 'terminal').map((s) => s.id))
const linkWrites = w.filter((x) => x.table === 'route_stop')
check(
  '  the terminal links are left as they are: the one set stays, and the link writes name hintuans only',
  !!aTerminal &&
    tables.route_stop.some((l) => l.route_variant_id === outV?.id && l.stop_id === aTerminal.id) &&
    linkWrites.every((x) => !/stop_id=eq\./.test(x.query) && ![x.body ?? []].flat().some((l) => terminals.has(l?.stop_id)) && ![...terminals].some((t) => x.query.includes(t))),
  said(linkWrites),
)
await dismissToasts()
// The other direction, not saved here, shares the route: its card reads the
// new end once the list is read again.
// The card is the public map's trip card since 2026-09-30: its ends sit on
// rows of their own, and "origin → destination" is its sheet's name.
const cardName = async () => (await page.locator('[data-testid="card"]').first().getAttribute('aria-label').catch(() => null)) ?? ''
await waitFor(async () => {
  await openCard(BACK[1])
  return (await cardName()) === 'Stand-in Tail → Stand-in Phase'
}, 8000)
check('  and the other direction, which shares the route, is renamed with it', variantsOf(outRoute?.id).some((v) => v.id === backId) && (await cardName()) === 'Stand-in Tail → Stand-in Phase', await cardName())
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await openCard(OUT[1])
await page.getByRole('button', { name: 'Edit route' }).click()
await waitFor(async () => (await pointsShown()) > 0)
await done()
await page.getByTestId('save-head').selectOption({ label: 'Stand-in Head' })
await page.getByPlaceholder('Zabarte').fill('Stand-in Road')
n = log.length
await saveButton().click()
await page.waitForTimeout(600)
check('ends that another route already has are refused in a plain sentence', /Another route already runs between these two places/.test(await body()), (await body()).slice(-200))
check('  and nothing is written', writesSince(n).length === 0, said(writesSince(n)))
await page.getByTestId('save-head').selectOption({ label: 'Stand-in Tail' })
await page.getByTestId('save-tail').selectOption({ label: 'Stand-in Phase' })
n = log.length
await saveButton().click()
await page.waitForTimeout(600)
check('head and tail swapped are refused: the route would turn round', /Head and tail swapped would turn the route round/.test(await body()), (await body()).slice(-200))
check('  and nothing is written', writesSince(n).length === 0, said(writesSince(n)))
await page.getByRole('button', { name: 'Back to map' }).click()
await page.getByTitle('Discard this route').click()
await page.waitForTimeout(300)

// ---- 11. Signing in from Done leaves the drawing keys alive
const guest = await open(false, '/studio/?e2e=1')
const guestBody = async () => (await guest.locator('body').innerText()).replace(/\s+/g, ' ')
const gbox = await guest.locator('canvas.maplibregl-canvas').boundingBox()
await guest.evaluate(([c]) => window.__map.jumpTo({ center: c, zoom: 15 }), [at(0, 0)])
await guest.waitForTimeout(400)
await guest.getByRole('button', { name: '+ New Route' }).click()
for (const p of OUT) {
  const q = await guest.evaluate((ll) => { const r = window.__map.project(ll); return [r.x, r.y] }, p)
  await guest.mouse.click(gbox.x + q[0], gbox.y + q[1])
  await guest.waitForTimeout(300)
}
await guest.getByRole('button', { name: /Done/ }).click()
await guest.waitForTimeout(400)
check('signed out, Done asks for sign-in', (await guest.getByPlaceholder('you@example.com').count()) === 1)
await guest.getByPlaceholder('you@example.com').fill('owner@example.com')
await guest.getByPlaceholder('Password').fill('stand-in')
await guest.getByPlaceholder('Password').press('Enter')
await guest.waitForTimeout(1200)
check('  signing in closes the dialog', (await guest.getByPlaceholder('you@example.com').count()) === 0)
const before = Number((await guestBody()).match(/(\d+) points?\b/)?.[1] ?? 0)
await guest.keyboard.press('Control+z')
await guest.waitForTimeout(300)
const after = Number((await guestBody()).match(/(\d+) points?\b/)?.[1] ?? 0)
check('  and Ctrl+Z still undoes (9)', before === OUT.length && after === OUT.length - 1, `${before} → ${after} points`)
await guest.keyboard.press('Enter')
await guest.waitForTimeout(500)
check('  and Enter still opens the save panel (9)', (await guest.getByTestId('save-head').count()) === 1)

// A line that comes back to where it began: the panel's first guess puts one
// place at both ends, and the timeline's two end rows used to share a key.
await drawLine([P1, at(0, 0.0012), at(-0.0036, 0.0002)])
check('a line back to its start guesses one place at both ends', (await page.getByTestId('save-head').inputValue()) !== '' && (await page.getByTestId('save-head').inputValue()) === (await page.getByTestId('save-tail').inputValue()))
await page.getByRole('button', { name: 'Back to map' }).click()
await page.getByTitle('Discard this route').click()
await page.waitForTimeout(300)
check('no page errors or React warnings (the duplicate key)', warnings.length === 0, warnings.slice(0, 3).join(' | '))
await page.screenshot({ path: 'save-test.png' })
await b.close()
tally()
