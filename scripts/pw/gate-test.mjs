import { chromium } from 'playwright'
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1280, height: 800 } })
// PARAPO_NODE_FETCH=1: serve every https request through Node fetch. Needed only
// where the browser cannot reach the internet but Node can (sandboxed CI).
if (process.env.PARAPO_NODE_FETCH) {
await page.route(/^https:\/\//, async (route) => { const req = route.request(); try { const h={...req.headers()}; delete h['accept-encoding']; const r = await fetch(req.url(), { method: req.method(), headers: h, body: ['GET','HEAD'].includes(req.method())?undefined:req.postDataBuffer() }); const body=Buffer.from(await r.arrayBuffer()); const hh={}; r.headers.forEach((v,k)=>{ if(!['content-encoding','content-length','transfer-encoding'].includes(k)) hh[k]=v }); await route.fulfill({status:r.status,headers:hh,body}) } catch { await route.abort() } })
}
const errors = []; page.on('pageerror', e => errors.push(String(e)))
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' })
await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
await page.waitForTimeout(800)
await page.getByRole('button', { name: '+ New hotspot' }).click()
await page.getByRole('menuitem', { name: /Terminal/ }).click()
const box = await page.locator('canvas.maplibregl-canvas').boundingBox(); const cx = box.x+box.width/2, cy = box.y+box.height/2
for (const [dx,dy] of [[-80,-60],[80,-60],[80,60]]) { await page.mouse.click(cx+dx, cy+dy); await page.waitForTimeout(150) }
await page.getByRole('button', { name: /Done/ }).click()
await page.waitForTimeout(300)
const signIn = await page.getByText('Sign in to save').count()
const panel = await page.getByText(/Save this terminal/).count()
console.log(signIn === 1 && panel === 0 ? 'PASS' : 'FAIL', 'signed-out Done on a terminal asks to sign in (no save panel)', {signIn, panel})
console.log(errors.length === 0 ? 'PASS' : 'FAIL', 'no page errors', errors.slice(0,2))
await page.screenshot({ path: 'terminal-gate.png' })
await b.close()
