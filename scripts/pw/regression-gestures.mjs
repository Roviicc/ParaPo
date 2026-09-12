import { chromium } from 'playwright'
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`) }
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1280, height: 800 } })
let routerCalls = 0
// PARAPO_NODE_FETCH=1: serve every https request through Node fetch. Needed only
// where the browser cannot reach the internet but Node can (sandboxed CI).
if (process.env.PARAPO_NODE_FETCH) {
await page.route(/^https:\/\//, async (route) => { const req = route.request(); if (/routing\.openstreetmap\.de|route\/v1\/driving/.test(req.url())) routerCalls++; try { const h={...req.headers()}; delete h['accept-encoding']; const r = await fetch(req.url(), { method: req.method(), headers: h, body: ['GET','HEAD'].includes(req.method())?undefined:req.postDataBuffer() }); const body=Buffer.from(await r.arrayBuffer()); const hh={}; r.headers.forEach((v,k)=>{ if(!['content-encoding','content-length','transfer-encoding'].includes(k)) hh[k]=v }); await route.fulfill({status:r.status,headers:hh,body}) } catch { await route.abort() } })
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

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' })
await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
await page.waitForFunction(async () => ((await window.__src('saved-routes'))?.features?.length ?? 0) > 0, null, { timeout: 20000 })
await page.waitForTimeout(800)
const box = await page.locator('canvas.maplibregl-canvas').boundingBox(); box0.x = box.x; box0.y = box.y
const click = (x, y, o) => page.mouse.click(box0.x + x, box0.y + y, o)

console.log('== Route drawing gestures (ported from scripts/uitest.mjs)')
check('map loads and + New Route is enabled', await page.getByRole('button', { name: '+ New Route' }).isEnabled())
check('pill shows the saved route count', /\d+ routes?/.test(await page.locator('body').innerText()))
await page.getByRole('button', { name: '+ New Route' }).click(); await page.waitForTimeout(200)
check('clicking + New Route enters drawing mode', await page.getByRole('button', { name: /Done/ }).count() === 1)
const cx = box.width/2, cy = box.height/2
for (const [dx,dy] of [[-150,0],[-50,0],[50,0],[150,0]]) { await click(cx+dx, cy+dy); await page.waitForTimeout(120) }
await idle()
check('four clicks add four control points', await pts() === 4, String(await pts()))
let s = await segs()
check('segments routed without error', s.length === 3 && s.every(f => f.properties.snap === 'snapped'), `${s.length} segs`)
// drag point 1
let c = await cp(); let p1 = await proj(c[1])
await page.mouse.move(box0.x+p1[0], box0.y+p1[1]); await page.mouse.down()
for (let i=1;i<=6;i++) await page.mouse.move(box0.x+p1[0], box0.y+p1[1]-60*i/6)
await page.mouse.up(); await idle(); await page.waitForTimeout(200)
let c2 = await cp()
check('dragging a point moves it (not the map)', Math.abs(c2[1][1] - c[1][1]) > 1e-4 && c2[0][0] === c[0][0], `dy=${(c2[1][1]-c[1][1]).toFixed(5)}`)
check('dragging keeps the point count', await pts() === 4)
// shift-click segment 0 midpoint to straighten
s = await segs(); const seg0 = s.find(f => f.properties.index === 0).geometry.coordinates; const mid = seg0[Math.floor(seg0.length/2)]
let pm = await proj(mid)
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
check('no router calls during any hotspot gesture', routerCalls === before, String(routerCalls - before))
check('Done enabled for the outline', await page.getByRole('button', { name: /Done/ }).isEnabled())
await page.getByRole('button', { name: '✕' }).click(); await page.waitForTimeout(200)
check('cancel returns to idle with both buttons', await page.getByRole('button', { name: '+ New hotspot' }).count() === 1)
check('no page errors', errors.length === 0, errors.slice(0,2).join(' | '))
await page.screenshot({ path: 'regression-final.png' })
await b.close()
const failed = results.filter(r => !r).length
console.log(`\n${results.length - failed} passed, ${failed} failed`); process.exit(failed ? 1 : 0)
