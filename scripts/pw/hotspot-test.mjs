// The studio's hotspot & route drawing tools, in a development build.
//
//   npm run dev                          (in another terminal)
//   node scripts/pw/hotspot-test.mjs
//
// Opens /studio/?e2e=1 (the development-only sign-in bypass) and traces a
// Hintuan hotspot (4 corners -> polygon + edges + points), undoes back down
// to 2 corners, checks the draft survives a reload, then traces a 2-point
// route and checks it snaps to roads via the public OSRM router. To stay
// independent of whatever is saved today, the map is recentred on the middle
// vertex of the saved route with the most coordinates (or a fixed Metro Manila
// fallback when there are none) before drawing, so clicks land on real streets instead of
// wherever the saved-routes bounding box happens to fit right now.
import { chromium } from 'playwright'

const BASE = (process.env.PARAPO_BASE ?? 'http://localhost:5173').replace(/\/$/, '')
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`) }
const skip = (name, reason) => { console.log(`SKIP  ${name}  ${reason}`) }

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
// The features of one of our GeoJSON sources once the page has some, asked
// every 100 ms from here for up to `ms`; [] when none came in time. Not
// `page.waitForFunction` with an async function: under Playwright's default
// polling that resolves after the function's first call whatever it returned,
// so a slow database (GitHub's runners are far from it) let the checks start
// on an empty map. Seen on the first CI run, 2026-09-25.
const waitForSource = async (id, ms = 20000) => {
  const until = Date.now() + ms
  for (;;) {
    const fs = await page.evaluate(async (id) => (await window.__src(id))?.features ?? [], id)
    if (fs.length > 0 || Date.now() > until) return fs
    await page.waitForTimeout(100)
  }
}

await page.goto(`${BASE}/studio/?e2e=1`, { waitUntil: 'load' })
// wait for the map to exist and be loaded
await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
check('map loaded', true)

// saved routes fetched (public read) — proves Supabase config is live.
// The page normally has them in about a second; give a slow network up to
// 20s before calling it a failure, and say plainly when that's what happened.
const savedRoutes = await waitForSource('saved-routes')
const savedCount = savedRoutes.length
if (savedCount > 0) {
  check('saved routes loaded from Supabase', true, `${savedCount} direction(s)`)
} else {
  // The page cannot tell an empty table from a slow one; either way the
  // route checks below have nothing to click, so say so rather than skip.
  check('saved routes loaded from Supabase', false, 'no saved routes in 20 s: none in the database, or a slow answer (normally ~1s)')
}

// Known risk: the map's opening view fits the saved-routes bounds, which
// drifts as routes are added and can leave the centre over water or inside a
// block, where the public OSRM router can't snap. Recentre on solid ground
// before drawing: the middle vertex of the saved route with the most
// coordinates, or a fixed Metro Manila fallback (Cubao) when the database has
// none yet. Not the first saved route: they come most recently updated first,
// so the first changes whenever the owner edits one. The route clicks below
// reuse this same line. Recentre both now and again after the reload below,
// since a reload resets the camera.
const FALLBACK_CENTER = [121.0527, 14.6187] // Cubao, Metro Manila
const savedLine = savedRoutes.filter(f => f.geometry?.type === 'LineString' && (f.geometry.coordinates?.length ?? 0) > 1)
  .reduce((a, f) => (!a || f.geometry.coordinates.length > a.geometry.coordinates.length ? f : a), null)
const center = savedLine ? savedLine.geometry.coordinates[Math.floor(savedLine.geometry.coordinates.length / 2)] : FALLBACK_CENTER
const recentre = () => page.evaluate(([lng, lat]) => window.__map.jumpTo({ center: [lng, lat], zoom: 15 }), center)
await recentre()
await page.waitForTimeout(300)

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
await recentre()
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
// Two clicks on the centred saved route's own vertices (savedLine, the same
// route the view is centred on), each at least 120 px from every earlier pick
// and clear of the cards and the toolbar: on a road, so the router (which
// refuses a click more than 25 m from one) routes the gap. Fixed offsets from
// the centre can land inside a block, and a refused gap is drawn freehand.
const onRoad = await page.evaluate((line) => {
  const m = window.__map, { clientWidth: w, clientHeight: h } = m.getCanvas()
  const picked = []
  for (const c of line) {
    const p = m.project(c)
    if (p.x < 80 || p.x > w - 80 || p.y < 80 || p.y > h - 140) continue
    if (picked.every(([x, y]) => Math.hypot(p.x - x, p.y - y) >= 120)) picked.push([p.x, p.y])
    if (picked.length === 2) break
  }
  return picked
}, savedLine?.geometry.coordinates ?? [])
check('route: two on-road click positions found on a saved route', onRoad.length === 2, `${onRoad.length} found`)
for (const [x, y] of onRoad) { await page.mouse.click(box.x + x, box.y + y); await page.waitForTimeout(150) }
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
// A gap waiting for the router is drawn as a straight stand-in that is also
// 'snapped', so draw-line alone cannot tell it from a routed segment. The draft
// can: a stand-in is written `pending` with no `streets`; a segment the router
// answered has a `streets` array (empty on an unnamed road).
const routed = await page.evaluate(() => {
  const draft = JSON.parse(localStorage.getItem('parapo.draft.v1') ?? 'null')
  if (!draft) return { ok: false, detail: 'no draft in localStorage' }
  const snapped = (draft.segments ?? []).filter(s => s?.snap === 'snapped')
  const real = snapped.filter(s => Array.isArray(s.streets) && !s.pending)
  return { ok: snapped.length > 0 && real.length === snapped.length, detail: `${real.length}/${snapped.length} snapped routed, ${snapped.filter(s => s.pending).length} pending, ${snapped.filter(s => !Array.isArray(s.streets)).length} no streets` }
})
check('route: router WAS called for the route (positive control)', routerCalls > 0, `${routerCalls}`)
check('route: one snapped segment', route.features === 1 && route.snap === 'snapped' && routed.ok, `snap=${route.snap}, ${routed.detail}`)
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
