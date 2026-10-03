// The public map at scale: how it opens with 1,000 directions and 500
// hotspots, made from today's map — 250 copies of its directions and 17 of
// its hotspots, shifted across a 25 × 10 grid — and served to the app in
// place of /data/index.v4.json and its lines. No tiles are fetched: a bare style
// stands in, so this runs the same on a laptop, in this sandbox and on a
// GitHub runner.
//
//   node tests/e2e/scale-test.mjs            against http://localhost:5173
//
// Why this exists: on 2026-09-25 this map took 142 s to open, all of it
// measuring every vertex of every line against every hotspot box for the
// orange stretches. Two bounds checks brought it to 2.4 s here. Since
// 2026-09-29 the map opens on the index — overviews, a quarter of the points
// — and reads a direction's full line, and works out its orange stretches,
// only when it is lit (stage 7 of the clean-up): the first line is budgeted
// at 5 s on a runner, where the one full file had 30.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COPIES, shift } from './lib/big-map.mjs'
import { BASE, bareStyle, harness } from './lib/harness.mjs'
import { countLongTasks, startProfile, whereItWent } from './lib/profile.mjs'

/** Seconds from the navigation to the first route line on the screen. */
const LINES_WITHIN_S = 5
/** Seconds the main thread may spend in long tasks while opening. */
const BUSY_WITHIN_S = 5
/** Seconds from a tap on a line to its orange stretches, its full line read. */
const LIT_WITHIN_S = 5

const { check, tally } = harness()

// ---------------------------------------------------------------- the map
const data = fileURLToPath(new URL('../../public/data/', import.meta.url))
const m = JSON.parse(readFileSync(join(data, 'index.v4.json'), 'utf8'))
const lineOf = (id) => JSON.parse(readFileSync(join(data, 'lines', `${id}.json`), 'utf8')).shape
const mv = (c, [dx, dy]) => [c[0] + dx, c[1] + dy]
const moved = (line, d) => line && { ...line, coordinates: line.coordinates.map((c) => mv(c, d)) }
const big = { ...m, variants: [], stops: [], links: [] }
/** Each copy's full line, served at /data/lines/<id>.json. */
const lines = new Map()
for (let k = 0; k < COPIES; k++) {
  const d = shift(k)
  for (const v of m.variants) {
    const id = `${v.id}-${k}`
    big.variants.push({
      ...v,
      id,
      route_id: `${v.route_id}-${k}`,
      route: { ...v.route, id: `${v.route.id}-${k}`, head_stop_id: `${v.route.head_stop_id}-${k}`, tail_stop_id: `${v.route.tail_stop_id}-${k}` },
      overview: moved(v.overview, d),
    })
    if (v.overview) lines.set(id, moved(lineOf(v.id), d))
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
await bareStyle(page)
await page.route(/\/data\/index\.v3\.json/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: file }))
await page.route(/\/data\/lines\/.+\.json/, (route) => {
  const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop().replace(/\.json$/, ''))
  const shape = lines.get(id)
  return shape
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schema: 2, id, shape }) })
    : route.fulfill({ status: 404, body: '' })
})
await page.addInitScript(countLongTasks)
await page.addInitScript(() => {
  window.__src = async (id) => {
    const s = window.__map?.getSource(id)
    return s ? await s.getData() : null
  }
})

const cdp = await startProfile(page)

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
await mark('lines on the screen', () => !!window.__map?.getLayer('saved-routes-line') && window.__map.queryRenderedFeatures({ layers: ['saved-routes-line'] }).length > 0, budgetMs)
await mark('idle', () => !!window.__map && window.__map.loaded(), 30_000)
await page.waitForTimeout(500)
const { profile } = await cdp.send('Profiler.stop')
const busy = await page.evaluate(() => Math.round(window.__long))
const routes = await page.evaluate(async () => (await window.__src('saved-routes'))?.features?.length ?? 0)
const stretchesAtLoad = await page.evaluate(async () => (await window.__src('saved-routes-pass'))?.features?.length ?? 0)

// A tap on the first copy's longest line: it (and whatever shares its road)
// is lit, its full line read, and its orange stretches worked out.
const longest = big.variants.slice(0, m.variants.length).filter((v) => v.overview).reduce((a, v) => (v.overview.coordinates.length > a.overview.coordinates.length ? v : a))
const at = longest.overview.coordinates[Math.floor(longest.overview.coordinates.length / 2)]
await page.evaluate((c) => window.__map.jumpTo({ center: c, zoom: 15 }), at)
await page.waitForTimeout(500)
const p = await page.evaluate((c) => { const q = window.__map.project(c); return [q.x, q.y] }, at)
const canvas = await page.locator('canvas.maplibregl-canvas').boundingBox()
const tapped = Date.now()
await page.mouse.click(canvas.x + p[0], canvas.y + p[1])
let stretches = 0
while (Date.now() - tapped < LIT_WITHIN_S * 1000 + 5000) {
  stretches = await page.evaluate(async () => (await window.__src('saved-routes-pass'))?.features?.length ?? 0)
  if (stretches > 0) break
  await page.waitForTimeout(100)
}
const litIn = Date.now() - tapped

const s = (ms) => (ms == null ? 'never' : `${(ms / 1000).toFixed(1)} s`)
console.log(`  map load ${s(marks['map load'])}; routes in the source ${s(marks['routes in the source'])}; hotspots ${s(marks['hotspots in the source'])}; idle ${s(marks.idle)}\n`)
check('every direction reached the map', routes === big.variants.length, `${routes} of ${big.variants.length}`)
check('no orange stretch is worked out at load: none is lit', stretchesAtLoad === 0, `${stretchesAtLoad} stretch(es)`)
check(`a tap on a line reads its full line and works out its orange stretches within ${LIT_WITHIN_S} s`, stretches > 0 && litIn <= LIT_WITHIN_S * 1000, `${stretches} stretch(es) in ${s(litIn)}`)
check(`the first line is on the screen within ${LINES_WITHIN_S} s`, marks['lines on the screen'] != null && marks['lines on the screen'] <= LINES_WITHIN_S * 1000, s(marks['lines on the screen']))
check(`the main thread is busy under ${BUSY_WITHIN_S} s while opening`, busy <= BUSY_WITHIN_S * 1000, `${(busy / 1000).toFixed(1)} s in long tasks`)
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

whereItWent(profile)

await b.close()
tally()
