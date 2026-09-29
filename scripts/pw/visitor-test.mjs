// The public map at /, on whatever the published file (public/data/map.json)
// holds today. The dev server serves that file straight from the working
// tree, committed or not — so a passing run here says nothing about whether
// the file was committed; `git status` does.
//
//   npm run dev                          (in another terminal)
//   node scripts/pw/visitor-test.mjs
//
// Everything asserted here is read from the map itself first — source
// features, layer order — and only then checked for internal consistency. Nothing is hard-coded about which or
// how many routes/hotspots exist, what they are named, or which vertex
// lands where; a check that needs a shape the data doesn't happen to have
// today (e.g. a route line passing through a hotspot) SKIPs instead of
// failing. Covers: the read-only public page carries none of the studio's
// buttons or sign-in text, ships no draw-* (editor) layers, writes nothing
// to localStorage, never calls the OSRM route snapper or the database (it
// reads the published /data/map.json, once), and tapping a route vs. a
// hotspot — including one hotspot with a route drawn through it — opens the
// right card with the right content.
import { chromium } from 'playwright'

const BASE = (process.env.PARAPO_BASE ?? 'http://localhost:5173').replace(/\/$/, '')
const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
const skip = (name, reason) => console.log(`SKIP  ${name}  ${reason}`)

// ------------------------------------------------------------------ geometry
// Plain point-in-polygon (ray casting) and a handful of "probably inside"
// guesses for a ring, computed here in Node rather than hard-coded, since we
// do not know the shape of today's hotspots ahead of time.
const pointInPolygon = ([x, y], ring) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const centroidOf = (ring) => [
  ring.reduce((a, c) => a + c[0], 0) / ring.length,
  ring.reduce((a, c) => a + c[1], 0) / ring.length,
]
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
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 800 } })
// PARAPO_NODE_FETCH=1: serve every https request through Node fetch. Needed only
// where the browser cannot reach the internet but Node can (sandboxed CI).
if (process.env.PARAPO_NODE_FETCH) {
await page.route(/^https:\/\//, async (route) => { const req = route.request(); try { const h={...req.headers()}; delete h['accept-encoding']; const r = await fetch(req.url(), { method: req.method(), headers: h, body: ['GET','HEAD'].includes(req.method())?undefined:req.postDataBuffer() }); const body=Buffer.from(await r.arrayBuffer()); const hh={}; r.headers.forEach((v,k)=>{ if(!['content-encoding','content-length','transfer-encoding'].includes(k)) hh[k]=v }); await route.fulfill({status:r.status,headers:hh,body}) } catch { await route.abort() } })
}
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
page.on('response', (res) => {
  if (/\/data\/map\.json/.test(res.url())) mapFileStatuses.push(res.status())
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

await page.goto(`${BASE}/`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
await waitForSource('saved-stops')
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
const paintNow = () => page.evaluate(() => (window.__map.getLayer('saved-routes-line') ? window.__paint() : null))
/** The directions lit on the map now. */
const litNow = async () => (await page.evaluate(() => window.__lit('saved-routes'))) ?? []
/** The directions a RouteCard's rows open, as the card names them. */
const cardDirections = (card) => card.locator('button[data-testid$="-item"]').evaluateAll((els) => els.map((e) => e.dataset.direction))
const sameIds = (a, b) => a.length === b.length && a.every((id) => b.includes(id))
const twoLooks = (p) =>
  !!p && p.shaded.length === 0 &&
  (MAP ? p.rest === MAP['Map/RouteLine/surface-default'] && p.lit === MAP['Map/RouteLine/surface-selected'] : !!p.rest && p.rest !== p.lit)

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

// 4. A tap on a route line inside a hotspot offers both — since 2026-09-22
// nothing wins outright: the route list shows the hotspot first, then the
// routes as RouteCards (the owner, 2026-09-29: the Chooser that asked here
// before is the list now), and a route's row opens its card. SKIP if no such
// vertex exists.
const hit = findVertexInsideAnyHotspot(snapshot.routeLines, snapshot.polys)
if (!hit) {
  skip('a tap on a route line inside a hotspot offers both in the list', 'no saved-route vertex lies inside any hotspot polygon today')
} else {
  await page.evaluate((c) => window.__map.jumpTo({ center: c, zoom: 18 }), hit.point)
  await page.waitForTimeout(700)
  const box = await page.locator('canvas.maplibregl-canvas').boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(350)
  const chooser = page.locator('[data-testid="chooser"]')
  const has = (await chooser.count()) > 0
  const text = has ? await chooser.first().innerText() : ''
  const cards = chooser.locator('[data-testid="chooser-origin"]')
  const cardCount = has ? await cards.count() : 0
  check(
    'a tap on a route line inside a hotspot offers both in the list',
    has && text.includes(hit.hotspot.name) && cardCount > 0,
    has ? `${text.split('\n')[0]}; ${cardCount} card(s)` : `no list; card ${(await cardKind()).kind}`,
  )
  if (has) {
    const items = chooser.locator('button[data-testid="chooser-item"]')
    const first = await items.first().innerText()
    check('  the hotspot is listed first', first.includes(hit.hotspot.name), first.split('\n')[0])
    // The owner's pick of 2026-09-29: the count stays the routes', a card each.
    const title = `${cardCount} ${cardCount === 1 ? 'Route' : 'Routes'}`
    check(`  headed "${title}": the routes' count, not the hotspot's`, text.split('\n').includes(title), text.split('\n')[0])
    // A list lights every route it shows; a tap on a card off its rows
    // narrows the lights to its routes, dark blue over the rest, and a
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
    const looks = await paintNow()
    check('  a tap on a card selects it, dark blue over the rest', (await card.getAttribute('data-state')) === 'selected' && twoLooks(looks), JSON.stringify(looks))
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
      // The list stays behind the trip, hidden, for its ‹, and its hotspot
      // goes dark under the trip till then (the owner, 2026-09-29).
      const stopsLit = async () => (await page.evaluate(() => window.__lit('saved-stops'))) ?? []
      const litUnder = await stopsLit()
      check('  its hotspot is not lit under the trip', !litUnder.includes(hit.hotspot.id), JSON.stringify(litUnder))
      const back = page.locator('[data-testid="card"]').getByRole('button', { name: 'Back' })
      if ((await back.count()) > 0) await back.first().click()
      await page.waitForTimeout(350)
      const again = (await chooser.first().isVisible()) ? await chooser.first().innerText() : ''
      check(
        '  ‹ on the trip goes back to the list, as it was, its hotspot lit again',
        again === text && (await cardKind()).kind === 'none' && (await stopsLit()).includes(hit.hotspot.id),
        again ? `card ${(await cardKind()).kind}; lit ${JSON.stringify(await stopsLit())}` : 'the list did not come back',
      )
      const relit = await litNow()
      const stillSelected = await chooser.locator('[data-state="selected"]').count()
      check('  ‹ brings it back at rest: no card picked, every route lit', stillSelected === 0 && sameIds(relit, listed), `${stillSelected} Selected; ${relit.length} lit, ${listed.length} listed`)
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
// route alone under the tap opens its card directly, drawn dark blue over
// the rest; closing the card lights nothing again. Nothing fades and nothing
// is see-through (the owner's two looks, 2026-09-29).
{
  const looks = await paintNow()
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
          const { litWidthAt } = await import('/src/shared/lineStyle.ts')
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
      // The orange stretches: where this direction passes a hintuan, on the same "passes" rule as the card's count.
      const litId = litIds[0] ?? ''
      const stretches = await page.evaluate(async (id) => ((await window.__src('saved-routes-pass'))?.features ?? []).filter((f) => f.properties.id === id).length, litId)
      const passLit = (await page.evaluate(() => window.__lit('saved-routes-pass'))) ?? []
      check('  the orange stretches of the lit direction are lit with it', stretches > 0 && passLit.includes(litId), `${stretches} stretch(es); lit on the stretches: ${JSON.stringify(passLit)}`)
      // Orange on the lit line only (the owner's two looks, 2026-09-29): no
      // other direction's stretches lit, and no layer left painting them all.
      const alwaysOn = await page.evaluate(() => !!window.__map.getLayer('saved-routes-pass'))
      check('  and on no other line', passLit.length === 1 && !alwaysOn, `lit on the stretches: ${JSON.stringify(passLit)}; the old layer for every line ${alwaysOn ? 'still there' : 'gone'}`)
      await closeCard()
      await page.waitForTimeout(300)
      const after = (await page.evaluate(() => window.__lit('saved-routes'))) ?? []
      check('  closing the card lights nothing again', after.length === 0, JSON.stringify(after))
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
  'the map came from /data/map.json, fetched once and served',
  mapFileStatuses.length === 1 && (mapFileStatuses[0] === 200 || mapFileStatuses[0] === 304),
  `${mapFileStatuses.length} response(s): ${mapFileStatuses.join(', ') || 'none'}`,
)
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))

await b.close()
const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
