// The studio's save flows, driven without an account and without the live
// tables: a stand-in for the database answers reads from today's map.json (the
// rows as the database keeps them) and echoes writes back as saved rows, a
// stored session is faked so ✓ Done opens the save panel, the basemap is a
// flat grey and the router has no roads (every gap falls back to freehand).
//
//   npm run dev                                (in another terminal)
//   node scripts/pw/studio-standin.mjs         # against http://localhost:5173
//
// Not a suite: it prints what the page holds at each step and screenshots it
// (standin-*.png in the current directory), so a person can see a save flow
// end to end. It is the seed for a save-flow suite (stage 4 of
// docs/plan-cleanup-2026-09-29.md): the CI suites run signed out, so nothing
// in routesWrite.ts or stopsWrite.ts has ever run under a check. Written for
// the review of 2026-09-29 (docs/review-2026-09-29.md), where it found the
// link sync's request growing with every hintuan and the count pill counting
// directions.
//
// The faked session is what supabase-js reads from localStorage: a JWT-shaped
// access token with a far-off `exp`, a refresh token and a user. Nothing checks
// its signature in the browser; the database would, which is why the stand-in
// answers every write instead.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = (process.env.PARAPO_BASE ?? 'http://localhost:5173').replace(/\/$/, '')
/** The project ref in VITE_SUPABASE_URL, which names the storage key. */
const PROJECT_REF = 'smzwbqxttdyvohuizynl'

// ------------------------------------------------------------- the tables
const m = JSON.parse(readFileSync(new URL('../../public/data/map.json', import.meta.url), 'utf8'))
const now = '2026-09-25T12:00:00+00:00'
const OWNER = '11111111-1111-4111-8111-111111111111'
const variants = m.variants.map((v) => ({
  id: v.id, route_id: v.route_id, owner_id: OWNER, direction_name: null, origin_terminal: null, destination_terminal: null,
  shape: v.shape,
  control_points: v.shape ? [v.shape.coordinates[0], v.shape.coordinates.at(-1)] : [],
  segments: v.shape ? [{ snap: 'snapped', coordinates: v.shape.coordinates, streets: [] }] : [],
  reversed: v.reversed, confidence: v.confidence ?? 'drawn', borrowed_from: null, borrowed_part: null, borrowed_m: null,
  created_at: now, updated_at: now,
  route: {
    id: v.route.id, owner_id: OWNER, signboard: v.route.signboard ?? null, route_code: null, short_name: null,
    long_name: v.route.long_name ?? null, mode: v.route.mode, fare_note: v.route.fare_note ?? null, fare_as_of: null,
    head_stop_id: v.route.head_stop_id, tail_stop_id: v.route.tail_stop_id, via: v.route.via ?? null, created_at: now, updated_at: now,
  },
}))
const routes = Object.values(Object.fromEntries(variants.map((v) => [v.route.id, v.route])))
const stops = m.stops.map((s) => ({ ...s, owner_id: OWNER, created_at: now }))
const links = m.links.map((l) => ({ route_variant_id: l.route_variant_id, stop_id: l.stop_id, stop_sequence: l.stop_sequence }))
const tables = { route_variant: variants, route: routes, stop: stops, route_stop: links }

// ---------------------------------------------------------- the stand-in
/** The columns a select asks for, or null for all of them. `route:route(*)` is the column `route`. */
const columnsOf = (select) => (!select || select === '*' ? null : select.split(',').map((c) => c.trim().split(':')[0].split('(')[0]))
const pick = (row, cols) => (cols ? Object.fromEntries(cols.filter((c) => c in row).map((c) => [c, row[c]])) : row)
/** Every write the page sent, in order. */
const writes = []
let seq = 0
/** A saved row as the database would send it back: the columns the page did not send, and a direction's route embedded. */
const stamp = (table, r) => {
  const row = { id: `new-${++seq}`, created_at: now, updated_at: now, owner_id: OWNER, ...r }
  if (table === 'route') {
    const full = { signboard: null, route_code: null, short_name: null, long_name: null, mode: 'jeepney', fare_note: null, fare_as_of: null, via: null, ...row }
    routes.push(full)
    return full
  }
  if (table === 'route_variant') {
    const full = { direction_name: null, origin_terminal: null, destination_terminal: null, confidence: 'drawn', borrowed_from: null, borrowed_part: null, borrowed_m: null, ...row, route: routes.find((x) => x.id === r.route_id) ?? null }
    variants.push(full)
    return full
  }
  if (table === 'stop') stops.push(row)
  if (table === 'route_stop') links.push(row)
  return row
}
const serve = (route) => {
  const req = route.request()
  const u = new URL(req.url())
  const table = u.pathname.split('/rest/v1/')[1]
  const one = /object/.test(req.headers().accept ?? '')
  if (req.method() !== 'GET') {
    const body = req.postData() ? JSON.parse(req.postData()) : null
    writes.push({ method: req.method(), table, query: u.search, body })
    if (req.method() === 'DELETE') return route.fulfill({ status: 204, body: '' })
    const out = Array.isArray(body) ? body.map((r) => stamp(table, r)) : body ? stamp(table, body) : null
    return route.fulfill({
      status: req.method() === 'POST' ? 201 : 200,
      contentType: 'application/json',
      body: JSON.stringify(one ? (Array.isArray(out) ? out[0] : out) : Array.isArray(out) ? out : [out]),
    })
  }
  let rows = tables[table] ?? []
  // The filters the editor uses: id=eq.<id>, kind=eq.<kind>; area=not.is.null is true of every row here.
  for (const [k, v] of u.searchParams) {
    if (k === 'id' && v.startsWith('eq.')) rows = rows.filter((r) => r.id === v.slice(3))
    if (k === 'kind' && v.startsWith('eq.')) rows = rows.filter((r) => r.kind === v.slice(3))
  }
  const offset = Number(u.searchParams.get('offset') ?? 0)
  const limit = Number(u.searchParams.get('limit') ?? 1000)
  const chunk = rows.slice(offset, offset + limit).map((r) => pick(r, columnsOf(u.searchParams.get('select'))))
  return route.fulfill({
    status: one && !chunk[0] ? 406 : 200,
    contentType: 'application/json',
    // Exposed, as the database exposes it: the page is on another origin.
    headers: { 'content-range': chunk.length ? `${offset}-${offset + chunk.length - 1}/${rows.length}` : `*/${rows.length}`, 'access-control-expose-headers': 'content-range' },
    body: JSON.stringify(one ? (chunk[0] ?? null) : chunk),
  })
}

// ------------------------------------------------------------ the session
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const exp = Math.floor(Date.now() / 1000) + 6 * 3600
const user = { id: OWNER, aud: 'authenticated', role: 'authenticated', email: 'owner@example.com', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: now, updated_at: now }
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: OWNER, aud: 'authenticated', role: 'authenticated', email: user.email, exp, iat: exp - 3600, session_id: 'standin' })}.standin`
const session = { access_token: jwt, refresh_token: 'standin', token_type: 'bearer', expires_in: 6 * 3600, expires_at: exp, user }

// ------------------------------------------------------------ the browser
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)))
page.on('console', async (msg) => {
  if (msg.type() !== 'error') return
  // React's warnings carry the key and the component stack as separate arguments.
  let args = []
  try { args = await Promise.all(msg.args().map((a) => a.jsonValue().catch(() => '?'))) } catch { /* gone */ }
  errors.push(msg.text().slice(0, 120) + (args.length > 1 ? ' | ' + args.slice(1).map((a) => String(a).replace(/\s+/g, ' ').slice(0, 200)).join(' | ') : ''))
})
await page.route(/tiles\.openfreemap\.org/, (route) =>
  /\/styles\//.test(route.request().url())
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e8e8e8' } }] }) })
    : route.fulfill({ status: 404, body: '' }),
)
await page.route(/\/rest\/v1\//, serve)
await page.route(/\/auth\/v1\/user/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }))
await page.route(/\/auth\/v1\//, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...session, user }) }))
await page.route(/router\.project-osrm\.org/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'NoRoute', routes: [] }) }))
await page.addInitScript(
  ({ key, s }) => {
    window.__src = async (id) => { const src = window.__map?.getSource(id); return src ? await src.getData() : null }
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(s))
  },
  { key: `sb-${PROJECT_REF}-auth-token`, s: session },
)

let n = 0
const shot = async (name) => { n++; const f = `standin-${String(n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f }); console.log(`  ${f}`) }
const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400)
const feats = async (src) => page.evaluate(async (s) => (await window.__src(s))?.features?.length ?? 0, src)
const buttons = async () => (await page.getByRole('button').evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent || '').trim()).filter(Boolean))).join(' | ')
/** A modal's own button first, then the toolbar's ✕, then Escape. */
const dismiss = async () => {
  for (let i = 0; i < 4; i++) {
    const d = page.getByRole('button', { name: /^(Back to map|Dismiss|Close|Cancel|Not now|Discard)$/ })
    if (!(await d.count())) break
    await d.first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(300)
  }
  const x = page.getByRole('button', { name: /Discard this route|Discard this hotspot|^✕$/ })
  if (await x.count()) { await x.first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(300) }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}
const lastWrites = (k) => writes.slice(-k).map((w) => `${w.method} ${w.table}${w.query.slice(0, 60)}${w.query.length > 60 ? '…' : ''}`).join('\n     ')

await page.goto(`${BASE}/studio/`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
for (let i = 0; i < 100 && (await feats('saved-routes')) === 0; i++) await page.waitForTimeout(100)
await page.waitForTimeout(800)
console.log('== opened, signed in:', await text())
await shot('opened')

// Street level on the longest saved line, as the suites do.
const line = await page.evaluate(async () => ((await window.__src('saved-routes'))?.features ?? []).map((f) => f.geometry?.coordinates ?? []).reduce((a, c) => (c.length > a.length ? c : a), []))
const mid = line[Math.floor(line.length / 2)]
await page.evaluate((c) => window.__map.jumpTo({ center: c, zoom: 15 }), mid)
await page.waitForTimeout(400)
const box = await page.locator('canvas.maplibregl-canvas').boundingBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2

// ---- A. draw a route, open the save panel, save it
await page.getByRole('button', { name: '+ New Route' }).click()
await page.waitForTimeout(300)
for (const [dx, dy] of [[-150, -60], [0, -60], [150, 40]]) { await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(400) }
await page.waitForFunction(() => !document.body.innerText.includes('snapping…'), null, { timeout: 30000 }).catch(() => {})
await page.getByRole('button', { name: /Done/ }).click()
await page.waitForTimeout(800)
console.log('== Done:', await text())
await shot('save-panel')
const save = page.getByRole('button', { name: /^(Save|Update)$/ })
await save.first().click()
await page.waitForTimeout(800)
console.log('== Save with the panel\'s first guess:', (await text()).slice(-160))
for (const id of ['save-head', 'save-tail']) {
  const el = page.getByTestId(id)
  const opts = await el.evaluate((e) => [...e.options].map((o) => o.value).filter(Boolean))
  await el.selectOption(id === 'save-tail' ? opts[1] : opts[0])
}
await page.waitForTimeout(300)
await save.first().click()
await page.waitForTimeout(1500)
console.log('== Save with two ends:', await text())
console.log('   writes:', lastWrites(3))
console.log('   draft:', await page.evaluate(() => localStorage.getItem('parapo.draft.v1')), '| saved-routes:', await feats('saved-routes'))
await shot('saved')
await dismiss()

// ---- B. trace a hintuan, save it
await page.evaluate((c) => window.__map.jumpTo({ center: c, zoom: 17 }), mid)
await page.waitForTimeout(400)
await page.getByRole('button', { name: '+ New hotspot' }).click()
await page.waitForTimeout(300)
await page.getByRole('menuitem', { name: /Hintuan/ }).click()
await page.waitForTimeout(300)
for (const [dx, dy] of [[-80, -60], [80, -60], [80, 60], [-80, 60]]) { await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(200) }
await page.getByRole('button', { name: /Done/ }).click()
await page.waitForTimeout(800)
console.log('== hotspot panel:', await text())
await shot('hotspot-panel')
await page.locator('input[type=text], input:not([type])').first().fill('Stand-in Hintuan')
await page.getByRole('button', { name: /^Save (hintuan|terminal)$/ }).click()
await page.waitForTimeout(1500)
console.log('== hotspot saved:', await text())
console.log('   writes:', lastWrites(3))
await shot('hotspot-saved')
await dismiss()

// ---- C. tap a line, pick a card, Edit
await page.evaluate((c) => window.__map.jumpTo({ center: c, zoom: 15 }), mid)
await page.waitForTimeout(400)
const p = await page.evaluate((c) => { const q = window.__map.project(c); return [q.x, q.y] }, mid)
await page.mouse.click(box.x + p[0], box.y + p[1])
await page.waitForTimeout(700)
console.log('== tapped a line:', await text())
const names = (await page.getByRole('button').allInnerTexts()).map((t) => t.trim()).filter((t) => t && !/^(SWITCH|Close|Zoom|Drag|Map design|Password|Sign out|\+ New)/.test(t))
if (names[0]) { await page.getByRole('button', { name: names[0], exact: true }).first().click(); await page.waitForTimeout(700) }
console.log('== picked a card:', await text())
console.log('   buttons:', await buttons())
await shot('card')
const edit = page.getByRole('button', { name: /^Edit/ })
if (await edit.count()) {
  await edit.first().click()
  await page.waitForTimeout(1200)
  console.log('== Edit:', await text(), '| draw-points:', await feats('draw-points'))
  await shot('edit')
}

console.log(`\n== ${writes.length} write(s) in all:\n     ${lastWrites(writes.length)}`)
console.log(`== ${errors.length} page error(s)${errors.length ? ':\n     ' + errors.join('\n     ') : ''}`)
await b.close()
