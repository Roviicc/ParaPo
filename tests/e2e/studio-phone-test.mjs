// The studio's drawing by finger: /studio/?e2e=1 as a phone, 390×844, touch
// only.
//
//   npm run dev                                (in another terminal)
//   node tests/e2e/studio-phone-test.mjs
//
// Taps go through Playwright's touchscreen; drags, long-presses and pinches
// are real touch events sent through the DevTools protocol, so MapLibre sees
// what a phone sends it. Points are put down on the saved route with the most
// coordinates, on its own vertices, so the router has a road to snap to. The
// router's requests are counted as the browser sends them (or as Node serves
// them, with PARAPO_NODE_FETCH=1).
import { chromium } from 'playwright'
import { BASE, harness, nodeFetch, waitForSource } from './lib/harness.mjs'
import { drawing } from './lib/studio.mjs'

const W = 390, H = 844
const { check, tally } = harness({ bracketed: true })
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })
const page = await ctx.newPage()
let routerCalls = 0
const isRouter = (url) => /routing\.openstreetmap\.de|route\/v1\/driving/.test(url)
if (process.env.PARAPO_NODE_FETCH) await nodeFetch(page, (req) => { if (isRouter(req.url())) routerCalls++ })
else page.on('request', (r) => { if (isRouter(r.url())) routerCalls++ })
const errors = []; page.on('pageerror', (e) => errors.push(String(e)))
await page.addInitScript(() => { window.__src = async (id) => { const s = window.__map?.getSource(id); return s ? await s.getData() : null } })
const cdp = await ctx.newCDPSession(page)
const { proj, idle } = drawing(page)

const bar = page.getByTestId('point-bar')
const cp = async () => page.evaluate(async () => ((await window.__src('draw-points'))?.features ?? []).map((f) => f.geometry.coordinates))
const segs = async () => page.evaluate(async () => (await window.__src('draw-line'))?.features ?? [])
const centreNow = () => page.evaluate(() => { const c = window.__map.getCenter(); return [c.lng, c.lat, window.__map.getZoom()] })
const settle = async () => { await page.waitForTimeout(300); await idle(); await page.waitForTimeout(300) }
/** Metres between two [lng, lat], near enough at Manila's latitude. */
const metres = (a, b) => Math.hypot((a[0] - b[0]) * 107_600, (a[1] - b[1]) * 110_600)

let box
const tap = (x, y) => page.touchscreen.tap(box.x + x, box.y + y)
const finger = (x, y, id = 0) => ({ x: box.x + x, y: box.y + y, id, radiusX: 5, radiusY: 5, force: 1 })
const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints })
/** One finger from `a` to `b` in `steps` moves, then lifted. */
const drag = async (a, z, steps = 10) => {
  await touch('touchStart', [finger(...a)])
  for (let i = 1; i <= steps; i++) {
    await touch('touchMove', [finger(a[0] + (z[0] - a[0]) * i / steps, a[1] + (z[1] - a[1]) * i / steps)])
    await page.waitForTimeout(16)
  }
  await touch('touchEnd', [])
}
const tapButton = async (loc) => { const r = await loc.first().boundingBox(); await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); await page.waitForTimeout(300) }
// ✕ asks first under a finger: Discard answers it.
const discard = async () => {
  for (const t of ['Discard this route', 'Discard this hotspot']) {
    const l = page.locator(`button[title="${t}"]`)
    if (await l.count()) await tapButton(l)
  }
  const yes = page.getByRole('button', { name: 'Discard', exact: true })
  if (await yes.count()) await tapButton(yes)
  await page.evaluate(() => localStorage.removeItem('parapo.draft.v1'))
}

await page.goto(`${BASE}/studio/?e2e=1`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__map?.loaded(), null, { timeout: 30000 })
const saved = await waitForSource(page, 'saved-routes', 20000)
const line = (saved ?? []).map((f) => f.geometry?.coordinates ?? []).reduce((a, c) => (c.length > a.length ? c : a), [])
const centre = line.length ? line[Math.floor(line.length / 2)] : [121.0527, 14.6187]
box = await page.locator('canvas.maplibregl-canvas').boundingBox()
const recentre = async (zoom = 15) => { await page.evaluate(([c, z]) => window.__map.jumpTo({ center: c, zoom: z }), [centre, zoom]); await page.waitForTimeout(500) }
// The saved route's vertices on screen, `gap` px apart, clear of the
// attribution at the top and the toolbar and its hint at the foot.
const roadPixels = (n, gap) => page.evaluate(([line, n, gap]) => {
  const m = window.__map, { clientWidth: w, clientHeight: h } = m.getCanvas(), picked = []
  for (const c of line) {
    const p = m.project(c)
    if (p.x < 40 || p.x > w - 40 || p.y < 140 || p.y > h - 240) continue
    if (picked.every(([x, y]) => Math.hypot(p.x - x, p.y - y) >= gap)) picked.push([p.x, p.y])
    if (picked.length === n) break
  }
  return picked
}, [line, n, gap])

/** A new route of `n` points tapped down on the saved route. */
const startRoute = async (n) => {
  await discard(); await recentre()
  await tapButton(page.getByRole('button', { name: '+ New Route' }))
  for (const [x, y] of await roadPixels(n, 70)) { await tap(x, y); await page.waitForTimeout(150) }
  await settle()
  return cp()
}

// ---------------------------------------------------------------- taps that add
let c = await startRoute(3)
check('tapping the map adds points', c.length === 3, `${c.length} points`)
// The spot on the line farthest from every point, so the tap is on the line
// and not on a point's dot.
const dots = await Promise.all(c.map(proj))
let at = null, clear = 0
for (const f of await segs()) for (const q of f.geometry.coordinates) {
  const p = await proj(q), d = Math.min(...dots.map((o) => Math.hypot(o[0] - p[0], o[1] - p[1])))
  if (d > clear) { at = p; clear = d }
}
if (clear > 30) { await tap(...at); await settle() }
c = await cp()
check('tapping the line between two points inserts one', clear > 30 && c.length === 4, `${c.length} points, the tap ${clear.toFixed(0)} px from the nearest`)

// ---------------------------------------------------------------- drag
c = await startRoute(3)
let calls = routerCalls
const cam = await centreNow()
const from = await proj(c[1])
await drag(from, [from[0] + 40, from[1] + 30])
await settle()
let after = await cp(); const camAfter = await centreNow()
check('a finger drag moves a route point', metres(after[1], c[1]) > 15 && metres(after[0], c[0]) < 1 && metres(after[2], c[2]) < 1, `moved ${metres(after[1], c[1]).toFixed(0)} m, the others ${metres(after[0], c[0]).toFixed(1)} and ${metres(after[2], c[2]).toFixed(1)} m`)
check('the map holds still under the drag', metres(cam, camAfter) < 1 && cam[2] === camAfter[2], `centre moved ${metres(cam, camAfter).toFixed(1)} m`)
check('the router is asked once, when the finger lifts', routerCalls - calls === 1, `${routerCalls - calls} router requests`)

// A finger starting just beside the dot still takes it.
c = after
const beside = await proj(c[2])
await drag([beside[0] + 12, beside[1] + 6], [beside[0] + 50, beside[1] - 30])
await settle()
after = await cp()
check('a drag from 13 px off a dot moves that point', after.length === 3 && metres(after[2], c[2]) > 15, `${after.length} points, moved ${metres(after[2], c[2]).toFixed(0)} m`)

// A second finger mid-drag puts the point back and pinches.
c = after
const z0 = (await centreNow())[2]
const p1 = await proj(c[1])
await touch('touchStart', [finger(...p1)])
for (let i = 1; i <= 6; i++) { await touch('touchMove', [finger(p1[0] + 8 * i, p1[1])]); await page.waitForTimeout(16) }
const other = [p1[0] + 48, p1[1] + 120]
await touch('touchStart', [finger(p1[0] + 48, p1[1], 0), finger(...other, 1)])
for (let i = 1; i <= 8; i++) { await touch('touchMove', [finger(p1[0] + 48, p1[1] - 10 * i, 0), finger(other[0], other[1] + 10 * i, 1)]); await page.waitForTimeout(16) }
await touch('touchEnd', [])
await settle()
after = await cp()
const z1 = (await centreNow())[2]
check('a second finger puts the dragged point back and pinches', after.length === 3 && metres(after[1], c[1]) < 1 && z1 > z0, `point ${metres(after[1], c[1]).toFixed(1)} m from where it was, zoom ${z0.toFixed(2)} → ${z1.toFixed(2)}`)

// A thumb resting off the map, on the toolbar, while a finger drags a point:
// lifting the finger ends the drag, and the map pans again after.
c = await startRoute(3)
const offMap = await page.evaluate(() => {
  const map = document.querySelector('canvas.maplibregl-canvas').parentElement.parentElement
  for (let y = innerHeight - 10; y > 0; y -= 10) for (let x = 10; x < innerWidth; x += 10) {
    const el = document.elementFromPoint(x, y)
    if (el && !map.contains(el) && !el.closest('button,a,input')) return [x, y]
  }
  return null
})
const p0 = await proj(c[1])
await touch('touchStart', [finger(...p0)])
for (let i = 1; i <= 6; i++) { await touch('touchMove', [finger(p0[0] + 8 * i, p0[1])]); await page.waitForTimeout(16) }
await touch('touchStart', [finger(p0[0] + 48, p0[1]), finger(...offMap, 1)])
await touch('touchMove', [finger(...offMap, 1)])
await touch('touchEnd', [])
await settle()
after = await cp()
const panFrom = await centreNow()
await drag([W / 2, 300], [W / 2 - 100, 360]); await page.waitForTimeout(400)
const panTo = await centreNow()
check('a thumb resting on the toolbar does not stick a drag', metres(after[1], c[1]) > 15 && (await segs()).every((f) => f.geometry.coordinates.length > 2) && metres(panFrom, panTo) > 50, `point moved ${metres(after[1], c[1]).toFixed(0)} m, stretches ${(await segs()).map((f) => f.geometry.coordinates.length)}, then a pan of ${metres(panFrom, panTo).toFixed(0)} m`)

// A second finger mid-drag puts back a stretch still waiting for the router,
// and it is asked for again rather than left straight.
let slowRouter = false
await page.route(/routing\.openstreetmap\.de|route\/v1\/driving/, async (route) => {
  if (slowRouter) await new Promise((r) => setTimeout(r, 3000))
  await route.fallback()
})
c = await startRoute(2)
slowRouter = true
const [sx, sy] = (await roadPixels(5, 70))[3] ?? [W / 2, 250]
await tap(sx, sy); await page.waitForTimeout(200)
const ps = await proj((await cp())[2])
await touch('touchStart', [finger(...ps)])
for (let i = 1; i <= 6; i++) { await touch('touchMove', [finger(ps[0] + 8 * i, ps[1])]); await page.waitForTimeout(16) }
await touch('touchStart', [finger(ps[0] + 48, ps[1]), finger(ps[0] + 48, ps[1] + 120, 1)])
await touch('touchEnd', [])
slowRouter = false
await page.waitForTimeout(3500); await settle()
const lens = (await segs()).map((f) => f.geometry.coordinates.length)
check('a stretch put back while it waited for the router is routed after all', lens.length === 2 && lens.every((n) => n > 2), `stretch coordinates ${lens}`)

// ---------------------------------------------------------------- taps that add nothing
c = await startRoute(3)
const last = await proj(c[2])
await tap(last[0] + 10, last[1] + 4); await settle()
check('a tap 11 px off a dot adds no point', (await cp()).length === 3, `${(await cp()).length} points`)
check('…and opens that point\'s bar', (await bar.textContent().catch(() => '')).includes('Point 3 of 3'), await bar.textContent().catch(() => 'no bar'))
await tap(W / 2, 200); await settle()
check('a tap on the map with the bar open closes it and adds nothing', !(await bar.count()) && (await cp()).length === 3, `bar ${await bar.count()}, ${(await cp()).length} points`)

const [fx, fy] = (await roadPixels(6, 70))[4] ?? [W / 2, 200]
await tap(fx, fy); await page.waitForTimeout(80); await tap(fx, fy); await settle()
check('a double-tap adds one point', (await cp()).length === 4, `${(await cp()).length} points`)
// Its second tap lands on the point the first added, and opens that point's bar.
if (await bar.count()) { await bar.getByRole('button', { name: 'Close' }).tap(); await page.waitForTimeout(300) }

c = await cp()
const empty = [W / 2, H / 2 - 120]
await touch('touchStart', [finger(...empty)]); await page.waitForTimeout(900); await touch('touchEnd', []); await settle()
check('a long-press adds no point', (await cp()).length === c.length, `${c.length} → ${(await cp()).length} points`)
await touch('touchStart', [finger(...empty)]); await page.waitForTimeout(900); await touch('touchEnd', [])
await page.waitForTimeout(300); await tap(empty[0], empty[1] + 60); await settle()
check('a tap soon after a long-press still adds its point', (await cp()).length === c.length + 1, `${c.length} → ${(await cp()).length} points`)
await page.getByRole('button', { name: /Undo/ }).tap(); await settle()

await drag(empty, [empty[0] - 120, empty[1] + 60]); await settle()
await touch('touchStart', [finger(W / 2 - 40, H / 2), finger(W / 2 + 40, H / 2, 1)])
for (let i = 1; i <= 8; i++) { await touch('touchMove', [finger(W / 2 - 40 - 8 * i, H / 2), finger(W / 2 + 40 + 8 * i, H / 2, 1)]); await page.waitForTimeout(16) }
await touch('touchEnd', []); await settle()
check('a pan and a pinch add no point', (await cp()).length === c.length, `${c.length} → ${(await cp()).length} points`)

// Android Chrome answers a long-press with a contextmenu, which is the
// desktop's delete. Held on a point, it must not delete it: MapLibre drops a
// contextmenu after a touch itself, and this keeps it doing so.
c = await cp()
await page.evaluate((p) => window.__map.jumpTo({ center: p }), c[1]); await page.waitForTimeout(300)
const held = await proj(c[1])
// What Android sends: a bare contextmenu, no mousedown before it.
const androidContextMenu = (p) => page.evaluate(([x, y]) => {
  const canvas = window.__map.getCanvas(), r = canvas.getBoundingClientRect()
  canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y, button: 2 }))
}, p)
await touch('touchStart', [finger(...held)])
await androidContextMenu(held)
await page.waitForTimeout(600); await touch('touchEnd', []); await settle()
check("a long-press's contextmenu deletes no point", (await cp()).length === c.length, `${c.length} → ${(await cp()).length} points`)
// The same contextmenu with no finger down is a right-click, and deletes.
await page.waitForTimeout(1000)
await page.mouse.click(box.x + held[0], box.y + held[1], { button: 'right' }); await settle()
check('a right-click with no finger down still deletes the point', (await cp()).length === c.length - 1, `${c.length} → ${(await cp()).length} points`)

// ---------------------------------------------------------------- the point bar
const snaps = async () => page.evaluate(async () => ((await window.__src('draw-line'))?.features ?? []).sort((a, b) => a.properties.index - b.properties.index).map((f) => f.properties.snap))
c = await startRoute(3)
let at1 = await proj(c[1])
await tap(...at1); await page.waitForTimeout(300)
const ring = await page.evaluate(async () => ((await window.__src('draw-points'))?.features ?? []).filter((f) => f.properties.selected).map((f) => f.properties.index))
check('a tap on a point opens its bar and rings it', (await bar.count()) === 1 && ring.join() === '1', `bar ${await bar.count()}, ringed ${ring}`)
const before = await snaps()
await page.getByTestId('stretch-1').tap(); await settle()
const flipped = await snaps()
check('a stretch button turns that stretch straight, and only it', before.join() === 'snapped,snapped' && flipped.join() === 'snapped,freehand', `${before} → ${flipped}`)
await page.getByTestId('stretch-1').tap(); await settle()
check('…and the same button turns it back to the streets', (await snaps()).join() === 'snapped,snapped', `${await snaps()}`)
await bar.getByRole('button', { name: 'Delete' }).tap(); await settle()
after = await cp()
check('Delete takes the point out, healing its two stretches', after.length === 2 && metres(after[1], c[2]) < 1 && (await snaps()).length === 1, `${after.length} points, ${(await snaps()).length} stretch`)
await page.getByRole('button', { name: 'Put back' }).tap(); await settle()
after = await cp()
check('Put back restores the point and both stretches', after.length === 3 && metres(after[1], c[1]) < 1 && (await snaps()).length === 2, `${after.length} points`)

// A mouse click on a dot is the desktop's, and opens no bar.
at1 = await proj((await cp())[1])
await page.mouse.click(box.x + at1[0], box.y + at1[1]); await page.waitForTimeout(400)
check('a mouse click on a point opens no bar', (await bar.count()) === 0, `bar ${await bar.count()}`)

// ---------------------------------------------------------------- Tap | Draw
const tapDraw = page.getByTestId('tap-draw')
const [nx, ny] = (await roadPixels(6, 70))[4] ?? [W / 2, 200]
await tapDraw.getByRole('button', { name: 'Draw' }).tap()
await tap(nx, ny); await settle()
check('Draw makes the next stretch straight', (await snaps()).at(-1) === 'freehand' && (await tapDraw.getByRole('button', { name: 'Draw' }).getAttribute('aria-pressed')) === 'true', `${await snaps()}`)
await tapDraw.getByRole('button', { name: 'Tap' }).tap()
const [mx, my] = (await roadPixels(7, 70))[5] ?? [W / 2, 260]
await tap(mx, my); await settle()
check('Tap makes the next one follow the streets again', (await snaps()).at(-1) === 'snapped', `${await snaps()}`)

// ---------------------------------------------------------------- toolbar
// A point opened and closed again: no bar, no Follow offer, the hint back.
await tap(...(await proj((await cp())[0]))); await page.waitForTimeout(300)
await bar.getByRole('button', { name: 'Close' }).tap(); await page.waitForTimeout(300)
const hintText = await page.getByTestId('draw-toolbar').innerText()
check('the hint speaks of taps, not right-clicks', hintText.includes('tap a point for options') && !/right-click|shift-click/.test(hintText), hintText.replace(/\n/g, ' / '))
await page.locator('button[title="Discard this route"]').tap()
check('✕ asks before discarding', (await page.getByRole('button', { name: 'Keep' }).count()) === 1 && (await cp()).length > 0)
await page.getByRole('button', { name: 'Keep' }).tap()
check('Keep keeps the drawing', (await cp()).length > 0 && (await page.getByRole('button', { name: /Done/ }).count()) === 1)
const small = await page.evaluate(() => [...document.querySelectorAll('[data-testid="draw-toolbar"] button')].map((b) => [b.textContent.trim(), Math.round(b.getBoundingClientRect().height)]).filter(([, h]) => h < 44))
check('every drawing button is at least 44 px tall', small.length === 0, JSON.stringify(small))

// ---------------------------------------------------------------- follow by finger
// A tap on a saved line, away from the drawing, offers to follow it; taking
// the offer drops that tap's point and joins the line there.
c = await startRoute(2)
const onLine = (await roadPixels(8, 70))[4]
if (onLine) {
  await tap(...onLine); await settle()
  const chip = page.getByTestId('follow-chip')
  check('a tap on a saved line offers to follow it', (await chip.count()) === 1, `chip ${await chip.count()}, ${(await cp()).length} points`)
  await chip.tap(); await page.waitForTimeout(1500); await settle()
  const joined = await page.evaluate(() => JSON.parse(localStorage.getItem('parapo.draft.v1') ?? 'null')?.borrow ?? null)
  check('Follow joins the saved line', joined !== null && (await cp()).length > 2, `borrow ${JSON.stringify(joined)}, ${(await cp()).length} points`)
} else check('a tap on a saved line offers to follow it', false, 'no vertex of the saved line on screen')

// ---------------------------------------------------------------- hotspot
await discard(); await recentre(16)
await tapButton(page.getByRole('button', { name: '+ New hotspot' }))
await tapButton(page.getByRole('menuitem', { name: /Terminal/ }))
const cx = W / 2, cy = H / 2 - 80
for (const [dx, dy] of [[-70, -60], [70, -60], [70, 60], [-70, 60]]) { await tap(cx + dx, cy + dy); await page.waitForTimeout(200) }
await page.waitForTimeout(300)
c = await cp()
calls = routerCalls
const k0 = await proj(c[0])
await drag(k0, [k0[0] - 30, k0[1] - 30]); await page.waitForTimeout(400)
after = await cp()
check('a finger drag moves a hotspot corner, with no router', after.length === 4 && metres(after[0], c[0]) > 10 && routerCalls === calls, `${after.length} corners, moved ${metres(after[0], c[0]).toFixed(0)} m, ${routerCalls - calls} router requests`)
await tap(...(await proj(after[3]))); await page.waitForTimeout(300)
await bar.getByRole('button', { name: 'Delete' }).tap(); await page.waitForTimeout(300)
check('a hotspot corner deletes from its bar', (await cp()).length === 3, `${(await cp()).length} corners`)
await tap(...(await proj((await cp())[0]))); await page.waitForTimeout(300)
check('…but not below 3 corners', (await bar.count()) === 1 && (await bar.getByRole('button', { name: 'Delete' }).count()) === 0, await bar.textContent().catch(() => 'no bar'))
await discard()

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
await b.close()
tally()
