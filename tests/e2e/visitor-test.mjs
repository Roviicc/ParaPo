// The public map at /, on whatever the published index (public/data/index.json)
// holds today. The dev server serves that file straight from the working
// tree, committed or not — so a passing run here says nothing about whether
// the file was committed; `git status` does.
//
//   npm run dev                          (in another terminal)
//   node tests/e2e/visitor-test.mjs
//
// Everything asserted here is read from the map itself first — source
// features, layer order — and only then checked for internal consistency. Nothing is hard-coded about which or
// how many routes/hotspots exist, what they are named, or which vertex
// lands where; a check that needs a shape the data doesn't happen to have
// today (e.g. a route line passing through a hotspot) SKIPs instead of
// failing. Covers: the read-only public page carries none of the studio's
// buttons or sign-in text, ships no draw-* (editor) layers, writes nothing
// to localStorage, never calls the OSRM route snapper or the database (it
// reads the published /data/index.json, once), and tapping a route vs. a
// hotspot — including one hotspot with a route drawn through it — opens the
// right card with the right content.
import { chromium } from 'playwright'
import { BASE, harness, nodeFetch, waitForSource } from './lib/harness.mjs'
import { centroidOf, pointInPolygon } from './lib/geo.mjs'
import { lookReaders, paintNow, rideLook } from './lib/looks.mjs'

const { check, skip, tally } = harness()

// VISITOR_PART=k/n runs part k of n, so CI can run the parts side by side:
// every part opens the map and runs sections 1, 2 and 5; section 3's
// hotspots are dealt out by their place in the list; 4 and 4b are part 1's.
// Unset, one part runs it all.
const [PART, PARTS] = (process.env.VISITOR_PART || '1/1').split('/').map(Number)
if (!(PARTS >= 1 && PART >= 1 && PART <= PARTS)) throw new Error(`VISITOR_PART is k/n with 1 ≤ k ≤ n, not "${process.env.VISITOR_PART}"`)

// ------------------------------------------------------------------ geometry
// A handful of "probably inside" guesses for a ring (point-in-polygon itself
// is lib/geo.mjs's), computed here in Node rather than hard-coded, since we
// do not know the shape of today's hotspots ahead of time.
const interiorCandidates = (ring) => {
  const c = centroidOf(ring)
  const uniq = ring.filter((v, i) => i === 0 || v[0] !== ring[i - 1][0] || v[1] !== ring[i - 1][1])
  const pts = [c]
  for (const v of uniq) pts.push([c[0] + (v[0] - c[0]) * 0.5, c[1] + (v[1] - c[1]) * 0.5])
  for (let i = 0; i < uniq.length; i++) {
    const a = uniq[i], b = uniq[(i + 1) % uniq.length]
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    pts.push([c[0] + (mid[0] - c[0]) * 0.75, c[1] + (mid[1] - c[1]) * 0.75])
  }
  return pts.slice(0, 8)
}
const findVertexInsideAnyHotspot = (routeLines, polys) => {
  for (const coords of routeLines) {
    for (const c of coords) {
      for (const p of polys) if (pointInPolygon(c, p.ring)) return { point: c, hotspot: p }
    }
  }
  return null
}
// Metres from a point to a line, on a flat patch of Metro Manila.
const metresToLine = (p, coords) => {
  const k = 111320
  const toM = (a, b) => [(a[0] - b[0]) * k * Math.cos((b[1] * Math.PI) / 180), (a[1] - b[1]) * k]
  let best = Infinity
  for (let i = 1; i < coords.length; i++) {
    const ap = toM(p, coords[i - 1])
    const ab = toM(coords[i], coords[i - 1])
    const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1]) / (ab[0] ** 2 + ab[1] ** 2 || 1)))
    best = Math.min(best, Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1]))
  }
  return best
}
// A route vertex a finger's width clear of every box (~110 m, so no box edge
// falls inside the tap) and 30 m clear of every other route's line (the tap
// takes ±20 px, ~24 m at zoom 17), so the tap means this route alone. Where
// two routes share a road — Tala's, since 2026-09-25 — the app rightly asks
// which, and that is 4a's check, not this one's.
const findVertexOutsideHotspots = (routes, polys) => {
  const clear = 0.001
  for (const r of routes) {
    const others = routes.filter((o) => o.route_id !== r.route_id)
    for (const c of r.coords) {
      const nearBox = polys.some((p) => p.ring.some((v) => Math.hypot(v[0] - c[0], v[1] - c[1]) < clear))
      if (nearBox) continue
      if (others.some((o) => metresToLine(c, o.coords) < 30)) continue
      return c
    }
  }
  return null
}
// A route vertex outside every box where another route runs within 3 m: a
// road two routes share, where one tap lists them both.
const findSharedVertexOutsideHotspots = (routes, polys) => {
  for (const r of routes) {
    const others = routes.filter((o) => o.route_id !== r.route_id)
    for (const c of r.coords) {
      if (polys.some((p) => pointInPolygon(c, p.ring))) continue
      if (others.some((o) => metresToLine(c, o.coords) < 3)) return c
    }
  }
  return null
}
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 800 } })
await nodeFetch(page)
await page.addInitScript(() => {
  window.__src = async (id) => { const s = window.__map?.getSource(id); return s ? await s.getData() : null }
})
await page.addInitScript(lookReaders)
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
let osrmHit = false
let supabaseHit = false
const mapFileStatuses = []
page.on('request', (req) => {
  if (/router\.project-osrm\.org/.test(req.url())) osrmHit = true
  if (/\.supabase\.co/.test(req.url())) supabaseHit = true
})
// Responses, not requests: a 404 is a request too, and would count as a load.
// The pick checks read the file again for their sums, marked so as not to count.
page.on('response', (res) => {
  if (/\/data\/index\.json/.test(res.url()) && !res.request().headers()['x-parapo-test']) mapFileStatuses.push(res.status())
})

const closeCard = () => page.getByRole('button', { name: 'Close' }).first().click().catch(() => {})
const cardKind = async () => {
  const el = page.locator('[data-testid="card"]')
  if ((await el.count()) === 0) return { kind: 'none', text: '' }
  const text = await el.first().innerText()
  if (text.includes('Routes that')) return { kind: 'hotspot', text }
  // A route's card is the owner's trip card since 2026-09-29: its rail of stops.
  if ((await el.first().locator('[data-testid="trip"]').count()) > 0) return { kind: 'route', text }
  return { kind: 'unknown', text }
}

await page.goto(`${BASE}/`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
await waitForSource(page, 'saved-stops')
await page.waitForTimeout(1200)

// 1. No editor chrome on the visitor page.
check('no + New Route button', (await page.getByRole('button', { name: '+ New Route' }).count()) === 0)
check('no + New hotspot button', (await page.getByRole('button', { name: '+ New hotspot' }).count()) === 0)
check('no Done button', (await page.getByRole('button', { name: 'Done' }).count()) === 0)
check('no "Sign in" text or button', (await page.getByText('Sign in').count()) === 0)
check('no "Sign out" text or button', (await page.getByText('Sign out').count()) === 0)
check('no "Password" text or button', (await page.getByText('Password').count()) === 0)
// Nor anything the owner found annoying for users (2026-09-29): no count of
// routes and hotspots in a corner, no +, − or compass.
check('no count pill ("4 routes · 14 hotspots")', (await page.getByText(/^\d+ routes?\b/).count()) === 0)
check(
  'no +, − or compass buttons',
  (await page.locator('.maplibregl-ctrl-zoom-in, .maplibregl-ctrl-zoom-out, .maplibregl-ctrl-compass').count()) === 0,
)

// 2. Read the map's own data before asserting anything about it.
// The owner's two looks for the lines (2026-09-29): every one opaque in
// Map/RouteLine/surface-default, the lit ones drawn over them in
// …/surface-selected, and no layer shading a line. The hexes are
// mapColours.ts's, read from the dev server; a server that cannot serve it
// is held to two different colours.
const MAP = await page.evaluate(async () => {
  try {
    return (await import('/src/design-system/foundation/mapColours.ts')).MAP_COLOURS
  } catch {
    return null
  }
})
/** The directions lit on the map now. */
const litNow = async () => (await page.evaluate(() => window.__lit('saved-routes'))) ?? []
/** The directions a RouteCard's rows open, as the card names them. */
const cardDirections = (card) => card.locator('button[data-testid$="-item"]').evaluateAll((els) => els.map((e) => e.dataset.direction))
const sameIds = (a, b) => a.length === b.length && a.every((id) => b.includes(id))
const twoLooks = (p, lit = MAP?.['Map/RouteLine/surface-selected']) =>
  !!p && p.shaded.length === 0 &&
  (MAP ? p.rest === MAP['Map/RouteLine/surface-default'] && p.lit === lit : !!p.rest && p.rest !== p.lit)

// What is lit wears the colour of the card it answers — a picked RouteCard's,
// an open trip's — its chevrons in the card's words' colour and its end
// circles ringed in the line's; with no card picked, the selected blue (the
// owner's ask, 2026-09-29). The looks are liveryLine.ts's, read from the dev
// server; a server that cannot serve it skips the colour.
const LOOKS = await page.evaluate(async () => {
  try {
    const m = await import('/src/shared/map/liveryLine.ts')
    return { byLivery: m.LIVERY_LINE, lit: m.LIT_LINE }
  } catch {
    return null
  }
})
/** Whether the lit line wears `want` (a LineLook), chevrons and rings too; true when the looks cannot be read. */
const wears = (seen, want) => !LOOKS || (!!want && seen.line === want.line && seen.arrow === want.arrow && seen.ends === want.line)

const snapshot = await page.evaluate(async () => {
  const m = window.__map
  const stopsFC = await window.__src('saved-stops')
  const routesFC = await window.__src('saved-routes')
  const polyFeatures = (stopsFC?.features ?? []).filter((f) => f.geometry.type === 'Polygon')
  const pointFeatures = (stopsFC?.features ?? []).filter((f) => f.geometry.type === 'Point')
  const order = m.getStyle().layers.map((l) => l.id)
  return {
    polys: polyFeatures.map((f) => ({
      id: f.properties.id,
      kind: f.properties.kind,
      name: f.properties.name,
      ring: f.geometry.coordinates[0],
    })),
    labelCount: pointFeatures.length,
    labelledIds: pointFeatures.flatMap((f) => String(f.properties.ids).split(',')),
    routeLines: (routesFC?.features ?? []).map((f) => f.geometry.coordinates),
    routes: (routesFC?.features ?? []).map((f) => ({ route_id: f.properties.route_id, coords: f.geometry.coordinates })),
    routeCount: routesFC?.features?.length ?? 0,
    order,
  }
})

// One label per hintuan, not per box: a box on each side of the road shares
// one (labelGroups, 2026-09-28). So every box is named by exactly one label.
const labelled = snapshot.labelledIds
check(
  'every hotspot polygon is named by exactly one label point, and at least one exists',
  snapshot.polys.length > 0 &&
    labelled.length === snapshot.polys.length &&
    new Set(labelled).size === labelled.length &&
    snapshot.polys.every((p) => labelled.includes(p.id)),
  `${snapshot.polys.length} polygons, ${snapshot.labelCount} labels naming ${labelled.length} boxes`,
)

const fillIdx = snapshot.order.indexOf('saved-stops-fill')
const outlineIdx = snapshot.order.indexOf('saved-stops-outline')
const labelIdx = snapshot.order.indexOf('saved-stops-label')
const hintuanLabelIdx = snapshot.order.indexOf('saved-stops-label-hintuan')
const casingIdx = snapshot.order.indexOf('saved-routes-casing')
const hitIdx = snapshot.order.indexOf('saved-routes-hit')
check(
  'hotspot fill + outline sit BELOW the route casing',
  fillIdx >= 0 && outlineIdx >= 0 && casingIdx >= 0 && fillIdx < casingIdx && outlineIdx < casingIdx,
  `fill ${fillIdx} outline ${outlineIdx} casing ${casingIdx}`,
)
check(
  'hotspot labels, terminals and hintuans, sit ABOVE the route hit layer',
  labelIdx >= 0 && hintuanLabelIdx >= 0 && hitIdx >= 0 && labelIdx > hitIdx && hintuanLabelIdx > hitIdx,
  `terminal labels ${labelIdx}, hintuan labels ${hintuanLabelIdx}, hit ${hitIdx}`,
)
// Hotspot names only close in, terminals' and hintuans' alike (the owner,
// 2026-09-25): from zoom 16.24, so none is drawn at 16 and some are at 17.
const namesAt = (zoom) =>
  page.evaluate(async (zoom) => {
    const m = window.__map
    const pt = (await window.__src('saved-stops')).features.find((f) => f.geometry.type === 'Point')
    m.jumpTo({ center: pt.geometry.coordinates, zoom })
    await new Promise((r) => { m.once('idle', r); setTimeout(r, 4000) })
    await new Promise((r) => setTimeout(r, 400))
    return new Set(m.queryRenderedFeatures({ layers: ['saved-stops-label', 'saved-stops-label-hintuan'] }).map((f) => f.properties.name)).size
  }, zoom)
const [namesFar, namesNear] = [await namesAt(16), await namesAt(17)]
check('hotspot names only close in: none at zoom 16, some at 17', namesFar === 0 && namesNear > 0, `${namesFar} at 16, ${namesNear} at 17`)
const drawLayers = snapshot.order.filter((id) => id.startsWith('draw-'))
check('no editor (draw-*) layers on the public page', drawLayers.length === 0, drawLayers.join(', '))

// 3. Tap each hotspot: fly to a point inside it, click, read the card.
for (const [i, p] of snapshot.polys.entries()) {
  if (i % PARTS !== PART - 1) continue
  const desc = `${p.kind} #${i} "${p.name}"`
  const candidates = interiorCandidates(p.ring)
  let opened = null
  for (const [x, y] of candidates) {
    await page.evaluate(([cx, cy]) => window.__map.jumpTo({ center: [cx, cy], zoom: 18 }), [x, y])
    await page.waitForTimeout(500)
    const pt = await page.evaluate(([cx, cy]) => {
      const q = window.__map.project([cx, cy])
      return [q.x, q.y]
    }, [x, y])
    const box = await page.locator('canvas.maplibregl-canvas').boundingBox()
    await page.mouse.click(box.x + pt[0], box.y + pt[1])
    await page.waitForTimeout(350)
    const chooser = page.locator('[data-testid="chooser"]')
    if ((await chooser.count()) > 0) {
      // The line runs within a finger of this point: the list shows the box
      // first and the route after it. Its row opens the box's card.
      const row = chooser.locator('button[data-testid="chooser-item"]').filter({ hasText: p.name }).first()
      if ((await row.count()) > 0) await row.click()
      await page.waitForTimeout(350)
    }
    const state = await cardKind()
    if (state.kind === 'hotspot') { opened = state.text; break }
    if (state.kind === 'route') await closeCard()
  }

  check(`tap ${desc} opens its hotspot card`, !!opened, opened ? '' : `no click point reached the card (tried ${candidates.length})`)
  if (!opened) continue

  check(`  card shows its own name`, opened.includes(p.name))
  const isTerminal = p.kind === 'terminal'
  check(
    `  card shows the ${isTerminal ? 'Terminal' : 'Hintuan'} badge`,
    opened.includes(isTerminal ? 'Terminal · routes start here' : 'Hintuan · wait and board here'),
  )
  check(
    '  no Edit/Delete for a visitor',
    // The studio's buttons read "Edit route", "Edit terminal", "Edit hintuan" and "Delete".
    (await page.locator('[data-testid="card"]').getByRole('button', { name: /^(Edit\b.*|Delete)$/ }).count()) === 0,
  )

  // The routes through here are the owner's RouteCards since 2026-09-29: a
  // card per place they leave from, in its colour, then → where it goes; ⇄
  // shows them the way back.
  const rows = page.locator('[data-testid="card"]').locator('button[data-testid="card-item"]:enabled')
  const rowCount = await rows.count()
  if (rowCount > 0) {
    const cards = page.locator('[data-testid="card"]').locator('[data-testid="card-origin"]')
    const places = (await cards.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
    const colours = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-livery')))
    check(`  its routes are RouteCards, a card per place they leave from`, places.length > 0 && places.every((t) => t.length > 0) && colours.every((c) => !!c), places.map((t, i) => `${colours[i]}: ${t}`).join(' | '))
    // The pesos left the cards with the owner's State set (2026-09-29): the
    // trip's Expected fare carries them.
    check(`  and no pesos on any card`, places.every((t) => !t.includes('₱')), places.join(' | '))
    // ⇄ only where both ways pass: a box passed one way only has nothing to flip to.
    const flip = page.locator('[data-testid="card-flip"]')
    check(`  and ⇄ offers the way back, or the box is passed one way only`, (await flip.count()) <= 1)
    // A hotspot's cards light every route they show, the way round ⇄ has
    // them (the owner, 2026-09-29: "on hintuan it should light its routes");
    // a tap on a card off its rows narrows that to its own, a second lets it
    // go; a row opens its trip straight away, and ‹ comes back to every card
    // at rest (his "back to normal", the same day).
    const firstCard = cards.first()
    const name = firstCard.locator('[data-testid="card-select"]')
    const shownIds = (await cardDirections(page.locator('[data-testid="card"]').first())).filter(Boolean)
    const litBefore = await litNow()
    check(`  every route its cards show is lit`, shownIds.length > 0 && sameIds(litBefore, shownIds), `${litBefore.length} lit, ${shownIds.length} shown`)
    await name.click()
    await page.waitForTimeout(250)
    const cardIds = await cardDirections(firstCard)
    const picked = await litNow()
    check(`  a tap on its first card selects it and lights just its routes`, (await firstCard.getAttribute('data-state')) === 'selected' && sameIds(picked, cardIds), `${picked.length} lit for ${cardIds.length} row(s) of ${shownIds.length}`)
    const label = (await rows.first().innerText()).replace(/\s+/g, ' ').trim()
    await rows.first().click()
    await page.waitForTimeout(350)
    const after = await cardKind()
    check(`  its first route row opens a route card straight away`, after.kind === 'route', `row "${label}" -> ${after.kind}`)
    if (after.kind === 'route') {
      // In its card's colour, the hotspot's card kept behind it for its ‹
      // (the owner, 2026-09-29).
      const tripColour = await page.locator('[data-testid="trip"]').first().getAttribute('data-livery')
      check(`  in the colour of the card it was picked from`, tripColour === colours[0], `card ${colours[0]}, trip ${tripColour}`)
      // The map lights only the trip: the hotspot goes dark under it, and ‹
      // lights it again (the owner, 2026-09-29).
      const stopsLit = async () => (await page.evaluate(() => window.__lit('saved-stops'))) ?? []
      const litUnder = await stopsLit()
      check(`  the hotspot is not lit under the trip`, !litUnder.includes(p.id), JSON.stringify(litUnder))
      const back = page.locator('[data-testid="card"]').getByRole('button', { name: 'Back' })
      if ((await back.count()) > 0) await back.first().click()
      await page.waitForTimeout(350)
      const again = await cardKind()
      check(`  ‹ on the trip goes back to the hotspot's card, lit again`, again.kind === 'hotspot' && again.text === opened && (await stopsLit()).includes(p.id), `card ${again.kind}; lit ${JSON.stringify(await stopsLit())}`)
      const relit = await litNow()
      check(`  ‹ comes back to its cards at rest, every route lit again`, (await page.locator('[data-testid="card"] [data-testid="card-origin"][data-state="selected"]').count()) === 0 && sameIds(relit, shownIds), `${relit.length} lit of ${shownIds.length}`)
      // Picked, a second tap lets it go.
      await name.click()
      await page.waitForTimeout(250)
      const repicked = (await firstCard.getAttribute('data-state')) === 'selected'
      await name.click()
      await page.waitForTimeout(250)
      const letGo = await litNow()
      check(`  a second tap on a picked card lets it go: every route lit again`, repicked && (await firstCard.getAttribute('data-state')) === 'rest' && sameIds(letGo, shownIds), `picked ${repicked}; ${letGo.length} lit`)
      // ✕ closes it, a picked card and all: nothing stays lit.
      await name.click()
      await page.waitForTimeout(250)
      const pickedAgain = (await firstCard.getAttribute('data-state')) === 'selected'
      await closeCard()
      await page.waitForTimeout(250)
      const closed = await litNow()
      check(`  ✕ closes it all: nothing lit`, pickedAgain && closed.length === 0, `picked ${pickedAgain}; ${closed.length} lit`)
    }
  } else {
    const noneMsg = isTerminal ? 'None recorded yet.' : 'No saved route passes through here yet.'
    check(`  no linked routes: shows "${noneMsg}"`, opened.includes(noneMsg))
  }
  // Closed already where ✕ was tried; the helper would wait out its timeout.
  if ((await cardKind()).kind !== 'none') await closeCard()
  await page.waitForTimeout(200)
}

// 4. One tap, one kind of thing (the owner's ask, 2026-09-30: "select
// hintuan only show the card, then select route show the route"): a tap on
// a route line inside a hotspot opens the hotspot's card alone — no list,
// the line through it not taken — where until then both were offered, the
// hotspot first. SKIP if no such vertex exists.
const inBox = findVertexInsideAnyHotspot(snapshot.routeLines, snapshot.polys)
if (PART !== 1) {
  // Part 1's, with 4b.
} else if (!inBox) {
  skip('a tap on a route line inside a hotspot opens the hotspot alone', 'no saved-route vertex lies inside any hotspot polygon today')
} else {
  await page.evaluate((c) => window.__map.jumpTo({ center: c, zoom: 18 }), inBox.point)
  await page.waitForTimeout(700)
  const box = await page.locator('canvas.maplibregl-canvas').boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(350)
  const state = await cardKind()
  const lists = await page.locator('[data-testid="chooser"]').count()
  const litRoutes = (await page.evaluate(() => window.__lit('saved-routes'))) ?? []
  check(
    'a tap on a route line inside a hotspot opens the hotspot alone: its card, no list, no route lit',
    state.kind === 'hotspot' && state.text.includes(inBox.hotspot.name) && lists === 0 && litRoutes.length === 0,
    `card ${state.kind} "${state.text.split('\n')[0] ?? ''}"; ${lists} list(s); ${litRoutes.length} route(s) lit`,
  )
  await closeCard()
}

// 4a. A tap where two routes share a road, clear of every box: the route
// list, the routes as RouteCards and nothing else (the owner, 2026-09-29:
// the Chooser that asked here before is the list now), and a route's row
// opens its card. SKIP if no such vertex exists.
const hit = findSharedVertexOutsideHotspots(snapshot.routes, snapshot.polys)
if (PART !== 1) {
  // Part 1's, with 4b.
} else if (!hit) {
  skip('a tap where two routes share a road lists them, and nothing else', 'no route vertex outside the boxes has another route within 3 m today')
} else {
  await page.evaluate((c) => window.__map.jumpTo({ center: c, zoom: 18 }), hit)
  await page.waitForTimeout(700)
  const box = await page.locator('canvas.maplibregl-canvas').boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(350)
  const chooser = page.locator('[data-testid="chooser"]')
  const has = (await chooser.count()) > 0
  const text = has ? await chooser.first().innerText() : ''
  const cards = chooser.locator('[data-testid="chooser-origin"]')
  const cardCount = has ? await cards.count() : 0
  // A hotspot's row is a list row outside every RouteCard.
  const hotspotRows = has ? await chooser.locator('xpath=.//button[@data-testid="chooser-item"][not(ancestor::*[@data-testid="chooser-origin"])]').count() : 0
  check(
    'a tap where two routes share a road lists them, and nothing else',
    has && cardCount > 0 && hotspotRows === 0,
    has ? `${text.split('\n')[0]}; ${cardCount} card(s), ${hotspotRows} hotspot row(s)` : `no list; card ${(await cardKind()).kind}`,
  )
  if (has) {
    const items = chooser.locator('button[data-testid="chooser-item"]')
    // The owner's pick of 2026-09-29: the count stays the routes', a card each.
    const title = `${cardCount} ${cardCount === 1 ? 'Route' : 'Routes'}`
    check(`  headed "${title}": the routes' count, not the hotspot's`, text.split('\n').includes(title), text.split('\n')[0])
    // A list lights every route it shows; a tap on a card off its rows
    // narrows the lights to its routes, in its colour over the rest, and a
    // second lets it go; a row opens its trip straight away, and ‹ comes
    // back to every card at rest (the owner, 2026-09-29).
    const listedNow = async () => (await cardDirections(chooser.first())).filter(Boolean)
    const listed = await listedNow()
    const asking = await litNow()
    check('  the list lights every route it shows', listed.length > 0 && sameIds(asking, listed), `${asking.length} lit, ${listed.length} listed`)
    const row = items.last()
    const card = row.locator('xpath=ancestor::*[@data-livery][1]')
    const colour = await card.getAttribute('data-livery')
    const name = card.locator('[data-testid="chooser-select"]')
    await name.click()
    await page.waitForTimeout(250)
    const cardIds = await cardDirections(card)
    const picked = await litNow()
    const looks = await paintNow(page)
    const cardLook = LOOKS?.byLivery[colour]
    check(
      "  a tap on a card selects it, its routes drawn over the rest in the card's colour",
      (await card.getAttribute('data-state')) === 'selected' && twoLooks(looks, cardLook?.line ?? MAP?.['Map/RouteLine/surface-selected']),
      JSON.stringify(looks),
    )
    const seenPicked = await rideLook(page)
    check("  its chevrons in the card's words' colour, its end circles ringed in its own", wears(seenPicked, cardLook), `${colour}: ${JSON.stringify(seenPicked)}`)
    // Narrower than the list only where the list has other cards.
    if (cardIds.length < listed.length) check('  and lights just its routes', sameIds(picked, cardIds), `${picked.length} lit for ${cardIds.length} row(s) of ${listed.length}`)
    else skip('  and lights just its routes', 'one card lists every route this way round under this tap')
    // Its row, the card picked: the trip opens, and ‹ brings the list back
    // at rest.
    await row.click()
    await page.waitForTimeout(350)
    const state = await cardKind()
    check("  the route's row opens the route card straight away", state.kind === 'route', state.kind)
    if (state.kind === 'route') {
      const tripColour = await page.locator('[data-testid="trip"]').first().getAttribute('data-livery')
      check('  in the colour of the card it was picked from', !!colour && tripColour === colour, `card ${colour}, trip ${tripColour}`)
      const seenTrip = await rideLook(page)
      check("  its line in the trip card's colour too", wears(seenTrip, LOOKS?.byLivery[tripColour]), `${tripColour}: ${JSON.stringify(seenTrip)}`)
      // The list stays behind the trip, hidden, for its ‹.
      const back = page.locator('[data-testid="card"]').getByRole('button', { name: 'Back' })
      if ((await back.count()) > 0) await back.first().click()
      await page.waitForTimeout(350)
      const again = (await chooser.first().isVisible()) ? await chooser.first().innerText() : ''
      check(
        '  ‹ on the trip goes back to the list, as it was',
        again === text && (await cardKind()).kind === 'none',
        again ? `card ${(await cardKind()).kind}` : 'the list did not come back',
      )
      const relit = await litNow()
      const stillSelected = await chooser.locator('[data-state="selected"]').count()
      check('  ‹ brings it back at rest: no card picked, every route lit', stillSelected === 0 && sameIds(relit, listed), `${stillSelected} Selected; ${relit.length} lit, ${listed.length} listed`)
      const seenRest = await rideLook(page)
      check('  in the selected blue again', wears(seenRest, LOOKS?.lit), JSON.stringify(seenRest))
      // Picked, a second tap lets it go.
      await name.click()
      await page.waitForTimeout(250)
      const repicked = (await card.getAttribute('data-state')) === 'selected'
      await name.click()
      await page.waitForTimeout(250)
      const letGo = await litNow()
      check('  a second tap on a picked card lets it go: every route it shows lit again', repicked && (await card.getAttribute('data-state')) === 'rest' && sameIds(letGo, listed), `picked ${repicked}; ${letGo.length} lit, ${listed.length} listed`)
      // SWITCH lets a picked card go and lights all of the other way round;
      // there, where each place is a card of its own, a pick narrows it.
      const flip = chooser.locator('[data-testid="chooser-flip"]')
      if (!(await flip.isEnabled())) {
        skip('  SWITCH lets a picked card go: nothing Selected, the other way round lit', 'nothing drawn the other way round under this tap')
      } else {
        await name.click()
        await page.waitForTimeout(250)
        const pickedAgain = (await card.getAttribute('data-state')) === 'selected'
        await flip.click()
        await page.waitForTimeout(300)
        const switched = await litNow()
        const otherWay = await listedNow()
        const stillPicked = await chooser.locator('[data-state="selected"]').count()
        check('  SWITCH lets a picked card go: nothing Selected, the other way round lit', pickedAgain && stillPicked === 0 && otherWay.length > 0 && sameIds(switched, otherWay), `picked ${pickedAgain}; ${switched.length} lit, ${otherWay.length} listed, ${stillPicked} Selected`)
        const backCards = chooser.locator('[data-testid="chooser-origin"]')
        if ((await backCards.count()) < 2) {
          skip("  a pick there lights just its card's routes, fewer than the list's", 'one card the other way round too')
        } else {
          const one = backCards.first()
          await one.locator('[data-testid="chooser-select"]').click()
          await page.waitForTimeout(250)
          const oneIds = await cardDirections(one)
          const narrowed = await litNow()
          check("  a pick there lights just its card's routes, fewer than the list's", oneIds.length > 0 && oneIds.length < otherWay.length && sameIds(narrowed, oneIds), `${narrowed.length} lit for ${oneIds.length} of ${otherWay.length}`)
        }
      }
    }
    await closeCard()
  }
}

// 4b. Rest and lit: every direction rests in one light blue, opaque; one
// route alone under the tap opens its card directly, drawn in its trip card's colour over
// the rest; closing the card lights nothing again. Nothing fades and nothing
// is see-through (the owner's two looks, 2026-09-29).
if (PART === 1) {
  const looks = await paintNow(page)
  check('the lines rest opaque in Map/RouteLine/surface-default, lit in …/surface-selected, none shaded', twoLooks(looks), JSON.stringify(looks))
  const clean = findVertexOutsideHotspots(snapshot.routes, snapshot.polys)
  if (!clean) {
    skip('a tap on one route opens its card straight away', 'every route vertex lies inside a hotspot or on a road another route shares today')
  } else {
    await page.evaluate((c) => window.__map.jumpTo({ center: c, zoom: 17 }), clean)
    await page.waitForTimeout(700)
    const box = await page.locator('canvas.maplibregl-canvas').boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(350)
    const state = await cardKind()
    const chooserCount = await page.locator('[data-testid="chooser"]').count()
    check('a tap on one route opens its card straight away', state.kind === 'route' && chooserCount === 0, `card ${state.kind}, list count ${chooserCount}`)
    if (state.kind === 'route') {
      // Named for its direction, the trip runs from where that leaves (the
      // top row, its pesos in a tile under the card since 3778:3183) to where
      // it goes (the bottom row).
      const label = (await page.locator('[data-testid="card"]').first().getAttribute('aria-label')) ?? ''
      const [from = '', to = ''] = label.split(' → ')
      const row = (id) => page.locator(`[data-testid="${id}"]`).first().innerText().then((t) => t.replace(/\s+/g, ' ').trim(), () => '')
      const [top, bottom] = [await row('trip-origin'), await row('trip-destination')]
      check('  the card runs from where its direction leaves to where it goes', !!from && !!to && top === from && bottom === to, `"${label}": top "${top}", bottom "${bottom}"`)
      const litIds = (await page.evaluate(() => window.__lit('saved-routes'))) ?? []
      check('  exactly one direction is lit', litIds.length === 1, JSON.stringify(litIds))
      // The chevrons: flowing along the lit direction, each cut to exactly
      // the lit line's width. Measured on screen, across the chevron's own
      // axis (outer tip to inner tip); the line's width comes from
      // lineStyle.ts itself where the dev server can serve it.
      await page.waitForTimeout(200)
      const chevrons = await page.evaluate(async () => {
        const m = window.__map
        let line = null
        try {
          const { litWidthAt } = await import('/src/shared/map/lineStyle.ts')
          line = litWidthAt(m.getZoom())
        } catch {}
        const all = ((await window.__src('direction-arrows'))?.features ?? []).map((f) => {
          const p = f.geometry.coordinates[0].map((c) => m.project(c))
          const ax = p[3].x - p[0].x
          const ay = p[3].y - p[0].y
          const len = Math.hypot(ax, ay)
          const across = 2 * Math.max(...p.map((q) => Math.abs(((q.x - p[0].x) * ay - (q.y - p[0].y) * ax) / len)))
          return { across, meant: f.properties.across }
        })
        return { line, all }
      })
      const fit = chevrons.all.every((c) => Math.abs(c.across - c.meant) < 0.5 && (chevrons.line == null || Math.abs(c.meant - chevrons.line) < 0.01))
      check('  chevrons ride the lit line, each as wide as it', chevrons.all.length > 0 && fit, `${chevrons.all.length} chevrons, ${chevrons.all[0]?.across.toFixed(2)} px across; the lit line ${chevrons.line?.toFixed(2) ?? 'unread'} px`)
      // They flow for as long as the route is lit (the owner's ask of
      // 2026-09-30: "yes continuous arrows"), fifteen steps a second rather
      // than every frame, so a phone's main thread is not kept busy: a look
      // a second apart finds them moved, in about fifteen redraws.
      const where = () =>
        page.evaluate(async () => ((await window.__src('direction-arrows'))?.features ?? []).map((f) => f.geometry.coordinates[0][0].map((v) => v.toFixed(7)).join()).join('|'))
      await page.waitForTimeout(3200)
      const flowA = await where()
      const sets = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const src = window.__map.getSource('direction-arrows')
            const set = src.setData
            let n = 0
            src.setData = function (...a) {
              n++
              return set.apply(this, a)
            }
            setTimeout(() => {
              src.setData = set
              resolve(n)
            }, 1000)
          }),
      )
      const flowB = await where()
      check(
        '  and they keep flowing, about fifteen steps a second',
        flowA !== '' && flowA !== flowB && sets >= 8 && sets <= 18,
        `${flowA === flowB ? 'still' : 'moved'}; ${sets} redraw(s) in a second`,
      )
      // The orange stretches: where this direction passes a hintuan, on the same "passes" rule as the card's count.
      const litId = litIds[0] ?? ''
      const stretches = await page.evaluate(async (id) => ((await window.__src('saved-routes-pass'))?.features ?? []).filter((f) => f.properties.id === id).length, litId)
      const passLit = (await page.evaluate(() => window.__lit('saved-routes-pass'))) ?? []
      check('  the orange stretches of the lit direction are lit with it', stretches > 0 && passLit.includes(litId), `${stretches} stretch(es); lit on the stretches: ${JSON.stringify(passLit)}`)
      // Orange on the lit line only (the owner's two looks, 2026-09-29): no
      // other direction's stretches lit, and no layer left painting them all.
      const alwaysOn = await page.evaluate(() => !!window.__map.getLayer('saved-routes-pass'))
      check('  and on no other line', passLit.length === 1 && !alwaysOn, `lit on the stretches: ${JSON.stringify(passLit)}; the old layer for every line ${alwaysOn ? 'still there' : 'gone'}`)
      // A hintuan's row picks it (the owner's Timeline State=Selected,
      // 2026-09-29), here with the card in the top-left corner: the pill's
      // pesos are the app's own sums over rideCut's metres, the route stays
      // whole with a circle popping up at the hintuan (the owner's ask of
      // 2026-09-30: "now I don't want to cut the route"), and the camera
      // glides the hintuan to the right of the card; a second tap lets it
      // go, circle and all, and ✕ lets a pick go.
      const cardEl = page.locator('[data-testid="card"]').first()
      const rows = cardEl.locator('[data-testid="trip-hintuan"]')
      if ((await rows.count()) === 0) {
        skip('  a hintuan row picks it, priced from the start, a circle at it on the map', 'no hintuan on this direction yet')
      } else {
        const fold = cardEl.locator('button[data-testid="trip-fold"]')
        if ((await fold.count()) > 0) {
          await fold.first().click()
          await page.waitForTimeout(450)
        }
        const row = rows.nth(Math.floor(((await rows.count()) - 1) / 2))
        const rowId = await row.getAttribute('data-hintuan')
        const want = await page.evaluate(async ([id, rowId]) => {
          try {
            const [{ rideFare }, { rideCut }] = await Promise.all([import('/src/shared/model/fares.ts'), import('/src/shared/model/ride.ts')])
            const { loadMapFile, loadLine } = await import('/src/commuter/mapFile.ts')
            const m = await loadMapFile()
            const found = m.variants.find((x) => x.id === id)
            const v = found && { ...found, shape: (await loadLine(id)) ?? found.shape }
            const cut = v && rideCut(v, m.stops, rowId)
            return cut ? { fare: rideFare(v.route?.mode, cut.metres) ?? null, at: cut.at } : null
          } catch {
            return null
          }
        }, [litId, rowId])
        const tilesBefore = await cardEl.locator('dl').innerText()
        const pick = row.locator('button[data-testid="trip-hintuan-pick"]')
        await pick.scrollIntoViewIfNeeded()
        await pick.click()
        await page.waitForTimeout(250)
        await page.waitForFunction(() => !window.__map.isMoving(), null, { timeout: 3000 }).catch(() => {})
        const pill = (await row.locator('[data-testid="trip-hintuan-fare"]').count()) ? (await row.locator('[data-testid="trip-hintuan-fare"]').innerText()).trim() : null
        const seen = await page.evaluate(async (at) => {
          const m = window.__map
          const c = m.getCanvas().getBoundingClientRect()
          const d = document.querySelector('[data-testid="card"]').getBoundingClientRect()
          const q = at && m.project(at)
          const pins = document.querySelectorAll('[data-testid="hintuan-pin"]')
          const p = pins[0]?.getBoundingClientRect()
          return {
            lit: (await window.__lit('saved-routes')) ?? [],
            rest: ((await window.__src('ride-rest'))?.features ?? []).length,
            pins: pins.length,
            off: p && q ? Math.hypot(p.left + p.width / 2 - (c.left + q.x), p.top + p.height / 2 - (c.top + q.y)) : null,
            dots: document.querySelectorAll('[data-testid="ride-dot"]').length,
            x: q ? c.left + q.x : null, y: q ? c.top + q.y : null, cardRight: d.right, top: c.top, bottom: c.bottom, right: c.right,
            padding: Object.values(m.getPadding()).every((v) => v === 0),
          }
        }, want?.at ?? null)
        check(
          '  a hintuan row picks it: Selected, its pill the pesos from the start to there',
          (await row.getAttribute('data-state')) === 'selected' && (!want || pill === want.fare),
          `"${pill}"${want ? `, the sums "${want.fare}"` : ''}`,
        )
        check('  the tiles keep the whole ride', (await cardEl.locator('dl').innerText()) === tilesBefore)
        check(
          '  the route left whole, a circle popping up at the hintuan: the trip still lit, nothing at rest over it, no get-off circles',
          seen.lit.length === 1 && seen.lit[0] === litId && seen.rest === 0 && seen.pins === 1 &&
            (!want || (seen.off !== null && seen.off < 2)) && seen.dots === 0,
          `${seen.lit.length} lit; ${seen.rest} stretch(es) at rest; ${seen.pins} circle(s), ${seen.off === null ? 'not measured' : Math.round(seen.off) + ' px'} off the hintuan; ${seen.dots} get-off circle(s)`,
        )
        if (want) {
          check(
            '  the camera glides it right of the card in the corner, no padding left',
            seen.x > seen.cardRight + 24 && seen.x < seen.right - 16 && seen.y > seen.top + 16 && seen.y < seen.bottom - 16 && seen.padding,
            `at ${Math.round(seen.x)},${Math.round(seen.y)}; the card's right edge ${Math.round(seen.cardRight)}`,
          )
        }
        await pick.click()
        await page.waitForTimeout(250)
        const letGo = await page.evaluate(() => document.querySelectorAll('[data-testid="hintuan-pin"]').length)
        check('  a second tap lets it go, its circle too', (await row.getAttribute('data-state')) === 'rest' && letGo === 0, `${letGo} circle(s)`)
        // Where the trip goes is a button too (the owner's ask, 2026-09-29):
        // picked again, a tap there lets the pick go and glides the map to
        // the line's end, right of the card in the corner.
        const end = await page.evaluate(async (id) => {
          try {
            const { travelLine } = await import('/src/shared/model/ride.ts')
            const { loadMapFile, loadLine } = await import('/src/commuter/mapFile.ts')
            const m = await loadMapFile()
            const found = m.variants.find((x) => x.id === id)
            const line = travelLine({ ...found, shape: (await loadLine(id)) ?? found.shape }, m.stops)
            return line.length > 1 ? line[line.length - 1] : null
          } catch {
            return null
          }
        }, litId)
        await pick.click()
        await page.waitForTimeout(250)
        const wasPicked = (await row.getAttribute('data-state')) === 'selected'
        await cardEl.locator('[data-testid="trip-destination"] button').click()
        const destination = await cardEl.locator('[data-testid="trip-destination"]').getAttribute('data-state')
        await page.waitForTimeout(250)
        await page.waitForFunction(() => !window.__map.isMoving(), null, { timeout: 3000 }).catch(() => {})
        const atEnd = await page.evaluate(async (at) => {
          const m = window.__map
          const c = m.getCanvas().getBoundingClientRect()
          const d = document.querySelector('[data-testid="card"]').getBoundingClientRect()
          const q = at && m.project(at)
          return {
            pins: document.querySelectorAll('[data-testid="hintuan-pin"]').length,
            right: q ? c.left + q.x > d.right + 24 && q.x < c.width - 16 && q.y > 16 && q.y < c.height - 16 : null,
          }
        }, end)
        check(
          "  where the trip goes, tapped, is picked in the hintuan's place, its circle gone, gliding there right of the card",
          wasPicked && (await row.getAttribute('data-state')) === 'rest' && destination === 'selected' && atEnd.pins === 0 && atEnd.right !== false,
          `picked first ${wasPicked}; the destination ${destination}; ${atEnd.pins} circle(s); right of the card ${atEnd.right ?? 'not measured'}`,
        )
        // Where it leaves from is picked in the destination's place, no hintuan picked.
        await cardEl.locator('[data-testid="trip-origin"] button').click()
        await page.waitForTimeout(250)
        const destinationAfter = await cardEl.locator('[data-testid="trip-destination"]').getAttribute('data-state')
        const originAfter = await cardEl.locator('[data-testid="trip-origin"]').getAttribute('data-state')
        check(
          "  where it leaves from, tapped, is picked in the destination's place",
          destination === 'selected' && destinationAfter === 'rest' && originAfter === 'selected',
          `the destination ${destination} → ${destinationAfter}, the origin ${originAfter}`,
        )
        // Picked again, for ✕ to let go.
        await pick.click()
        await page.waitForTimeout(250)
      }
      await closeCard()
      await page.waitForTimeout(300)
      const after = (await page.evaluate(() => window.__lit('saved-routes'))) ?? []
      check('  closing the card lights nothing again', after.length === 0, JSON.stringify(after))
      const pinsAfter = await page.evaluate(() => document.querySelectorAll('[data-testid="hintuan-pin"]').length)
      check('  and lets a picked hintuan go, its circle too', pinsAfter === 0, `${pinsAfter} circle(s)`)
    }
  }
}

// 5. Housekeeping: no storage, no OSRM calls, no errors.
const lsCount = await page.evaluate(() => Object.keys(localStorage).length)
check('localStorage stays empty', lsCount === 0, lsCount ? `${lsCount} key(s)` : '')
check('no request to router.project-osrm.org', !osrmHit)
// Since step 5 the public map is one published file; the database is never asked.
check('no request to the database (*.supabase.co)', !supabaseHit)
check(
  'the map came from /data/index.json, fetched once and served',
  mapFileStatuses.length === 1 && (mapFileStatuses[0] === 200 || mapFileStatuses[0] === 304),
  `${mapFileStatuses.length} response(s): ${mapFileStatuses.join(', ') || 'none'}`,
)
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))

await b.close()
tally()
