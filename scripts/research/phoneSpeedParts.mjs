// The parts of the cheap-phone timer (phone-speed.mjs) that are plain logic,
// kept apart so the unit checks can hold them (tests/unit/phone-speed-test.mjs).
// Split out for the cheap-phone plan's Step 0, 2026-10-04.

// ------------------------------------------------------------- ground metres
export const M_PER_DEG_LAT = 110_574
export const mPerDegLng = (lat) => 111_320 * Math.cos((lat * Math.PI) / 180)

/** Metres from p to the segment a–b, in p's local metre frame (k: metres per degree of longitude there). */
export function distPointSegment(p, a, b, k) {
  const px = (p[0] - a[0]) * k
  const py = (p[1] - a[1]) * M_PER_DEG_LAT
  const bx = (b[0] - a[0]) * k
  const by = (b[1] - a[1]) * M_PER_DEG_LAT
  const len2 = bx * bx + by * by
  let t = len2 ? (px * bx + py * by) / len2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - bx * t, py - by * t)
}

/** Metres from p to the nearest part of a polyline. */
export function distToLine(p, coords, k) {
  let best = Infinity
  for (let i = 1; i < coords.length; i++) best = Math.min(best, distPointSegment(p, coords[i - 1], coords[i], k))
  return best
}

/** Whether p is inside a ring, by ray casting (tests/e2e/lib/geo.mjs's). */
export function pointInRing([x, y], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * Metres from p to the nearest hotspot box, 0 inside one: a tap inside a box
 * is the box's, whatever runs through it (tap.ts). As phone-test's
 * distToHotspots; the harness's first list spots measured to the edges only,
 * so a point deep inside a big box read as clear of it.
 */
export function distToRings(p, rings, k) {
  let best = Infinity
  for (const ring of rings) {
    if (pointInRing(p, ring)) return 0
    best = Math.min(best, distToLine(p, ring, k))
  }
  return best
}

// ---------------------------------------------------------- the published map
/**
 * The published map's directions and hotspot boxes, from index.v4.json:
 * each direction's full line where `lineOf(id)` has one (a direction with an
 * overview has a file in data/lines/), else its overview.
 */
export function mapGeometry(index, lineOf) {
  const lines = index.variants
    .map((v) => ({
      id: v.id,
      route: v.route_id,
      name: v.route?.name ?? '',
      coords: (v.overview ? lineOf(v.id) : null) ?? v.overview?.coordinates ?? [],
    }))
    .filter((l) => l.coords.length > 1)
  const rings = index.stops.filter((s) => s.area?.type === 'Polygon').map((s) => s.area.coordinates[0])
  return { lines, rings }
}

/** Every `stride`-th index of a line, so at most `max` of them. */
const sampled = (length, max) => {
  const stride = Math.max(1, Math.ceil(length / Math.max(1, max)))
  const out = []
  for (let i = 0; i < length; i += stride) out.push(i)
  return out
}

/**
 * Where to tap for the route list: a road several routes share, as
 * phone-test finds its list tap. A vertex of one direction within 15 m of a
 * direction of another route (another name on the signboard), with its
 * metres to the nearest hotspot box (`box`). Sampled evenly along each line,
 * in the file's order.
 */
export function listSpots({ lines, rings }) {
  const named = lines.filter((l) => l.name)
  const spots = []
  for (const l of named) {
    for (const i of sampled(l.coords.length, 2000 / named.length)) {
      const p = l.coords[i]
      const k = mPerDegLng(p[1])
      if (!named.some((o) => o.name !== l.name && distToLine(p, o.coords, k) <= 15)) continue
      spots.push({ p, line: l.id, box: distToRings(p, rings, k) })
    }
  }
  return spots
}

/**
 * Where to tap for a trip: a vertex where only its own route runs, as
 * phone-test's openAlone finds one. Each with `clear`, its metres to the
 * nearest line of another route (a route's two directions are one thing to
 * the tap, tap.ts's routeKeys, and where they share a road the outbound
 * opens), and `box`, to the nearest hotspot box; the clearest first. The page
 * then keeps the first whose room is more than a finger reaches there.
 */
export function tripSpots({ lines, rings }, perLine = 200) {
  const spots = []
  for (const l of lines) {
    for (const i of sampled(l.coords.length, perLine)) {
      const p = l.coords[i]
      const k = mPerDegLng(p[1])
      let clear = Infinity
      for (const o of lines) if (o.route !== l.route) clear = Math.min(clear, distToLine(p, o.coords, k))
      spots.push({ p, line: l.id, clear, box: distToRings(p, rings, k) })
    }
  }
  return spots.sort((a, b) => Math.min(b.clear, b.box) - Math.min(a.clear, a.box))
}

/**
 * How far a finger reaches on the ground, in pixels, as openAlone counts it:
 * the corner of the coarse ±20 px tap box (tap.ts), 20√2, and half the hit
 * line's width, 9.
 */
export const FINGER_REACH_PX = 20 * Math.SQRT2 + 9

// ------------------------------------------------------------------ the wire
/** The zoom of a basemap tile from its address (…/z/x/y.pbf), null for the style, TileJSON, sprite and glyphs. */
export function tileZoom(url) {
  let path
  try {
    path = new URL(url).pathname
  } catch {
    return null
  }
  const m = /\/(\d{1,2})\/\d+\/\d+\.(?:pbf|mvt|png|jpe?g|webp)$/.exec(path)
  return m ? Number(m[1]) : null
}

/** Where a point falls in the tile grid at zoom z, in tiles (fractional): Web Mercator. */
export function tileAt([lng, lat], z) {
  const n = 2 ** z
  const r = (lat * Math.PI) / 180
  return [((lng + 180) / 360) * n, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n]
}

/**
 * Every tile a camera move from view `a` to view `b` ({ center, zoom }) can
 * ask for, as [z, x, y]: at each whole zoom it passes, the tiles under a
 * screen of `viewport` CSS px centred anywhere on the straight line between
 * the two centres, and one more all round. MapLibre asks a 512 px vector
 * source for the floor of the zoom, and a screen is widest at the whole zoom.
 * Which tiles a move asks for depends on when its frames fall: the cheap-phone
 * timer fetches all of these in its warm-up (2026-10-04).
 */
export function tilesAlong(a, b, viewport) {
  const out = []
  for (let z = Math.floor(Math.min(a.zoom, b.zoom)); z <= Math.floor(Math.max(a.zoom, b.zoom)); z++) {
    const [ax, ay] = tileAt(a.center, z)
    const [bx, by] = tileAt(b.center, z)
    const halfW = viewport.width / 2 / 512
    const halfH = viewport.height / 2 / 512
    const last = 2 ** z - 1
    const clamp = (v) => Math.max(0, Math.min(last, v))
    for (let x = clamp(Math.floor(Math.min(ax, bx) - halfW) - 1); x <= clamp(Math.floor(Math.max(ax, bx) + halfW) + 1); x++) {
      for (let y = clamp(Math.floor(Math.min(ay, by) - halfH) - 1); y <= clamp(Math.floor(Math.max(ay, by) + halfH) + 1); y++) out.push([z, x, y])
    }
  }
  return out
}

/**
 * One link that carries one transfer at a time: each waits `latencyMs`, then
 * its bytes at `bytesPerSecond`, after the one before it is through. `sleep`
 * is for the unit checks.
 */
export function serialLink({ latencyMs, bytesPerSecond }, sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
  let tail = Promise.resolve()
  const holdMs = (bytes) => latencyMs + (bytes / bytesPerSecond) * 1000
  return {
    holdMs,
    /** Resolves once `bytes` are through. */
    carry(bytes) {
      const done = tail.then(() => sleep(holdMs(bytes)))
      tail = done.catch(() => {})
      return done
    },
  }
}

/**
 * Who asked the site for something, by the headers Chrome sends with it: a
 * dedicated worker's own script (Sec-Fetch-Dest: worker) and whatever that
 * worker asks for (its script is the referrer); the service worker's script
 * (serviceworker) and everything it fetches, its precache and importScripts
 * (it is the referrer); else the page. A page's request the service worker
 * passes on to the network keeps the page as its referrer, so it counts as
 * the page's. `workerPath` and `swPath` tell those scripts' addresses.
 */
export function askedBy(headers, { workerPath = /\/assets\/maplibre-gl-worker-[^/]*\.js$/, swPath = /^\/sw\.js$/ } = {}) {
  const dest = headers['sec-fetch-dest']
  let from = ''
  try {
    from = new URL(headers.referer ?? '').pathname
  } catch {}
  if (dest === 'serviceworker' || swPath.test(from)) return 'sw'
  if (dest === 'worker' || workerPath.test(from)) return 'worker'
  return 'page'
}

/** Bytes of an HTTP/1.1 response's status line and headers, as they go over the wire. */
export function headerBytes(status, headers) {
  let n = `HTTP/1.1 ${status} \r\n`.length + 2
  for (const [k, v] of Object.entries(headers)) n += `${k}: ${v}\r\n`.length
  return n
}

/** The keys in `after` that `before` lacks, in after's order: the GL programs a tap compiled. */
export const added = (before, after) => {
  const had = new Set(before)
  return after.filter((k) => !had.has(k))
}

// ------------------------------------------------------------------ the sums
export const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/** Median, min and max of the numbers among `xs`; all null when there are none. */
export function stats(xs) {
  const n = xs.filter((v) => typeof v === 'number' && Number.isFinite(v))
  return n.length ? { median: median(n), min: Math.min(...n), max: Math.max(...n) } : { median: null, min: null, max: null }
}

/** The zooms any run's `scenario` fetched tiles at, lowest first, as metric names: tilesZ9, tilesZ10, … */
export function tileMetrics(runs, scenario) {
  const zooms = new Set()
  for (const r of runs) for (const z of Object.keys(r[scenario]?.tiles ?? {})) zooms.add(Number(z))
  return [...zooms].sort((a, b) => a - b).map((z) => `tilesZ${z}`)
}
