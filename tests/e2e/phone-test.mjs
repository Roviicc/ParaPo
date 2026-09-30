// The public map at /, on a phone: 390×844, touch, a coarse pointer.
//
//   npm run dev                        (in another terminal)
//   node tests/e2e/phone-test.mjs
//
// Same rule as visitor-test: nothing is hard-coded about today's data. Every
// tap position is computed from the map's own sources — the script reads the
// route lines and hotspot rings out of `saved-routes` / `saved-stops`, finds a
// stretch of line no other route comes near, a vertex two routes share, and a
// hotspot edge with no line beside it, then projects those to screen pixels and
// taps them. A check today's data cannot support prints SKIP instead of failing.
//
// Covers: touch chrome — no zoom buttons, attribution moved to the top right,
// no horizontal scroll; the forgiving ±20 px tap, with a negative control well
// outside the box; the trip card a lone route opens (the owner's
// RouteTripDetail, 2026-09-29) — its ends, its fold, SWITCH keeping its
// colour, ‹ only where another route sharing an end runs its way; the route list
// where two routes share a road ("N Routes", a card per place), the trip a
// row opens in its card's colour and ‹ back to the list, every card at rest; a tap
// just outside a hotspot, and the bottom sheet on a hotspot's card — tap and
// drag the handle, Middle → Max → Low → Middle → Low → gone; the ?r=<id> share link and the
// view it restores; a trip opened on its own whose ‹ lists the routes sharing
// an end with its own; the fine-pointer desktop control (±5 px, no zoom
// buttons for a mouse either since 2026-09-29, attribution bottom right);
// and housekeeping.
import { chromium } from 'playwright'
import { BASE, harness, nodeFetch, waitForSource } from './lib/harness.mjs'
import { centroidOf, pointInPolygon } from './lib/geo.mjs'
import { lookReaders, paintNow, rideLook } from './lib/looks.mjs'

const { check, skip, tally } = harness()

// ------------------------------------------------------------------ geometry
// Metres from degrees, flat-earth style. Everything here is within a few km of
// everything else, so a local equirectangular approximation is exact enough to
// decide "is another route within 60 m of this vertex".
const M_PER_DEG_LAT = 110_574
const mPerDegLng = (lat) => 111_320 * Math.cos((lat * Math.PI) / 180)

/** Metres from point p to the segment a–b, in p's local metre frame. */
function distPointSegment(p, a, b, k) {
  const px = (p[0] - a[0]) * k
  const py = (p[1] - a[1]) * M_PER_DEG_LAT
  const bx = (b[0] - a[0]) * k
  const by = (b[1] - a[1]) * M_PER_DEG_LAT
  const len2 = bx * bx + by * by
  let t = len2 ? (px * bx + py * by) / len2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - bx * t, py - by * t)
}

/** Metres from point p to the nearest part of a polyline. */
function distToLine(p, coords, k) {
  let best = Infinity
  for (let i = 1; i < coords.length; i++) {
    const d = distPointSegment(p, coords[i - 1], coords[i], k)
    if (d < best) best = d
  }
  return best
}

const bboxOf = (coords) => {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of coords) {
    if (x < w) w = x
    if (x > e) e = x
    if (y < s) s = y
    if (y > n) n = y
  }
  return [w, s, e, n]
}

/** Rough metres from p to a bounding box; 0 when inside. Used only to skip work. */
function distToBbox(p, [w, s, e, n], k) {
  const dx = Math.max(w - p[0], 0, p[0] - e) * k
  const dy = Math.max(s - p[1], 0, p[1] - n) * M_PER_DEG_LAT
  return Math.hypot(dx, dy)
}

/** Metres from p to the nearest hotspot ring, 0 if p is inside one. */
function distToHotspots(p, polys, k) {
  let best = Infinity
  for (const poly of polys) {
    if (pointInPolygon(p, poly.ring)) return 0
    const d = distToLine(p, poly.ring, k)
    if (d < best) best = d
  }
  return best
}

/** Every route within `metres` of p, by variant id. */
function routesNear(p, routes, metres, k) {
  const near = []
  for (const r of routes) {
    if (distToBbox(p, r.bbox, k) > metres) continue
    if (distToLine(p, r.coords, k) <= metres) near.push(r)
  }
  return near
}

/**
 * The nearest vertex on either side of `i` that is at least `metres` away, so
 * the direction of the line through vertex `i` can be measured without the
 * rounding noise between two points a metre apart. Null if the line is shorter.
 */
function neighbourAtLeast(coords, i, metres, k) {
  for (let step = 1; step < coords.length; step++) {
    for (const j of [i - step, i + step]) {
      if (j < 0 || j >= coords.length) continue
      const d = Math.hypot((coords[j][0] - coords[i][0]) * k, (coords[j][1] - coords[i][1]) * M_PER_DEG_LAT)
      if (d >= metres) return coords[j]
    }
  }
  return null
}

/**
 * Sample at most `max` vertices of a route, evenly. Metro Manila routes carry a
 * few thousand points each; we only need enough to find one good tap target.
 */
function sampleIndices(length, max) {
  const stride = Math.max(1, Math.ceil(length / max))
  const out = []
  for (let i = 0; i < length; i += stride) out.push(i)
  return out
}

// ---------------------------------------------------------------- the browser
const b = await chromium.launch()
const errors = []
let osrmHit = false
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(String(e)))
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 160))
  })
  p.on('request', (req) => {
    if (/router\.project-osrm\.org/.test(req.url())) osrmHit = true
  })
}

const context = await b.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
})
const page = await context.newPage()
watch(page)

await nodeFetch(page)
await page.addInitScript(() => {
  // Pointer presses the page has seen: on some GitHub runs Chromium stopped
  // making them from touches, and from the mouse, partway through the suite
  // (2026-09-29; see tapHandle).
  // What might have stopped them, and when the last one came: a long press's
  // context menu or drag, or a pointer the browser cancelled.
  window.__pointerdowns = 0
  window.__lastDown = null
  window.__odd = []
  const tag = (e) => (e.target instanceof Element ? e.target.closest('[data-testid]')?.getAttribute('data-testid') ?? e.target.tagName.toLowerCase() : '')
  document.addEventListener(
    'pointerdown',
    (e) => {
      window.__pointerdowns++
      if (e.isTrusted) window.__lastDown = `${Math.round(performance.now())} ${e.pointerType}@${tag(e)}`
    },
    true,
  )
  for (const t of ['contextmenu', 'dragstart', 'dragend', 'pointercancel', 'touchcancel', 'selectstart'])
    document.addEventListener(t, (e) => window.__odd.push(`${Math.round(performance.now())} ${t}@${tag(e)}`), true)
  window.__src = async (id) => {
    const s = window.__map?.getSource(id)
    return s ? await s.getData() : null
  }
})
await page.addInitScript(lookReaders)

// ------------------------------------------------------------- 1. the pointer
// Everything below assumes the page believes it is being touched. Playwright's
// mobile emulation usually reports `pointer: coarse` on its own; where it does
// not, CDP's emulated media does it, and it has to be sent before the first
// navigation (an addInitScript cannot change what matchMedia reports).
const cdp = await context.newCDPSession(page)
const coarse = () => page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)
let isCoarse = await coarse()
let coarseVia = 'Playwright emulation'
if (!isCoarse) {
  await cdp
    .send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }] })
    .catch(() => {})
  isCoarse = await coarse()
  coarseVia = 'CDP Emulation.setEmulatedMedia'
}
check('the page reports a coarse pointer', isCoarse, isCoarse ? `via ${coarseVia}` : 'matchMedia("(pointer: coarse)") is false — every check below is meaningless')

await page.goto(`${BASE}/`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
await waitForSource(page, 'saved-routes')
await page.waitForTimeout(1200)

/**
 * A finger on the map at page point (x, y). A real touch first; when the map
 * has seen no click from it within 1.5 s, a click the browser would have
 * made, sent by hand with `pointerType: 'touch'`, so the app still reads a
 * finger. On a GitHub runner the page draws so slowly at three device pixels
 * per CSS pixel that the touch's end came half a second and more after its
 * start, which Chromium takes for a long press and turns into no click at
 * all (the fourth CI run, 2026-09-25). How many taps needed the fallback is
 * reported at the end.
 */
let tapsByHand = 0
await page.evaluate(() => {
  window.__clicks = 0
  window.__map.on('click', () => window.__clicks++)
})
let lateClicks = 0
/** A frame drawn after the input queue drained: the click a touch makes, if any, has been dispatched by now. */
const settled = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))))
const mapTap = async (x, y) => {
  const before = await page.evaluate(() => window.__clicks)
  await page.touchscreen.tap(x, y)
  // The page may be busy drawing for a while after the touch; only then does
  // the wait for its click start, or the click comes late, after the one
  // sent by hand, and two taps land where one was meant (a local run,
  // 2026-09-25: the second tap replaced the chooser the first had opened).
  await settled()
  const until = Date.now() + 1500
  while ((await page.evaluate(() => window.__clicks)) === before && Date.now() < until) await page.waitForTimeout(100)
  if ((await page.evaluate(() => window.__clicks)) !== before) return
  tapsByHand++
  await page.evaluate(([px, py]) => {
    const el = window.__map.getCanvasContainer()
    el.dispatchEvent(new PointerEvent('click', { pointerType: 'touch', clientX: px, clientY: py, bubbles: true, cancelable: true }))
  }, [x, y])
  await settled()
  if ((await page.evaluate(() => window.__clicks)) > before + 1) lateClicks++
}
/**
 * A finger on a button (a chooser row): a real touch, and, when `done()` is
 * still false 1.5 s later, a click on the button, since the runner drops a
 * touch on a button the same way (the sixth CI run). False when there is no
 * such button.
 */
const buttonTap = async (locator, done) => {
  const b = (await locator.count()) ? await locator.first().boundingBox({ timeout: 2000 }).catch(() => null) : null
  if (!b) return false
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2)
  await settled()
  const until = Date.now() + 1500
  while (!(await done()) && Date.now() < until) await page.waitForTimeout(100)
  if (!(await done())) {
    tapsByHand++
    // Sent straight to the button: Playwright's own click first waits for
    // the page to hold still, which a runner drawing a phone at three
    // device pixels per CSS pixel may not do in time (the seventh CI run).
    await locator.first().dispatchEvent('click')
    const again = Date.now() + 1500
    while (!(await done()) && Date.now() < again) await page.waitForTimeout(100)
  }
  await page.waitForTimeout(600)
  return true
}

check('no zoom buttons on a touch screen', (await page.locator('.maplibregl-ctrl-zoom-in').count()) === 0)
check(
  'the attribution control sits top right',
  (await page.locator('.maplibregl-ctrl-top-right .maplibregl-ctrl-attrib').count()) > 0,
  (await page.locator('.maplibregl-ctrl-bottom-right .maplibregl-ctrl-attrib').count()) > 0 ? 'still bottom right' : '',
)
const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
check('no horizontal scroll at load', await noHScroll(page), `scrollWidth ${await page.evaluate(() => document.documentElement.scrollWidth)} vs innerWidth ${await page.evaluate(() => window.innerWidth)}`)

// ------------------------------------------------------------------- the data
const snapshot = await page.evaluate(async () => {
  const routesFC = await window.__src('saved-routes')
  const stopsFC = await window.__src('saved-stops')
  // Each direction's full line, as the page reads it for a lit direction
  // (mapFile.ts): the source holds overviews until then, and where two routes
  // share a road is found on the lines themselves, as before the index.
  const { loadLine } = await import('/src/commuter/mapFile.ts')
  const routes = []
  for (const f of routesFC?.features ?? []) {
    if (f.geometry.type !== 'LineString' || f.geometry.coordinates.length < 2) continue
    const full = await loadLine(f.properties.id).catch(() => null)
    routes.push({
      id: f.properties.id,
      routeId: f.properties.route_id,
      signboard: f.properties.name ?? '',
      coords: full?.coordinates ?? f.geometry.coordinates,
    })
  }
  return {
    routes,
    polys: (stopsFC?.features ?? [])
      .filter((f) => f.geometry.type === 'Polygon')
      .map((f) => ({
        id: f.properties.id,
        kind: f.properties.kind,
        name: f.properties.name,
        ring: f.geometry.coordinates[0],
      })),
  }
})
for (const r of snapshot.routes) r.bbox = bboxOf(r.coords)
console.log(`\n(${snapshot.routes.length} route directions, ${snapshot.polys.length} hotspots on the map today)\n`)

// What the features do not carry — each direction's way round, its name and
// its route's two end hotspots — from the published index, through the page's
// own reader (overviews as the lines: only whether one is drawn is asked).
const published = await page.evaluate(() => import('/src/commuter/mapFile.ts').then((f) => f.loadMapFile()).catch(() => null))
const fileDirections = published?.variants ?? []
/**
 * What a trip on direction `id` lists behind its ‹ when it was opened on its
 * own (the owner's ask, 2026-09-29): the directions, drawn and the same way
 * round, of its route and of every route sharing its head or its tail — its
 * own included. The trip has ‹ when that is more than itself.
 */
const fanOf = (id) => {
  const v = fileDirections.find((d) => d.id === id)
  if (!v) return []
  const { head_stop_id: head, tail_stop_id: tail } = v.route
  const shares = (d) => d.route_id === v.route_id || (!!head && d.route.head_stop_id === head) || (!!tail && d.route.tail_stop_id === tail)
  return fileDirections.filter((d) => d.reversed === v.reversed && (d.shape?.coordinates?.length ?? 0) > 1 && shares(d))
}

/** Every tap below is made at this zoom, so the map keeps one scale throughout. */
const ZOOM = 16

// --------------------------------------------------------------- page helpers
const canvasBox = () => page.locator('canvas.maplibregl-canvas').boundingBox()
// A jump is done when the map is idle again, not half a second later: on a
// GitHub runner the zoom-18 tiles were still arriving 500 ms after the jump,
// and a tap then hit a route beside a hotspot instead of the hotspot (the
// second CI run, 2026-09-25). The desktop suite has always waited for `idle`.
const jumpTo = async (p, center, zoom = ZOOM) => {
  await p.evaluate(
    ([c, z]) =>
      new Promise((r) => {
        const m = window.__map
        m.jumpTo({ center: c, zoom: z })
        m.once('idle', r)
        setTimeout(r, 10000)
      }),
    [center, zoom],
  )
  await p.waitForTimeout(300)
}
/**
 * How many features `layer` draws at canvas point `xy` once it draws any,
 * polled for up to `ms`; 0 if it never does, -1 if there is no such layer.
 * A tap is made on what is on the screen: on a GitHub runner, a phone at
 * three device pixels per CSS pixel draws so slowly that a hotspot's box was
 * not there yet when the finger came, and the tap hit only the route beside
 * it (the third CI run, 2026-09-25).
 */
const drawnAt = async (layer, xy, ms = 10000) => {
  const until = Date.now() + ms
  for (;;) {
    const n = await page.evaluate(
      ([l, q]) => (window.__map.getLayer(l) ? window.__map.queryRenderedFeatures(q, { layers: [l] }).length : -1),
      [layer, xy],
    )
    if (n !== 0 || Date.now() > until) return n
    await page.waitForTimeout(150)
  }
}
const project = (p, lngLat) =>
  p.evaluate((c) => {
    const q = window.__map.project(c)
    return [q.x, q.y]
  }, lngLat)
const unproject = (p, xy) =>
  p.evaluate((q) => {
    const c = window.__map.unproject(q)
    return [c.lng, c.lat]
  }, xy)
/**
 * Unit vector perpendicular to the line a→b, in screen pixels, pointing to the
 * side where a step of `away` px ends up farthest from the whole of `line`.
 * At a bend the route's own next stretch can lie a few pixels off one side, so
 * "20 px beside the line" would really be 10 px from it there.
 */
const perpendicular = (p, a, bPt, line = [a, bPt], away = 20) =>
  p.evaluate(([u, v, coords, step]) => {
    const m = window.__map
    const s = m.project(u)
    const t = m.project(v)
    const dx = t.x - s.x
    const dy = t.y - s.y
    const len = Math.hypot(dx, dy) || 1
    const n = [-dy / len, dx / len]
    const pts = coords.map((c) => m.project(c))
    const segD = (q, e, f) => {
      const ex = f.x - e.x, ey = f.y - e.y
      const k = Math.max(0, Math.min(1, ((q.x - e.x) * ex + (q.y - e.y) * ey) / (ex * ex + ey * ey || 1)))
      return Math.hypot(q.x - e.x - k * ex, q.y - e.y - k * ey)
    }
    const clearance = (sign) => {
      const q = { x: s.x + n[0] * step * sign, y: s.y + n[1] * step * sign }
      let d = Infinity
      for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, segD(q, pts[i], pts[i + 1]))
      return d
    }
    const sign = clearance(1) >= clearance(-1) ? 1 : -1
    return [n[0] * sign, n[1] * sign]
  }, [a, bPt, line, away])

const card = () => page.locator('[data-testid="card"]')
// Every sheet locator is scoped to the card — never to the page — so the
// route list, which is `chooser`, never answers for it. Every card is the
// one BottomSheet since the owner's ask of 2026-09-30 ("make it a universal
// rule as component"), a hotspot's and a trip's alike, with its handle,
// `dock-handle` — a trip's card with its rail of stops in it
// (RouteTripDetail, 2026-09-29), named for its direction, "Tala → Novaliches".
const handle = () => card().locator('button[data-testid="dock-handle"]')
const trip = () => card().locator('[data-testid="trip"]')
const tripLabel = async () => ((await trip().count()) ? ((await card().first().getAttribute('aria-label')) ?? '') : '')
const tripRow = async (id) => {
  const row = card().locator(`[data-testid="${id}"]`)
  return (await row.count()) ? (await row.first().innerText()).replace(/\s+/g, ' ').trim() : ''
}

/**
 * A trip card's own parts, on whichever trip is open: its Kilometer and
 * Expected fare tiles (the owner's 3778:3183), its hintuans folding into one
 * row that opens and folds again (a lone hintuan is shown as it is), and
 * SWITCH turning it round. Run where a trip opens — a lone route's tap, a row
 * of the route list — as today's data allows.
 */
const tripChecks = async () => {
  // Two tiles under the card: the whole ride's length and pesos, as the app's
  // own sums give them on the published line (read from the dev server's
  // modules; a server that cannot serve them skips the check). The pesos
  // left the rail for their tile with this set.
  const [tripId] = (await litIds(page)) ?? []
  const want = await page.evaluate(async (id) => {
    try {
      const [{ rideFare }, { kmLabel, lineLength }, { variantLine }] = await Promise.all([
        import('/src/shared/model/fares.ts'),
        import('/src/shared/geo/geo.ts'),
        import('/src/shared/model/routes.ts'),
      ])
      // The direction with its full line, as the page reads them (mapFile.ts).
      const { loadMapFile, loadLine } = await import('/src/commuter/mapFile.ts')
      const found = (await loadMapFile()).variants.find((x) => x.id === id)
      const v = found && { ...found, shape: (await loadLine(id)) ?? found.shape }
      const metres = v && lineLength(variantLine(v))
      return v ? { km: kmLabel(metres), fare: rideFare(v.route?.mode, metres) ?? null } : null
    } catch {
      return null
    }
  }, tripId)
  const tile = async (id) => {
    const t = card().locator(`[data-testid="${id}"]`)
    return (await t.count()) ? (await t.first().innerText()).trim() : null
  }
  const [km, fare] = [await tile('trip-km'), await tile('trip-fare')]
  if (!want) skip('  its tiles: the Kilometer and Expected fare of the whole ride', 'the sums cannot be read from this server')
  else check('  its tiles: the Kilometer and Expected fare of the whole ride', km === want.km && fare === want.fare, `"${km}" / "${fare}", the sums "${want.km}" / "${want.fare}"`)

  // The hintuans fold into one row, "N more hintuans"; opened, each is a row
  // of its own, and "View less" folds them again (the owner's 3762:3546,
  // with an s since 3778:3183). A lone hintuan is shown as it is, with
  // nothing to fold.
  const fold = card().locator('button[data-testid="trip-fold"]')
  // The rows in sight: folded ones stay in the card, invisible, so that they
  // can close in view (the fold's motion, 2026-09-29).
  const hintuanRows = () => card().locator('[data-testid="trip-hintuan"]:visible').count()
  /** The rows in sight once the fold has come to rest: it moves for 300 ms at most. */
  const restingRows = async () => {
    await page.waitForTimeout(450)
    return hintuanRows()
  }
  /** How long a row takes to open or fold, as it is now set to. */
  const rowMotion = () => card().locator('[data-testid="trip-hintuan"]').first().evaluate((e) => getComputedStyle(e).transitionDuration)
  if ((await fold.count()) === 0) {
    skip('  its hintuans fold into one row, and open', (await hintuanRows()) === 0 ? 'no hintuan on this direction yet' : 'one hintuan on the way, shown as it is: nothing to fold')
  } else {
    const folded = (await fold.first().innerText()).trim()
    const n = Number(/^(\d+) more hintuans$/.exec(folded)?.[1] ?? NaN)
    await buttonTap(fold, async () => (await fold.first().getAttribute('aria-expanded')) === 'true')
    const opening = await rowMotion()
    const shown = await restingRows()
    check('  its hintuans fold into one row, "N more hintuans", that opens to N rows', n > 1 && shown === n && (await fold.first().innerText()).includes('View less'), `"${folded}" opened to ${shown} row(s)`)
    await buttonTap(fold, async () => (await fold.first().getAttribute('aria-expanded')) === 'false')
    const folding = await rowMotion()
    check('  "View less" folds them again', (await restingRows()) === 0 && (await fold.first().innerText()).trim() === folded, await fold.first().innerText())
    // The Motion tokens: open over gentle, fold over base (the owner's "try it").
    check('  the rows open over 300 ms and fold over 200 ms', opening.startsWith('0.3s') && folding.startsWith('0.2s'), `${opening} / ${folding}`)
  }

  // A hintuan's row picks it (the owner's Timeline State=Selected,
  // 2026-09-29): that one row Selected, its name Black, a pill with the pesos
  // from where the trip leaves to there — the app's own sums over rideCut's
  // metres on the published line — in the card's own colours swapped; the
  // tiles keep the whole ride; the route left whole on the map, and a circle
  // popping up at the hintuan in the trip's rail colour (the owner's ask of
  // 2026-09-30: "now I don't want to cut the route"), no get-off circles,
  // the camera gliding the hintuan clear of the card, and no padding left
  // on the map; a second tap lets it go, circle and all. Checked
  // once, on the first trip with a hintuan; it is picked again after, for
  // SWITCH, ✕ or ‹ to let go.
  let picked = false
  const rows = card().locator('[data-testid="trip-hintuan"]')
  if (!picksChecked && (await rows.count()) > 0) {
    picksChecked = true
    if ((await fold.count()) > 0) {
      await buttonTap(fold, async () => (await fold.first().getAttribute('aria-expanded')) === 'true')
      await page.waitForTimeout(450)
    }
    const row = rows.nth(Math.floor(((await rows.count()) - 1) / 2))
    const rowId = await row.getAttribute('data-hintuan')
    const pickWant = await page.evaluate(async ([id, rowId]) => {
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
    }, [tripId, rowId])
    const pickButton = row.locator('button[data-testid="trip-hintuan-pick"]')
    const isPicked = async () => (await row.getAttribute('data-state')) === 'selected'
    await pickButton.scrollIntoViewIfNeeded()
    await buttonTap(pickButton, isPicked)
    const selectedRows = await card().locator('[data-testid="trip-hintuan"][data-state="selected"]').count()
    const weight = await pickButton.evaluate((b) => getComputedStyle(b.lastElementChild.firstElementChild).fontWeight)
    check(
      '  a hintuan row picks it: that one row Selected, its name Black',
      (await isPicked()) && selectedRows === 1 && weight === '900' && (await pickButton.getAttribute('aria-pressed')) === 'true',
      `${selectedRows} Selected, weight ${weight}`,
    )
    const pill = row.locator('[data-testid="trip-hintuan-fare"]')
    const pillText = (await pill.count()) ? (await pill.first().innerText()).trim() : null
    if (!pickWant) skip('  its pill: the pesos from where the trip leaves to there', 'the sums cannot be read from this server')
    else check('  its pill: the pesos from where the trip leaves to there', pillText === pickWant.fare, `"${pillText}", the sums "${pickWant.fare}"`)
    const colours = await page.evaluate(() => {
      const pill = document.querySelector('[data-testid="trip-hintuan-fare"]')
      const trip = document.querySelector('[data-testid="trip"]')
      if (!pill || !trip) return null
      const [p, t] = [getComputedStyle(pill), getComputedStyle(trip)]
      return { swapped: p.backgroundColor === t.color && p.color === t.backgroundColor, detail: `${p.color} on ${p.backgroundColor}; the card ${t.color} on ${t.backgroundColor}` }
    })
    if (pickWant && pickWant.fare == null) skip("  in the card's own colours, swapped", 'an unpriced route shows no pill')
    else check("  in the card's own colours, swapped", !!colours?.swapped, colours?.detail ?? 'no pill')
    check('  the tiles keep the whole ride', (await tile('trip-km')) === km && (await tile('trip-fare')) === fare)
    // The glide starts after the card has drawn the pick: let it start, then end.
    await page.waitForTimeout(200)
    await page.waitForFunction(() => !window.__map.isMoving(), null, { timeout: 3000 }).catch(() => {})
    const drawn = await page.evaluate(async (at) => {
      const m = window.__map
      const pins = [...document.querySelectorAll('[data-testid="hintuan-pin"]')]
      const pin = pins[0]
      const trip = document.querySelector('[data-testid="trip"]')
      const ring = pin?.firstElementChild
      // The circle's centre on the screen, and the hintuan's.
      const r = pin?.getBoundingClientRect()
      const c = m.getCanvas().getBoundingClientRect()
      const q = at && m.project(at)
      // The rail's colour: the card's Card/<livery>/Timeline/surface.
      const dot = trip?.querySelector('[class*="timeline-surface"]')
      return {
        lit: (await window.__lit('saved-routes')) ?? [],
        rest: ((await window.__src('ride-rest'))?.features ?? []).length,
        restLayer: !!m.getLayer('ride-rest-line'),
        pins: pins.length,
        off: r && q ? Math.hypot(r.left + r.width / 2 - (c.left + q.x), r.top + r.height / 2 - (c.top + q.y)) : null,
        ring: ring ? getComputedStyle(ring).backgroundColor : null,
        rail: dot ? getComputedStyle(dot).backgroundColor : null,
        livery: pin?.dataset.livery ?? null,
        tripLivery: trip?.dataset.livery ?? null,
        taps: pin ? getComputedStyle(pin).pointerEvents : null,
        dots: document.querySelectorAll('[data-testid="ride-dot"]').length,
        padding: Object.values(m.getPadding()).every((v) => v === 0),
      }
    }, pickWant?.at ?? null)
    check(
      '  the map: the trip still lit and whole — nothing drawn at rest over it',
      drawn.lit.length === 1 && drawn.lit[0] === tripId && drawn.rest === 0 && !drawn.restLayer,
      `${drawn.lit.length} lit; ${drawn.rest} stretch(es) at rest; the rest layer ${drawn.restLayer ? 'there' : 'never added'}`,
    )
    check(
      "  a circle pops up at the hintuan, in the trip's rail colour, taking no taps",
      drawn.pins === 1 && (!pickWant || (drawn.off !== null && drawn.off < 2)) && drawn.livery === drawn.tripLivery &&
        !!drawn.ring && (!drawn.rail || drawn.ring === drawn.rail) && drawn.taps === 'none',
      `${drawn.pins} circle(s), ${drawn.off === null ? 'not measured' : Math.round(drawn.off) + ' px'} off the hintuan; ${drawn.livery} ring ${drawn.ring}, the rail ${drawn.rail}; pointer-events ${drawn.taps}`,
    )
    check('  no get-off circles on the public map', drawn.dots === 0, `${drawn.dots}`)
    if (pickWant) {
      const where = await page.evaluate((at) => {
        const m = window.__map
        const c = m.getCanvas().getBoundingClientRect()
        const q = m.project(at)
        const d = document.querySelector('[data-testid="card"]').getBoundingClientRect()
        return { x: c.left + q.x, y: c.top + q.y, left: c.left, right: c.right, top: c.top, cardTop: d.top }
      }, pickWant.at)
      check(
        '  the camera glides it into the map above the card',
        where.y > where.top + 16 && where.y < where.cardTop - 16 && where.x > where.left + 16 && where.x < where.right - 16,
        `at ${Math.round(where.x)},${Math.round(where.y)}; the map ${Math.round(where.top)}–${Math.round(where.cardTop)} above the card`,
      )
    }
    check('  and leaves no padding on the map for later moves', drawn.padding)
    await buttonTap(pickButton, async () => !(await isPicked()))
    const letGo = await page.evaluate(async () => ({
      pins: document.querySelectorAll('[data-testid="hintuan-pin"]').length,
      lit: (await window.__lit('saved-routes')) ?? [],
    }))
    check(
      '  a second tap lets it go: no pill, no circle, the trip still lit',
      !(await isPicked()) && (await pill.count()) === 0 && letGo.pins === 0 && letGo.lit.length === 1,
      `${letGo.pins} circle(s), ${letGo.lit.length} lit`,
    )
    // At Max the card covers the map, and the glide would go on out of
    // sight: a hintuan picked there brings the card down to Middle as the
    // camera glides (the owner's ask, 2026-09-30), the hintuan landing above
    // where the card stops, not where it started. Let go again after, for
    // the ends below.
    await buttonTap(handle(), async () => (await sheetState()) === 'max')
    if ((await sheetState()) !== 'max') {
      skip('  picked at Max, the card comes down to Middle as the camera glides there', `the card would not rise to Max: data-snap=${await sheetState()}`)
    } else {
      await pickButton.scrollIntoViewIfNeeded()
      await buttonTap(pickButton, isPicked)
      await page.waitForTimeout(200)
      await page.waitForFunction(() => !window.__map.isMoving(), null, { timeout: 3000 }).catch(() => {})
      const lowered = await sheetState()
      const spot = pickWant
        ? await page.evaluate((at) => {
            const m = window.__map
            const c = m.getCanvas().getBoundingClientRect()
            const q = m.project(at)
            return { y: c.top + q.y, top: c.top, cardTop: document.querySelector('[data-testid="card"]').getBoundingClientRect().top }
          }, pickWant.at)
        : null
      check(
        '  picked at Max, the card comes down to Middle as the camera glides there, the hintuan above it',
        (await isPicked()) && lowered === 'middle' && (!spot || (spot.y > spot.top + 16 && spot.y < spot.cardTop - 16)),
        `data-snap=${lowered}; ${spot ? `the hintuan at ${Math.round(spot.y)}, the map ${Math.round(spot.top)}–${Math.round(spot.cardTop)} above the card` : 'not measured'}`,
      )
      await pickButton.scrollIntoViewIfNeeded()
      await buttonTap(pickButton, async () => !(await isPicked()))
    }
    // The ends are buttons too (the owner's asks, 2026-09-29): with a
    // hintuan picked, a tap on where the trip goes, then on where it leaves
    // from, picks that end in its place, its dot the Selected one — the hintuan's
    // circle gone, the trip still lit — and glides the map to that end of the
    // line, above the card. Picking the hintuan again lets the end go.
    const ends = await page.evaluate(async (id) => {
      try {
        const { travelLine } = await import('/src/shared/model/ride.ts')
        const { loadMapFile, loadLine } = await import('/src/commuter/mapFile.ts')
        const m = await loadMapFile()
        const found = m.variants.find((x) => x.id === id)
        const line = travelLine({ ...found, shape: (await loadLine(id)) ?? found.shape }, m.stops)
        return line.length > 1 ? { from: line[0], to: line[line.length - 1] } : null
      } catch {
        return null
      }
    }, tripId)
    for (const [end, testId] of [['to', 'trip-destination'], ['from', 'trip-origin']]) {
      const endButton = card().locator(`[data-testid="${testId}"] button`)
      // The last pass scrolled the card to its far end: back to the row first.
      await pickButton.scrollIntoViewIfNeeded()
      await buttonTap(pickButton, isPicked)
      const wasPicked = await isPicked()
      // On the second pass the destination was picked: the hintuan picked
      // again has let it go, before the origin is tapped.
      const destinationBefore = await card().locator('[data-testid="trip-destination"]').first().getAttribute('data-state')
      await endButton.first().scrollIntoViewIfNeeded()
      await buttonTap(endButton, async () => !(await isPicked()))
      await page.waitForTimeout(200)
      await page.waitForFunction(() => !window.__map.isMoving(), null, { timeout: 3000 }).catch(() => {})
      const destination = await card().locator('[data-testid="trip-destination"]').first().getAttribute('data-state')
      const origin = await card().locator('[data-testid="trip-origin"]').first().getAttribute('data-state')
      const after = await page.evaluate(async (at) => {
        const m = window.__map
        const c = m.getCanvas().getBoundingClientRect()
        const d = document.querySelector('[data-testid="card"]').getBoundingClientRect()
        const q = at && m.project(at)
        return {
          pins: document.querySelectorAll('[data-testid="hintuan-pin"]').length,
          lit: (await window.__lit('saved-routes')) ?? [],
          above: q ? c.top + q.y > c.top + 16 && c.top + q.y < d.top - 16 && q.x > 16 && q.x < c.width - 16 : null,
          padding: Object.values(m.getPadding()).every((v) => v === 0),
        }
      }, ends?.[end] ?? null)
      check(
        `  ${end === 'to' ? 'where the trip goes' : 'where it leaves from'}, tapped, is picked in the hintuan's place, its circle gone, the map gliding there above the card`,
        wasPicked && destinationBefore === 'rest' && !(await isPicked()) &&
          destination === (end === 'to' ? 'selected' : 'rest') && origin === (end === 'from' ? 'selected' : 'rest') &&
          after.pins === 0 && after.lit.length === 1 && after.lit[0] === tripId && after.above !== false && after.padding,
        `picked first ${wasPicked}; the destination ${destinationBefore} → ${destination}, the origin ${origin}; ${after.pins} circle(s), ${after.lit.length} lit; in the map above the card ${after.above ?? 'not measured'}`,
      )
    }
    // Picked again, for SWITCH — or ✕ and ‹ — to let go.
    await pickButton.scrollIntoViewIfNeeded()
    await buttonTap(pickButton, isPicked)
    picked = await isPicked()
  }

  // SWITCH turns the trip round: the same route, the other way.
  const sw = card().locator('button[data-testid="card-switch"]')
  if ((await sw.count()) === 0 || (await sw.first().isDisabled())) {
    skip('  SWITCH turns the trip round', (await sw.count()) === 0 ? 'no SWITCH on the card' : "this route's other way is not drawn yet")
  } else {
    const before = await tripLabel()
    const colour = await trip().first().getAttribute('data-livery')
    await buttonTap(sw, async () => (await tripLabel()) !== before)
    const after = await tripLabel()
    const same = (s) => s.split(' → ').sort().join(' | ')
    check('  SWITCH turns the trip round', after !== before && same(after) === same(before), `"${before}" → "${after}"`)
    // Turned round, it is the same card: its colour stays (the owner, 2026-09-29).
    const now = await trip().first().getAttribute('data-livery')
    check('  and keeps its colour', !!colour && now === colour, `${colour} → ${now}`)
    if (picked) {
      // Another direction is another ride: the pick does not come with it.
      const pins = await page.evaluate(() => document.querySelectorAll('[data-testid="hintuan-pin"]').length)
      const still = await card().locator('[data-testid="trip-hintuan"][data-state="selected"]').count()
      check('  and lets the picked hintuan go', pins === 0 && still === 0, `${still} Selected, ${pins} circle(s)`)
      picked = false
    }
  }
  // A hintuan picked on the trip as it is left, for the caller's ✕ or ‹ to
  // let go: SWITCH has let the checked one go.
  if (!picked && (await rows.count()) > 0) {
    if ((await fold.count()) > 0 && (await fold.first().getAttribute('aria-expanded')) !== 'true') {
      await buttonTap(fold, async () => (await fold.first().getAttribute('aria-expanded')) === 'true')
      await page.waitForTimeout(450)
    }
    const any = card().locator('button[data-testid="trip-hintuan-pick"]:visible').first()
    if ((await any.count()) > 0) {
      const on = async () => (await any.getAttribute('aria-pressed')) === 'true'
      await buttonTap(any, on)
      picked = await on()
    }
  }
  return { picked }
}
/** Whether the hintuan pick has been checked: once, on the first trip with a hintuan. */
let picksChecked = false
/** The picked hintuan's circle, gone — and no cut or get-off circle, which the public map never draws. */
const noPickLeft = async () =>
  page.evaluate(async () =>
    ((await window.__src('ride-rest'))?.features ?? []).length +
      document.querySelectorAll('[data-testid="ride-dot"], [data-testid="hintuan-pin"]').length === 0)
const cardText = async () => ((await card().count()) ? (await card().first().innerText()) : '')
/** The card's height: 'low', 'middle' or 'max' (BottomSheet's data-snap). */
const sheetState = async () =>
  (await card().count()) ? await card().first().getAttribute('data-snap') : null
/**
 * How far to drag the handle for the sheet to come to rest at `to` from
 * where it is, by the heights BottomSheet gives it: Low 137, Middle 45% of
 * the map, Max all of it. Negative is up.
 */
const dragTo = async (from, to) => {
  const h = await card().first().evaluate((el) => el.offsetHeight)
  const shown = { low: 137, middle: Math.round(h * 0.45), max: h }
  return shown[from] - shown[to]
}
const closeCard = async () => {
  await page.getByRole('button', { name: 'Close' }).first().click({ timeout: 1500 }).catch(() => {})
  // The ✕ can be missed while the page is busy drawing; Escape closes a sheet too.
  for (let i = 0; i < 20 && (await card().count()) > 0; i++) {
    if (i === 5) await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
  }
  await page.waitForTimeout(300)
}
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
/** The directions lit now, by id. */
const litIds = (p) => p.evaluate(() => window.__lit('saved-routes'))

// How far a pixel reaches on the ground — measured off the map, not looked up.
// MapLibre serves 512 px tiles, so its zoom 16 is the scale a 256 px table calls
// 17: about 1.2 m per CSS pixel here, half what the table says. Every metre
// threshold below is written against this, so they stay right if ZOOM changes.
await jumpTo(page, snapshot.routes[0]?.coords[0] ?? [121.0244, 14.5995])
const M_PER_PX = await page.evaluate(() => {
  const m = window.__map
  const a = m.unproject([0, 0])
  const c = m.unproject([100, 0])
  const k = 111320 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot((c.lng - a.lng) * k, (c.lat - a.lat) * 110574) / 100
})
/** How far the coarse ±20 px tap box reaches on the ground, in metres. */
const BOX_M = 20 * M_PER_PX
/** Where the negative control taps: 40 px off the line. */
const FAR_M = 40 * M_PER_PX
console.log(`(at zoom ${ZOOM} a pixel is ${M_PER_PX.toFixed(2)} m, so the ±20 px tap box reaches ${Math.round(BOX_M)} m)\n`)

// ------------------------------------------------ 2. a forgiving tap, ±20 px
// Route A: the vertex with the most clearance from every other route's line,
// and clear of the hotspot polygons, so only one thing can possibly be there.
let routeA = null
if (snapshot.routes.length === 0) {
  skip('a tap 14 px beside a lone route line selects it', 'no saved routes on the map today')
} else {
  let best = null
  for (const [ri, r] of snapshot.routes.entries()) {
    for (const vi of sampleIndices(r.coords.length, 1500 / snapshot.routes.length)) {
      const p = r.coords[vi]
      const k = mPerDegLng(p[1])
      let clear = Infinity
      for (const [oi, o] of snapshot.routes.entries()) {
        if (oi === ri) continue
        if (distToBbox(p, o.bbox, k) > clear) continue
        const d = distToLine(p, o.coords, k)
        if (d < clear) clear = d
      }
      if (clear < 60) continue
      if (distToHotspots(p, snapshot.polys, k) < 60) continue

      // Which way the line runs here. A route's vertices can be metres apart, so
      // the immediate neighbour gives a direction that is mostly rounding noise
      // — walk along the line until the neighbour is far enough to trust.
      const nb = neighbourAtLeast(r.coords, vi, 30, k)
      if (!nb) continue

      // The negative control taps 40 px out along the perpendicular, so prefer a
      // vertex on a straight stretch: where the line bends back, its own
      // geometry is inside the tap box there and the control cannot run.
      const dx = (nb[0] - p[0]) * k
      const dy = (nb[1] - p[1]) * M_PER_DEG_LAT
      const len = Math.hypot(dx, dy) || 1
      const straight = [1, -1].some((side) => {
        const off = [
          p[0] + ((-dy / len) * FAR_M * side) / k,
          p[1] + ((dx / len) * FAR_M * side) / M_PER_DEG_LAT,
        ]
        const ko = mPerDegLng(off[1])
        const clearThere = Math.min(
          ...snapshot.routes.map((o) => distToLine(off, o.coords, ko)),
          distToHotspots(off, snapshot.polys, ko),
        )
        return clearThere > BOX_M + 10
      })
      const score = clear + (straight ? 1e6 : 0)
      if (!best || score > best.score) best = { route: r, index: vi, point: p, neighbour: nb, clear, straight, score }
    }
  }
  routeA = best
}

if (snapshot.routes.length > 0 && !routeA) {
  skip('a tap 14 px beside a lone route line selects it', 'no route vertex today is 60 m clear of every other route and hotspot')
}

if (routeA) {
  const r = routeA.route
  const neighbour = routeA.neighbour
  const desc = `"${r.signboard}" (${Math.round(routeA.clear)} m clear)`
  await jumpTo(page, routeA.point)
  const anchor = await project(page, routeA.point)
  const perp = await perpendicular(page, routeA.point, neighbour, routeA.route.coords, 40)
  const box = await canvasBox()
  const at = (px) => [box.x + anchor[0] + perp[0] * px, box.y + anchor[1] + perp[1] * px]

  const [tx, ty] = at(14)
  await mapTap(tx, ty)
  await page.waitForTimeout(500)

  const text = await cardText()
  check(`a tap 14 px beside a lone route line selects it`, (await card().count()) > 0, `${desc}; [data-testid="card"] count ${await card().count()}`)
  // The owner's trip card (2026-09-29), named for its direction: it runs from
  // where that leaves (the top row, no pesos on it since 3778:3183) to where
  // it goes (the bottom row). Which way round is the tap's to decide, so the
  // route's two ends are checked, not their order.
  const label = await tripLabel()
  const [from = '', to = ''] = label.split(' → ')
  const origin = await tripRow('trip-origin')
  const end = await tripRow('trip-destination')
  check('  it opens the trip card, from where its direction leaves to where it goes', !!from && !!to && origin === from && end === to, `"${label}": top "${origin}", bottom "${end}"`)
  const routeEnds = r.signboard.split(' – ').map((e) => e.replace(/ via .*$/, ''))
  check("  its ends are the route's two ends", routeEnds.length === 2 && routeEnds.every((e) => text.includes(e)), r.signboard)
  // Dropped by the owner for now, to design later (2026-09-28).
  const gone = ['Length', 'Mode', 'Status', 'Share', 'Signboard'].filter((s) => text.includes(s))
  check("  the old card's extras are gone: no Length, Mode, Status, Share or signboard", text !== '' && gone.length === 0, gone.join(', '))

  // The tap opens the route's drawn outbound, whichever direction was under the finger (2026-09-22).
  const sameRoute = snapshot.routes.filter((o) => o.routeId === r.routeId).map((o) => o.id)
  const lit = (await litIds(page)) ?? []
  check('  one direction of that route is lit', lit.length === 1 && sameRoute.includes(lit[0]), JSON.stringify(lit))
  // No list is behind it: ‹ only where another route sharing an end is drawn
  // its way round, to list them (the owner's ask, 2026-09-29).
  const fanned = fanOf(lit[0]).length > 1
  const backShown = (await card().getByRole('button', { name: 'Back' }).count()) > 0
  check(
    fanned ? '  another route sharing an end runs its way, so it has ‹' : '  no other route sharing an end runs its way, so no ‹',
    backShown === fanned,
    `‹ ${backShown ? 'shown' : 'not shown'}`,
  )
  const looks = await paintNow(page)
  const openColour = (await trip().count()) ? await trip().first().getAttribute('data-livery') : null
  check(
    "  the rest stay as they rest, opaque light blue, the trip's line in its card's colour: nothing fades (two looks)",
    twoLooks(looks, LOOKS?.byLivery[openColour]?.line ?? MAP?.['Map/RouteLine/surface-selected']),
    `${openColour}: ${JSON.stringify(looks)}`,
  )

  const trip2 = await tripChecks()

  // Negative control: 40 px out is twice as far as the box reaches — but only
  // where the line does not curve back and no hotspot sits on that side, so
  // both sides of the line are measured and the clearer one is tapped.
  await closeCard()
  if (trip2.picked) check('  ✕ lets the picked hintuan go', await noPickLeft())
  // A pick glides the camera: back where the tap was measured.
  await jumpTo(page, routeA.point)
  let far = null
  for (const side of [1, -1]) {
    const [fx, fy] = at(40 * side)
    const at40 = await unproject(page, [fx - box.x, fy - box.y])
    const kFar = mPerDegLng(at40[1])
    const clear = Math.min(
      ...snapshot.routes.map((o) => distToLine(at40, o.coords, kFar)),
      distToHotspots(at40, snapshot.polys, kFar),
    )
    if (!far || clear > far.clear) far = { x: fx, y: fy, clear }
  }
  if (far.clear <= BOX_M) {
    skip('a tap 40 px away from every line selects nothing', `neither side of the line is clear 40 px out — the nearest thing is ${Math.round(far.clear)} m away, inside the ${Math.round(BOX_M)} m box`)
  } else {
    await mapTap(far.x, far.y)
    await page.waitForTimeout(500)
    check('a tap 40 px away from every line selects nothing', (await card().count()) === 0, `${Math.round(far.clear)} m clear`)
    const after = (await litIds(page)) ?? []
    check('  nothing stays lit', after.length === 0, JSON.stringify(after))
  }
  await closeCard()
}

// ------------------------------------------------------------- 3. the chooser
// Two routes sharing a road: a vertex of one that lies within 15 m of another's
// line, with no third route inside the tap box.
let shared = null
for (const [ri, r] of snapshot.routes.entries()) {
  if (shared) break
  for (const vi of sampleIndices(r.coords.length, 2000 / Math.max(1, snapshot.routes.length))) {
    const p = r.coords[vi]
    const k = mPerDegLng(p[1])
    const near = routesNear(p, snapshot.routes, BOX_M + 20, k)
    if (near.length !== 2) continue
    const other = near.find((o) => o.id !== r.id)
    if (!other || !near.some((o) => o.id === r.id)) continue
    if (distToLine(p, other.coords, k) > 15) continue
    if (!other.signboard || !r.signboard || other.signboard === r.signboard) continue
    shared = { a: r, b: other, point: p }
    break
  }
}

if (!shared) {
  skip('a tap where two routes share a road opens the chooser', 'no two routes run within 15 m of each other today, on their own')
} else {
  await jumpTo(page, shared.point)
  const anchor = await project(page, shared.point)
  const box = await canvasBox()
  await drawnAt('saved-routes-hit', anchor)
  await mapTap(box.x + anchor[0], box.y + anchor[1])
  await page.waitForTimeout(600)

  const chooser = page.locator('[data-testid="chooser"]')
  const has = (await chooser.count()) > 0
  check('a tap where two routes share a road opens the chooser', has && (await card().count()) === 0, has ? '' : `[data-testid="chooser"] count 0; card count ${await card().count()}`)
  const chooserText = has ? await chooser.first().innerText() : ''
  // The routes' rows, inside their cards: a hotspot under the tap would be a
  // row of the list too, above them.
  const items = chooser.locator('[data-testid="chooser-origin"] button[data-testid="chooser-item"]')
  const itemTexts = []
  for (let i = 0; i < (await items.count()); i++) itemTexts.push(await items.nth(i).innerText())
  // Since 2026-09-25 the sheet lists the routes one way round under the
  // place they leave from — "Tala", then → SM Fairview — so a route's row is
  // its far end, under a heading that is where it leaves from. Outbound where
  // an outbound line was under the tap, the way back where only ways back
  // were (the rule of 2026-09-25): the shared stretch found may be the two
  // routes' ways back (their way home can take another road), as the
  // owner's Bagong Silang Kanan 5 routes of 2026-09-29 are, both coming home
  // from Philcoa and SM Fairview.
  const endsOf = (name) => name.replace(/ via .*$/, '').split(' – ')
  const wayBack = [shared.a, shared.b].every((r) => fileDirections.find((d) => d.id === r.id)?.reversed === true)
  /** Where a route leaves from and goes to, the way round the list shows it. */
  const shownWay = (r) => {
    const [head, tail] = endsOf(r.signboard)
    return wayBack ? { from: tail, to: head } : { from: head, to: tail }
  }
  // The owner's route list (2026-09-28) counts its cards, one per place the
  // routes leave from: two routes out of Tala are "1 Route".
  const places = new Set([shared.a, shared.b].map((r) => shownWay(r).from.toLowerCase())).size
  const title = `${places} ${places === 1 ? 'Route' : 'Routes'}`
  check(`  the list is headed "${title}", a card per place`, chooserText.split('\n').includes(title), chooserText.split('\n')[0] ?? '')
  check(
    `  it lists both routes ${wayBack ? 'the way back' : 'outbound'}, one row each, under the place each leaves from`,
    itemTexts.length === 2 &&
      [shared.a, shared.b].every((r) => {
        const { from, to } = shownWay(r)
        return chooserText.includes(from) && itemTexts.some((t) => t.includes(to))
      }),
    `${itemTexts.length} row(s): ${itemTexts.map((t) => t.replace(/\n/g, ' / ')).join(' | ')}`,
  )
  // Its row, found in its card: the way back, both rows may read the same
  // place ("→ Bagong Silang Kanan 5"), each under its own card.
  const bWay = shownWay(shared.b)
  const wantedCard = chooser
    .locator('[data-testid="chooser-origin"]')
    .filter({ has: page.locator('[data-testid="chooser-select"]', { hasText: bWay.from }) })
    .first()
  const wanted = wantedCard.locator('button[data-testid="chooser-item"]').filter({ hasText: bWay.to })
  const listShown = async () => (await chooser.count()) > 0 && (await chooser.first().isVisible())
  // The colour of the card the row sits on: the trip it opens wears it.
  const cardColour = (await wanted.count()) ? await wantedCard.getAttribute('data-livery') : null
  // A list lights every route it lists. A tap on a card off its rows — its
  // name — narrows the lights to its routes, and a second lets it go; a row
  // opens its trip straight away, and ‹ comes back to every card at rest
  // (the owner, 2026-09-29).
  const sameSet = (a, b) => {
    const [x, y] = [[...new Set(a)], [...new Set(b)]]
    return x.length === y.length && x.every((id) => y.includes(id))
  }
  const directionsIn = (where) => where.locator('button[data-testid="chooser-item"]').evaluateAll((els) => els.map((e) => e.dataset.direction).filter(Boolean))
  const listedIds = has ? await directionsIn(chooser.first().locator('[data-testid="chooser-origin"]')) : []
  const litOpen = (await litIds(page)) ?? []
  check('  it lights every route it lists', listedIds.length > 0 && sameSet(litOpen, listedIds), `${litOpen.length} lit, ${listedIds.length} listed`)
  const isPicked = async () => (await wanted.count()) > 0 && (await wantedCard.getAttribute('data-state')) === 'selected'
  const wantedName = wantedCard.locator('[data-testid="chooser-select"]')
  await buttonTap(wantedName, isPicked)
  const pickedIds = (await wanted.count()) ? await directionsIn(wantedCard) : []
  const litPicked = (await litIds(page)) ?? []
  check('  a tap on a card off its rows selects it, opening no trip', (await isPicked()) && (await trip().count()) === 0, `Selected ${await isPicked()}; trip open ${(await trip().count()) > 0}`)
  const seenPicked = await rideLook(page)
  check("  its routes in the card's colour, chevrons and end circles too", wears(seenPicked, LOOKS?.byLivery[cardColour]), `${cardColour}: ${JSON.stringify(seenPicked)}`)
  // Narrower than the list only where the list has other cards.
  if (pickedIds.length > 0 && pickedIds.length < new Set(listedIds).size) {
    check('  and lights just its routes', sameSet(litPicked, pickedIds), `${litPicked.length} lit for ${pickedIds.length} row(s) of ${listedIds.length}`)
  } else {
    skip('  and lights just its routes', 'the picked card holds every route the list shows today')
  }
  await buttonTap(wantedName, async () => !(await isPicked()))
  const litLetGo = (await litIds(page)) ?? []
  check('  a second tap lets it go, every route it lists lit again', !(await isPicked()) && sameSet(litLetGo, listedIds), `Selected ${await isPicked()}; ${litLetGo.length} lit`)
  // Picked again, its row opens the trip; ‹ will bring the list back at rest.
  await buttonTap(wantedName, isPicked)
  const pickedForTrip = await isPicked()
  await buttonTap(wanted, async () => (await trip().count()) > 0)
  // The trip card takes the list's place, and the list stays behind it,
  // hidden, for the trip's ‹ (the owner's frames, 2026-09-28).
  const [bHead, bTail] = endsOf(shared.b.signboard)
  const picked = await tripLabel()
  check(
    `  tapping "${shared.b.signboard}" opens its trip in the list's place`,
    picked.includes(bHead) && picked.includes(bTail) && !(await listShown()),
    `card "${picked}", list shown ${await listShown()}`,
  )
  const tripColour = (await trip().count()) ? await trip().first().getAttribute('data-livery') : null
  check('  the trip wears the colour of the card it was picked from', !!cardColour && tripColour === cardColour, `card ${cardColour}, trip ${tripColour}`)
  const seenTrip = await rideLook(page)
  check("  and so does its line", wears(seenTrip, LOOKS?.byLivery[tripColour]), `${tripColour}: ${JSON.stringify(seenTrip)}`)
  const trip3 = await tripChecks()
  const back = card().getByRole('button', { name: 'Back' })
  if ((await back.count()) === 0) {
    check('  ‹ on the trip goes back to the list, as it was', false, 'no ‹ on a trip picked from the list')
  } else {
    await buttonTap(back, listShown)
    const again = (await listShown()) ? await chooser.first().innerText() : ''
    const litBack = (await litIds(page)) ?? []
    check(
      '  ‹ on the trip, from a picked card, goes back to the list at rest: no card picked, every route it lists lit',
      again === chooserText && (await card().count()) === 0 && pickedForTrip && !(await isPicked()) && sameSet(litBack, listedIds),
      again ? `card count ${await card().count()}; picked before ${pickedForTrip}, now ${await isPicked()}; ${litBack.length} lit` : 'the list did not come back',
    )
    if (trip3.picked) check('  and lets the picked hintuan go', await noPickLeft())
    const seenRest = await rideLook(page)
    check('  and its lines are the selected blue again', wears(seenRest, LOOKS?.lit), JSON.stringify(seenRest))
    // Picked, then a tap on the map where the list opened: a fresh list,
    // nothing Selected, every route it lists lit.
    await buttonTap(wantedName, isPicked)
    const repicked = await isPicked()
    await jumpTo(page, shared.point)
    const anchor2 = await project(page, shared.point)
    const box2 = await canvasBox()
    await mapTap(box2.x + anchor2[0], box2.y + anchor2[1])
    await page.waitForTimeout(600)
    const litTapped = (await litIds(page)) ?? []
    const pickedAfter = await chooser.locator('[data-state="selected"]').count()
    check('  a map tap lets it go: nothing Selected, every route it lists lit', repicked && pickedAfter === 0 && (await listShown()) && sameSet(litTapped, listedIds), `picked ${repicked}; ${pickedAfter} Selected; ${litTapped.length} lit`)
    // The list and the trip opened from it are one height (the owner's ask
    // of 2026-09-30: "if RouteDetail was in medium, if they go back, the
    // RouteCard is in medium too"): raised to Max here, through a pick and ‹.
    const listSnap = async () => ((await listShown()) ? await chooser.first().getAttribute('data-snap') : null)
    const listHandle = chooser.first().locator('button[data-testid="dock-handle"]')
    for (let i = 0; i < 2 && (await listSnap()) !== 'max'; i++) await buttonTap(listHandle, async () => (await listSnap()) === 'max')
    const listAtMax = (await listSnap()) === 'max'
    await buttonTap(wanted, async () => (await trip().count()) > 0)
    const tripSnap = await sheetState()
    check('  a trip opened from the list at Max opens at Max too', listAtMax && tripSnap === 'max', `list at Max ${listAtMax}; trip ${tripSnap}`)
    const backAgain = card().getByRole('button', { name: 'Back' })
    if (await backAgain.count()) await buttonTap(backAgain, listShown)
    check('  and ‹ brings the list back at Max', (await listSnap()) === 'max', `list ${await listSnap()}`)
  }
  await closeCard()
}

// -------------------------------------------------- 4. hotspots, forgivingly
// A route drawn right under the tapped pixel wins (the hit line is 18 px wide,
// so "under" reaches 9 px); a route merely inside the ±20 px box shares the
// route list with the hotspot; no route near, and the hotspot opens on its own.
// Hotspots are a few tens of metres across, so this section zooms to 18, where
// a person tapping a terminal would be, and scales its metres per pixel to match.
const Z_HOT = 18
const M_HOT = M_PER_PX / 2 ** (Z_HOT - ZOOM)
const UNDER_M = 9 * M_HOT + 3 * M_HOT
const NEAR_M = 20 * M_HOT + 9 * M_HOT
const badgeOf = (poly) => (poly.kind === 'terminal' ? 'Terminal · routes start here' : 'Hintuan · wait and board here')

// 4a. Inside a hotspot, on a pixel no route covers, with a route or not in
// the finger's reach: the box's card opens straight away, alone — one tap,
// one kind of thing (the owner's ask, 2026-09-30: "select hintuan only show
// the card, then select route show the route"). Until then a route in reach
// made it a list, the hotspot first.
let inside = null
for (const poly of snapshot.polys) {
  const c = centroidOf(poly.ring)
  const candidates = [c, ...poly.ring.map((v) => [c[0] + (v[0] - c[0]) * 0.5, c[1] + (v[1] - c[1]) * 0.5])]
  for (const p of candidates) {
    if (!pointInPolygon(p, poly.ring)) continue
    const k = mPerDegLng(p[1])
    const nearest = Math.min(...snapshot.routes.map((o) => distToLine(p, o.coords, k)), Infinity)
    if (nearest < UNDER_M) continue
    if (snapshot.polys.some((o) => o.id !== poly.id && pointInPolygon(p, o.ring))) continue
    const routesInBox = routesNear(p, snapshot.routes, NEAR_M, k)
    inside = { poly, point: p, routesInBox }
    break
  }
  if (inside) break
}

if (!inside) {
  skip('a tap inside a hotspot opens its card alone', snapshot.polys.length ? `no point inside a hotspot today is ${Math.round(UNDER_M)} m clear of every route line` : 'no hotspots on the map today')
} else {
  const { poly, point, routesInBox } = inside
  await jumpTo(page, point, Z_HOT)
  const anchor = await project(page, point)
  const box = await canvasBox()
  await mapTap(box.x + anchor[0], box.y + anchor[1])
  await page.waitForTimeout(600)
  const chooser = page.locator('[data-testid="chooser"]')
  const text = await cardText()
  check(
    `a tap inside "${poly.name}" opens its card alone${routesInBox.length ? `, its route in reach not listed` : ''}`,
    text.includes(poly.name) && text.includes(badgeOf(poly)) && (await chooser.count()) === 0,
    `${text.split('\n')[0] || '(no card)'}; ${await chooser.count()} list(s); ${routesInBox.length} route(s) in reach`,
  )
  check(`  no chooser for one thing`, (await chooser.count()) === 0)
  await closeCard()
}

// 4b. 15 px outside the ring, with no route within reach of the tap at all.
const RING_CLEAR_M = 15 * M_HOT + NEAR_M + 3 * M_HOT
let hotspot = null
let bestRingClear = 0
for (const poly of snapshot.polys) {
  const c = centroidOf(poly.ring)
  for (const v of poly.ring) {
    const k = mPerDegLng(v[1])
    const clear = Math.min(...snapshot.routes.map((o) => distToLine(v, o.coords, k)), Infinity)
    if (clear > bestRingClear) bestRingClear = clear
    if (clear < RING_CLEAR_M) continue
    if (snapshot.polys.some((o) => o.id !== poly.id && distToLine(v, o.ring, k) < 80)) continue
    hotspot = { poly, vertex: v, centre: c }
    break
  }
  if (hotspot) break
}

if (snapshot.polys.length === 0) {
  skip('a tap 15 px outside a hotspot edge still opens it', 'no hotspots on the map today')
} else if (!hotspot) {
  skip('a tap 15 px outside a hotspot edge still opens it', `no hotspot ring vertex today is ${Math.round(RING_CLEAR_M)} m clear of every route line (the best manages ${Math.round(bestRingClear)} m)`)
} else {
  const { poly, vertex, centre } = hotspot
  await jumpTo(page, vertex, Z_HOT)
  const anchor = await project(page, vertex)
  const inward = await project(page, centre)
  const dx = anchor[0] - inward[0]
  const dy = anchor[1] - inward[1]
  const len = Math.hypot(dx, dy) || 1
  const box = await canvasBox()
  const drawn = await drawnAt('saved-stops-fill', inward)
  await mapTap(box.x + anchor[0] + (dx / len) * 15, box.y + anchor[1] + (dy / len) * 15)
  await page.waitForTimeout(600)

  const text = await cardText()
  check(
    `a tap 15 px outside "${poly.name}" still opens it`,
    text.includes(poly.name),
    `${text.split('\n')[0] || '(no card)'}; the box drawn at its centre: ${drawn === 1 ? 'yes' : drawn}`,
  )
  check(`  the card shows its "${badgeOf(poly).split(' ·')[0]}" badge`, text.includes(badgeOf(poly)))
  await closeCard()
}

// ------------------------------------- 4c. the sheet, on a hotspot's card
// Every card is the one BottomSheet since 2026-09-30, a hotspot's and a
// trip's alike; these gestures are checked on a hotspot's.
/** Handle gestures the runner made no pointer events for, sent again by hand. */
let handleByHand = 0
const pointerdowns = () => page.evaluate(() => window.__pointerdowns)
/**
 * A gesture on the handle sent by hand, as pointer events: down at (x, y),
 * a move to each of `ys`, up. The mouse's pointer, since a touch's id would
 * have to be a finger on the glass for the handle to capture it.
 */
const handGesture = (x, y, ys) =>
  page.evaluate(async ([x, y, ys]) => {
    const el = document.elementFromPoint(x, y)
    const at = (cy) => ({ clientX: x, clientY: cy, bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true })
    el.dispatchEvent(new PointerEvent('pointerdown', at(y)))
    for (const cy of ys) el.dispatchEvent(new PointerEvent('pointermove', at(cy)))
    // Held still before letting go, as dragHandle does: a placement, not a flick.
    if (ys.length) await new Promise((r) => setTimeout(r, 150))
    el.dispatchEvent(new PointerEvent('pointerup', at(ys.at(-1) ?? y)))
  }, [x, y, ys])
/**
 * A finger's tap on the handle; when the page saw no pointer press from it,
 * the same tap as pointer events sent by hand. On some GitHub runs Chromium
 * stopped making pointer events from touches, and from the mouse, partway
 * through the suite: the page heard only touchstart and touchend, so the
 * sheet, which listens for pointers, heard nothing (the Philcoa card's
 * handle, 2026-09-29, pinned by the events sheetDiag lists). mapTap and
 * buttonTap send a dropped tap's click by hand for the same reason. How many
 * needed it is reported at the end.
 */
const tapHandle = async () => {
  if ((await handle().count()) === 0) return false
  const hb = await handle().first().boundingBox()
  if (!hb) return false
  const [x, y] = [hb.x + hb.width / 2, hb.y + hb.height / 2]
  const seen = await pointerdowns()
  await page.touchscreen.tap(x, y)
  await page.waitForTimeout(450)
  if ((await pointerdowns()) === seen) {
    handleByHand++
    await handGesture(x, y, [])
    await page.waitForTimeout(450)
  }
  return true
}
/**
 * Drag the handle by dy CSS px. Touch first (CDP), mouse as a fallback. Held
 * still for a moment before letting go, so the sheet settles on the height
 * nearest where it was left (BottomSheet's snapFor), not a flick's.
 */
const dragHandle = async (dy) => {
  if ((await handle().count()) === 0) return { ok: false, how: 'no handle' }
  const before = await sheetState()
  const hb = await handle().first().boundingBox()
  if (!hb) return { ok: false, how: 'handle not visible' }
  const x = hb.x + hb.width / 2
  const y = hb.y + hb.height / 2
  const steps = 8
  const seen = await pointerdowns()
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y + (dy * i) / steps }],
      })
      await page.waitForTimeout(16)
    }
    await page.waitForTimeout(150)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } catch (e) {
    return { ok: false, how: `Input.dispatchTouchEvent threw: ${String(e).slice(0, 80)}` }
  }
  await page.waitForTimeout(450)
  if ((await sheetState()) !== before || (await card().count()) === 0) return { ok: true, how: 'touch' }
  // The sheet ignored the synthetic touch; try the same gesture with a mouse.
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x, y + (dy * i) / steps)
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(150)
  await page.mouse.up()
  await page.waitForTimeout(450)
  // Neither made a pointer event: the runner's, as with tapHandle.
  if ((await pointerdowns()) === seen) {
    handleByHand++
    await handGesture(x, y, Array.from({ length: steps }, (_, i) => y + (dy * (i + 1)) / steps))
    await page.waitForTimeout(450)
    return { ok: true, how: 'by hand (the runner made no pointer events from the touch or the mouse)' }
  }
  return { ok: true, how: 'mouse (the sheet did not answer a synthetic touch drag)' }
}

/** Open that hotspot's card again, with the tap 15 px outside its ring that 4b checks. */
const openSheet = async () => {
  const { vertex, centre } = hotspot
  await jumpTo(page, vertex, Z_HOT)
  const anchor = await project(page, vertex)
  const inward = await project(page, centre)
  const dx = anchor[0] - inward[0]
  const dy = anchor[1] - inward[1]
  const len = Math.hypot(dx, dy) || 1
  const box = await canvasBox()
  await mapTap(box.x + anchor[0] + (dx / len) * 15, box.y + anchor[1] + (dy / len) * 15)
  await page.waitForTimeout(600)
}
/** Each gesture below is judged on its own, so put the sheet back if one broke it. */
const restore = async (want) => {
  if ((await card().count()) === 0) await openSheet()
  // The handle goes round, Low → Middle → Max: two taps at most.
  for (let i = 0; i < 2 && (await sheetState()) !== want; i++) await tapHandle()
  return (await sheetState()) === want
}

/**
 * What the page held when a handle check failed: on some GitHub runs the
 * Philcoa card's first handle tap and drags answered nothing, touch or mouse,
 * and passed on others (2026-09-29) — every card on the page, what lies on
 * top of the handle, and the events the last gestures made there.
 */
const sheetDiag = () =>
  page.evaluate(() => {
    const name = (el) => (el instanceof Element ? el.closest('[data-testid]')?.getAttribute('data-testid') ?? el.tagName.toLowerCase() : String(el))
    const cards = [...document.querySelectorAll('[data-testid="card"]')].map(
      (c) => `${c.tagName.toLowerCase()}${c.hidden ? ' hidden' : ''} snap=${c.getAttribute('data-snap')} "${(c.textContent ?? '').trim().slice(0, 30)}"`,
    )
    const h = document.querySelector('[data-testid="card"] button[data-testid="dock-handle"]')
    const r = h?.getBoundingClientRect()
    const top = r ? name(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) : '(no handle)'
    return `cards [${cards.join(' | ')}]; on the handle ${top}; chooser ${document.querySelectorAll('[data-testid="chooser"]').length}; events ${(window.__sheetEvents ?? []).slice(-14).join(', ')}; now ${Math.round(performance.now())}, the last real pointerdown ${window.__lastDown}; odd [${window.__odd.slice(-12).join(', ')}]`
  })

if (!hotspot) {
  skip("the sheet handle opens and closes a hotspot's card", 'no hotspot clear of every route to open a card on (see 4b)')
} else {
  await page.evaluate(() => {
    window.__sheetEvents = []
    const t0 = performance.now()
    for (const t of ['pointerdown', 'pointerup', 'pointercancel', 'click', 'contextmenu', 'touchstart', 'touchend', 'touchcancel'])
      document.addEventListener(
        t,
        (e) => {
          const el = e.target instanceof Element ? e.target.closest('[data-testid]')?.getAttribute('data-testid') ?? e.target.tagName.toLowerCase() : ''
          window.__sheetEvents.push(`${Math.round(performance.now() - t0)} ${t}@${el}`)
        },
        true,
      )
  })
  await openSheet()
  // Every card opens at Middle (BottomSheet), a hotspot's too since the
  // owner's ask of 2026-09-30; before, it opened peeking.
  check("a hotspot's card opens at Middle", (await sheetState()) === 'middle', `data-snap=${await sheetState()}`)

  const hadHandle = await tapHandle()
  const firstTap = hadHandle && (await sheetState()) === 'max'
  check("a tap on a hotspot card's handle raises it to Max", firstTap, hadHandle ? `data-snap=${await sheetState()}${firstTap ? '' : `; ${await sheetDiag()}`}` : 'no button[data-testid="dock-handle"]')
  check('  no horizontal scroll with the sheet at Max', await noHScroll(page))

  await tapHandle()
  const afterSecond = (await card().count()) === 0 ? 'the whole card vanished' : `data-snap=${await sheetState()}`
  check('a second tap on the handle goes round to Low', (await sheetState()) === 'low', afterSecond)

  // From here each gesture starts from a known height, so one broken gesture
  // does not report the next three as broken too. A start that cannot be
  // reached is itself a failure: the drag after it would prove nothing.
  const readyUp = await restore('low')
  const up = await dragHandle(await dragTo('low', 'middle'))
  const upOpened = readyUp && (await sheetState()) === 'middle'
  check('dragging the handle up from Low settles at Middle', upOpened, `${readyUp ? '' : 'could not get to Low first; '}${up.how}; data-snap=${await sheetState()}${upOpened ? '' : `; ${await sheetDiag()}`}`)

  const readyDown = await restore('middle')
  const down = await dragHandle(await dragTo('middle', 'low'))
  check('dragging it down from Middle settles at Low', readyDown && (await sheetState()) === 'low', `${readyDown ? '' : 'could not get to Middle first; '}${down.how}; data-snap=${await sheetState()}`)

  const readyLow = await restore('low')
  const down2 = await dragHandle(120)
  check('dragging down past Low dismisses the card', readyLow && (await card().count()) === 0, `${readyLow ? '' : 'could not get to Low first; '}${down2.how}; [data-testid="card"] count ${await card().count()}`)
  await closeCard()

  // A mouse's drag, on a narrow window: the browser then clicks the handle it
  // was held on, and that click toggled the sheet straight back — pulled up,
  // it fell to peek, as it was then (the reviewer's note, fixed on the owner's word,
  // 2026-09-29). The drags above go by touch whenever the page answers it.
  const mouseDrag = async (dy) => {
    const hb = await handle().first().boundingBox()
    if (!hb) return false
    const [x, y] = [hb.x + hb.width / 2, hb.y + hb.height / 2]
    const seen = await pointerdowns()
    await page.mouse.move(x, y)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(x, y + (dy * i) / 8)
      await page.waitForTimeout(16)
    }
    await page.waitForTimeout(150)
    await page.mouse.up()
    await page.waitForTimeout(450)
    // The mouse made no pointer event: the runner's, as with tapHandle. The
    // same drag by hand, then the click a mouse sends after one — on the
    // handle it was held on, where it let go — which is the click this check
    // is for.
    if ((await pointerdowns()) === seen) {
      handleByHand++
      await handGesture(x, y, Array.from({ length: 8 }, (_, i) => y + (dy * (i + 1)) / 8))
      await page.evaluate(([x, y]) => {
        const h = document.querySelector('[data-testid="card"] button[data-testid="dock-handle"]')
        h?.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true, cancelable: true, detail: 1 }))
      }, [x, y + dy])
      await page.waitForTimeout(450)
    }
    return true
  }
  const readyMouseUp = await restore('low')
  const mouseUp = await mouseDrag(await dragTo('low', 'middle'))
  const mouseOpened = readyMouseUp && mouseUp && (await sheetState()) === 'middle'
  check('a mouse dragging the handle up from Low leaves the sheet at Middle', mouseOpened, `data-snap=${await sheetState()}${mouseOpened ? '' : `; ${await sheetDiag()}`}`)
  const readyMouseDown = await restore('middle')
  const mouseDown = await mouseDrag(await dragTo('middle', 'low'))
  check('  and dragging it down leaves it at Low', readyMouseDown && mouseDown && (await sheetState()) === 'low', `data-snap=${await sheetState()}`)
  await closeCard()

  // The watch for the click the browser sends after a handle tap must end
  // with the next tap, or the ✕ pressed right after would be lost too.
  const readyClose = await restore('low')
  await tapHandle()
  const cb = await card().getByRole('button', { name: 'Close' }).first().boundingBox()
  if (cb) {
    const [cx, cy] = [cb.x + cb.width / 2, cb.y + cb.height / 2]
    const seen = await pointerdowns()
    await page.touchscreen.tap(cx, cy)
    await page.waitForTimeout(400)
    // The runner dropped the touch, as tapHandle allows for: the same tap by
    // hand — a press, which ends the watch, then its click — so what is
    // checked is still the watch, not a bare click. The mouse's pointer, as
    // handGesture's, since the sheet may capture it.
    if ((await card().count()) > 0 && (await pointerdowns()) === seen) {
      tapsByHand++
      await page.evaluate(([x, y]) => {
        const el = document.elementFromPoint(x, y)
        const at = { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true }
        el?.dispatchEvent(new PointerEvent('pointerdown', at))
        el?.dispatchEvent(new PointerEvent('pointerup', at))
        el?.dispatchEvent(new MouseEvent('click', { ...at, detail: 1 }))
      }, [cx, cy])
      await page.waitForTimeout(400)
    }
  }
  check('✕ pressed right after a handle tap still closes the card', readyClose && !!cb && (await card().count()) === 0, `[data-testid="card"] count ${await card().count()}`)
  await closeCard()
}

// ------------------------- 4d. the handle, on a hotspot's card with routes
// Raised, a hotspot's card shows its routes where the finger was, and the
// click that follows the tap on the handle must not open one (seen
// 2026-09-29: it did, with the old rows and the RouteCards alike). 4c's
// hotspot is chosen clear of every route, so it has none to fall on.
const drawnIds = new Set(fileDirections.filter((d) => (d.shape?.coordinates?.length ?? 0) > 1).map((d) => d.id))
const withRoutes = snapshot.polys.find((poly) => (published?.links ?? []).some((l) => l.stop_id === poly.id && drawnIds.has(l.route_variant_id)))
if (!withRoutes) {
  skip('a tap on the handle of a hotspot card with routes raises it, opening none', published ? 'no hotspot has a drawn route linked today' : 'the published file could not be read')
} else {
  const c = centroidOf(withRoutes.ring)
  await jumpTo(page, c, Z_HOT)
  const at = await project(page, c)
  const box = await canvasBox()
  await mapTap(box.x + at[0], box.y + at[1])
  await page.waitForTimeout(600)
  // A route under the finger shares the tap: the list asks, and its row opens the box.
  const chooser = page.locator('[data-testid="chooser"]')
  if ((await chooser.count()) > 0) {
    await buttonTap(chooser.locator('button[data-testid="chooser-item"]').filter({ hasText: withRoutes.name }), async () => (await chooser.count()) === 0)
  }
  const atMiddle = (await cardText()).includes(withRoutes.name) && (await sheetState()) === 'middle'
  await tapHandle()
  check(
    `a tap on the handle of "${withRoutes.name}"'s card, with routes, raises it to Max, opening none`,
    atMiddle && (await sheetState()) === 'max' && (await trip().count()) === 0,
    `opened at Middle ${atMiddle}; now data-snap=${await sheetState()}, trip ${await trip().count()}`,
  )
  // On a busy page that click comes long after the finger lifts — a second on
  // GitHub's runners once the Philcoa card's routes flowed (2026-09-29), when
  // the sheet gave up on it after 300 ms — and is still the tap's: pulled down,
  // it would land on the map and close the card; pulled up, on a route.
  // Holding the page busy in the pointerup did not make it late here —
  // Chromium still sent the click before the overdue timer (2026-09-29) — so
  // this tap is sent by hand, its click a second after it, to whatever is
  // then under the finger. What that click would do there varies
  // (the hotspot under the finger opens the same card again; a RouteCard's
  // name only lights it), so the check is that it reached nothing at all.
  /** What the late click reached, '' if it was swallowed; null with no handle to tap. */
  const lateClickTap = async () => {
    const hb = (await handle().count()) ? await handle().first().boundingBox() : null
    if (!hb) return null
    const reached = await page.evaluate(async ([x, y]) => {
      // The mouse's pointer: a touch's id would have to be a finger on the glass for the handle to capture it.
      const at = { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true }
      const el = document.elementFromPoint(x, y)
      el.dispatchEvent(new PointerEvent('pointerdown', at))
      el.dispatchEvent(new PointerEvent('pointerup', at))
      await new Promise((r) => setTimeout(r, 1000))
      const under = document.elementFromPoint(x, y)
      if (!under) return '(nothing under the finger)'
      // Heard where it lands: the sheet swallows the tap's click on its way down, before it gets there.
      let through = false
      const heard = () => (through = true)
      under.addEventListener('click', heard)
      under.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true, cancelable: true, detail: 1 }))
      under.removeEventListener('click', heard)
      return through ? under.closest('[data-testid]')?.getAttribute('data-testid') ?? under.tagName.toLowerCase() : ''
    }, [hb.x + hb.width / 2, hb.y + hb.height / 2])
    await settled()
    await page.waitForTimeout(300)
    return reached
  }
  const lateDown = await lateClickTap()
  check('  a tap whose click comes a second late takes it round to Low, the click reaching nothing', lateDown === '' && (await card().count()) === 1 && (await sheetState()) === 'low', `${lateDown === null ? 'no handle' : lateDown ? `the click reached ${lateDown}` : 'swallowed'}; data-snap=${await sheetState()}`)
  const lateUp = await lateClickTap()
  check('  and raises it again to Middle, the click reaching nothing', lateUp === '' && (await sheetState()) === 'middle' && (await trip().count()) === 0, `${lateUp === null ? 'no handle' : lateUp ? `the click reached ${lateUp}` : 'swallowed'}; data-snap=${await sheetState()}, trip ${await trip().count()}`)
  await closeCard()
}

// Overlapping hotspots share the list; today's data has none.
const overlapping = snapshot.polys.some((a) =>
  snapshot.polys.some((bPoly) => bPoly.id !== a.id && a.ring.some((v) => pointInPolygon(v, bPoly.ring))),
)
if (!overlapping) skip('two overlapping hotspots open the list', 'no two hotspot polygons overlap today')

// --------------------------------------------------------------- 5. sharing
if (!routeA) {
  skip('selecting a route puts ?r=<id> in the address', 'no lone route vertex to select')
} else {
  const r = routeA.route
  await jumpTo(page, routeA.point)
  const anchor = await project(page, routeA.point)
  const perp = await perpendicular(page, routeA.point, routeA.neighbour, routeA.route.coords, 40)
  const box = await canvasBox()
  await mapTap(box.x + anchor[0] + perp[0] * 14, box.y + anchor[1] + perp[1] * 14)
  await page.waitForTimeout(600)
  const sameRouteIds = snapshot.routes.filter((o) => o.routeId === r.routeId).map((o) => o.id)
  check('selecting a route puts ?r=<id> in the address', sameRouteIds.includes(new URL(page.url()).searchParams.get('r') ?? ''), page.url().slice(BASE.length) || '/')
  await closeCard()
  check('  closing the card clears it again', !new URL(page.url()).searchParams.has('r'), page.url().slice(BASE.length) || '/')

  // A cold load of the share link.
  await page.goto(`${BASE}/?r=${encodeURIComponent(r.id)}`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
  await page.waitForTimeout(2000)
  const shareText = await cardText()
  // The card reads the route the way that direction rides it: check both ends, not the order.
  const ends = r.signboard.split(' – ').map((e) => e.replace(/ via .*$/, ''))
  check('loading /?r=<id> opens that route', ends.length === 2 && ends.every((e) => shareText.includes(e)), shareText.split('\n')[0] ?? '(no card)')

  const view = await page.evaluate(() => {
    const c = window.__map.getCenter()
    return { lng: c.lng, lat: c.lat, zoom: window.__map.getZoom() }
  })
  const [w, s, e, n] = r.bbox
  const mx = (e - w) * 0.1 + 0.0005
  const my = (n - s) * 0.1 + 0.0005
  check(
    '  it centres the view on the route',
    view.lng >= w - mx && view.lng <= e + mx && view.lat >= s - my && view.lat <= n + my,
    `centre ${view.lng.toFixed(4)},${view.lat.toFixed(4)} vs bbox ${w.toFixed(4)},${s.toFixed(4)} → ${e.toFixed(4)},${n.toFixed(4)}`,
  )
  // The view fits the whole route. A jeepney route is kilometres long, so on a
  // 390 px screen that lands around zoom 12–13, well in from the metro-wide 11
  // the map opens at.
  const spanKm = ((e - w) * mPerDegLng(view.lat) * 0.001).toFixed(1)
  check('  it zooms in from the metro-wide view (≥ 12)', view.zoom >= 12, `zoom ${view.zoom.toFixed(2)} for a route ${spanKm} km wide`)

  // Opened by a link, no list is behind the trip: ‹ only where another route
  // sharing an end is drawn its way round (the owner's ask, 2026-09-29). No
  // Share button since the owner dropped it for now (2026-09-28) — the
  // address bar is the link.
  const fannedR = fanOf(r.id).length > 1
  check(
    fannedR
      ? '  opened by a link, the trip has ‹: another route sharing an end runs its way'
      : '  opened by a link, the trip has no ‹: no other route sharing an end runs its way',
    (await trip().count()) > 0 && ((await card().getByRole('button', { name: 'Back' }).count()) > 0) === fannedR,
    `trip ${await trip().count()}`,
  )
}

// ------------------------------------------ 5b. ‹ on a trip opened on its own
// A trip opened by a link has no list behind it. Where other routes sharing
// its head or its tail are drawn its way round, ‹ lists them the way the trip
// goes, as a tap where they all run would: Tala → Novaliches ‹ to Tala's
// card, "1 Route", Novaliches and SM Fairview (the owner's ask, 2026-09-29).
// A drawn direction: a link to a slot opens nothing to test, and its fan would leave it out.
const fannedOne = fileDirections.find((d) => (d.shape?.coordinates?.length ?? 0) > 1 && fanOf(d.id).length > 1)
if (!fannedOne) {
  skip(
    'a trip opened on its own lists, behind its ‹, the routes sharing an end',
    published ? 'no two routes sharing an end are drawn the same way round today' : 'the published file could not be read',
  )
} else {
  const fan = fanOf(fannedOne.id)
  await page.goto(`${BASE}/?r=${encodeURIComponent(fannedOne.id)}`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
  await page.waitForTimeout(2000)
  const opened = await tripLabel()
  const openedColour = (await trip().count()) ? await trip().first().getAttribute('data-livery') : null
  const back = card().getByRole('button', { name: 'Back' })
  const chooser = page.locator('[data-testid="chooser"]')
  const listShown = async () => (await chooser.count()) > 0 && (await chooser.first().isVisible())
  const tapped = (await back.count()) > 0 && (await buttonTap(back, listShown))
  check(
    `a trip opened on its own, "${opened}", lists behind its ‹ the routes sharing an end`,
    tapped && (await listShown()) && (await trip().count()) === 0,
    tapped ? `list shown ${await listShown()}, trip ${await trip().count()}` : 'no ‹ on the trip',
  )
  if (await listShown()) {
    // A card per place they leave from, the way the trip went; a row for each.
    const ends = fan.map((d) => (d.direction_name ?? '').split(' → '))
    const places = new Set(ends.map(([from = '']) => from.toLowerCase())).size
    const title = `${places} ${places === 1 ? 'Route' : 'Routes'}`
    const text = await chooser.first().innerText()
    check(`  headed "${title}", a card per place`, text.split('\n').includes(title), text.split('\n')[0] ?? '')
    const items = chooser.locator('button[data-testid="chooser-item"]')
    const rows = []
    for (let i = 0; i < (await items.count()); i++) rows.push((await items.nth(i).innerText()).trim())
    check("  a row for each, where it goes, the trip's own among them", rows.length === fan.length && ends.every(([, to = '']) => rows.some((t) => t.includes(to))), rows.join(' | '))
    const lit = ((await litIds(page)) ?? []).sort()
    check('  and lit, as a tap where they all run would light them', JSON.stringify(lit) === JSON.stringify(fan.map((d) => d.id).sort()), JSON.stringify(lit))
    // One place, one card: it wears the colour the trip wore, its place's.
    if (places === 1) {
      const listColour = await chooser.locator('[data-livery]').first().getAttribute('data-livery')
      check("  its card wears the trip's colour", !!openedColour && listColour === openedColour, `trip ${openedColour}, card ${listColour}`)
    }
  }
  await closeCard()
}

// -------------------------------------------- 6. the desktop control, ±5 px
const desktop = await b.newContext({ viewport: { width: 1280, height: 800 } })
const dpage = await desktop.newPage()
watch(dpage)
await nodeFetch(dpage)
await dpage.addInitScript(() => {
  window.__src = async (id) => {
    const s = window.__map?.getSource(id)
    return s ? await s.getData() : null
  }
})
await dpage.goto(`${BASE}/`, { waitUntil: 'load' })
await dpage.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
await dpage.waitForTimeout(1500)

// The public map has no +, − or compass for a mouse either since 2026-09-29
// (the owner: "annoying for users"); the studio keeps them.
check('a fine pointer gets no zoom buttons either', (await dpage.locator('.maplibregl-ctrl-zoom-in, .maplibregl-ctrl-compass').count()) === 0)
check(
  'a fine pointer keeps the attribution bottom right',
  (await dpage.locator('.maplibregl-ctrl-bottom-right .maplibregl-ctrl-attrib').count()) > 0,
)

if (!routeA) {
  skip('a mouse click 4 px beside the line selects it', 'no lone route vertex to click')
} else {
  const r = routeA.route
  const neighbour = routeA.neighbour
  await jumpTo(dpage, routeA.point)
  const anchor = await project(dpage, routeA.point)
  const perp = await perpendicular(dpage, routeA.point, neighbour, routeA.route.coords, 20)
  const box = await dpage.locator('canvas.maplibregl-canvas').boundingBox()
  const dCard = dpage.locator('[data-testid="card"]')

  await dpage.mouse.click(box.x + anchor[0] + perp[0] * 4, box.y + anchor[1] + perp[1] * 4)
  await dpage.waitForTimeout(500)
  check('a mouse click 4 px beside the line selects it', (await dCard.count()) > 0, `card count ${await dCard.count()}`)
  await dpage.getByRole('button', { name: 'Close' }).first().click({ timeout: 1500 }).catch(() => {})
  await dpage.waitForTimeout(300)

  // The box and the hit line add up: a ±5 px box around a line drawn 18 px wide
  // reaches 5 + 9 = 14 px from the centre — the mouse tolerance the map always
  // had, plus the box. 20 px must be outside it.
  const hitWidth = await dpage.evaluate(() =>
    window.__map.getLayer('saved-routes-hit') ? window.__map.getPaintProperty('saved-routes-hit', 'line-width') : null,
  )
  await dpage.mouse.click(box.x + anchor[0] + perp[0] * 20, box.y + anchor[1] + perp[1] * 20)
  await dpage.waitForTimeout(500)
  check(
    'a mouse click 20 px away does not — the fine box is ±5 px on an 18 px hit line',
    (await dCard.count()) === 0,
    `card count ${await dCard.count()}; saved-routes-hit is ${hitWidth} px wide, so a ±5 px box reaches ${5 + Number(hitWidth) / 2} px`,
  )
}

// --------------------------------------------------------- 7. housekeeping
if (tapsByHand) console.log(`\n(${tapsByHand} tap(s) needed the click sent by hand: the runner dropped the touch${lateClicks ? `; ${lateClicks} of those got the touch's own click afterwards too` : ''})\n`)
const odd = await page.evaluate(() => window.__odd ?? []).catch(() => [])
if (odd.length) console.log(`
(context menus, drags and cancelled pointers the page saw: ${odd.slice(-20).join(', ')})
`)
if (handleByHand) console.log(`\n(${handleByHand} gesture(s) on the sheet handle sent by hand as pointer events: the runner made none from the touch)\n`)
check('no request to router.project-osrm.org', !osrmHit)
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))

await b.close()
tally()
