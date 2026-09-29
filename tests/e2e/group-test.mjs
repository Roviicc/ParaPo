// The route list for a tap where routes share a road, on /studio/?e2e=1.
//
//   npm run dev                          (in another terminal)
//   node tests/e2e/group-test.mjs
//
// The owner's layout of 2026-09-25: the routes under the tap one way round at
// a time, grouped by the place they leave from ("Tala", then → SM Fairview
// and → Novaliches), with a switch to show them all the way back — his route
// list here too since 2026-09-29 ("Studio too"): a RouteCard per place, only
// what is drawn, and SWITCH. The list lights every direction it shows; a
// card picked narrows the lights to exactly its directions, each with
// flowing chevrons and a circle at either end, and where two lit lines share
// a road their chevrons flow as one stream; a second tap, or SWITCH, lets
// the card go (the owner's picks of 2026-09-29). Nothing fades: the other way round and every route
// the list does not show stay drawn as they rest. A click on the light-blue
// way back switches the list to it, and a click on a shown line where its
// outbound runs too keeps the shown one.
// Reads the live tables, so it finds its own spot: a vertex of
// one route lying on another route's line. SKIPs when no two routes share
// a road.
import { chromium } from 'playwright'

const BASE = (process.env.PARAPO_BASE ?? 'http://localhost:5173').replace(/\/$/, '')
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`) }
const skip = (name, reason) => console.log(`SKIP  ${name}  ${reason}`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.addInitScript(() => {
  window.__src = async (id) => { const s = window.__map?.getSource(id); return s ? await s.getData() : null }
  // Since 2026-09-25 a tap is feature state, not a filter or a paint
  // expression naming ids (useLighting in src/shared/useSavedRoutes.ts).
  // The directions a source has lit.
  window.__lit = async (src) => {
    const m = window.__map
    const fc = await m?.getSource(src)?.getData()
    if (!fc) return null
    return [...new Set(fc.features.map((f) => f.properties.id))].filter((id) => !!m.getFeatureState({ source: src, id }).lit)
  }
  // The route lines' paint, the owner's two looks of 2026-09-29: the colour a
  // line rests in, the colour of the lit copy drawn over it, and any
  // saved-routes layer whose opacity shades a line rather than switching it
  // on or off — the outputs of its expression, read branch by branch.
  window.__paint = () => {
    const m = window.__map
    const outputs = (e) =>
      typeof e === 'number' ? [e]
      : !Array.isArray(e) ? []
      : e[0] === 'case' ? [...e.slice(2, -1).filter((_, i) => i % 2 === 0), e.at(-1)].flatMap(outputs)
      : e[0] === 'step' ? [e[2], ...e.slice(4).filter((_, i) => i % 2 === 0)].flatMap(outputs)
      : e[0] === 'interpolate' ? e.slice(4).filter((_, i) => i % 2 === 0).flatMap(outputs)
      : []
    const shaded = m.getStyle().layers
      .filter((l) => l.id.startsWith('saved-routes') && l.type === 'line')
      .flatMap((l) => outputs(m.getPaintProperty(l.id, 'line-opacity') ?? 1).filter((o) => o > 0 && o < 1).map((o) => `${l.id} at ${o}`))
    return {
      rest: m.getPaintProperty('saved-routes-line', 'line-color'),
      lit: m.getPaintProperty('saved-routes-selected', 'line-color'),
      shaded,
    }
  }
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

const lines = await page.evaluate(async () =>
  (await window.__src('saved-routes')).features.map((f) => ({ id: f.properties.id, route: f.properties.route_id, coords: f.geometry.coordinates })),
)

// Metres from p to a line, flat around p: fine at street scale.
const offLine = (p, coords) => {
  const k = Math.cos((p[1] * Math.PI) / 180)
  let best = Infinity
  for (let i = 1; i < coords.length; i++) {
    const [a, b] = [coords[i - 1], coords[i]]
    const [ax, ay, bx, by] = [(a[0] - p[0]) * k, a[1] - p[1], (b[0] - p[0]) * k, b[1] - p[1]]
    const [dx, dy] = [bx - ax, by - ay]
    const l2 = dx * dx + dy * dy
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2))
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy) * 111_320)
  }
  return best
}

// The owner's two looks for the lines (2026-09-29), in the studio too: every
// one opaque in Map/RouteLine/surface-default, the lit ones drawn over them
// in …/surface-selected, and no layer shading a line. The hexes are
// mapColours.ts's, read from the dev server; a server that cannot serve it
// is held to two different colours.
const MAP = await page.evaluate(async () => {
  try {
    return (await import('/src/design-system/foundation/mapColours.ts')).MAP_COLOURS
  } catch {
    return null
  }
})
{
  const p = await page.evaluate(() => window.__paint())
  const twoLooks = p.shaded.length === 0 &&
    (MAP ? p.rest === MAP['Map/RouteLine/surface-default'] && p.lit === MAP['Map/RouteLine/surface-selected'] : !!p.rest && p.rest !== p.lit)
  check('the studio paints the lines in the same two looks, none shaded', twoLooks, JSON.stringify(p))
}

// A vertex in the middle stretch of one route that lies on another route's line.
let spot = null
for (const a of lines) {
  if (spot) break
  for (let i = Math.floor(a.coords.length * 0.2); i < a.coords.length * 0.8 && !spot; i += 5) {
    const p = a.coords[i]
    if (lines.some((b) => b.route !== a.route && offLine(p, b.coords) < 2)) spot = p
  }
}

if (!spot) {
  skip('a tap where two routes share a road', 'no two routes share a road in the live tables today')
} else {
  await page.evaluate((c) => window.__map.jumpTo({ center: c, zoom: 17 }), spot)
  await page.waitForTimeout(900)
  const [x, y] = await page.evaluate((c) => { const q = window.__map.project(c); return [q.x, q.y] }, spot)
  // The lines the app's own mouse box (±5 px) catches there.
  const caught = await page.evaluate(([x, y]) =>
    [...new Set(window.__map.queryRenderedFeatures([[x - 5, y - 5], [x + 5, y + 5]], { layers: ['saved-routes-hit'] }).map((f) => f.properties.id))],
  [x, y])
  await page.mouse.click(x, y)
  await page.waitForTimeout(700)

  const chooser = page.locator('[data-testid="chooser"]')
  check('a tap where routes share a road opens the list', (await chooser.count()) === 1)
  /** Whether the list shows the way back (SWITCH pressed). */
  const showsBack = async () =>
    (await chooser.locator('[data-testid="chooser-flip"]').getAttribute('aria-pressed', { timeout: 2000 }).catch(() => null)) === 'true'

  // What the list shows — each card's place, its rows and the directions
  // they open — what is lit, and what is drawn over it.
  const read = async () => {
    const origins = []
    for (const o of await chooser.locator('[data-testid="chooser-origin"]').all()) {
      // A RouteCard's place is its name, the button that picks the card.
      const from = (await o.locator('[data-testid="chooser-select"]').innerText()).trim()
      const rows = []
      for (const r of await o.locator('button[data-testid="chooser-item"]').all()) {
        const text = await r.innerText()
        rows.push({ id: await r.getAttribute('data-direction'), to: text.replace('→', '').split('\n').map((s) => s.trim()).filter(Boolean)[0], drawn: await r.isEnabled(), text })
      }
      origins.push({ from, rows })
    }
    const listed = origins.flatMap((o) => o.rows.map((r) => r.id))
    const selected = await chooser.locator('[data-state="selected"]').count()
    await page.waitForTimeout(300)
    const map = await page.evaluate(async () => {
      const m = window.__map
      const lit = (await window.__lit('saved-routes')) ?? []
      const endFeatures = (await window.__src('direction-ends'))?.features ?? []
      const ends = endFeatures.length
      // Every end, named or not: where its name was left off matters too.
      const endList = endFeatures.map((f) => ({ name: f.properties.name, named: !!f.properties.named, at: f.geometry.coordinates }))
      const names = endList.filter((e) => e.named).map((e) => e.name)
      const centres = ((await window.__src('direction-arrows'))?.features ?? []).map((f) => {
        const ring = f.geometry.coordinates[0].map((c) => m.project(c))
        return [ring.reduce((s, q) => s + q.x, 0) / ring.length, ring.reduce((s, q) => s + q.y, 0) / ring.length]
      })
      let doubled = 0
      for (let i = 0; i < centres.length; i++)
        for (let j = i + 1; j < centres.length; j++)
          if (Math.hypot(centres[i][0] - centres[j][0], centres[i][1] - centres[j][1]) < 3) doubled++
      return { lit, ends, endList, names, chevrons: centres.length, doubled }
    })
    return { origins, listed, selected, ...map }
  }
  /**
   * Picks the card with the most ways out — lines out of one place share its
   * road, so their chevrons meet — by a tap off its rows, and reads what it
   * lights: its directions alone (the owner, 2026-09-29).
   */
  const pick = async (r) => {
    const i = r.origins.reduce((best, o, j) => (o.rows.length > r.origins[best].rows.length ? j : best), 0)
    await chooser.locator('[data-testid="chooser-select"]').nth(i).click()
    await page.waitForTimeout(500)
    return { card: r.origins[i], at: i, ...(await read()) }
  }

  // What each line under the lit ones is drawn at, as the map works it out
  // line by line: the camera pulls back so every line is on screen, then
  // returns, so the chevrons are still measured where they were. Unset is
  // MapLibre's default, 1: since the owner's two looks (2026-09-29) nothing
  // under the lit ones fades.
  const levels = () =>
    page.evaluate(async () => {
      const m = window.__map
      const settle = () => new Promise((r) => { m.once('idle', r); setTimeout(r, 4000) })
      const camera = { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() }
      let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity]
      for (const f of (await window.__src('saved-routes')).features)
        for (const [x, y] of f.geometry.coordinates) [w, s, e, n] = [Math.min(w, x), Math.min(s, y), Math.max(e, x), Math.max(n, y)]
      m.fitBounds([[w, s], [e, n]], { padding: 40, duration: 0 })
      await settle()
      const byId = {}
      for (const f of m.queryRenderedFeatures({ layers: ['saved-routes-line'] })) byId[f.properties.id] = f.layer.paint?.['line-opacity'] ?? 1
      m.jumpTo(camera)
      await settle()
      return byId
    })
  const opaque = (byId, ids) => ids.every((id) => byId[id] === 1)
  const same = (a, b) => a.length === b.length && a.every((id) => b.includes(id))
  /**
   * Metres between two points, flat around the first: fine at street scale.
   * A degree is the map's own — geo.ts's haversine, on a 6,371 km earth.
   */
  const apart = (a, b) => Math.hypot((b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), b[1] - a[1]) * 111_195
  // directionArrows.ts's SAME_END_M, and a metre either side of it for the
  // flat sum above.
  const SAME_END_M = 150
  /**
   * The map's rule for naming ends, both halves: every place named, in the
   * list's words; a name twice only where those ends lie 150 m or more
   * apart; and an end left unnamed only where its name is already on the
   * map within 150 m — so a second label cannot quietly go either.
   */
  const namedRight = (endList, places) => {
    const named = endList.filter((e) => e.named)
    return (
      new Set(named.map((n) => n.name)).size === places.size &&
      named.every((n) => places.has(n.name)) &&
      named.every((a, i) => named.every((b, j) => j <= i || a.name !== b.name || apart(a.at, b.at) >= SAME_END_M - 1)) &&
      endList.every((e) => e.named || !e.name || named.some((n) => n.name === e.name && apart(n.at, e.at) < SAME_END_M + 1))
    )
  }

  // `out` is the way round the list opens on, `back` the other: which is
  // outbound depends on the lines under the tap. Everything it shows is lit
  // till a card is picked; then that card's directions, with their arrows,
  // circles and names.
  const opened = await read()
  check('the list lights every direction it shows, no card picked', opened.selected === 0 && opened.listed.length > 0 && same([...new Set(opened.lit)], opened.listed),
    `${new Set(opened.lit).size} lit, ${opened.listed.length} listed, ${opened.selected} Selected`)
  const out = await pick(opened)
  // The routes under the tap, and every direction of theirs drawn: all of
  // them listed, one way round or the other.
  const tapped = new Set(caught.map((id) => lines.find((l) => l.id === id)?.route))
  const drawnHere = lines.filter((l) => tapped.has(l.route)).map((l) => l.id)
  const firstBack = await showsBack()
  const outRows = out.origins.flatMap((o) => o.rows)
  const litOut = [...new Set(out.lit)]
  const listedOut = out.listed
  console.log(`      first (${firstBack ? 'the way back' : 'outbound'}): ${out.origins.map((o) => `${o.from} → ${o.rows.map((r) => r.to + (r.drawn ? '' : ' (not mapped)')).join(', ')}`).join(' | ')}`)
  check('the routes are listed under the place they leave from', out.origins.length >= 1 && outRows.length >= 2,
    `${out.origins.length} place(s), ${outRows.length} row(s)`)
  check('  one place per name, no place listed twice', new Set(out.origins.map((o) => o.from.toLowerCase())).size === out.origins.length)
  check(`  picking ${out.card.from}'s card lights exactly its directions`, out.selected === 1 && same(litOut, out.card.rows.map((r) => r.id)),
    `${litOut.length} lit for ${out.card.rows.length} row(s)`)
  if (out.card.rows.length < opened.listed.length) {
    check('  fewer than the list lit before', litOut.length < new Set(opened.lit).size, `${litOut.length} of ${new Set(opened.lit).size}`)
  } else {
    skip('  fewer than the list lit before', 'the busiest card lists everything this way round')
  }
  check('  a circle at each end of each lit direction', out.ends === 2 * litOut.length, `${out.ends} circle(s)`)
  // Every end named with the list's own words, each place once where its
  // ends meet: two ends of one name are one place within 150 m (SAME_END_M
  // in directionArrows.ts), and each has its name further apart — as the
  // routes into SM Fairview from Tala and from Bagong Silang Phase 5 do, 649
  // m apart ("two labels are right", the owner, 2026-09-29).
  const placesOut = new Set([out.card.from, ...out.card.rows.map((r) => r.to)])
  check('  each end is named, with the names the list uses, each place once where its ends meet',
    namedRight(out.endList, placesOut),
    `named ${out.names.join(', ')}`)
  check('  chevrons flow on them', out.chevrons > 0, `${out.chevrons} chevron(s)`)
  check('  where lit lines share a road, one stream: no chevron drawn twice', out.doubled === 0, `${out.doubled} doubled pair(s)`)
  const levelsOut = await levels()
  // A second tap on the card lets it go: everything listed lit again.
  await chooser.locator('[data-testid="chooser-select"]').nth(out.at).click()
  await page.waitForTimeout(500)
  const letGo = await read()
  check('  a second tap lets it go: nothing Selected, every direction listed lit again', letGo.selected === 0 && same([...new Set(letGo.lit)], letGo.listed),
    `${new Set(letGo.lit).size} lit, ${letGo.listed.length} listed, ${letGo.selected} Selected`)

  const flip = chooser.locator('[data-testid="chooser-flip"]')
  check('the list offers SWITCH', (await flip.count()) === 1 && (await flip.isEnabled()))
  // Picked again, so SWITCH has a card to let go.
  await chooser.locator('[data-testid="chooser-select"]').nth(out.at).click()
  await page.waitForTimeout(300)
  const repicked = (await chooser.locator('[data-state="selected"]').count()) === 1
  await flip.click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(500)
  const switched = await read()
  check('  SWITCH lets a picked card go: the other way round, all of it lit, nothing Selected', repicked && switched.selected === 0 && switched.listed.length > 0 && same([...new Set(switched.lit)], switched.listed),
    `picked ${repicked}; ${new Set(switched.lit).size} lit, ${switched.listed.length} listed, ${switched.selected} Selected`)
  const back = await pick(switched)
  const backRows = back.origins.flatMap((o) => o.rows)
  const litBack = [...new Set(back.lit)]
  const listedBack = back.listed
  console.log(`      after SWITCH: ${back.origins.map((o) => `${o.from} → ${o.rows.map((r) => r.to + (r.drawn ? '' : ' (not mapped)')).join(', ')}`).join(' | ')}`)
  check('SWITCH lists the same routes the other way round', same([...listedOut, ...listedBack], drawnHere),
    `${listedOut.length} + ${listedBack.length} listed, ${drawnHere.length} drawn under the tap`)
  // By name only where every route under the tap is drawn both ways: a way
  // still to draw is not listed, so its place has no row to go back to.
  if (![...tapped].every((r) => lines.filter((l) => l.route === r).length === 2)) {
    skip('  each leaves from where it was going', 'a route under the tap is drawn one way only')
  } else {
    check('  each leaves from where it was going',
      out.origins.every((o) => o.rows.every((r) => back.origins.some((b) => b.from === r.to && b.rows.some((s) => s.to === o.from)))))
  }
  check(`  picking ${back.card.from}'s card then lights its directions, none of the first`, same(litBack, back.card.rows.map((r) => r.id)) && litBack.every((id) => !litOut.includes(id)),
    `${litBack.length} lit`)
  check('  the circles follow', back.ends === 2 * litBack.length, `${back.ends} circle(s)`)
  const placesBack = new Set([back.card.from, ...back.card.rows.map((r) => r.to)])
  check('  and so do the names', namedRight(back.endList, placesBack), `named ${back.names.join(', ')}`)
  // The owner dropped "not mapped yet" from the list (2026-09-28): a row
  // that opens nothing is no row.
  check('  only drawn directions are listed, each row one that opens',
    [...outRows, ...backRows].every((r) => r.drawn) && [...listedOut, ...listedBack].every((id) => drawnHere.includes(id)),
    `${outRows.length} + ${backRows.length} row(s), ${[...outRows, ...backRows].filter((r) => !r.drawn).length} disabled`)
  // Outbound where an outbound line was under the tap, the way back where only ways back were.
  const outbound = firstBack ? listedBack : listedOut
  check('the list opened the way round under the tap', firstBack === !caught.some((id) => outbound.includes(id)),
    `caught ${caught.length} line(s), ${caught.filter((id) => outbound.includes(id)).length} outbound; opened ${firstBack ? 'the way back' : 'outbound'}`)

  // Two looks, no fading (the owner, 2026-09-29): the other way round, and
  // whatever the list does not show, stay drawn as they rest, opaque.
  const levelsBack = await levels()
  check('the other way round still shows, opaque, while one way is listed', opaque(levelsOut, listedBack),
    `${listedBack.length} drawn the other way: ${listedBack.map((id) => levelsOut[id]).join(', ')}`)
  check('  after SWITCH the first way does', opaque(levelsBack, listedOut), `${listedOut.length} drawn the first way: ${listedOut.map((id) => levelsBack[id]).join(', ')}`)
  const unlisted = lines.map((l) => l.id).filter((id) => !listedOut.includes(id) && !listedBack.includes(id))
  if (unlisted.length === 0) {
    skip('  a route the list does not show stays as it rests', 'every saved route is under this tap')
  } else {
    check('  a route the list does not show stays as it rests', opaque(levelsOut, unlisted) && opaque(levelsBack, unlisted),
      `${unlisted.length} not listed: ${unlisted.map((id) => `${levelsOut[id]}/${levelsBack[id]}`).join(', ')}`)
  }

  // A row opens that direction's card.
  const place = back.origins.find((o) => o.rows.some((r) => r.drawn))
  const row = place?.rows.find((r) => r.drawn)
  if (!place || !row) {
    skip('a row opens that direction', 'nothing drawn the way back')
  } else {
    // Straight away, whether its card is picked or not (the owner, 2026-09-29).
    const placeCard = chooser.locator('[data-testid="chooser-origin"]').nth(back.origins.indexOf(place))
    await placeCard.locator('button[data-testid="chooser-item"]:enabled').first().click()
    await page.waitForTimeout(600)
    const title = await page.locator('[data-testid="card-direction"]').first().innerText().catch(() => '')
    check('a row opens that direction\'s card', title === `${place.from} → ${row.to}`, title)
    const litOne = ((await page.evaluate(() => window.__lit('saved-routes'))) ?? []).length
    const endsOne = await page.evaluate(async () => ((await window.__src('direction-ends'))?.features ?? []).length)
    check('  lit alone, with its two circles', litOne === 1 && endsOne === 2, `${litOne} lit, ${endsOne} circle(s)`)
    // Its way back, and every other line, stay as they rest (two looks).
    const openId = ((await page.evaluate(() => window.__lit('saved-routes'))) ?? [''])[0]
    const openRoute = lines.find((l) => l.id === openId)?.route
    const twins = lines.filter((l) => l.route === openRoute && l.id !== openId).map((l) => l.id)
    const one = await levels()
    const others = Object.keys(one).filter((id) => id !== openId)
    check('  its way back, and the rest, stay as they rest', opaque(one, [...twins, ...others]), `${twins.length} way back, ${others.length} other line(s)`)
    // The studio keeps its ride-to preview as the public map gains the
    // hintuan pick (the owner, 2026-09-29): a hintuan row draws the way not
    // ridden at rest over the lit line, opaque in its white casing, with the
    // get-off circles the public map goes without; a second tap puts the
    // whole route back. The first row the line reaches is the one checked.
    const rideRows = page.locator('[data-testid="card"] button[data-testid="timeline-row"][title="Show the ride up to here"]')
    const rideCount = await rideRows.count()
    // The way between the ends is folded away until asked for.
    const between = page.locator('[data-testid="card"] [data-testid="card-timeline"]').first()
    if (rideCount && !(await between.evaluate((d) => d.open))) {
      await between.locator('summary').click()
      await page.waitForTimeout(200)
    }
    let ridden = null
    for (let i = 0; i < rideCount && !ridden; i++) {
      const rowEl = await rideRows.nth(i).elementHandle()
      await rowEl.scrollIntoViewIfNeeded()
      await rowEl.click()
      await page.waitForTimeout(900)
      const seen = await page.evaluate(async () => {
        const m = window.__map
        const fs = (await window.__src('ride-rest'))?.features ?? []
        const has = !!m.getLayer('ride-rest-line') && !!m.getLayer('ride-rest-casing')
        return {
          rest: fs.length,
          line: has ? m.getPaintProperty('ride-rest-line', 'line-color') : null,
          casing: has ? m.getPaintProperty('ride-rest-casing', 'line-color') : null,
          dots: document.querySelectorAll('[data-testid="ride-dot"]').length,
        }
      })
      if (seen.rest > 0) ridden = { rowEl, seen }
      else await rowEl.click() // the line misses its box: nothing to show; let it go
    }
    if (!ridden) {
      skip('  a hintuan row shows the ride up to it, get-off circles and all', rideCount ? "the line reaches none of its hintuans' boxes" : 'no hintuan on this direction')
    } else {
      const { seen } = ridden
      check(
        '  a hintuan row shows the ride up to it, get-off circles and all',
        (await ridden.rowEl.getAttribute('aria-pressed')) === 'true' && seen.dots > 0 &&
          (MAP ? seen.line === MAP['Map/RouteLine/surface-default'] : !!seen.line) && seen.casing === '#ffffff',
        `${seen.rest} stretch at rest in ${seen.line}, cased ${seen.casing}; ${seen.dots} circle(s)`,
      )
      await ridden.rowEl.click()
      await page.waitForTimeout(400)
      const back = await page.evaluate(async () => ({
        rest: ((await window.__src('ride-rest'))?.features ?? []).length,
        dots: document.querySelectorAll('[data-testid="ride-dot"]').length,
      }))
      check('  and a second tap puts the whole route back', back.rest === 0 && back.dots === 0, `${back.rest} at rest, ${back.dots} circle(s)`)
    }
    await page.locator('[data-testid="card"] button[aria-label="Close"]').first().click()
    await page.waitForTimeout(400)
    const endsNone = await page.evaluate(async () => ((await window.__src('direction-ends'))?.features ?? []).length)
    check('  closing it leaves no circles', endsNone === 0, `${endsNone} circle(s)`)
  }

  // ------------------------------------------- clicks while the list is open

  /**
   * Tap the spot again and set the list the way round asked for; what it
   * shows, no card picked: the directions it lists that way round, all lit,
   * and what a tap where directions overlap keeps to (useSavedRoutes'
   * `shown`).
   */
  const reopen = async (wantBack) => {
    await page.evaluate((c) => window.__map.jumpTo({ center: c, zoom: 17 }), spot)
    await page.waitForTimeout(700)
    await page.mouse.click(x, y)
    await page.waitForTimeout(700)
    if ((await showsBack()) !== wantBack) {
      await chooser.locator('[data-testid="chooser-flip"]').click()
      await page.waitForTimeout(500)
    }
    return (await read()).listed
  }
  /** The first of up to eight points, spread along `coords`, where what the app's own mouse box (±5 px) catches at zoom 17 passes `ok`. */
  const findSpot = async (coords, ok) => {
    for (const c of coords.filter((_, i) => i % Math.max(1, Math.floor(coords.length / 8)) === 0)) {
      await page.evaluate((c) => window.__map.jumpTo({ center: c, zoom: 17 }), c)
      await page.waitForTimeout(600)
      const p = await page.evaluate((c) => {
        const m = window.__map
        const q = m.project(c)
        const box = [[q.x - 5, q.y - 5], [q.x + 5, q.y + 5]]
        const ids = (layer) => [...new Set(m.queryRenderedFeatures(box, { layers: [layer] }).map((f) => f.properties.id))]
        return { x: q.x, y: q.y, ids: ids('saved-routes-hit'), stops: ids('saved-stops-fill').length }
      }, c)
      if (ok(p)) return p
    }
    return null
  }
  /** Click there; what is shown afterwards — the list's directions, or the card's lit one — and what the list or card says. */
  const clickAt = async (p) => {
    await page.mouse.click(p.x, p.y)
    await page.waitForTimeout(700)
    const now = await read()
    const shown = now.origins.length
      ? `list: ${now.origins.map((o) => `${o.from} → ${o.rows.map((r) => r.to).join(', ')}`).join(' | ')}`
      : `card: ${await page.locator('[data-testid="card-direction"]').first().innerText().catch(() => 'none')}`
    return { lit: now.origins.length > 0 ? now.listed : [...new Set(now.lit)], sheet: now.origins.length > 0, shown }
  }
  const every3 = (l) => l.coords.filter((_, i) => i % 3 === 0)
  const routeOf = (id) => lines.find((l) => l.id === id)?.route

  // With the list on the outbound, a click on the light-blue way back, away
  // from the lines it shows, switches to it: the owner's report of 2026-09-25,
  // "it's not switching". Where two ways back share a road the click catches
  // both, and the list opened on the outbound again, lighting lines nowhere
  // near the click.
  {
    const shownNow = await reopen(false)
    // The way back: the listed routes' lines the list is not showing.
    const wayBack = lines.filter((l) => !shownNow.includes(l.id) && shownNow.some((id) => routeOf(id) === l.route))
    const shownLines = lines.filter((l) => shownNow.includes(l.id))
    const far = wayBack.flatMap(every3).filter((c) => shownLines.every((l) => offLine(c, l.coords) > 40))
    const target = await findSpot(far, (p) => p.ids.length > 0 && !p.ids.some((id) => shownNow.includes(id)))
    if (!target) {
      skip('a click on the light-blue way back switches to it', 'no stretch of a way back runs 40 m clear of the lines shown')
    } else {
      const after = await clickAt(target)
      check('a click on the light-blue way back switches to it',
        target.ids.every((id) => after.lit.includes(id)) && !after.lit.some((id) => shownNow.includes(id)) && (!after.sheet || (await showsBack())),
        `caught ${target.ids.length} line(s), ${after.shown}`)
    }
  }

  // With the list on the way back, a click on a line it shows where its
  // route's outbound runs on the same road keeps the shown one: the owner's ask of
  // 2026-09-25 (a click on the lit Novaliches → Tala opened Tala →
  // Novaliches). One route under the click opens its card; more keep the list.
  /** Where one route alone runs both ways on one road, one of them shown; and which. */
  const bothWaysSpot = async (shownNow) => {
    const twinOf = (l) => lines.find((o) => o.route === l.route && o.id !== l.id)
    const bothWays = lines
      .filter((l) => shownNow.includes(l.id) && twinOf(l))
      .flatMap((l) => every3(l).filter((c) => offLine(c, twinOf(l).coords) < 2 && lines.every((o) => o.route === l.route || offLine(c, o.coords) > 40)))
    const alone = await findSpot(bothWays, (p) => p.ids.length === 2 && p.stops === 0 && p.ids.some((id) => shownNow.includes(id)))
    return alone && { alone, litId: alone.ids.find((id) => shownNow.includes(id)) }
  }
  {
    const spot = await bothWaysSpot(await reopen(true))
    if (!spot) {
      skip('a click on a shown line where its outbound runs too keeps the shown one', 'no stretch where one route alone runs both ways on one road')
    } else {
      const after = await clickAt(spot.alone)
      check('a click on a shown line where its outbound runs too keeps the shown one', after.lit.length === 1 && after.lit[0] === spot.litId, after.shown)
    }
  }
  // The same with another card of the list picked, lighting its own lines
  // only: what the list shows still decides (useSavedRoutes' `shown`,
  // 2026-09-29), not the outbound rule the unlit line would fall to.
  {
    const spot = await bothWaysSpot(await reopen(true))
    const other = spot ? (await read()).origins.findIndex((o) => !o.rows.some((r) => r.id === spot.litId)) : -1
    if (!spot) {
      skip('  and so it does with another card picked', 'no stretch where one route alone runs both ways on one road')
    } else if (other < 0) {
      skip('  and so it does with another card picked', "the list has no card but the shown line's")
    } else {
      await chooser.locator('[data-testid="chooser-select"]').nth(other).click()
      await page.waitForTimeout(500)
      const picked = (await read()).selected === 1
      const after = await clickAt(spot.alone)
      check('  and so it does with another card picked', picked && after.lit.length === 1 && after.lit[0] === spot.litId, `picked ${picked}; ${after.shown}`)
    }
  }
  {
    const shownNow = await reopen(true)
    const near = lines
      .filter((l) => shownNow.includes(l.id))
      .flatMap(every3)
      .filter((c) => lines.some((o) => !shownNow.includes(o.id) && offLine(c, o.coords) < 8))
    const mixed = await findSpot(near, (p) =>
      p.ids.some((id) => shownNow.includes(id)) && p.ids.some((id) => !shownNow.includes(id)) && new Set(p.ids.map(routeOf)).size >= 2)
    if (!mixed) {
      skip('  and where more routes run, the list keeps the way back', 'no lit stretch where another route and an outbound run too')
    } else {
      const after = await clickAt(mixed)
      check('  and where more routes run, the list keeps the way back',
        after.sheet && (await showsBack()) && mixed.ids.filter((id) => shownNow.includes(id)).every((id) => after.lit.includes(id)),
        `caught ${mixed.ids.length} line(s), ${after.shown}`)
    }
  }
}

check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
const failed = results.filter((r) => !r.ok).length
console.log(`${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
