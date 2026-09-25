// Route and hotspot drawing gestures in the studio editor.
//
//   npm run dev                                (in another terminal)
//   node scripts/pw/regression-gestures.mjs
//
// Opens /studio/?e2e=1, which in development skips the sign-in door so
// drawing can be exercised while signed out (Done still asks to sign in
// before saving). Before each drawing section the map is jumped to a
// street-level view centred on the middle vertex of the saved route with the
// most coordinates, or a fixed Metro Manila point when the database has none.
// Route clicks and drags land on that saved route's own vertices, or along a segment's own
// road: the router refuses a click more than 25 m from a road, and a refused
// gap is drawn freehand, which would let the freehand checks below pass for
// the wrong reason. Point counts asserted throughout come from this script's
// own clicks, not from saved data.
import { chromium } from 'playwright'

const BASE = (process.env.PARAPO_BASE ?? 'http://localhost:5173').replace(/\/$/, '')
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`) }
const skip = (name, reason) => console.log(`SKIP  ${name}${reason ? '  [' + reason + ']' : ''}`)
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1280, height: 800 } })
let routerCalls = 0
// PARAPO_NODE_FETCH=1: serve every https request through Node fetch. Needed only
// where the browser cannot reach the internet but Node can (sandboxed CI).
if (process.env.PARAPO_NODE_FETCH) {
await page.route(/^https:\/\//, async (route) => { const req = route.request(); if (/routing\.openstreetmap\.de|route\/v1\/driving/.test(req.url())) routerCalls++; try { const h={...req.headers()}; delete h['accept-encoding']; const r = await fetch(req.url(), { method: req.method(), headers: h, body: ['GET','HEAD'].includes(req.method())?undefined:req.postDataBuffer() }); const body=Buffer.from(await r.arrayBuffer()); const hh={}; r.headers.forEach((v,k)=>{ if(!['content-encoding','content-length','transfer-encoding'].includes(k)) hh[k]=v }); await route.fulfill({status:r.status,headers:hh,body}) } catch { await route.abort() } })
} else {
// Otherwise count router requests as the browser sends them; without this the
// counter never moves and "no router calls during any hotspot gesture" cannot fail.
page.on('request', r => { if (/routing\.openstreetmap\.de|route\/v1\/driving/.test(r.url())) routerCalls++ })
}
await page.addInitScript(() => { window.__src = async (id) => { const s = window.__map?.getSource(id); return s ? await s.getData() : null } })
const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type()==='error') errors.push(m.text().slice(0,160)) })
const pts = async (src='draw-points') => (await page.evaluate(async s => (await window.__src(s))?.features?.length ?? 0, src))
const segs = async () => (await page.evaluate(async () => (await window.__src('draw-line'))?.features ?? []))
const cp = async () => (await page.evaluate(async () => (await window.__src('draw-points')).features.map(f => f.geometry.coordinates)))
const proj = async (c) => page.evaluate(c => { const q = window.__map.project(c); return [q.x, q.y] }, c)
const idle = async () => page.waitForFunction(() => !document.body.innerText.includes('snapping…'), null, { timeout: 30000 })
const box0 = { x: 0, y: 0 }
const renderedAt = async (px, layer='draw-point-dots') => page.waitForFunction(([x, y, l]) => window.__map.queryRenderedFeatures([x, y], { layers: [l] }).length > 0, [px[0], px[1], layer], { timeout: 5000 }).then(() => true).catch(() => false)
// A gap waiting for the router is drawn as a straight stand-in that is also
// 'snapped', so draw-line cannot tell it from a routed segment. The draft can: a
// stand-in is written `pending` with no `streets`; a segment the router answered
// has a `streets` array (empty on an unnamed road).
const routed = async () => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('parapo.draft.v1') ?? 'null'); if (!d) return { ok: false, detail: 'no draft in localStorage' }
  const sn = (d.segments ?? []).filter(x => x?.snap === 'snapped'), real = sn.filter(x => Array.isArray(x.streets) && !x.pending)
  return { ok: sn.length > 0 && real.length === sn.length, detail: `${real.length}/${sn.length} snapped routed, ${sn.filter(x => x.pending).length} pending, ${sn.filter(x => !Array.isArray(x.streets)).length} no streets` }
})

// Known risk: clicks used to land at the centre of a view fitted to whatever
// routes happen to be saved, which drifts as routes are added and can fall on
// water or a block the public OSRM router can't snap to. Recentre on real
// ground before drawing instead.
// The saved route with the most coordinates, not features[0]: saved routes come
// most recently updated first, so the first one changes whenever the owner edits
// a route. centerOnLand keeps its coordinates in savedLine for roadPixels, so the
// clicks come from the same route the view is centred on.
const CUBAO = [121.0527, 14.6187] // Metro Manila land fallback, used when there are no saved routes yet
let savedLine = []
const centerOnLand = async () => {
  await waitForSource('saved-routes', 6000)
  savedLine = await page.evaluate(async () => ((await window.__src('saved-routes'))?.features ?? []).map(f => f.geometry?.coordinates ?? []).reduce((a, c) => c.length > a.length ? c : a, []))
  const center = savedLine.length > 0 ? savedLine[Math.floor(savedLine.length / 2)] : CUBAO
  await page.evaluate(c => window.__map.jumpTo({ center: c, zoom: 15 }), center)
  await page.waitForTimeout(300)
}

// Canvas pixels of the centred saved route's own vertices in the current view,
// in order along it, each at least `gap` px from every earlier pick and clear of
// the cards and the toolbar. They are on a road, so the router routes a gap
// between any two.
const roadPixels = async (n, gap) => page.evaluate(([line, n, gap]) => {
  const m = window.__map, { clientWidth: w, clientHeight: h } = m.getCanvas()
  const picked = []
  for (const c of line) {
    const p = m.project(c)
    if (p.x < 80 || p.x > w - 80 || p.y < 80 || p.y > h - 140) continue
    if (picked.every(([x, y]) => Math.hypot(p.x - x, p.y - y) >= gap)) picked.push([p.x, p.y])
    if (picked.length === n) break
  }
  return picked
}, [savedLine, n, gap])

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
await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
await page.waitForTimeout(800)
await centerOnLand()
const box = await page.locator('canvas.maplibregl-canvas').boundingBox(); box0.x = box.x; box0.y = box.y
const click = (x, y, o) => page.mouse.click(box0.x + x, box0.y + y, o)

console.log('== Route drawing gestures (ported from scripts/uitest.mjs)')
check('map loads and + New Route is enabled', await page.getByRole('button', { name: '+ New Route' }).isEnabled())
check('pill shows the saved route count', /\d+ routes?/.test(await page.locator('body').innerText()))
await page.getByRole('button', { name: '+ New Route' }).click(); await page.waitForTimeout(200)
check('clicking + New Route enters drawing mode', await page.getByRole('button', { name: /Done/ }).count() === 1)
const cx = box.width/2, cy = box.height/2
const road = await roadPixels(4, 70)
check('four on-road click positions found on a saved route', road.length === 4, `${road.length} found`)
for (const [x, y] of road) { await click(x, y); await page.waitForTimeout(120) }
await idle()
check('four clicks add four control points', await pts() === 4, String(await pts()))
let s = await segs(), r = await routed()
check('segments routed without error', s.length === 3 && s.every(f => f.properties.snap === 'snapped') && r.ok, `${s.length} segs; ${r.detail}`)
// drag point 1 along its own road, to the middle of segment 1, so both its
// segments can still be routed
let c = await cp(); let p1 = await proj(c[1])
const seg1 = s.find(f => f.properties.index === 1).geometry.coordinates
const along = seg1.length > 2 ? seg1[Math.floor(seg1.length / 2)] : [(seg1[0][0] + seg1[1][0]) / 2, (seg1[0][1] + seg1[1][1]) / 2]
const to = await proj(along)
await page.mouse.move(box0.x+p1[0], box0.y+p1[1]); await page.mouse.down()
for (let i=1;i<=6;i++) await page.mouse.move(box0.x+p1[0]+(to[0]-p1[0])*i/6, box0.y+p1[1]+(to[1]-p1[1])*i/6)
await page.mouse.up(); await idle(); await page.waitForTimeout(200)
let c2 = await cp()
const dragged = Math.hypot(c2[1][0] - c[1][0], c2[1][1] - c[1][1])
check('dragging a point moves it (not the map)', dragged > 1e-4 && c2[0][0] === c[0][0], `moved ${(dragged * 1e5).toFixed(0)}e-5°`)
check('dragging keeps the point count', await pts() === 4)
s = await segs(); r = await routed()
check('both segments of the dragged point are routed again (control for the shift-click)', s.length === 3 && s.every(f => f.properties.snap === 'snapped') && r.ok, `${s.map(f => f.properties.snap).join(',')}; ${r.detail}`)
// shift-click segment 0 midpoint to straighten
const seg0 = s.find(f => f.properties.index === 0).geometry.coordinates
// A routed segment's own vertices can run close to a neighbour's route near
// their shared, just-dragged point (how close depends on the real streets
// under today's fallback centre), so the invisible 22px hit corridor can
// overlap two segments at once. Probe outward from the array midpoint for a
// vertex map.queryRenderedFeatures actually attributes to gap 0, instead of
// assuming the midpoint vertex always does.
const order = [...seg0.keys()].filter(i => i > 0 && i < seg0.length - 1)
  .sort((a, b) => Math.abs(a - seg0.length / 2) - Math.abs(b - seg0.length / 2))
let mid = seg0[Math.floor(seg0.length / 2)], pm = await proj(mid)
for (const i of order) {
  const cand = seg0[i]; const candPx = await proj(cand)
  const gap = await page.evaluate(([x, y]) => window.__map.queryRenderedFeatures([x, y], { layers: ['draw-line-hit'] })[0]?.properties?.index, candPx)
  if (gap === 0) { mid = cand; pm = candPx; break }
}
// This headless Chromium drops the Shift modifier on synthesized mouse input
// (verified: map.on('click') saw shiftKey=false), so shift-click is dispatched
// as DOM events directly, which is what a real browser hands MapLibre.
await page.evaluate(([x, y]) => {
  const el = window.__map.getCanvas()
  const r = el.getBoundingClientRect(); const o = { bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y, shiftKey: true, button: 0 }
  el.dispatchEvent(new MouseEvent('mousedown', o)); el.dispatchEvent(new MouseEvent('mouseup', o)); el.dispatchEvent(new MouseEvent('click', o))
}, pm); await page.waitForTimeout(300)
s = await segs()
check('shift-clicking a segment marks it freehand', s.find(f => f.properties.index === 0)?.properties.snap === 'freehand')
check('shift-click did not add a point', await pts() === 4)
// click segment 2 to insert a point into it
s = await segs(); const seg2 = s.find(f => f.properties.index === 2).geometry.coordinates; const mid2 = seg2[Math.floor(seg2.length/2)]
let pm2 = await proj(mid2); await click(pm2[0], pm2[1]); await idle(); await page.waitForTimeout(200)
check('clicking the line inserts a point into that segment', await pts() === 5)
c = await cp(); check('inserted point lands where clicked, as index 3', Math.abs(c[3][0]-mid2[0]) < 1e-4 && Math.abs(c[3][1]-mid2[1]) < 1e-4)
// right-click point 3 to delete it
let p3 = await proj(c[3]); await renderedAt(p3); await click(p3[0], p3[1], { button: 'right' }); await idle(); await page.waitForTimeout(200)
check('right-clicking a point deletes it', await pts() === 4)
await page.getByRole('button', { name: /Undo/ }).click(); await page.waitForTimeout(150)
check('undo removes the last point', await pts() === 3)
check('Done is enabled with a route drawn', await page.getByRole('button', { name: /Done/ }).isEnabled())
await page.getByRole('button', { name: /Done/ }).click(); await page.waitForTimeout(200)
check('Done while signed out opens the sign-in dialog', await page.getByText('Sign in to save').count() === 1)
await page.getByRole('button', { name: 'Cancel' }).click(); await page.waitForTimeout(100)
await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 }); await page.waitForTimeout(800)
check('reloading the page restores the route draft', await pts() === 3 && await page.getByRole('button', { name: /Done/ }).count() === 1)
await page.getByRole('button', { name: '✕' }).click(); await page.waitForTimeout(200)
check('cancel returns to idle', await page.getByRole('button', { name: '+ New Route' }).count() === 1)

// The reload above re-fit the map to saved routes (or a default view), so
// recentre before the next drawing section too.
await centerOnLand()

console.log('== Hotspot gestures')
const before = routerCalls
await page.getByRole('button', { name: '+ New hotspot' }).click(); await page.getByRole('menuitem', { name: /Terminal/ }).click(); await page.waitForTimeout(200)
for (const [dx,dy] of [[-80,-60],[80,-60],[80,60],[-80,60]]) { await click(cx+dx, cy+dy); await page.waitForTimeout(120) }
check('terminal: 4 corners, fill present', await pts() === 4 && await pts('draw-area') === 1)
check('terminal colour is sky', (await page.evaluate(() => window.__map.getPaintProperty('draw-area-fill','fill-color'))) === '#0ea5e9')
c = await cp(); p1 = await proj(c[1])
await page.mouse.move(box0.x+p1[0], box0.y+p1[1]); await page.mouse.down()
for (let i=1;i<=6;i++) await page.mouse.move(box0.x+p1[0]+40*i/6, box0.y+p1[1]-40*i/6)
await page.mouse.up(); await page.waitForTimeout(250)
c2 = await cp()
check('drag a corner moves it and the ring follows', Math.abs(c2[1][0]-c[1][0]) > 1e-4 && (await page.evaluate(async () => (await window.__src('draw-area')).features[0].geometry.coordinates[0][1][0])) === c2[1][0])
// insert on edge 1 (between corner 1 and 2)
s = await segs(); const e1 = s.find(f => f.properties.index === 1).geometry.coordinates; const em = [(e1[0][0]+e1[1][0])/2, (e1[0][1]+e1[1][1])/2]
pm = await proj(em); await click(pm[0], pm[1]); await page.waitForTimeout(250)
check('click an edge inserts a corner there', await pts() === 5 && (await cp())[2][0].toFixed(5) === em[0].toFixed(5))
// insert on the CLOSING edge (last → first): appends a corner
s = await segs(); const cl = s.find(f => f.properties.index === -1).geometry.coordinates; const cm = [(cl[0][0]+cl[1][0])/2, (cl[0][1]+cl[1][1])/2]
pm = await proj(cm); await click(pm[0], pm[1]); await page.waitForTimeout(250)
c = await cp()
check('click the closing edge appends a corner (ring re-closes through it)', c.length === 6 && c[5][0].toFixed(5) === cm[0].toFixed(5))
p3 = await proj(c[5]); await renderedAt(p3); await click(p3[0], p3[1], { button: 'right' }); await page.waitForTimeout(250)
check('right-click a corner deletes it', await pts() === 5)
// before > 0: the counter saw the route section's requests, so a 0 here is real.
check('no router calls during any hotspot gesture', routerCalls === before && before > 0, `${routerCalls - before} during hotspots, ${before} while drawing the route`)
check('Done enabled for the outline', await page.getByRole('button', { name: /Done/ }).isEnabled())
await page.getByRole('button', { name: '✕' }).click(); await page.waitForTimeout(200)
check('cancel returns to idle with both buttons', await page.getByRole('button', { name: '+ New hotspot' }).count() === 1)
check('no page errors', errors.length === 0, errors.slice(0,2).join(' | '))
await page.screenshot({ path: 'regression-final.png' })
await b.close()
const failed = results.filter(r => !r).length
console.log(`\n${results.length - failed} passed, ${failed} failed`); process.exit(failed ? 1 : 0)
