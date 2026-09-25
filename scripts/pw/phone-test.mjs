// The public map at /, on a phone: 390×844, touch, a coarse pointer.
//
//   npm run dev                        (in another terminal)
//   node scripts/pw/phone-test.mjs
//
// Same rule as visitor-test: nothing is hard-coded about today's data. Every
// tap position is computed from the map's own sources — the script reads the
// route lines and hotspot rings out of `saved-routes` / `saved-stops`, finds a
// stretch of line no other route comes near, a vertex two routes share, and a
// hotspot edge with no line beside it, then projects those to screen pixels and
// taps them. A check today's data cannot support prints SKIP instead of failing.
//
// Covers (43 checks today): touch chrome — no zoom buttons, attribution moved
// to the top right, no horizontal scroll; the forgiving ±20 px tap, with a
// negative control well outside the box; the bottom sheet — tap and drag the
// handle, peek → open → peek → gone; the "N routes here" chooser where two
// routes share a road; a tap just outside a hotspot; the ?r=<id> share link,
// the view it restores and its copy button; the fine-pointer desktop control
// (±5 px, zoom buttons back, attribution bottom right); and housekeeping.
import { chromium } from 'playwright'

const BASE = (process.env.PARAPO_BASE ?? 'http://localhost:5173').replace(/\/$/, '')
const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
const skip = (name, reason) => console.log(`SKIP  ${name}  ${reason}`)

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
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
const page = await context.newPage()
watch(page)

// PARAPO_NODE_FETCH=1: serve every https request through Node fetch. Needed only
// where the browser cannot reach the internet but Node can (sandboxed CI).
const nodeFetch = async (p) => {
  if (!process.env.PARAPO_NODE_FETCH) return
  await p.route(/^https:\/\//, async (route) => { const req = route.request(); try { const h={...req.headers()}; delete h['accept-encoding']; const r = await fetch(req.url(), { method: req.method(), headers: h, body: ['GET','HEAD'].includes(req.method())?undefined:req.postDataBuffer() }); const body=Buffer.from(await r.arrayBuffer()); const hh={}; r.headers.forEach((v,k)=>{ if(!['content-encoding','content-length','transfer-encoding'].includes(k)) hh[k]=v }); await route.fulfill({status:r.status,headers:hh,body}) } catch { await route.abort() } })
}
await nodeFetch(page)
await page.addInitScript(() => {
  window.__src = async (id) => {
    const s = window.__map?.getSource(id)
    return s ? await s.getData() : null
  }
  // Since 2026-09-25 a tap is feature state, not a filter or a paint
  // expression naming ids (useLighting in src/shared/useSavedRoutes.ts).
  // The directions a source has lit; and the level the line layer paints a
  // direction nobody tapped: dim while anything is lit, at rest otherwise —
  // its own expression's branches, read through the state, as MapLibre does.
  window.__lit = async (src) => {
    const m = window.__map
    const fc = await m?.getSource(src)?.getData()
    if (!fc) return null
    return [...new Set(fc.features.map((f) => f.properties.id))].filter((id) => !!m.getFeatureState({ source: src, id }).lit)
  }
  window.__restLevel = async () => {
    const o = window.__map.getPaintProperty('saved-routes-line', 'line-opacity')
    if (!Array.isArray(o)) return o
    return ((await window.__lit('saved-routes')) ?? []).length ? o[4] : o[o.length - 1]
  }
})

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
await waitForSource('saved-routes')
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
  return {
    routes: (routesFC?.features ?? [])
      .filter((f) => f.geometry.type === 'LineString' && f.geometry.coordinates.length > 1)
      .map((f) => ({
        id: f.properties.id,
        routeId: f.properties.route_id,
        signboard: f.properties.name ?? '',
        coords: f.geometry.coordinates,
      })),
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
// The chooser is a sheet too, handle and all, so every sheet locator is scoped
// to the card — never to the page.
const handle = () => card().locator('button[data-testid="sheet-handle"]')
const cardText = async () => ((await card().count()) ? (await card().first().innerText()) : '')
const sheetState = async () =>
  (await card().count()) ? await card().first().getAttribute('data-sheet') : null
const closeCard = async () => {
  await page.getByRole('button', { name: 'Close' }).first().click({ timeout: 1500 }).catch(() => {})
  // The ✕ can be missed while the page is busy drawing; Escape closes a sheet too.
  for (let i = 0; i < 20 && (await card().count()) > 0; i++) {
    if (i === 5) await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
  }
  await page.waitForTimeout(300)
}
// Every direction rests in a light blue; a tap fades the rest further (2026-09-22).
const REST_OPACITY = 0.45
// What the rest are at: the level of a direction nobody tapped.
const lineOpacity = (p) => p.evaluate(() => (window.__map.getLayer('saved-routes-line') ? window.__restLevel() : null))
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
  check('  it opens as a sheet in "peek"', (await sheetState()) === 'peek', `data-sheet=${await sheetState()}`)
  // The small line reads the route the way the opened direction rides it, so check both ends, not the order.
  const peekEnds = r.signboard.split(' – ').map((e) => e.replace(/ via .*$/, ''))
  check('  the peek names both ends of the route', peekEnds.length === 2 && peekEnds.every((e) => text.includes(e)), r.signboard)
  check('  the peek leads with a direction (→)', text.includes('→'))
  check('  the peek hides "Length" until it is opened', text !== '' && !text.includes('Length'))

  // The tap opens the route's drawn outbound, whichever direction was under the finger (2026-09-22).
  const sameRoute = snapshot.routes.filter((o) => o.routeId === r.routeId).map((o) => o.id)
  const lit = (await litIds(page)) ?? []
  check('  one direction of that route is lit', lit.length === 1 && sameRoute.includes(lit[0]), JSON.stringify(lit))
  check('  the other lines fade below the light rest', (await lineOpacity(page)) < REST_OPACITY, String(await lineOpacity(page)))

  // Negative control: 40 px out is twice as far as the box reaches — but only
  // where the line does not curve back and no hotspot sits on that side, so
  // both sides of the line are measured and the clearer one is tapped.
  await closeCard()
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
    check('  the lines go back to their light rest', (await lineOpacity(page)) === REST_OPACITY, String(await lineOpacity(page)))
  }
  await closeCard()
}

// ------------------------------------------------------------- 3. the sheet
const tapHandle = async () => {
  if ((await handle().count()) === 0) return false
  const hb = await handle().first().boundingBox()
  if (!hb) return false
  await page.touchscreen.tap(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.waitForTimeout(450)
  return true
}
/** Drag the handle by dy CSS px. Touch first (CDP), mouse as a fallback. */
const dragHandle = async (dy) => {
  if ((await handle().count()) === 0) return { ok: false, how: 'no handle' }
  const before = await sheetState()
  const hb = await handle().first().boundingBox()
  if (!hb) return { ok: false, how: 'handle not visible' }
  const x = hb.x + hb.width / 2
  const y = hb.y + hb.height / 2
  const steps = 8
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y + (dy * i) / steps }],
      })
      await page.waitForTimeout(16)
    }
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
  await page.mouse.up()
  await page.waitForTimeout(450)
  return { ok: true, how: 'mouse (the sheet did not answer a synthetic touch drag)' }
}

/** Select route A again by tapping 14 px beside its lonely vertex. */
const openRouteA = async () => {
  await jumpTo(page, routeA.point)
  const anchor = await project(page, routeA.point)
  const perp = await perpendicular(page, routeA.point, routeA.neighbour, routeA.route.coords, 40)
  const box = await canvasBox()
  await mapTap(box.x + anchor[0] + perp[0] * 14, box.y + anchor[1] + perp[1] * 14)
  await page.waitForTimeout(600)
}
/** Each gesture below is judged on its own, so put the sheet back if one broke it. */
const restore = async (want) => {
  if ((await card().count()) === 0) await openRouteA()
  if ((await sheetState()) !== want) await tapHandle()
  return (await sheetState()) === want
}

if (!routeA) {
  skip('the sheet handle opens and closes the card', 'no lone route vertex to open a card on')
} else {
  await openRouteA()

  const hadHandle = await tapHandle()
  check('a tap on the handle opens the sheet', hadHandle && (await sheetState()) === 'open', hadHandle ? `data-sheet=${await sheetState()}` : 'no button[data-testid="sheet-handle"]')
  const openText = await cardText()
  const missing = ['Length', 'Mode', 'Status'].filter((s) => !openText.includes(s))
  check('  the open sheet shows Length, Mode and Status', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : '')
  check('  no horizontal scroll with the sheet open', await noHScroll(page))

  await tapHandle()
  const afterSecond = (await card().count()) === 0 ? 'the whole card vanished' : `data-sheet=${await sheetState()}`
  check('a second tap on the handle goes back to peek', (await sheetState()) === 'peek', afterSecond)

  // From here each gesture starts from a known state, so one broken gesture
  // does not report the next three as broken too. A start state that cannot
  // be reached is itself a failure: the drag after it would prove nothing.
  const readyUp = await restore('peek')
  const up = await dragHandle(-60)
  check('dragging the handle up opens the sheet', readyUp && (await sheetState()) === 'open', `${readyUp ? '' : 'could not get back to peek first; '}${up.how}; data-sheet=${await sheetState()}`)

  const readyDown = await restore('open')
  const down = await dragHandle(60)
  check('dragging the handle down goes back to peek', readyDown && (await sheetState()) === 'peek', `${readyDown ? '' : 'could not get back to open first; '}${down.how}; data-sheet=${await sheetState()}`)

  const readyPeek = await restore('peek')
  const down2 = await dragHandle(60)
  check('dragging down again at peek dismisses the card', readyPeek && (await card().count()) === 0, `${readyPeek ? '' : 'could not get back to peek first; '}${down2.how}; [data-testid="card"] count ${await card().count()}`)
  await closeCard()

  // The click the browser sends after a handle tap must not be swallowed for
  // long, or the ✕ pressed right after would be lost too.
  const readyClose = await restore('peek')
  await tapHandle()
  const cb = await card().getByRole('button', { name: 'Close' }).first().boundingBox()
  if (cb) await page.touchscreen.tap(cb.x + cb.width / 2, cb.y + cb.height / 2)
  await page.waitForTimeout(400)
  check('✕ pressed right after a handle tap still closes the card', readyClose && !!cb && (await card().count()) === 0, `[data-testid="card"] count ${await card().count()}`)
  await closeCard()
}

// ------------------------------------------------------------- 4. the chooser
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
  check('  the chooser says "2 routes here"', chooserText.includes('2 routes here'), chooserText.split('\n')[0] ?? '')
  const items = chooser.locator('button[data-testid="chooser-item"]')
  const itemTexts = []
  for (let i = 0; i < (await items.count()); i++) itemTexts.push(await items.nth(i).innerText())
  // Since 2026-09-25 the sheet lists each route outbound under the place it
  // leaves from — "Tala", then → SM Fairview — so a route's row is its far
  // end, under a heading that is its head.
  const endsOf = (name) => name.replace(/ via .*$/, '').split(' – ')
  check(
    '  it lists both routes, one row each, under the place each leaves from',
    itemTexts.length === 2 &&
      [shared.a.signboard, shared.b.signboard].every((s) => {
        const [head, tail] = endsOf(s)
        return chooserText.includes(head) && itemTexts.some((t) => t.includes(tail))
      }),
    `${itemTexts.length} row(s): ${itemTexts.map((t) => t.replace(/\n/g, ' / ')).join(' | ')}`,
  )
  const wanted = items.filter({ hasText: endsOf(shared.b.signboard)[1] })
  await buttonTap(wanted, async () => (await chooser.count()) === 0)
  check(
    `  tapping "${shared.b.signboard}" opens that route and closes the chooser`,
    (await cardText()).includes(shared.b.signboard) && (await chooser.count()) === 0,
    `card "${(await cardText()).split('\n')[0] ?? ''}", chooser count ${await chooser.count()}`,
  )
  await closeCard()
}

// -------------------------------------------------- 5. hotspots, forgivingly
// A route drawn right under the tapped pixel wins (the hit line is 18 px wide,
// so "under" reaches 9 px); a route merely inside the ±20 px box shares a
// chooser with the hotspot; no route near, and the hotspot opens on its own.
// Hotspots are a few tens of metres across, so this section zooms to 18, where
// a person tapping a terminal would be, and scales its metres per pixel to match.
const Z_HOT = 18
const M_HOT = M_PER_PX / 2 ** (Z_HOT - ZOOM)
const UNDER_M = 9 * M_HOT + 3 * M_HOT
const NEAR_M = 20 * M_HOT + 9 * M_HOT
const badgeOf = (poly) => (poly.kind === 'terminal' ? 'Terminal · routes start here' : 'Hintuan · wait and board here')

// 5a. Inside a hotspot, on a pixel no route covers. The normal case for a
// terminal is that its own route runs through it, so this is the tap the
// chooser exists for: "1 route · 1 hotspot here".
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
  skip('a tap inside a hotspot opens it, or a chooser when its route is near', snapshot.polys.length ? `no point inside a hotspot today is ${Math.round(UNDER_M)} m clear of every route line` : 'no hotspots on the map today')
} else {
  const { poly, point, routesInBox } = inside
  await jumpTo(page, point, Z_HOT)
  const anchor = await project(page, point)
  const box = await canvasBox()
  const drawn = await drawnAt('saved-stops-fill', anchor)
  await mapTap(box.x + anchor[0], box.y + anchor[1])
  await page.waitForTimeout(600)
  const chooser = page.locator('[data-testid="chooser"]')
  if (routesInBox.length > 0) {
    const cText = (await chooser.count()) ? await chooser.first().innerText() : ''
    check(
      `a tap inside "${poly.name}" beside its route offers both`,
      cText.includes('1 hotspot here') && cText.includes(`${routesInBox.length} route`) && cText.includes(poly.name),
      cText
        ? cText.split('\n')[0]
        : `no chooser; card "${(await cardText()).split('\n')[0] ?? ''}"; the box drawn under the tap: ${drawn === 1 ? 'yes' : drawn}`,
    )
    const row = chooser.locator('button[data-testid="chooser-item"]').filter({ hasText: poly.name })
    await buttonTap(row, async () => (await chooser.count()) === 0)
    const text = await cardText()
    check(
      `  choosing "${poly.name}" opens its card, with its badge`,
      text.includes(poly.name) && text.includes(badgeOf(poly)) && (await chooser.count()) === 0,
      text.split('\n')[0] || `(no card; chooser count ${await chooser.count()})`,
    )
  } else {
    const text = await cardText()
    check(`a tap inside "${poly.name}", no route near, opens it directly`, text.includes(poly.name) && text.includes(badgeOf(poly)) && (await chooser.count()) === 0, text.split('\n')[0] ?? '(no card)')
    check(`  no chooser for one thing`, (await chooser.count()) === 0)
  }
  await closeCard()
}

// 5b. 15 px outside the ring, with no route within reach of the tap at all.
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

// Overlapping hotspots share the chooser; today's data has none.
const overlapping = snapshot.polys.some((a) =>
  snapshot.polys.some((bPoly) => bPoly.id !== a.id && a.ring.some((v) => pointInPolygon(v, bPoly.ring))),
)
if (!overlapping) skip('two overlapping hotspots open the chooser', 'no two hotspot polygons overlap today')

// --------------------------------------------------------------- 6. sharing
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

  // Share lives in the body of the sheet, so pull it up before pressing it.
  if ((await sheetState()) === 'peek') await tapHandle()
  const shareBtn = card().locator('[data-testid="share"]')
  const sb = (await shareBtn.count()) ? await shareBtn.first().boundingBox() : null
  if (!sb) {
    check('the Share button copies the link', false, (await shareBtn.count()) === 0 ? 'no [data-testid="share"] on the card' : 'the Share button is on the card but not visible')
    skip('  the clipboard holds that link', 'no Share button to press')
  } else {
    await page.touchscreen.tap(sb.x + sb.width / 2, sb.y + sb.height / 2)
    await page.waitForTimeout(600)
    check('the Share button copies the link', (await page.getByText('Link copied').count()) > 0)
    let clip = null
    let clipErr = ''
    try {
      await page.bringToFront()
      clip = await page.evaluate(() => navigator.clipboard.readText())
    } catch (err) {
      clipErr = String(err).slice(0, 120).replace(/\s+/g, ' ')
    }
    if (clip === null) skip('  the clipboard holds that link', `navigator.clipboard.readText() unavailable: ${clipErr}`)
    else check('  the clipboard holds that link', clip === page.url(), `"${clip}" vs "${page.url()}"`)
  }
}

// -------------------------------------------- 7. the desktop control, ±5 px
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

check('a fine pointer keeps the zoom buttons', (await dpage.locator('.maplibregl-ctrl-zoom-in').count()) > 0)
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

// --------------------------------------------------------- 8. housekeeping
if (tapsByHand) console.log(`\n(${tapsByHand} tap(s) needed the click sent by hand: the runner dropped the touch${lateClicks ? `; ${lateClicks} of those got the touch's own click afterwards too` : ''})\n`)
check('no request to router.project-osrm.org', !osrmHit)
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))

await b.close()
const failed = results.filter((x) => !x).length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
