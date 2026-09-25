// The public map at scale: how it opens with 1,000 directions and 500
// hotspots, made from today's map — 250 copies of its directions and 17 of
// its hotspots, shifted across a 25 × 10 grid — and served to the app in
// place of /data/map.json. No tiles are fetched: a bare style stands in, so
// this runs the same on a laptop, in this sandbox and on a GitHub runner.
//
//   node scripts/pw/scale-test.mjs            against http://localhost:5173
//
// Why this exists: on 2026-09-25 this map took 142 s to open, all of it
// measuring every vertex of every line against every hotspot box for the
// orange stretches. Two bounds checks brought it to 2.4 s here. The budgets
// below are loose (a runner is slower than a laptop) and exist to catch the
// next such regression, not to time the app.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = (process.env.PARAPO_BASE ?? 'http://localhost:5173').replace(/\/$/, '')
const COPIES = Number(process.env.PARAPO_SCALE_COPIES ?? 250)
/** Seconds from the navigation to the first route line on the screen. */
const LINES_WITHIN_S = 30
/** Seconds the main thread may spend in long tasks while opening. */
const BUSY_WITHIN_S = 20

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

// ---------------------------------------------------------------- the map
const m = JSON.parse(readFileSync(new URL('../../public/data/map.json', import.meta.url), 'utf8'))
const shift = (k) => [(k % 25) * 0.03, Math.floor(k / 25) * 0.03]
const mv = (c, [dx, dy]) => [c[0] + dx, c[1] + dy]
const big = { ...m, variants: [], stops: [], links: [] }
for (let k = 0; k < COPIES; k++) {
  const d = shift(k)
  for (const v of m.variants) {
    big.variants.push({
      ...v,
      id: `${v.id}-${k}`,
      route_id: `${v.route_id}-${k}`,
      route: { ...v.route, id: `${v.route.id}-${k}`, head_stop_id: `${v.route.head_stop_id}-${k}`, tail_stop_id: `${v.route.tail_stop_id}-${k}` },
      shape: v.shape && { ...v.shape, coordinates: v.shape.coordinates.map((c) => mv(c, d)) },
    })
  }
  if (k < Math.ceil(500 / Math.max(1, m.stops.length))) {
    for (const s of m.stops) {
      big.stops.push({
        ...s,
        id: `${s.id}-${k}`,
        point: { ...s.point, coordinates: mv(s.point.coordinates, d) },
        area: s.area && { ...s.area, coordinates: s.area.coordinates.map((r) => r.map((c) => mv(c, d))) },
      })
    }
  }
  for (const l of m.links) big.links.push({ ...l, route_variant_id: `${l.route_variant_id}-${k}`, stop_id: `${l.stop_id}-${k}` })
}
const file = JSON.stringify(big)
console.log(`\n(${big.variants.length} directions, ${big.stops.length} hotspots, ${big.links.length} links; ${(file.length / 1024).toFixed(0)} KB)\n`)

// ------------------------------------------------------------ the browser
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 800 } })
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
await page.route(/\/data\/map\.json/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: file }))
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

const t0 = Date.now()
await page.goto(`${BASE}/`, { waitUntil: 'load' })
const marks = {}
const mark = async (name, cond, timeoutMs) => {
  const until = Date.now() + timeoutMs
  for (;;) {
    if (await page.evaluate(cond)) return (marks[name] = Date.now() - t0)
    if (Date.now() > until) return (marks[name] = null)
    await page.waitForTimeout(100)
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
const stretches = await page.evaluate(async () => (await window.__src('saved-routes-pass'))?.features?.length ?? 0)

const s = (ms) => (ms == null ? 'never' : `${(ms / 1000).toFixed(1)} s`)
console.log(`  map load ${s(marks['map load'])}; routes in the source ${s(marks['routes in the source'])}; hotspots ${s(marks['hotspots in the source'])}; stretches ${s(marks['stretches in the source'])}; idle ${s(marks.idle)}\n`)
check('every direction reached the map', routes === big.variants.length, `${routes} of ${big.variants.length}`)
check('the orange stretches were computed', stretches > 0, `${stretches} stretch(es)`)
check(`the first line is on the screen within ${LINES_WITHIN_S} s`, marks['lines on the screen'] != null && marks['lines on the screen'] <= LINES_WITHIN_S * 1000, s(marks['lines on the screen']))
check(`the main thread is busy under ${BUSY_WITHIN_S} s while opening`, busy <= BUSY_WITHIN_S * 1000, `${(busy / 1000).toFixed(1)} s in long tasks`)
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
