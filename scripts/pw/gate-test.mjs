// The studio's front door, in a development build.
//
//   npm run dev                          (in another terminal)
//   node scripts/pw/gate-test.mjs
//
// Signed out, /studio/ shows sign-in, none of the editing tools and no map, and
// links back to the public map. With ?e2e=1, in development only, the tools
// appear and Done still asks for sign-in, because saving needs an account. An
// auth result arriving at / is handed to /studio/ untouched. That no production
// file mentions e2e is checked by scripts/check-build.mjs.
import { chromium } from 'playwright'

const BASE = (process.env.PARAPO_BASE ?? 'http://localhost:5173').replace(/\/$/, '')
const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 800 } })
// PARAPO_NODE_FETCH=1: serve every https request through Node fetch. Needed only
// where the browser cannot reach the internet but Node can (sandboxed CI).
if (process.env.PARAPO_NODE_FETCH) {
await page.route(/^https:\/\//, async (route) => { const req = route.request(); try { const h={...req.headers()}; delete h['accept-encoding']; const r = await fetch(req.url(), { method: req.method(), headers: h, body: ['GET','HEAD'].includes(req.method())?undefined:req.postDataBuffer() }); const body=Buffer.from(await r.arrayBuffer()); const hh={}; r.headers.forEach((v,k)=>{ if(!['content-encoding','content-length','transfer-encoding'].includes(k)) hh[k]=v }); await route.fulfill({status:r.status,headers:hh,body}) } catch { await route.abort() } })
}
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

// 1. Signed out, no bypass: the door and nothing else.
await page.goto(`${BASE}/studio/`, { waitUntil: 'load' })
await page.getByText('Sign in to ParaPo Studio').waitFor({ timeout: 15000 }).catch(() => {})
check('signed-out /studio/ shows the sign-in door', (await page.getByText('Sign in to ParaPo Studio').count()) === 1)
check('  no + New Route button', (await page.getByRole('button', { name: '+ New Route' }).count()) === 0)
check('  no + New hotspot button', (await page.getByRole('button', { name: '+ New hotspot' }).count()) === 0)
check('  no map behind the door', (await page.locator('canvas.maplibregl-canvas').count()) === 0)
check(
  '  no Cancel; a link to the public map instead',
  (await page.getByRole('button', { name: 'Cancel' }).count()) === 0 &&
    (await page.getByRole('link', { name: 'Public map' }).getAttribute('href')) === '/',
)
check(
  '  the page asks search engines to stay away',
  (await page.locator('meta[name="robots"]').getAttribute('content')) === 'noindex, nofollow',
)
await page.getByRole('button', { name: 'Forgot password?' }).click()
check('  Forgot password? opens the reset form', (await page.getByText('Reset your password').count()) === 1)
await page.getByRole('button', { name: 'Sign in', exact: true }).click()
check('  and "Sign in" comes back to the door', (await page.getByText('Sign in to ParaPo Studio').count()) === 1)

// 2. ?e2e=1, development only: the tools, and Done still asks for sign-in.
await page.goto(`${BASE}/studio/?e2e=1`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
await page.waitForTimeout(800)
check('?e2e=1 shows the tools in development', (await page.getByRole('button', { name: '+ New hotspot' }).count()) === 1)
await page.getByRole('button', { name: '+ New hotspot' }).click()
await page.getByRole('menuitem', { name: /Terminal/ }).click()
const box = await page.locator('canvas.maplibregl-canvas').boundingBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2
for (const [dx, dy] of [[-80, -60], [80, -60], [80, 60]]) {
  await page.mouse.click(cx + dx, cy + dy)
  await page.waitForTimeout(150)
}
await page.getByRole('button', { name: /Done/ }).click()
await page.waitForTimeout(300)
check(
  '  Done while signed out asks to sign in, with no save panel',
  (await page.getByText('Sign in to save').count()) === 1 && (await page.getByText(/Save this terminal/).count()) === 0,
)
await page.getByRole('button', { name: 'Cancel' }).click()
await page.getByRole('button', { name: '✕' }).click()

// 3. An auth result arriving at / goes to /studio/ untouched.
await page.goto(`${BASE}/?type=recovery&probe=1#frag=2`, { waitUntil: 'load' })
await page.waitForURL(/\/studio\//, { timeout: 10000 }).catch(() => {})
check(
  '/ forwards ?type=recovery to /studio/, query and fragment intact',
  page.url() === `${BASE}/studio/?type=recovery&probe=1#frag=2`,
  page.url(),
)
await page.goto(
  `${BASE}/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`,
  { waitUntil: 'load' },
)
await page.waitForURL(/\/studio\//, { timeout: 10000 }).catch(() => {})
await page.getByText(/Reset link problem/).waitFor({ timeout: 10000 }).catch(() => {})
check(
  '/ forwards #error=… to /studio/, and the door explains it',
  new URL(page.url()).pathname === '/studio/' &&
    (await page.getByText('Reset link problem: Email link is invalid or has expired').count()) === 1,
  page.url().slice(0, 80),
)
await page.goto(`${BASE}/`, { waitUntil: 'load' })
await page.waitForTimeout(500)
check('a plain / stays on the public map', new URL(page.url()).pathname === '/', page.url())
await page.goto(`${BASE}/?code=T123&error=nope`, { waitUntil: 'load' })
await page.waitForTimeout(800)
check('a bare ?code= or ?error= is not an auth result: / stays put', new URL(page.url()).pathname === '/', page.url())

check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
await page.screenshot({ path: 'studio-gate.png' })
await b.close()
const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
