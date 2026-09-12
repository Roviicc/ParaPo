export type LngLat = [number, number]

export type SnapMode = 'snapped' | 'freehand'

/**
 * The geometry between two consecutive control points. One per gap, so a route
 * with N control points has N-1 segments.
 */
export type Segment = {
  snap: SnapMode
  coordinates: LngLat[]
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
  const n = ring.length
  for (let i = 0; i < line.length; i++) {
    if (pointInRing(line[i], ring)) return i
    if (i === 0) continue
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
