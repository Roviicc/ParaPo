import { chromium } from 'playwright'
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`) }
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1280, height: 800 } })
// PARAPO_NODE_FETCH=1: serve every https request through Node fetch. Needed only
// where the browser cannot reach the internet but Node can (sandboxed CI).
if (process.env.PARAPO_NODE_FETCH) {
await page.route(/^https:\/\//, async (route) => { const req = route.request(); try { const h={...req.headers()}; delete h['accept-encoding']; const r = await fetch(req.url(), { method: req.method(), headers: h, body: ['GET','HEAD'].includes(req.method())?undefined:req.postDataBuffer() }); const body=Buffer.from(await r.arrayBuffer()); const hh={}; r.headers.forEach((v,k)=>{ if(!['content-encoding','content-length','transfer-encoding'].includes(k)) hh[k]=v }); await route.fulfill({status:r.status,headers:hh,body}) } catch { await route.abort() } })
}
await page.addInitScript(() => { window.__src = async (id) => { const s = window.__map?.getSource(id); return s ? await s.getData() : null } })
const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type()==='error') errors.push(m.text().slice(0,160)) })
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' })
await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
await page.waitForFunction(async () => ((await window.__src('saved-stops'))?.features?.length ?? 0) > 0, null, { timeout: 20000 }).catch(()=>{})
await page.waitForTimeout(1200)

const data = await page.evaluate(async () => {
  const m = window.__map
  const fc = await window.__src('saved-stops')
  const polys = fc.features.filter(f => f.geometry.type === 'Polygon')
  const pts = fc.features.filter(f => f.geometry.type === 'Point')
  const order = m.getStyle().layers.map(l => l.id)
  return {
    polys: polys.map(f => ({ id: f.properties.id, kind: f.properties.kind, name: f.properties.name, ring: f.geometry.coordinates[0] })),
    labels: pts.length,
    fillIdx: order.indexOf('saved-stops-fill'), outlineIdx: order.indexOf('saved-stops-outline'),
    routesCasingIdx: order.indexOf('saved-routes-casing'), routesHitIdx: order.indexOf('saved-routes-hit'), labelIdx: order.indexOf('saved-stops-label'),
    pillText: document.body.innerText.match(/\d+ routes? · \d+ hotspots?/)?.[0] ?? null,
  }
})
check('both saved hotspots are on the map', data.polys.length === 2, data.polys.map(p => p.kind + ':' + p.name).join(', '))
check('one label point per hotspot', data.labels === 2, String(data.labels))
check('hotspot fill + outline sit BELOW the route lines', data.fillIdx < data.routesCasingIdx && data.outlineIdx < data.routesCasingIdx, `fill ${data.fillIdx} outline ${data.outlineIdx} routes ${data.routesCasingIdx}`)
check('labels sit ABOVE the route hit layer', data.labelIdx > data.routesHitIdx)
check('account pill counts hotspots', /1 route · 2 hotspots/.test(data.pillText ?? ''), data.pillText)

// Tap each hotspot: fly to its centroid, click, read the card.
for (const p of data.polys) {
  const cx = p.ring.reduce((a, c) => a + c[0], 0) / p.ring.length, cy = p.ring.reduce((a, c) => a + c[1], 0) / p.ring.length
  await page.evaluate(([x, y]) => window.__map.jumpTo({ center: [x, y], zoom: 18 }), [cx, cy])
  await page.waitForTimeout(900)
  const pt = await page.evaluate(([x, y]) => { const q = window.__map.project([x, y]); return [q.x, q.y] }, [cx, cy])
  const box = await page.locator('canvas.maplibregl-canvas').boundingBox()
  // click slightly off-centre so we do not land exactly on a route line
  await page.mouse.click(box.x + pt[0] + 6, box.y + pt[1] + 6)
  await page.waitForTimeout(400)
  const card = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(d => d.className.includes('w-80') && d.innerText.includes('Routes that'))
    return el ? el.innerText : null
  })
  const isTerminal = p.kind === 'terminal'
  check(`tap ${p.kind} "${p.name}" opens its card`, !!card && card.includes(p.name))
  check(`  card says ${isTerminal ? 'Terminal' : 'Hintuan'}`, !!card && card.includes(isTerminal ? 'Terminal · routes start here' : 'Hintuan · wait and board here'))
  check('  card lists Tala → to SM Fairview', !!card && card.includes('Tala') && card.includes('to SM Fairview'))
  check('  no Edit/Delete for a visitor', !!card && !card.includes('Delete'))
  await page.screenshot({ path: `hotspot-card-${p.kind}.png` })
  // clicking the direction chip selects the route and swaps the card
  await page.getByRole('button', { name: 'to SM Fairview' }).click()
  await page.waitForTimeout(300)
  const routeCard = await page.evaluate(() => document.body.innerText.includes('drawn, not yet ridden') && !document.body.innerText.includes('Routes that'))
  check('  direction chip → route card replaces hotspot card', routeCard)
  await page.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(200)
}

// Click priority: a point ON the route line inside the hintuan selects the route, not the hotspot
const h = data.polys.find(p => p.kind === 'hintuan')
const hit = await page.evaluate(async (ring) => {
  const m = window.__map
  const routes = await window.__src('saved-routes'); const line = routes.features[0].geometry.coordinates
  // route vertex index 133 is inside/at the hintuan (from the DB check) — project it
  const c = line[133]; const q = m.project(c); return [q.x, q.y]
}, h.ring)
const box = await page.locator('canvas.maplibregl-canvas').boundingBox()
await page.evaluate(async () => { const routes = await window.__src('saved-routes'); const c = routes.features[0].geometry.coordinates[133]; window.__map.jumpTo({ center: c, zoom: 18 }) })
await page.waitForTimeout(800)
const centre = [box.x + box.width/2, box.y + box.height/2]
await page.mouse.click(centre[0], centre[1]); await page.waitForTimeout(400)
const which = await page.evaluate(() => ({ route: document.body.innerText.includes('drawn, not yet ridden'), hotspot: document.body.innerText.includes('Routes that pass through') }))
check('click on the route line inside a hotspot selects the ROUTE', which.route && !which.hotspot, JSON.stringify(which))
await page.screenshot({ path: 'hotspot-click-priority.png' })

check('no page errors', errors.length === 0, errors.slice(0,2).join(' | '))
await b.close()
const failed = results.filter(r => !r).length
console.log(`\n${results.length - failed} passed, ${failed} failed`); process.exit(failed ? 1 : 0)
