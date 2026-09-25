// Extend's join mode, on /studio/?e2e=1, in a development build.
//
//   npm run dev                          (in another terminal)
//   node scripts/pw/extend-test.mjs
//
// A new route that keeps the *end* of a saved line is drawn forwards, from
// where its jeep starts to where it joins: each click goes in just ahead of
// the join point, never after the line's last point. The Extend button itself
// is behind sign-in (it is an owner's card action), so this starts from the
// state it leaves: a draft holding the saved line's second half, with the
// join at its first point. The draft is the same one a reload restores.
import { chromium } from 'playwright'

const BASE = (process.env.PARAPO_BASE ?? 'http://localhost:5173').replace(/\/$/, '')
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`) }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.addInitScript(() => {
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
await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
if ((await waitForSource('saved-routes')).length === 0) throw new Error('no saved routes arrived in 20 s')
const line = await page.evaluate(async () => {
  const fs = (await window.__src('saved-routes')).features
  return fs.sort((a, b) => b.geometry.coordinates.length - a.geometry.coordinates.length)[0].geometry.coordinates
})
check('a saved line to extend', line.length > 60, `${line.length} vertices`)

const mid = Math.floor(line.length / 2)
const join = line[mid]
const kept = line.slice(mid)
const draft = {
  controlPoints: [join, kept[kept.length - 1]],
  segments: [{ snap: 'snapped', coordinates: kept }],
  target: { routeId: null, variantId: null },
  area: null,
  borrow: { variantId: 'probe', part: 'end' },
  join: 0,
}
await page.evaluate((d) => localStorage.setItem('parapo.draft.v1', JSON.stringify(d)), draft)
await page.reload({ waitUntil: 'load' })
await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
const readDraft = () => page.evaluate(() => JSON.parse(localStorage.getItem('parapo.draft.v1') ?? 'null'))
const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9
// Frame some points. fitBounds reads a pair as [south-west, north-east]; two
// points the other way round make a box around the whole planet.
const frame = (pts, padding) =>
  page.evaluate(([pts, padding]) => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
    window.__map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding, duration: 0 })
  }, [pts, padding])
// The toolbar's count. The draft is not rewritten when the last point goes.
const pointsShown = async () => Number((await page.evaluate(() => document.body.innerText)).match(/(\d+) points?\b/)?.[1] ?? -1)

// Frame the stretch before the join, where the new route's clicks go.
const a = line[Math.max(0, mid - 30)]
const b = line[Math.max(0, mid - 12)]
await frame([a, join], 250)
await page.waitForTimeout(800)
const px = (ll) => page.evaluate((ll) => { const p = window.__map.project(ll); return [p.x, p.y] }, ll)
const waitRouted = () => page.waitForFunction(() => !document.body.innerText.includes('snapping…'), null, { timeout: 30000 })

let d = await readDraft()
check('the draft comes back with its join', d?.join === 0 && d?.borrow?.part === 'end')

const [ax, ay] = await px(a)
await page.mouse.click(ax, ay)
await page.waitForTimeout(300)
await waitRouted()
await page.waitForTimeout(300)
d = await readDraft()
check('first click goes in before the join', d.controlPoints.length === 3 && same(d.controlPoints[1], join) && d.join === 1,
  `points ${d.controlPoints.length}, join at ${d.join}`)
check('its gap runs from the click to the join', d.segments.length === 2 && d.segments[0].coordinates.length >= 2)

const [bx, by] = await px(b)
await page.mouse.click(bx, by)
await page.waitForTimeout(300)
await waitRouted()
await page.waitForTimeout(300)
d = await readDraft()
check('second click goes between the first and the join', d.controlPoints.length === 4 && same(d.controlPoints[2], join) && d.join === 2,
  `points ${d.controlPoints.length}, join at ${d.join}`)
check('the borrowed end is untouched', JSON.stringify(d.segments[d.segments.length - 1].coordinates) === JSON.stringify(kept))
check('segments stay one fewer than points', d.segments.length === d.controlPoints.length - 1)

await page.keyboard.press('Control+z')
await page.waitForTimeout(300)
await waitRouted()
await page.waitForTimeout(300)
d = await readDraft()
check('undo takes back the click next to the join', d.controlPoints.length === 3 && same(d.controlPoints[1], join) && d.join === 1,
  `points ${d.controlPoints.length}, join at ${d.join}`)
await page.keyboard.press('Control+z')
await page.waitForTimeout(300)
await page.keyboard.press('Control+z')
await page.waitForTimeout(300)
d = await readDraft()
check('undo never eats into the borrowed end', d.controlPoints.length === 2 && d.join === 0, `points ${d.controlPoints.length}`)

// ------------------------------------------------ follow a saved line, mid-drawing
// A right-click on a saved line while drawing joins it there and copies the
// rest of it: for a return trip that meets another route's line and rides it
// home. Which line is followed depends on the data, so the check is that the
// drawing now ends where *a* saved line ends, and borrows from that one.
await page.evaluate(() => localStorage.removeItem('parapo.draft.v1'))
await page.reload({ waitUntil: 'load' })
await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
if ((await waitForSource('saved-routes')).length === 0) throw new Error('no saved routes arrived in 20 s')
const saved = await page.evaluate(async () =>
  (await window.__src('saved-routes')).features.map((f) => ({ id: f.properties.id, coords: f.geometry.coordinates })),
)
await page.locator('button[title="Draw a route"]').click()
await page.waitForTimeout(300)
const A = line[Math.floor(line.length * 0.1)]
const B = line[Math.floor(line.length * 0.3)]
await frame([A, B], 200)
await page.waitForTimeout(800)
const [Ax, Ay] = await px(A)
const [Bx, By] = await px(B)

await page.mouse.click(Ax, Ay)
await page.waitForTimeout(300)
await page.mouse.click(Ax, Ay, { button: 'right' })
await page.waitForTimeout(400)
check('right-click on a drawn point still deletes it, even on a saved line', (await pointsShown()) === 0,
  `points ${await pointsShown()}`)

await page.mouse.click(Bx, By, { button: 'right' })
await page.waitForTimeout(400)
check('with nothing drawn, a right-click on a line says to draw first',
  (await page.evaluate(() => document.body.innerText)).includes('Draw from where the jeep starts first'))
await page.getByRole('button', { name: 'Dismiss' }).first().click()

await page.mouse.click(Ax, Ay)
await page.waitForTimeout(300)
await page.mouse.click(Bx, By, { button: 'right' })
await page.waitForTimeout(400)
await waitRouted()
await page.waitForTimeout(400)
d = await readDraft()
const lastCoord = d.segments[d.segments.length - 1]?.coordinates?.at(-1)
const followed = saved.find((s) => s.id === d.borrow?.variantId)
check('a right-click on a saved line joins it and follows it to its end',
  d.controlPoints.length > 2 && !!followed && same(lastCoord, followed.coords[followed.coords.length - 1]),
  `points ${d.controlPoints.length}, borrows ${d.borrow?.variantId?.slice(0, 8)} (${d.borrow?.part})`)
check('the join is routed, one segment per gap', d.segments.length === d.controlPoints.length - 1 && d.segments[0].snap === 'snapped')
const followedTail = followed ? followed.coords.slice(-20) : []
check('the followed part is that line, point for point',
  JSON.stringify(d.segments.flatMap((s) => s.coordinates).slice(-20)) === JSON.stringify(followedTail))

await page.keyboard.press('Control+z')
await page.waitForTimeout(400)
d = await readDraft()
check('undo takes the whole join back', d.controlPoints.length === 1 && !d.borrow, `points ${d.controlPoints.length}`)
await page.locator('button[title="Discard this route"]').click()
await page.waitForTimeout(300)

// Leave nothing behind for the owner's next visit.
await page.evaluate(() => localStorage.removeItem('parapo.draft.v1'))
check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
const failed = results.filter((r) => !r.ok).length
console.log(`${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
