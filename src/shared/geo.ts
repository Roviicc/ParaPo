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

/**
 * Concatenate segments into one continuous line, dropping the duplicated join
 * point where each segment starts where the previous one ended.
 */
export function joinSegments(segments: Segment[]): LngLat[] {
  const out: LngLat[] = []
  segments.forEach((s, i) => {
    if (!s?.coordinates?.length) return
    out.push(...(i === 0 ? s.coordinates : s.coordinates.slice(1)))
  })
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
export function lineLength(coords: LngLat[]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) total += haversine(coords[i - 1], coords[i])
  return total
}

// ------------------------------------------------------------------ polygons
//
// A ring is the list of corner points in order, NOT closed: the edge from the
// last point back to the first is implied. Hotspots are a few hundred metres
// across at most, so plain lng/lat arithmetic is used throughout; at that
// scale the difference from a proper projection is far below click precision.

/** Polygon corners in order; the closing edge is implied. */
export type Ring = LngLat[]

/** Signed doubled area (shoelace). Positive = counter-clockwise in lng/lat. */
function ring2Area(ring: Ring): number {
  let s = 0
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % n]
    s += x1 * y2 - x2 * y1
  }
  return s
}

/**
 * Point-in-polygon by ray casting. A point exactly on an edge counts as
 * inside: a hotspot traced along a kerb should still claim a route running on
 * that kerb.
 */
export function pointInRing(p: LngLat, ring: Ring): boolean {
  const n = ring.length
  if (n < 3) return false
  const [px, py] = p
  let inside = false
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (onSegment(p, ring[i], ring[j])) return true
    const crosses =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

const EPS = 1e-12

function orient([ax, ay]: LngLat, [bx, by]: LngLat, [cx, cy]: LngLat): number {
  const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  return Math.abs(v) < EPS ? 0 : Math.sign(v)
}

function onSegment(p: LngLat, a: LngLat, b: LngLat): boolean {
  if (orient(a, b, p) !== 0) return false
  return (
    Math.min(a[0], b[0]) - EPS <= p[0] &&
    p[0] <= Math.max(a[0], b[0]) + EPS &&
    Math.min(a[1], b[1]) - EPS <= p[1] &&
    p[1] <= Math.max(a[1], b[1]) + EPS
  )
}

/** Do segments a–b and c–d touch or cross, including collinear overlap? */
export function segmentsIntersect(a: LngLat, b: LngLat, c: LngLat, d: LngLat): boolean {
  const o1 = orient(a, b, c)
  const o2 = orient(a, b, d)
  const o3 = orient(c, d, a)
  const o4 = orient(c, d, b)
  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && onSegment(c, a, b)) return true
  if (o2 === 0 && onSegment(d, a, b)) return true
  if (o3 === 0 && onSegment(a, c, d)) return true
  if (o4 === 0 && onSegment(b, c, d)) return true
  return false
}

/**
 * Index of the first line vertex that falls inside the ring, or -1.
 *
 * This is what `route_stop.stop_sequence` stores: cheap now, and enough to
 * order hotspots along a route later without another migration.
 */
export function firstVertexInside(line: LngLat[], ring: Ring): number {
  for (let i = 0; i < line.length; i++) if (pointInRing(line[i], ring)) return i
  return -1
}

/**
 * Where along the line the polygon is first touched: the index of the first
 * vertex inside it, or, when the line crosses between two vertices, the index
 * of the vertex just before that crossing. -1 when they never meet.
 *
 * This is what `route_stop.stop_sequence` stores. The second case matters: a
 * snapped road has a vertex every ~20–30 m, so a narrow hotspot drawn across
 * a straight stretch can sit entirely between two vertices.
 */
export function firstTouchIndex(line: LngLat[], ring: Ring): number {
  if (ring.length < 3 || line.length === 0) return -1
  // A vertex inside the ring is inside its box, and a segment that crosses
  // its edge reaches its box: the cheap questions first, and none of the
  // dear ones for a line whose own box is nowhere near (lineBounds).
  const box = bboxOf(ring)
  if (!bboxesOverlap(lineBounds(line), box)) return -1
  const n = ring.length
  for (let i = 0; i < line.length; i++) {
    if (bboxContains(box, line[i]) && pointInRing(line[i], ring)) return i
    if (i === 0 || !bboxMeetsSegment(box, line[i - 1], line[i])) continue
    for (let j = 0; j < n; j++) {
      if (segmentsIntersect(line[i - 1], line[i], ring[j], ring[(j + 1) % n])) return i - 1
    }
  }
  return -1
}

/** Does the line pass through the polygon at all? */
export function lineIntersectsRing(line: LngLat[], ring: Ring): boolean {
  return firstTouchIndex(line, ring) !== -1
}

/** Metres from point p to segment a–b, on a flat patch around the segment (fine at street scale). */
function pointToSegmentM(p: LngLat, a: LngLat, b: LngLat): number {
  const k = Math.cos(toRad(a[1]))
  const [px, py] = [(p[0] - a[0]) * k, p[1] - a[1]]
  const [bx, by] = [(b[0] - a[0]) * k, b[1] - a[1]]
  const l2 = bx * bx + by * by
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / l2))
  const [dx, dy] = [px - t * bx, py - t * by]
  return toRad(Math.hypot(dx, dy)) * EARTH_RADIUS_M
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
  const padLat = padM / 111_000
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

/** Metres from p to the polygon's edge (0 inside it). */
export function distanceToRingM(p: LngLat, ring: Ring): number {
  if (pointInRing(p, ring)) return 0
  const n = ring.length
  let best = Infinity
  for (let j = 0; j < n; j++) best = Math.min(best, pointToSegmentM(p, ring[j], ring[(j + 1) % n]))
  return best
}

/**
 * Where the line first enters the polygon or comes within `withinM` metres
 * of its edge: the vertex index, or the index of the segment that does it.
 * -1 if never. Two segments that do not cross are nearest at one of their
 * four ends, so that is all that is measured.
 */
export function firstNearIndex(line: LngLat[], ring: Ring, withinM: number): number {
  const touch = firstTouchIndex(line, ring)
  const n = ring.length
  if (n < 3 || line.length === 0) return -1
  // A segment within `withinM` of the ring reaches the ring's box padded by
  // that much (a metre more, for the flat patch the metres are measured on).
  const box = bboxOf(ring, withinM + 1)
  if (!bboxesOverlap(lineBounds(line), box)) return touch
  for (let i = 1; i < line.length; i++) {
    if (touch >= 0 && i - 1 >= touch) return touch
    const [a, b] = [line[i - 1], line[i]]
    if (!bboxMeetsSegment(box, a, b)) continue
    for (let j = 0; j < n; j++) {
      const [c, d] = [ring[j], ring[(j + 1) % n]]
      const near =
        Math.min(pointToSegmentM(a, c, d), pointToSegmentM(b, c, d), pointToSegmentM(c, a, b), pointToSegmentM(d, a, b)) <=
        withinM
      if (near) return i - 1
    }
  }
  return touch
}

/** Where segments a–b and c–d cross, or null if they do not (parallel/collinear count as no point). */
function crossingPoint(a: LngLat, b: LngLat, c: LngLat, d: LngLat): LngLat | null {
  const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])
  if (Math.abs(den) < EPS) return null
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den
  const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
}

/**
 * Metres along the line to the point where it first enters the polygon —
 * a vertex inside, or the exact spot a segment crosses an edge. -1 if never.
 * This is what "the route starts at this terminal" is measured with.
 */
export function entryDistance(line: LngLat[], ring: Ring): number {
  const idx = firstTouchIndex(line, ring)
  if (idx < 0) return -1
  const upTo = lineLength(line.slice(0, idx + 1))
  if (pointInRing(line[idx], ring)) return upTo
  // The touch is on segment idx → idx+1: find the nearest crossing on it.
  const a = line[idx]
  const b = line[idx + 1]
  const n = ring.length
  let best = Infinity
  for (let j = 0; j < n; j++) {
    const p = crossingPoint(a, b, ring[j], ring[(j + 1) % n])
    if (p) best = Math.min(best, haversine(a, p))
  }
  return upTo + (Number.isFinite(best) ? best : haversine(a, b))
}

/**
 * Area-weighted centroid. Falls back to the vertex average for a degenerate
 * (zero-area) ring so a bad trace still gets a usable label point.
 */
export function ringCentroid(ring: Ring): LngLat {
  const n = ring.length
  if (n === 0) return [0, 0]
  const a2 = ring2Area(ring)
  if (Math.abs(a2) < EPS) {
    let sx = 0
    let sy = 0
    for (const [x, y] of ring) {
      sx += x
      sy += y
    }
    return [sx / n, sy / n]
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % n]
    const f = x1 * y2 - x2 * y1
    cx += (x1 + x2) * f
    cy += (y1 + y2) * f
  }
  return [cx / (3 * a2), cy / (3 * a2)]
}

/**
 * The convex hull of some points (Andrew's monotone chain), as a ring. Fewer
 * than three distinct points give back what was passed. Used for the wash
 * that joins the boxes of one place on the map.
 */
export function convexHull(points: LngLat[]): Ring {
  const pts = [...new Map(points.map((p) => [p.join(','), p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o: LngLat, a: LngLat, b: LngLat) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: LngLat[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: LngLat[] = []
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** GeoJSON Polygon with the ring closed, as the database and MapLibre want it. */
export function ringToPolygon(ring: Ring): { type: 'Polygon'; coordinates: LngLat[][] } {
  const closed = ring.length > 0 ? [...ring, ring[0]] : []
  return { type: 'Polygon', coordinates: [closed] }
}

/** The corners back out of a stored GeoJSON Polygon (drops the closing point). */
export function polygonToRing(poly: { coordinates: LngLat[][] } | null | undefined): Ring {
  const outer = poly?.coordinates?.[0] ?? []
  if (outer.length < 2) return outer
  const [fx, fy] = outer[0]
  const [lx, ly] = outer[outer.length - 1]
  return fx === lx && fy === ly ? outer.slice(0, -1) : outer
}

/**
 * Twice the signed area, in degrees²: positive when the ring runs
 * anticlockwise. Measured from the first corner: a box of a few metres at
 * 121°E is lost in the rounding when each product is taken from 0°.
 */
function signedArea2(ring: Ring): number {
  const [ox, oy] = ring[0]
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    a += (ring[j][0] - ox) * (ring[i][1] - oy) - (ring[i][0] - ox) * (ring[j][1] - oy)
  return a
}

/**
 * The part of the ring on the line's right, walking the line forward: the
 * ring cut along the first stretch of the line inside it. A line that starts
 * or ends inside is carried on straight until it is out, so a tail that stops
 * in the box still cuts it. Null when the line never goes inside — a box
 * beside the road has nothing to cut.
 *
 * Works in plain degrees: which side of a line a point is on, and where two
 * segments cross, do not change when longitude is stretched.
 */
export function rightOfLine(ring: Ring, line: LngLat[]): Ring | null {
  const n = ring.length
  if (n < 3 || line.length < 2) return null
  const [w, s, e, nn] = bboxOf(ring)
  const reach = 2 * Math.hypot(e - w, nn - s)
  const carry = (from: LngLat, to: LngLat): LngLat => {
    const [dx, dy] = [to[0] - from[0], to[1] - from[1]]
    const len = Math.hypot(dx, dy)
    return len === 0 ? to : [to[0] + (dx / len) * reach, to[1] + (dy / len) * reach]
  }
  const path = [...line]
  if (pointInRing(path[0], ring)) path.unshift(carry(path[1], path[0]))
  if (pointInRing(path[path.length - 1], ring)) path.push(carry(path[path.length - 2], path[path.length - 1]))

  // Every place the path crosses an edge, in travel order. `at` is where on
  // the ring: edge index plus how far along it.
  const hits: { k: number; t: number; at: number; p: LngLat }[] = []
  for (let k = 0; k + 1 < path.length; k++) {
    const [a, b] = [path[k], path[k + 1]]
    for (let i = 0; i < n; i++) {
      const [c, d] = [ring[i], ring[(i + 1) % n]]
      const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])
      if (den === 0) continue
      const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den
      const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den
      if (t < 0 || t >= 1 || u < 0 || u >= 1) continue
      hits.push({ k, t, at: i + u, p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] })
    }
  }
  hits.sort((x, y) => x.k - y.k || x.t - y.t)

  // The first pair of crossings with the box between them, not a corner grazed.
  for (let j = 0; j + 1 < hits.length; j++) {
    const [into, out] = [hits[j], hits[j + 1]]
    const next = out.k === into.k ? out.p : path[into.k + 1]
    if (!pointInRing([(into.p[0] + next[0]) / 2, (into.p[1] + next[1]) / 2], ring)) continue
    const d = (((into.at - out.at) % n) + n) % n
    if (d === 0) return null
    const cut = [into.p, ...path.slice(into.k + 1, out.k + 1), out.p]
    // Back from where the line leaves to where it came in, one way round the ring or the other.
    const forward: LngLat[] = []
    for (let v = Math.floor(out.at) + 1; v - out.at < d; v++) forward.push(ring[v % n])
    const backward: LngLat[] = []
    for (let v = Math.ceil(out.at) - 1; out.at - v < n - d; v--) backward.push(ring[((v % n) + n) % n])
    // Walking the cut with the piece on the right is walking it clockwise.
    const a = [...cut, ...forward]
    return signedArea2(a) < 0 ? a : [...cut, ...backward]
  }
  return null
}
