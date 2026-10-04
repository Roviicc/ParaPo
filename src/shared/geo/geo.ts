export type LngLat = [number, number]

export type SnapMode = 'snapped' | 'freehand'

/** One stretch of a single road along a routed segment. `name` is '' for an unnamed way. */
export type StreetRun = { name: string; metres: number }

/**
 * The geometry between two consecutive control points. One per gap, so a route
 * with N control points has N-1 segments.
 */
export type Segment = {
  snap: SnapMode
  coordinates: LngLat[]
  /**
   * The roads a routed segment follows, in order, with how far along each.
   * Absent on straight segments, and on routed ones saved before streets were
   * recorded.
   */
  streets?: StreetRun[]
}

/** Two points this close are one join, not two vertices: 1 cm, far below a click or a 6-decimal save. */
const JOIN_M = 0.01

/**
 * Concatenate segments into one continuous line, dropping a segment's first
 * point only where it repeats the previous segment's last.
 *
 * It was dropped always, and a routed segment does not start on the click: it
 * starts where the router put that click on the road, up to SNAP_RADIUS_M
 * (25 m) away. After a freehand segment, which does end on the click, the
 * road's first vertex was lost, and the saved line, its metres, its stop
 * order and the published line cut that corner, while the map, which draws
 * segment by segment, showed it whole (review of 2026-10-03, finding 7).
 */
export function joinSegments(segments: Segment[]): LngLat[] {
  const out: LngLat[] = []
  for (const s of segments) {
    if (!s?.coordinates?.length) continue
    const last = out[out.length - 1]
    const repeats = last !== undefined && haversine(last, s.coordinates[0]) < JOIN_M
    out.push(...(repeats ? s.coordinates.slice(1) : s.coordinates))
  }
  return out
}

/**
 * Six decimals, about 0.1 m: what a save keeps of a coordinate. The router
 * and the mouse give 15 or more, and those digits were half of every row
 * (2026-09-25, future-proofing stage 2). The publish script rounds the same
 * way, so a published point is the saved one.
 */
export const round6 = (n: number): number => Math.round(n * 1e6) / 1e6

/** The point with both coordinates rounded to 6 decimals. */
export const roundLngLat = (p: LngLat): LngLat => [round6(p[0]), round6(p[1])]

const EARTH_RADIUS_M = 6_371_000

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

/**
 * Metres in a degree of latitude — and of longitude, times the cosine of the
 * latitude — on the sphere `haversine` measures on: 111,194.9. The one
 * figure every flat patch and padded box uses (the review's 6.5: there were
 * four, 110,574 to 111,320, and a padding metre to cover the gap).
 */
export const M_PER_DEG = toRad(1) * EARTH_RADIUS_M

/** Great-circle distance in metres. */
export function haversine([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}

/** Total length of a coordinate list, in metres. */
export function lineLength(coords: readonly LngLat[]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) total += haversine(coords[i - 1], coords[i])
  return total
}

/**
 * Metres one screen pixel covers at this latitude and zoom, on MapLibre's
 * map: Web Mercator with 512 px tiles, so the equator's 40,075 km span 512 px
 * at zoom 0 — half the 156,543 m figure quoted for 256 px tiles. One function
 * for the chevrons' spacing and the locator's accuracy circle; the halo had the 256 px
 * figure and was drawn at half the fix's accuracy (review finding 10).
 */
export function metresPerPixel(lat: number, zoom: number): number {
  return (78271.51696 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
}

/** The scale bar's length on the screen: the camera's "height" is metres per this many pixels (useLocator, useOverviews). */
export const SCALE_PX = 100

/** The zoom at which SCALE_PX screen pixels are `metres` at this latitude: the scale bar reading that. */
export function zoomForScale(metres: number, lat: number): number {
  return Math.log2((metresPerPixel(lat, 0) * SCALE_PX) / metres)
}

/** `12.8km`: a length as the trip card's Kilometer tile writes it, to a tenth, no space (the owner's 3778:3183). */
export function kmLabel(metres: number): string {
  return (metres / 1000).toFixed(1) + 'km'
}

/**
 * The point of segment a–b nearest p, and how far along a–b it is (0–1), on
 * a flat patch around a (fine at street scale).
 */
export function nearestOnSegment(p: LngLat, a: LngLat, b: LngLat): { point: LngLat; t: number } {
  const k = Math.cos(toRad(a[1]))
  const [px, py] = [(p[0] - a[0]) * k, p[1] - a[1]]
  const [bx, by] = [(b[0] - a[0]) * k, b[1] - a[1]]
  const l2 = bx * bx + by * by
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / l2))
  return { point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], t }
}

/**
 * Metres along the line to the point of it nearest p. What breaks a tie
 * between two hotspots met on one segment (timeline.ts): the line may be
 * the full one or its overview, so an index into it is not to be trusted,
 * a position along it is (2026-10-03).
 */
export function metresAlong(line: readonly LngLat[], p: LngLat): number {
  if (line.length < 2) return 0
  let best = Infinity
  let at = 0
  let walked = 0
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]]
    const d = pointToSegmentM(p, a, b)
    if (d < best) {
      best = d
      at = walked + haversine(a, nearestOnSegment(p, a, b).point)
    }
    walked += haversine(a, b)
  }
  return at
}

/**
 * Metres from point p to segment a–b, on the same flat patch: the one
 * point-to-segment every file measures with (the review's 6.5).
 */
export function pointToSegmentM(p: LngLat, a: LngLat, b: LngLat): number {
  const { point } = nearestOnSegment(p, a, b)
  const k = Math.cos(toRad(a[1]))
  return Math.hypot((p[0] - point[0]) * k, p[1] - point[1]) * M_PER_DEG
}

/**
 * The line thinned so that no point of it strays more than `epsilonM` metres
 * (Douglas–Peucker); the first and last points always stay.
 */
export function simplifyLine(line: readonly LngLat[], epsilonM: number): LngLat[] {
  if (line.length <= 2) return line.slice()
  const keep = new Array<boolean>(line.length).fill(false)
  keep[0] = keep[line.length - 1] = true
  const stack: [number, number][] = [[0, line.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let worst = -1
    let worstD = epsilonM
    for (let i = a + 1; i < b; i++) {
      const d = pointToSegmentM(line[i], line[a], line[b])
      if (d > worstD) {
        worstD = d
        worst = i
      }
    }
    if (worst >= 0) {
      keep[worst] = true
      stack.push([a, worst], [worst, b])
    }
  }
  return line.filter((_, i) => keep[i])
}

/** How far an overview may stray from its line: the published index's (publish-map.mjs, OVERVIEW_M). */
export const OVERVIEW_M = 5

const round5 = (n: number): number => Math.round(n * 1e5) / 1e5

/**
 * A line's overview: thinned at 5 m, five decimals (about 1 m) — a quarter of
 * the points, and the line itself to the eye until a pixel is under 5 m.
 * What the editor's list draws (0009); the public index carries the same
 * 5 m and five decimals, thinned by the publish's own measure.
 */
export function overviewOf(line: readonly LngLat[]): LngLat[] {
  return simplifyLine(line, OVERVIEW_M).map(([x, y]) => [round5(x), round5(y)])
}

/** West, south, east, north, in degrees. */
export type BBox = [number, number, number, number]

/**
 * The box around some points, `padM` metres wider on every side. A cheap
 * first question before any distance is measured: a point outside a ring's
 * box padded by `d` metres is more than `d` metres from the ring.
 */
export function bboxOf(points: readonly LngLat[], padM = 0): BBox {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of points) {
    if (x < w) w = x
    if (x > e) e = x
    if (y < s) s = y
    if (y > n) n = y
  }
  if (padM <= 0 || points.length === 0) return [w, s, e, n]
  const padLat = padM / M_PER_DEG
  const padLng = padLat / Math.cos((((s + n) / 2) * Math.PI) / 180)
  return [w - padLng, s - padLat, e + padLng, n + padLat]
}

/** Whether two boxes share any ground. */
export function bboxesOverlap(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]
}

/** Whether the point is inside the box. */
export function bboxContains(b: BBox, [x, y]: LngLat): boolean {
  return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]
}

/** Whether the segment a–b reaches the box: its own box overlaps it. */
export function bboxMeetsSegment(b: BBox, a: LngLat, c: LngLat): boolean {
  return (
    Math.max(a[0], c[0]) >= b[0] &&
    Math.min(a[0], c[0]) <= b[2] &&
    Math.max(a[1], c[1]) >= b[1] &&
    Math.min(a[1], c[1]) <= b[3]
  )
}

const lineBoxes = new WeakMap<readonly LngLat[], BBox>()

/**
 * The box around a line, computed once per array. A loaded direction's line
 * is one array for as long as it is loaded, and every hotspot saved asks
 * every line whether it comes near (linksThrough), every direction saved
 * asks every hotspot (hintuansAlong): the box is the first question each
 * time, and a thousand lines answer it in a millisecond. Rebuilt for a new
 * array, never for an array changed in place — no line is.
 */
export function lineBounds(line: readonly LngLat[]): BBox {
  let b = lineBoxes.get(line)
  if (!b) {
    b = bboxOf(line)
    lineBoxes.set(line, b)
  }
  return b
}
