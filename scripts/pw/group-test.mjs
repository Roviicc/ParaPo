// The sheet for a tap where routes share a road, on /studio/?e2e=1.
//
//   npm run dev                          (in another terminal)
//   node scripts/pw/group-test.mjs
//
// The owner's layout of 2026-09-25: the routes under the tap one way round at
// a time, grouped by the place they leave from ("Tala", then → SM Fairview
// and → Novaliches), with ⇄ to show them all the way back. The map lights
// exactly what the list shows, each with flowing chevrons and a circle at
// either end, and where two lit lines share a road their chevrons flow as
// one stream. The same routes the other way round stay at rest, light blue,
// and only a route the list does not show fades (the owner's pick of the
// same day); a click on that light-blue way back switches the list to it,
// and a click on a lit line where its outbound runs too keeps the lit one.
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
  check('a tap where routes share a road opens the sheet', (await chooser.count()) === 1)
  /** Whether the sheet shows the way back (⇄ pressed). */
  const showsBack = async () =>
    (await chooser.locator('[data-testid="chooser-flip"]').getAttribute('aria-pressed', { timeout: 2000 }).catch(() => null)) === 'true'

  // What the sheet shows, what is lit, and what is drawn over it.
  const read = async () => {
    const origins = []
    for (const o of await chooser.locator('[data-testid="chooser-origin"]').all()) {
      const from = (await o.locator('p').first().innerText()).trim()
      const rows = []
      for (const r of await o.locator('button[data-testid="chooser-item"]').all()) {
        const text = await r.innerText()
        rows.push({ to: text.replace('→', '').split('\n').map((s) => s.trim()).filter(Boolean)[0], drawn: await r.isEnabled(), text })
      }
      origins.push({ from, rows })
    }
    await page.waitForTimeout(300)
    const map = await page.evaluate(async () => {
      const m = window.__map
      const lit = (JSON.stringify(m.getFilter('saved-routes-selected')).match(/[0-9a-f]{8}-[0-9a-f-]{27}/g) ?? [])
      const endFeatures = (await window.__src('direction-ends'))?.features ?? []
      const ends = endFeatures.length
      const names = endFeatures.filter((f) => f.properties.named).map((f) => f.properties.name)
      const centres = ((await window.__src('direction-arrows'))?.features ?? []).map((f) => {
        const ring = f.geometry.coordinates[0].map((c) => m.project(c))
        return [ring.reduce((s, q) => s + q.x, 0) / ring.length, ring.reduce((s, q) => s + q.y, 0) / ring.length]
      })
      let doubled = 0
      for (let i = 0; i < centres.length; i++)
        for (let j = i + 1; j < centres.length; j++)
          if (Math.hypot(centres[i][0] - centres[j][0], centres[i][1] - centres[j][1]) < 3) doubled++
      return { lit, ends, names, chevrons: centres.length, doubled }
    })
    return { origins, ...map }
  }

  // What each line under the lit ones is drawn at, as the map works it out
  // line by line: the camera pulls back so every line is on screen, then
  // returns, so the chevrons are still measured where they were.
  const REST = 0.45
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
      for (const f of m.queryRenderedFeatures({ layers: ['saved-routes-line'] })) byId[f.properties.id] = f.layer.paint['line-opacity']
      m.jumpTo(camera)
      await settle()
      return byId
    })
  const restingIn = (byId) => Object.keys(byId).filter((id) => byId[id] === REST)
  const same = (a, b) => a.length === b.length && a.every((id) => b.includes(id))

  // `out` is the way round the sheet opens on, `back` the other: which is
  // outbound depends on the lines under the tap.
  const out = await read()
  const firstBack = await showsBack()
  const outRows = out.origins.flatMap((o) => o.rows)
  const litOut = [...new Set(out.lit)]
  console.log(`      first (${firstBack ? 'the way back' : 'outbound'}): ${out.origins.map((o) => `${o.from} → ${o.rows.map((r) => r.to + (r.drawn ? '' : ' (not mapped)')).join(', ')}`).join(' | ')}`)
  check('the routes are listed under the place they leave from', out.origins.length >= 1 && outRows.length >= 2,
    `${out.origins.length} place(s), ${outRows.length} row(s)`)
  check('  one place per name, no place listed twice', new Set(out.origins.map((o) => o.from.toLowerCase())).size === out.origins.length)
  check('  the map lights exactly the drawn directions listed', litOut.length === outRows.filter((r) => r.drawn).length,
    `${litOut.length} lit, ${outRows.filter((r) => r.drawn).length} drawn row(s)`)
  check('  a circle at each end of each lit direction', out.ends === 2 * litOut.length, `${out.ends} circle(s)`)
  // Every end named with the list's own words, each place once.
  const placesOut = new Set(out.origins.flatMap((o) => [o.from, ...o.rows.filter((r) => r.drawn).map((r) => r.to)]))
  check('  each end is named, with the names the list uses, each place once',
    out.names.length === placesOut.size && out.names.every((n) => placesOut.has(n)),
    `named ${out.names.join(', ')}`)
  check('  chevrons flow on them', out.chevrons > 0, `${out.chevrons} chevron(s)`)
  check('  where lit lines share a road, one stream: no chevron drawn twice', out.doubled === 0, `${out.doubled} doubled pair(s)`)
  const levelsOut = await levels()

  const flip = chooser.locator('[data-testid="chooser-flip"]')
  check('the sheet offers ⇄', (await flip.count()) === 1)
  await flip.click()
  await page.waitForTimeout(500)
  const back = await read()
  const backRows = back.origins.flatMap((o) => o.rows)
  const litBack = [...new Set(back.lit)]
  console.log(`      after ⇄: ${back.origins.map((o) => `${o.from} → ${o.rows.map((r) => r.to + (r.drawn ? '' : ' (not mapped)')).join(', ')}`).join(' | ')}`)
  check('⇄ lists the same routes the other way round', backRows.length === outRows.length, `${backRows.length} row(s)`)
  check('  each leaves from where it was going',
    out.origins.every((o) => o.rows.every((r) => back.origins.some((b) => b.from === r.to && b.rows.some((s) => s.to === o.from)))))
  check('  the lit lines change over, none kept', litBack.every((id) => !litOut.includes(id)) && litBack.length === backRows.filter((r) => r.drawn).length,
    `${litBack.length} lit`)
  check('  the circles follow', back.ends === 2 * litBack.length, `${back.ends} circle(s)`)
  const placesBack = new Set(back.origins.filter((o) => o.rows.some((r) => r.drawn)).flatMap((o) => [o.from, ...o.rows.filter((r) => r.drawn).map((r) => r.to)]))
  check('  and so do the names', back.names.length === placesBack.size && back.names.every((n) => placesBack.has(n)), `named ${back.names.join(', ')}`)
  check('  a direction not drawn yet says so, and cannot be opened',
    [...outRows, ...backRows].filter((r) => !r.drawn).every((r) => r.text.includes('Not mapped yet')),
    `${[...outRows, ...backRows].filter((r) => !r.drawn).length} undrawn row(s)`)
  // Outbound where an outbound line was under the tap, the way back where only ways back were.
  const outbound = firstBack ? litBack : litOut
  check('the sheet opened the way round under the tap', firstBack === !caught.some((id) => outbound.includes(id)),
    `caught ${caught.length} line(s), ${caught.filter((id) => outbound.includes(id)).length} outbound; opened ${firstBack ? 'the way back' : 'outbound'}`)

  // The other way round rests; only what the list does not show fades.
  const levelsBack = await levels()
  const [restOut, restBack] = [restingIn(levelsOut), restingIn(levelsBack)]
  check('the other way round rests in light blue while one way is listed', same(restOut, litBack),
    `${restOut.length} resting, ${litBack.length} drawn the other way`)
  check('  after ⇄ the first way rests instead', same(restBack, litOut), `${restBack.length} resting, ${litOut.length} drawn the first way`)
  const unlisted = lines.map((l) => l.id).filter((id) => !litOut.includes(id) && !litBack.includes(id))
  if (unlisted.length === 0) {
    skip('  a route the list does not show fades', 'every saved route is under this tap')
  } else {
    check('  a route the list does not show fades', unlisted.every((id) => levelsOut[id] < REST && levelsBack[id] < REST),
      `${unlisted.length} not listed: ${unlisted.map((id) => `${levelsOut[id]}/${levelsBack[id]}`).join(', ')}`)
  }

  // A row opens that direction's card.
  const place = back.origins.find((o) => o.rows.some((r) => r.drawn))
  const row = place?.rows.find((r) => r.drawn)
  if (!place || !row) {
    skip('a row opens that direction', 'nothing drawn the way back')
  } else {
    await chooser.locator('[data-testid="chooser-origin"]').filter({ hasText: place.from }).locator('button[data-testid="chooser-item"]:enabled').first().click()
    await page.waitForTimeout(600)
    const title = await page.locator('[data-testid="card-direction"]').first().innerText().catch(() => '')
    check('a row opens that direction\'s card', title === `${place.from} → ${row.to}`, title)
    const litOne = await page.evaluate(() => (JSON.stringify(window.__map.getFilter('saved-routes-selected')).match(/[0-9a-f]{8}-[0-9a-f-]{27}/g) ?? []).length)
    const endsOne = await page.evaluate(async () => ((await window.__src('direction-ends'))?.features ?? []).length)
    check('  lit alone, with its two circles', litOne === 1 && endsOne === 2, `${litOne} lit, ${endsOne} circle(s)`)
    // Its way back rests in light blue, as in the list (the owner's pick, 2026-09-25).
    const openId = (JSON.stringify(await page.evaluate(() => window.__map.getFilter('saved-routes-selected'))).match(/[0-9a-f]{8}-[0-9a-f-]{27}/) ?? [''])[0]
    const openRoute = lines.find((l) => l.id === openId)?.route
    const twins = lines.filter((l) => l.route === openRoute && l.id !== openId).map((l) => l.id)
    const restOne = restingIn(await levels())
    check('  its way back rests in light blue, nothing else', same(restOne, twins), `${restOne.length} resting, ${twins.length} way back drawn`)
    await page.locator('[data-testid="card"] button[aria-label="Close"]').first().click()
    await page.waitForTimeout(400)
    const endsNone = await page.evaluate(async () => ((await window.__src('direction-ends'))?.features ?? []).length)
    check('  closing it leaves no circles', endsNone === 0, `${endsNone} circle(s)`)
  }

  // ------------------------------------------- clicks while the list is open

  /** Tap the spot again and set the list the way round asked for; what it lights. */
  const reopen = async (wantBack) => {
    await page.evaluate((c) => window.__map.jumpTo({ center: c, zoom: 17 }), spot)
    await page.waitForTimeout(700)
    await page.mouse.click(x, y)
    await page.waitForTimeout(700)
    if ((await showsBack()) !== wantBack) {
      await chooser.locator('[data-testid="chooser-flip"]').click()
      await page.waitForTimeout(500)
    }
    return [...new Set((await read()).lit)]
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
  /** Click there; what is lit afterwards, and what the sheet or card says. */
  const clickAt = async (p) => {
    await page.mouse.click(p.x, p.y)
    await page.waitForTimeout(700)
    const now = await read()
    const shown = now.origins.length
      ? `sheet: ${now.origins.map((o) => `${o.from} → ${o.rows.map((r) => r.to).join(', ')}`).join(' | ')}`
      : `card: ${await page.locator('[data-testid="card-direction"]').first().innerText().catch(() => 'none')}`
    return { lit: [...new Set(now.lit)], sheet: now.origins.length > 0, shown }
  }
  const every3 = (l) => l.coords.filter((_, i) => i % 3 === 0)
  const routeOf = (id) => lines.find((l) => l.id === id)?.route

  // With the list on the outbound, a click on the light-blue way back, away
  // from the lit lines, switches to it: the owner's report of 2026-09-25,
  // "it's not switching". Where two ways back share a road the click catches
  // both, and the sheet opened on the outbound again, lighting lines nowhere
  // near the click.
  {
    const litNow = await reopen(false)
    const resting = restingIn(await levels())
    const litLines = lines.filter((l) => litNow.includes(l.id))
    const far = lines.filter((l) => resting.includes(l.id)).flatMap(every3).filter((c) => litLines.every((l) => offLine(c, l.coords) > 40))
    const target = await findSpot(far, (p) => p.ids.length > 0 && !p.ids.some((id) => litNow.includes(id)))
    if (!target) {
      skip('a click on the light-blue way back switches to it', 'no stretch of a way back runs 40 m clear of the lit lines')
    } else {
      const after = await clickAt(target)
      check('a click on the light-blue way back switches to it',
        target.ids.every((id) => after.lit.includes(id)) && !after.lit.some((id) => litNow.includes(id)) && (!after.sheet || (await showsBack())),
        `caught ${target.ids.length} line(s), ${after.shown}`)
    }
  }

  // With the list on the way back, a click on a lit line where its route's
  // outbound runs on the same road keeps the lit one: the owner's ask of
  // 2026-09-25 (a click on the lit Novaliches → Tala opened Tala →
  // Novaliches). One route under the click opens its card; more keep the list.
  {
    const litNow = await reopen(true)
    const twinOf = (l) => lines.find((o) => o.route === l.route && o.id !== l.id)
    const bothWays = lines
      .filter((l) => litNow.includes(l.id) && twinOf(l))
      .flatMap((l) => every3(l).filter((c) => offLine(c, twinOf(l).coords) < 2 && lines.every((o) => o.route === l.route || offLine(c, o.coords) > 40)))
    const alone = await findSpot(bothWays, (p) => p.ids.length === 2 && p.stops === 0 && p.ids.some((id) => litNow.includes(id)))
    if (!alone) {
      skip('a click on a lit line where its outbound runs too keeps the lit one', 'no stretch where one route alone runs both ways on one road')
    } else {
      const litId = alone.ids.find((id) => litNow.includes(id))
      const after = await clickAt(alone)
      check('a click on a lit line where its outbound runs too keeps the lit one', after.lit.length === 1 && after.lit[0] === litId, after.shown)
    }
  }
  {
    const litNow = await reopen(true)
    const near = lines
      .filter((l) => litNow.includes(l.id))
      .flatMap(every3)
      .filter((c) => lines.some((o) => !litNow.includes(o.id) && offLine(c, o.coords) < 8))
    const mixed = await findSpot(near, (p) =>
      p.ids.some((id) => litNow.includes(id)) && p.ids.some((id) => !litNow.includes(id)) && new Set(p.ids.map(routeOf)).size >= 2)
    if (!mixed) {
      skip('  and where more routes run, the list keeps the way back', 'no lit stretch where another route and an outbound run too')
    } else {
      const after = await clickAt(mixed)
      check('  and where more routes run, the list keeps the way back',
        after.sheet && (await showsBack()) && mixed.ids.filter((id) => litNow.includes(id)).every((id) => after.lit.includes(id)),
        `caught ${mixed.ids.length} line(s), ${after.shown}`)
    }
  }
}

check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
const failed = results.filter((r) => !r.ok).length
console.log(`${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
