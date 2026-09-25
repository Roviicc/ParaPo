import { haversine, joinSegments, lineLength, type LngLat, type Segment, type StreetRun } from '../shared/geo'

/**
 * Extend at either end (PLAN.md, "The four actions"): a new route borrows part
 * of a direction already drawn and adds road at one end only, so the shared
 * kilometres are never redrawn.
 *
 * The borrowed part is **copied**, point for point, into the new drawing
 * (option A, decided 2026-09-25): the new line owns its full geometry, and the
 * save only remembers which line it borrowed from, which part, and how far.
 * That record is what later lets the studio say "Tala – SM Fairview changed;
 * Tala – Novaliches borrowed it. Update it too?"
 */

/** Which part of the parent the new line keeps, in the parent's stored order. */
export type BorrowPart = 'start' | 'end'

/** A spot on a drawn line: segment `seg`, between its coordinates `edge` and `edge + 1`. */
export type LineSpot = { seg: number; edge: number; point: LngLat; metres: number }

/** Flat projection of p onto a–b around a (fine at street scale): the point and its fraction t. */
function project(p: LngLat, a: LngLat, b: LngLat): { point: LngLat; t: number } {
  const k = Math.cos((a[1] * Math.PI) / 180)
  const [px, py] = [(p[0] - a[0]) * k, p[1] - a[1]]
  const [bx, by] = [(b[0] - a[0]) * k, b[1] - a[1]]
  const l2 = bx * bx + by * by
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / l2))
  return { point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], t }
}

/** The spot on the line nearest p, and how far p is from it. Null for a line with no edges. */
export function nearestSpot(segments: Segment[], p: LngLat): (LineSpot & { off: number }) | null {
  let best: (LineSpot & { off: number }) | null = null
  segments.forEach((s, seg) => {
    const c = s?.coordinates ?? []
    for (let edge = 0; edge < c.length - 1; edge++) {
      const { point } = project(p, c[edge], c[edge + 1])
      const off = haversine(p, point)
      if (!best || off < best.off) best = { seg, edge, point, metres: 0, off }
    }
  })
  if (!best) return null
  const b = best as LineSpot & { off: number }
  const before = joinSegments(segments.slice(0, b.seg))
  const within = [...segments[b.seg].coordinates.slice(0, b.edge + 1), b.point]
  b.metres = lineLength(before) + lineLength(within)
  return b
}

/** The street runs covering metres [from, to) of a segment, cut to fit. */
function trimStreets(streets: StreetRun[] | undefined, from: number, to: number): StreetRun[] | undefined {
  if (!streets) return undefined
  const out: StreetRun[] = []
  let at = 0
  for (const run of streets) {
    const [a, b] = [Math.max(at, from), Math.min(at + run.metres, to)]
    if (b > a) out.push({ name: run.name, metres: b - a })
    at += run.metres
  }
  return out
}

const same = (a: LngLat, b: LngLat) => haversine(a, b) < 0.01

/**
 * The part of a drawn direction on one side of a spot, as control points and
 * segments the drawing can take over. The spot becomes a control point, and
 * the segment it falls in is cut there. A cut segment keeps its snap mode:
 * a routed one is still road, just shorter.
 */
export function cutAt(
  controlPoints: LngLat[],
  segments: Segment[],
  spot: LineSpot,
  part: BorrowPart,
): { controlPoints: LngLat[]; segments: Segment[] } {
  const s = segments[spot.seg]
  const coords = s.coordinates
  const cutM = lineLength([...coords.slice(0, spot.edge + 1), spot.point])
  const total = lineLength(coords)

  if (part === 'start') {
    const head = [...coords.slice(0, spot.edge + 1)]
    if (!same(head[head.length - 1], spot.point)) head.push(spot.point)
    const kept = segments.slice(0, spot.seg)
    const points = controlPoints.slice(0, spot.seg + 1)
    // A cut at the very start of a segment leaves nothing of it.
    if (head.length < 2) return { controlPoints: points, segments: kept }
    return {
      controlPoints: [...points, spot.point],
      segments: [...kept, { ...s, coordinates: head, streets: trimStreets(s.streets, 0, cutM) }],
    }
  }

  const tail = [...coords.slice(spot.edge + 1)]
  if (!same(tail[0], spot.point)) tail.unshift(spot.point)
  const kept = segments.slice(spot.seg + 1)
  const points = controlPoints.slice(spot.seg + 1)
  if (tail.length < 2) return { controlPoints: points, segments: kept }
  return {
    controlPoints: [spot.point, ...points],
    segments: [{ ...s, coordinates: tail, streets: trimStreets(s.streets, cutM, total) }, ...kept],
  }
}

/**
 * A drawn direction the other way round: its points, its segments and each
 * segment's coordinates and street runs. For following a line that was stored
 * from its far end, so the copy still runs the way the jeep goes.
 */
export function reverseDrawing(
  controlPoints: LngLat[],
  segments: Segment[],
): { controlPoints: LngLat[]; segments: Segment[] } {
  return {
    controlPoints: [...controlPoints].reverse(),
    segments: [...segments].reverse().map((s) => ({
      ...s,
      coordinates: [...s.coordinates].reverse(),
      streets: s.streets ? [...s.streets].reverse() : undefined,
    })),
  }
}

/** Compass bearing from a to b in degrees, on a flat patch around a. */
function bearing(a: LngLat, b: LngLat): number {
  const k = Math.cos((a[1] * Math.PI) / 180)
  return (Math.atan2((b[0] - a[0]) * k, b[1] - a[1]) * 180) / Math.PI
}

/** How far apart two bearings are, 0–180°. */
const turn = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180)

/** The point on a coordinate list nearest p, the edge it lies on, and how far p is from it. */
function nearestOnCoords(line: LngLat[], p: LngLat): { edge: number; point: LngLat; off: number } | null {
  let best: { edge: number; point: LngLat; off: number } | null = null
  for (let edge = 0; edge < line.length - 1; edge++) {
    const { point } = project(p, line[edge], line[edge + 1])
    const off = haversine(p, point)
    if (!best || off < best.off) best = { edge, point, off }
  }
  return best
}

/**
 * A saved direction that a right-click while drawing may mean to follow: its
 * line in travel order, and whether it ends at the place the drawing is for.
 */
export type FollowOption<V> = { v: V; travel: LngLat[]; endsAtDestination: boolean }

/**
 * Which saved line a right-click means, when the drawing should join one and
 * follow it to its end. The two directions of a route often share a road, so
 * the click can land on both: the one wanted runs the way the drawing is going.
 *
 * The way the drawing is going is read from its last point towards the spot,
 * or, when it already ends there, from its own last stretch. A line that ends
 * where the drawing is headed wins unless it plainly runs the other way (a
 * drawing that reaches the road from a side street arrives square to both);
 * otherwise the line that runs most nearly the same way, if it is within 90°.
 * `against` is the nearest line when every line runs the other way.
 */
export function lineToFollow<V>(
  options: FollowOption<V>[],
  drawn: LngLat[],
  at: LngLat,
): { follow: FollowOption<V> } | { against: FollowOption<V> } | null {
  const last = drawn[drawn.length - 1]
  const scored = options.flatMap((o) => {
    const near = nearestOnCoords(o.travel, at)
    if (!near) return []
    const along = bearing(o.travel[near.edge], o.travel[near.edge + 1])
    let arriving: number | null = null
    if (last && haversine(last, near.point) > 15) arriving = bearing(last, near.point)
    else {
      // Already at the spot: the drawing's own last few metres say which way.
      for (let i = drawn.length - 2; i >= 0 && last; i--) {
        if (haversine(drawn[i], last) >= 5) {
          arriving = bearing(drawn[i], last)
          break
        }
      }
    }
    return [{ o, off: near.off, angle: arriving === null ? 0 : turn(arriving, along) }]
  })
  if (scored.length === 0) return null
  const home = scored.filter((s) => s.o.endsAtDestination && s.angle < 135).sort((a, b) => a.angle - b.angle)
  if (home.length > 0) return { follow: home[0].o }
  const best = [...scored].sort((a, b) => a.angle - b.angle || a.off - b.off)[0]
  return best.angle < 90 ? { follow: best.o } : { against: [...scored].sort((a, b) => a.off - b.off)[0].o }
}

/** Metres from p to segment a–b. */
function offEdge(p: LngLat, a: LngLat, b: LngLat): number {
  return haversine(p, project(p, a, b).point)
}

/**
 * How far the new line still runs on the parent's, from the kept end: the
 * coordinates they share exactly, plus the cut point where it lies on the
 * parent's next edge. Measured at save time rather than remembered from the
 * cut, so dragging a borrowed point or undoing into the trunk is counted as
 * it really is. 0 when they share nothing.
 */
export function sharedMetres(line: LngLat[], parent: LngLat[], part: BorrowPart): number {
  const [a, b] = part === 'start' ? [line, parent] : [[...line].reverse(), [...parent].reverse()]
  let k = 0
  while (k < a.length && k < b.length && same(a[k], b[k])) k++
  if (k === 0) return 0
  if (k < a.length && k < b.length && offEdge(a[k], b[k - 1], b[k]) < 1) k++
  return k < 2 ? 0 : lineLength(a.slice(0, k))
}
