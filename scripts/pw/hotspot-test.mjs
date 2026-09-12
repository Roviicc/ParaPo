import { chromium } from 'playwright'

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`) }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
// Headless Chromium cannot use this container's TLS relay, but Node can reach
// the internet directly: serve every https request through Node fetch.
let routerCalls = 0
// PARAPO_NODE_FETCH=1: serve every https request through Node fetch. Needed only
// where the browser cannot reach the internet but Node can (sandboxed CI).
if (process.env.PARAPO_NODE_FETCH) {
await page.route(/^https:\/\//, async (route) => {
  const req = route.request()
  if (/routing\.openstreetmap\.de|route\/v1\/driving/.test(req.url())) routerCalls++
  try {
    const headers = { ...req.headers() }
    delete headers['accept-encoding']
    const r = await fetch(req.url(), { method: req.method(), headers, body: ['GET','HEAD'].includes(req.method()) ? undefined : req.postDataBuffer() })
    const body = Buffer.from(await r.arrayBuffer())
    const h = {}; r.headers.forEach((v, k) => { if (!['content-encoding','content-length','transfer-encoding'].includes(k)) h[k] = v })
    await route.fulfill({ status: r.status, headers: h, body })
  } catch (e) { await route.abort() }
})
} else if (typeof routerCalls !== 'undefined') {
  page.on('request', r => { if (/routing\.openstreetmap\.de|route\/v1\/driving/.test(r.url())) routerCalls++ })
}
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

await page.addInitScript(() => {
  // MapLibre 6: GeoJSONSource data is behind an async getter.
  window.__src = async (id) => { const s = window.__map?.getSource(id); return s ? await s.getData() : null }
})
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' })
// wait for the map to exist and be loaded
await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
check('map loaded', true)

// saved routes fetched (public read) — proves Supabase config is live
await page.waitForFunction(async () => ((await window.__src('saved-routes'))?.features?.length ?? 0) > 0, null, { timeout: 20000 }).catch(() => {})
const savedCount = await page.evaluate(async () => (await window.__src('saved-routes'))?.features?.length ?? 0)
check('saved routes loaded from Supabase', savedCount > 0, `${savedCount} direction(s)`)

// ---- Hotspot: open menu, choose Hintuan
await page.getByRole('button', { name: '+ New hotspot' }).click()
await page.getByRole('menuitem', { name: /Hintuan/ }).click()
await page.waitForSelector('text=Hintuan ·')
check('toolbar shows Hintuan mode', true)
check('freehand toggle hidden in area mode', (await page.getByRole('button', { name: /Freehand/ }).count()) === 0)

// click 4 corners around the centre of the map
const box = await page.locator('canvas.maplibregl-canvas').boundingBox()
const cx = box.x + box.width / 2, cy = box.y + box.height / 2
const corners = [[-80, -60], [80, -60], [80, 60], [-80, 60]]
for (const [dx, dy] of corners) { await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(150) }
await page.waitForTimeout(300)

const probe = await page.evaluate(async () => {
  const m = window.__map
  const area = await window.__src('draw-area')
  const line = await window.__src('draw-line')
  const pts  = await window.__src('draw-points')
  return {
    polygons: area?.features?.length ?? 0,
    ringLen: area?.features?.[0]?.geometry?.coordinates?.[0]?.length ?? 0,
    type: area?.features?.[0]?.geometry?.type,
    lineFeatures: line?.features?.length ?? 0,
    hasClosing: !!line?.features?.find(f => f.properties?.index === -1),
    points: pts?.features?.length ?? 0,
    fillColor: m.getPaintProperty('draw-area-fill', 'fill-color'),
    lineColor: m.getPaintProperty('draw-line-freehand', 'line-color'),
  }
})
check('4 corners placed', probe.points === 4, `${probe.points}`)
check('one Polygon feature in draw-area', probe.polygons === 1 && probe.type === 'Polygon')
check('ring is closed (5 coords for 4 corners)', probe.ringLen === 5, `${probe.ringLen}`)
check('3 edges + closing edge in draw-line', probe.lineFeatures === 4 && probe.hasClosing, `${probe.lineFeatures} features, closing=${probe.hasClosing}`)
check('hintuan colour is orange', probe.fillColor === '#f97316' && probe.lineColor === '#f97316', `${probe.fillColor}/${probe.lineColor}`)
check('no router calls made while tracing an area', routerCalls === 0, `${routerCalls}`)
const doneEnabled = await page.getByRole('button', { name: /Done/ }).isEnabled()
check('Done enabled with 4 corners', doneEnabled)

// undo down to 2 corners: fill must disappear, Done must disable
await page.getByRole('button', { name: /Undo/ }).click()
await page.getByRole('button', { name: /Undo/ }).click()
await page.waitForTimeout(200)
const afterUndo = await page.evaluate(async () => ({
  polygons: (await window.__src('draw-area'))?.features?.length ?? 0,
  points: (await window.__src('draw-points'))?.features?.length ?? 0,
}))
check('undo to 2 corners removes the fill', afterUndo.points === 2 && afterUndo.polygons === 0)
check('Done disabled below 3 corners', !(await page.getByRole('button', { name: /Done/ }).isEnabled()))

// draft survives reload with kind
await page.mouse.click(cx + 80, cy + 60); await page.waitForTimeout(200)
await page.reload({ waitUntil: 'load' })
await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
await page.waitForTimeout(500)
const afterReload = await page.evaluate(async () => ({
  toolbarHintuan: !!document.body.innerText.match(/Hintuan ·/),
  points: (await window.__src('draw-points'))?.features?.length ?? 0,
  polygons: (await window.__src('draw-area'))?.features?.length ?? 0,
}))
check('draft restores as a Hintuan after reload', afterReload.toolbarHintuan && afterReload.points === 3 && afterReload.polygons === 1, JSON.stringify(afterReload))

await page.screenshot({ path: 'hotspot-trace.png' })
await page.getByRole('button', { name: '✕' }).click()

// ---- Regression: a 2-point route still snaps to roads
await page.getByRole('button', { name: '+ New Route' }).click()
await page.waitForTimeout(200)
await page.mouse.click(cx - 60, cy); await page.waitForTimeout(150)
await page.mouse.click(cx + 60, cy)
await page.waitForFunction(() => !document.body.innerText.includes('snapping…'), null, { timeout: 30000 })
const route = await page.evaluate(async () => {
  const line = await window.__src('draw-line')
  const seg = line?.features?.[0]
  return {
    features: line?.features?.length ?? 0,
    snap: seg?.properties?.snap,
    coords: seg?.geometry?.coordinates?.length ?? 0,
    polygons: (await window.__src('draw-area'))?.features?.length ?? 0,
    lineColor: window.__map.getPaintProperty('draw-line-snapped', 'line-color'),
    freehandVisible: !!document.querySelector('button[aria-pressed]'),
    distanceShown: /\d+ m|\d+\.\d+ km/.test(document.body.innerText),
  }
})
check('route: router WAS called for the route (positive control)', routerCalls > 0, `${routerCalls}`)
check('route: one snapped segment', route.features === 1 && route.snap === 'snapped', `snap=${route.snap}`)
check('route: geometry is road-following (>2 coords)', route.coords > 2, `${route.coords} coords`)
check('route: no polygon fill in route mode', route.polygons === 0)
check('route: rose colour restored', route.lineColor === '#e11d48', route.lineColor)
check('route: freehand toggle + distance readout back', route.freehandVisible && route.distanceShown)
await page.screenshot({ path: 'route-regression.png' })

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
await browser.close()
const failed = results.filter(r => !r.ok).length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
