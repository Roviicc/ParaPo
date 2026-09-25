// The editor at scale: how /studio/?e2e=1 opens with 1,000 directions and 500
// hotspots, made from today's map — 250 copies of its directions and 17 of
// its hotspots, shifted across a 25 × 10 grid — served by a stand-in for the
// database's REST API. The rows are as the database keeps them: a line with a
// point every 20 m or so (what the router gives), the drawing beside it
// (control_points, segments) and 15-decimal coordinates. No tiles, no router,
// no database: this runs the same on a laptop, in a sandbox and on a GitHub
// runner.
//
//   node scripts/pw/studio-scale-test.mjs     against http://localhost:5173
//
// Why this exists: on 2026-09-25 the editor read every column of every
// direction on open, 25 MB for 1,000 of them, and asked for the links table
// a page at a time, 14 round trips. Future-proofing stage 2 changed what is
// asked for, and this keeps it so: the list carries no drawings, a
// direction's drawing is read only when a line is followed, the pages after
// the first are asked for together, and the map opens and lights within
// loose budgets (a runner is slower than a laptop) that catch the next
// regression rather than time the app. In development the page renders its
// effects twice (StrictMode), so every load is asked for twice here.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = (process.env.PARAPO_BASE ?? 'http://localhost:5173').replace(/\/$/, '')
const COPIES = Number(process.env.PARAPO_SCALE_COPIES ?? 250)
/** Seconds from the navigation to the first route line on the screen. */
const LINES_WITHIN_S = 45
/** Seconds the main thread may spend in long tasks while opening. */
const BUSY_WITHIN_S = 30
/** Seconds from a click on a line to that route being lit. */
const LIT_WITHIN_S = 5
/** Metres between points on a stored line, about what the router gives. */
const POINT_EVERY_M = 20

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

// ------------------------------------------------------------- the tables
const m = JSON.parse(readFileSync(new URL('../../public/data/map.json', import.meta.url), 'utf8'))
const shift = (k) => [(k % 25) * 0.03, Math.floor(k / 25) * 0.03]
// Shifted, and with the digits a save used to keep.
const mv = (c, [dx, dy], j) => [c[0] + dx + (j % 9) * 1e-9 + 3e-12, c[1] + dy + (j % 7) * 1e-9 + 7e-12]
const haversine = (a, b) => {
  const r = Math.PI / 180
  const x = (b[0] - a[0]) * r * Math.cos(((a[1] + b[1]) / 2) * r)
  const y = (b[1] - a[1]) * r
  return Math.sqrt(x * x + y * y) * 6_371_000
}
/** The published line, thinned to its bends, with a point every POINT_EVERY_M again as the router drew it. */
const dense = (line) => {
  const out = [line[0]]
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]]
    const n = Math.max(1, Math.round(haversine(a, b) / POINT_EVERY_M))
    for (let t = 1; t <= n; t++) out.push([a[0] + ((b[0] - a[0]) * t) / n, a[1] + ((b[1] - a[1]) * t) / n])
  }
  return out
}
const now = '2026-09-25T12:00:00+00:00'
const variants = []
const stops = []
const links = []
for (let k = 0; k < COPIES; k++) {
  const d = shift(k)
  for (const v of m.variants) {
    const line = v.shape ? dense(v.shape.coordinates).map((c, j) => mv(c, d, j)) : null
    variants.push({
      id: `${v.id}-${k}`,
      route_id: `${v.route_id}-${k}`,
      owner_id: 'owner',
      direction_name: null,
      origin_terminal: null,
      destination_terminal: null,
      shape: line && { type: 'LineString', coordinates: line },
      control_points: line ? [line[0], line[line.length - 1]] : [],
      segments: line ? [{ snap: 'snapped', coordinates: line }] : [],
      reversed: v.reversed,
      confidence: v.confidence ?? 'drawn',
      borrowed_from: null,
      borrowed_part: null,
      borrowed_m: null,
      created_at: now,
      updated_at: now,
      route: {
        id: `${v.route.id}-${k}`,
        owner_id: 'owner',
        signboard: v.route.signboard ?? null,
        route_code: null,
        short_name: null,
        long_name: v.route.long_name ?? null,
        mode: v.route.mode,
        fare_note: v.route.fare_note ?? null,
        fare_as_of: null,
        head_stop_id: `${v.route.head_stop_id}-${k}`,
        tail_stop_id: `${v.route.tail_stop_id}-${k}`,
        via: v.route.via ?? null,
        created_at: now,
        updated_at: now,
      },
    })
  }
  if (k < Math.ceil(500 / Math.max(1, m.stops.length))) {
    for (const s of m.stops) {
      stops.push({
        ...s,
        id: `${s.id}-${k}`,
        owner_id: 'owner',
        point: { ...s.point, coordinates: mv(s.point.coordinates, d, k) },
        area: s.area && { ...s.area, coordinates: s.area.coordinates.map((r) => r.map((c, j) => mv(c, d, j))) },
        created_at: now,
      })
    }
  }
  for (const l of m.links) links.push({ route_variant_id: `${l.route_variant_id}-${k}`, stop_id: `${l.stop_id}-${k}`, stop_sequence: l.stop_sequence })
}
const tables = { route_variant: variants, stop: stops, route_stop: links }
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`
console.log(
  `\n(${variants.length} directions, ${stops.length} hotspots, ${links.length} links; as the database keeps them: ` +
    Object.entries(tables).map(([k, v]) => `${k} ${mb(JSON.stringify(v).length)}`).join(', ') + ')\n',
)

// ---------------------------------------------------------- the stand-in
/** The columns a select asks for, or null for all of them. `route:route(*)` is the column `route`. */
const columnsOf = (select) =>
  !select || select === '*' ? null : select.split(',').map((c) => c.trim().split(':')[0].split('(')[0])
const pick = (row, cols) => (cols ? Object.fromEntries(cols.filter((c) => c in row).map((c) => [c, row[c]])) : row)
/** What the stand-in was asked, in order. */
const asked = []
const serve = (route) => {
  const req = route.request()
  const u = new URL(req.url())
  const table = u.pathname.split('/rest/v1/')[1]
  let rows = tables[table] ?? []
  // The filters the editor uses: id=eq.<id>, kind=eq.<kind>, area=not.is.null.
  for (const [k, v] of u.searchParams) {
    if (k === 'id' && v.startsWith('eq.')) rows = rows.filter((r) => r.id === v.slice(3))
    if (k === 'kind' && v.startsWith('eq.')) rows = rows.filter((r) => r.kind === v.slice(3))
  }
  const offset = Number(u.searchParams.get('offset') ?? 0)
  const limit = Number(u.searchParams.get('limit') ?? 1000)
  const cols = columnsOf(u.searchParams.get('select'))
  const whole = rows.slice(offset, offset + limit)
  const chunk = whole.map((r) => pick(r, cols))
  const one = /object/.test(req.headers().accept ?? '')
  const body = JSON.stringify(one ? (chunk[0] ?? null) : chunk)
  // `wholeBytes`: what the same rows would have been with every column.
  asked.push({ table, select: u.searchParams.get('select') ?? '*', offset, one, bytes: body.length, wholeBytes: JSON.stringify(one ? (whole[0] ?? null) : whole).length, at: Date.now() - t0 })
  return route.fulfill({
    status: one && !chunk[0] ? 406 : 200,
    contentType: 'application/json',
    // Exposed, as the database exposes it: the page is on another origin,
    // and a browser hides a header a cross-origin answer does not expose.
    headers: {
      'content-range': chunk.length ? `${offset}-${offset + chunk.length - 1}/${rows.length}` : `*/${rows.length}`,
      'access-control-expose-headers': 'content-range',
    },
    body,
  })
}

// ------------------------------------------------------------ the browser
const b = await chromium.launch()
// No chevron animation: it keeps the map busy, and the click's timing is the question here.
const page = await b.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text().slice(0, 160))
})
await page.route(/tiles\.openfreemap\.org/, (route) =>
  /\/styles\//.test(route.request().url())
    ? route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eeeeee' } }] }),
      })
    : route.fulfill({ status: 404, body: '' }),
)
await page.route(/\/rest\/v1\//, serve)
await page.route(/\/auth\/v1\//, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
// The router has no road here; a gap it would fill stays a straight line.
await page.route(/router\.project-osrm\.org/, (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'NoRoute', routes: [] }) }),
)
await page.addInitScript(() => {
  window.__long = 0
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__long += e.duration
  }).observe({ entryTypes: ['longtask'] })
  window.__src = async (id) => {
    const s = window.__map?.getSource(id)
    return s ? await s.getData() : null
  }
})

// A CPU profile of the opening, so a failure says where the time went.
const cdp = await page.context().newCDPSession(page)
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 1000 })
await cdp.send('Profiler.start')

let t0 = Date.now()
await page.goto(`${BASE}/studio/?e2e=1`, { waitUntil: 'load' })
const marks = {}
const mark = async (name, cond, timeoutMs, arg = null, everyMs = 100) => {
  const until = Date.now() + timeoutMs
  for (;;) {
    if (await page.evaluate(cond, arg)) return (marks[name] = Date.now() - t0)
    if (Date.now() > until) return (marks[name] = null)
    await page.waitForTimeout(everyMs)
  }
}
const budgetMs = LINES_WITHIN_S * 1000 + 30_000
await mark('map load', () => !!window.__map && window.__map.loaded(), budgetMs)
await mark('routes in the source', async () => ((await window.__src('saved-routes'))?.features?.length ?? 0) > 0, budgetMs)
await mark('hotspots in the source', async () => ((await window.__src('saved-stops'))?.features?.length ?? 0) > 0, budgetMs)
await mark('stretches in the source', async () => ((await window.__src('saved-routes-pass'))?.features?.length ?? 0) > 0, budgetMs)
await mark('lines on the screen', () => !!window.__map?.getLayer('saved-routes-line') && window.__map.queryRenderedFeatures({ layers: ['saved-routes-line'] }).length > 0, budgetMs)
await mark('idle', () => !!window.__map && window.__map.loaded(), 30_000)
await page.waitForTimeout(500)
const { profile } = await cdp.send('Profiler.stop')
const busy = await page.evaluate(() => Math.round(window.__long))
const routes = await page.evaluate(async () => (await window.__src('saved-routes'))?.features?.length ?? 0)
// A hotspot is a box and a label point in the source: count the ids.
const boxes = await page.evaluate(async () => new Set(((await window.__src('saved-stops'))?.features ?? []).map((f) => f.properties?.id)).size)
const stretches = await page.evaluate(async () => (await window.__src('saved-routes-pass'))?.features?.length ?? 0)

const s = (ms) => (ms == null ? 'never' : `${(ms / 1000).toFixed(1)} s`)
const sent = asked.reduce((a, r) => a + r.bytes, 0)
const byTable = {}
for (const r of asked) byTable[r.table] = (byTable[r.table] ?? 0) + 1
console.log(`  ${asked.length} request(s), ${mb(sent)} sent: ${Object.entries(byTable).map(([k, n]) => `${k} ×${n}`).join(', ')}`)
// PARAPO_SCALE_DEBUG=1 lists every request: table, select, offset, bytes, when.
if (process.env.PARAPO_SCALE_DEBUG) for (const r of asked) console.log(`    ${r.at.toString().padStart(6)} ms  ${r.table} offset ${r.offset} ${r.one ? 'one ' : ''}${mb(r.bytes)}  select ${r.select.slice(0, 50)}`)
console.log(`  map load ${s(marks['map load'])}; routes in the source ${s(marks['routes in the source'])}; hotspots ${s(marks['hotspots in the source'])}; stretches ${s(marks['stretches in the source'])}; idle ${s(marks.idle)}\n`)
check('every direction reached the map', routes === variants.length, `${routes} of ${variants.length}`)
check('every hotspot reached the map', boxes === stops.length, `${boxes} of ${stops.length}`)
check('the orange stretches were computed', stretches > 0, `${stretches} stretch(es)`)
check(`the first line is on the screen within ${LINES_WITHIN_S} s`, marks['lines on the screen'] != null && marks['lines on the screen'] <= LINES_WITHIN_S * 1000, s(marks['lines on the screen']))
check(`the main thread is busy under ${BUSY_WITHIN_S} s while opening`, busy <= BUSY_WITHIN_S * 1000, `${(busy / 1000).toFixed(1)} s in long tasks`)

// What was asked for: the list without its drawings, and the pages together.
const lists = asked.filter((r) => r.table === 'route_variant' && !r.one)
const drawingsInList = lists.filter((r) => {
  const cols = columnsOf(r.select)
  return !cols || cols.includes('control_points') || cols.includes('segments')
})
check('the list of directions asks for no drawings', lists.length > 0 && drawingsInList.length === 0, `${lists.length} list request(s); select "${lists[0]?.select.slice(0, 60)}…"`)
const listBytes = lists.reduce((a, r) => a + r.bytes, 0)
const wholeBytes = lists.reduce((a, r) => a + r.wholeBytes, 0)
// The drawing is about half of a row: a line with its points, kept again as
// one segment. What is left must be well under two thirds.
check('the list is under two thirds of the rows as the database keeps them', listBytes < (wholeBytes * 2) / 3, `${mb(listBytes)} for ${lists.length} request(s), the same rows whole ${mb(wholeBytes)}`)
// The links table: after its first page answers, the rest are asked for at
// once. Two loads in development, so the first of each load is the one an
// earlier page precedes by more than a moment.
const linkPages = asked.filter((r) => r.table === 'route_stop')
const pages = Math.ceil(links.length / 1000)
const gaps = linkPages.slice(1).map((r, i) => r.at - linkPages[i].at)
const together = gaps.filter((g) => g < 250).length
check(`the links table's ${pages} pages are asked for together after the first`, linkPages.length >= pages && together >= pages - 2, `${linkPages.length} request(s); gaps ${gaps.map((g) => `${g}`).join(' ')} ms`)

// A click on a line at zoom 14: how long until its route is lit.
const v = variants.find((x) => x.shape && x.shape.coordinates.length > 40) ?? variants[0]
const mid = v.shape.coordinates[Math.floor(v.shape.coordinates.length / 2)]
await page.evaluate(([c]) => window.__map.jumpTo({ center: c, zoom: 14 }), [mid])
await page.waitForFunction(() => window.__map.loaded(), null, { timeout: 30000 })
await page.waitForTimeout(500)
const at = await page.evaluate(([c]) => {
  const q = window.__map.project(c)
  return [q.x, q.y]
}, [mid])
const canvas = await page.locator('canvas').first().boundingBox()
await page.evaluate(() => {
  window.__long = 0
})
const tc = Date.now()
await page.mouse.click(canvas.x + at[0], canvas.y + at[1])
// A tap lights the routes under it one way round; the other way stays at rest.
const sibs = variants.filter((x) => x.route_id === v.route_id).map((x) => x.id)
const lit = await mark('lit', (ids) => ids.some((id) => !!window.__map.getFeatureState({ source: 'saved-routes', id }).lit), LIT_WITHIN_S * 1000 + 15_000, sibs, 10)
const litMs = lit == null ? null : Date.now() - tc
const busyClick = await page.evaluate(() => Math.round(window.__long))
check(`a click on a line lights its route within ${LIT_WITHIN_S} s`, litMs != null && litMs <= LIT_WITHIN_S * 1000, `${litMs == null ? 'never' : `${litMs} ms`}; ${busyClick} ms in long tasks`)

// Following a line while drawing reads that line's drawing, once, for it alone.
await page.evaluate(() => localStorage.clear())
const start = v.shape.coordinates[Math.floor(v.shape.coordinates.length / 2) - 8]
await page.evaluate(
  (d) => localStorage.setItem('parapo.draft.v1', JSON.stringify(d)),
  { controlPoints: [start], segments: [], target: { routeId: null, variantId: null }, area: null, borrow: null, join: null },
)
asked.length = 0
await page.reload({ waitUntil: 'load' })
await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: budgetMs })
await mark('routes again', async () => ((await window.__src('saved-routes'))?.features?.length ?? 0) > 0, budgetMs)
await page.evaluate(([c]) => window.__map.jumpTo({ center: c, zoom: 16 }), [mid])
await page.waitForFunction(() => window.__map.loaded(), null, { timeout: 30000 })
await page.waitForTimeout(500)
const at2 = await page.evaluate(([c]) => {
  const q = window.__map.project(c)
  return [q.x, q.y]
}, [mid])
const before = asked.filter((r) => r.table === 'route_variant' && r.one).length
await page.mouse.click(canvas.x + at2[0], canvas.y + at2[1], { button: 'right' })
const until = Date.now() + 15_000
while (Date.now() < until) {
  const d = await page.evaluate(() => JSON.parse(localStorage.getItem('parapo.draft.v1') ?? 'null'))
  if (d?.borrow) break
  await page.waitForTimeout(100)
}
const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('parapo.draft.v1') ?? 'null'))
const drawingReads = asked.filter((r) => r.table === 'route_variant' && r.one)
check('following a line reads its drawing, one small request for that line', drawingReads.length === before + 1 && drawingReads.every((r) => r.bytes < 200_000 && /control_points/.test(r.select)), `${drawingReads.length - before} read(s); ${drawingReads.map((r) => `${mb(r.bytes)} "${r.select}"`).join(', ')}`)
check('and the drawing follows that line to its end', !!draft?.borrow && (draft.controlPoints?.length ?? 0) > 2, `borrows ${draft?.borrow?.variantId?.slice(0, 12) ?? 'nothing'}, ${draft?.controlPoints?.length ?? 0} points`)
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

// Where the time went: the functions with the most self time.
const self = new Map()
const byId = new Map(profile.nodes.map((n) => [n.id, n]))
for (let i = 0; i < profile.samples.length; i++) {
  const f = byId.get(profile.samples[i]).callFrame
  const key = `${f.functionName || '(anon)'} ${f.url.replace(/^.*\/(src|node_modules)\//, '$1/').split('?')[0]}:${f.lineNumber + 1}`
  self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0))
}
console.log('\n  where the opening went (self time):')
for (const [k, us] of [...self.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8)) console.log(`  ${String(Math.round(us / 1000)).padStart(6)} ms  ${k}`)

await b.close()
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
