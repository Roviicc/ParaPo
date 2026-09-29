// Extend's join mode, on /studio/?e2e=1, in a development build.
//
//   npm run dev                          (in another terminal)
//   node tests/e2e/extend-test.mjs
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
// The toolbar's count; the draft is removed when the last point goes.
const pointsShown = async () => Number((await page.evaluate(() => document.body.innerText)).match(/(\d+) points?\b/)?.[1] ?? -1)

// Frame the stretch before the join, where the new route's clicks go.
const a = line[Math.max(0, mid - 30)]
const b = line[Math.max(0, mid - 12)]
await frame([a, join], 250)
await page.waitForTimeout(800)
const px = (ll) => page.evaluate((ll) => { const p = window.__map.project(ll); return [p.x, p.y] }, ll)
const waitRouted = () => page.waitForFunction(() => !document.body.innerText.includes('snapping…'), null, { timeout: 30000 })
// Whether a drawn point's dot is at a pixel (`there`), or has gone from it,
// within 5 s; as snap-test and regression-gestures wait. A new point is
// drawn, and can be hit, only once MapLibre has rebuilt the draw-points
// tiles on its worker. Until then a right-click there lands on the saved
// line under it, and the studio rightly follows that line. A fixed 300 ms
// was enough until 2026-09-29, when the owner's longer Bagong Silang lines
// made the frame below zoom out from 15 to 13 (nine tiles a source, not
// four) and GitHub's runner lost the race every time.
const dotAt = ([x, y], there = true) =>
  page.waitForFunction(([x, y, there]) =>
    (window.__map.queryRenderedFeatures([x, y], { layers: ['draw-point-dots'] }).length > 0) === there,
  [x, y, there], { timeout: 5000 }).then(() => true, () => false)
// A drawing's line as the studio joins it and saves it (shared/geo.ts
// joinSegments): each segment after the first starts on the point the one
// before it ends on, and that point is kept once.
const joined = (segments) => segments.flatMap((s, i) => (i === 0 ? s.coordinates : s.coordinates.slice(1)))

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
// Right-click the point once its dot is drawn, as a person does (see dotAt).
const dotShown = await dotAt([Ax, Ay])
await page.mouse.click(Ax, Ay, { button: 'right' })
await page.waitForTimeout(400)
check('right-click on a drawn point still deletes it, even on a saved line', dotShown && (await pointsShown()) === 0,
  dotShown ? `points ${await pointsShown()}` : 'its dot was not drawn in 5 s')

await page.mouse.click(Bx, By, { button: 'right' })
await page.waitForTimeout(400)
check('with nothing drawn, a right-click on a line says to draw first',
  (await page.evaluate(() => document.body.innerText)).includes('Draw from where the jeep starts first'))
await page.getByRole('button', { name: 'Dismiss' }).first().click()

// A click on a dot still drawn is a press on that point, not a new one
// (useDrawing's onMapClick): let the deleted point's dot go first.
await dotAt([Ax, Ay], false)
await page.mouse.click(Ax, Ay)
await page.waitForTimeout(300)
await page.mouse.click(Bx, By, { button: 'right' })
// The line's drawing is read from the database when it is followed (one
// request; the list carries no drawings since 2026-09-25): wait for the join
// to land in the draft before waiting for its gap to be routed.
await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('parapo.draft.v1') ?? '{}').borrow, null, { timeout: 15000 }).catch(() => {})
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
// The followed part: every segment after the routed gap (the drawing had one
// point, so one gap). It starts at the join spot, which is not one of the
// line's points unless it fell on one, then runs on the line's own points to
// its end. Compared whole, joined as the studio joins it: its last segment
// may hold fewer than 20 points, whose first then came twice in a flat list
// (on 2026-09-29, a6dc5193's last segment has 19, 2eed1668's 12).
const followedPart = joined(d.segments.slice(1)).slice(1)
check('the followed part is that line, point for point',
  !!followed && followedPart.length > 0 &&
    JSON.stringify(followedPart) === JSON.stringify(followed.coords.slice(-followedPart.length)),
  `${followedPart.length} points after the join`)

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
