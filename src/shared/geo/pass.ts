import { bboxContains, bboxMeetsSegment, bboxOf, bboxesOverlap, haversine, lineBounds, pointToSegmentM, type BBox, type LngLat } from './geo'
import { distanceToRingM, firstTouchIndex, type Ring } from './ring'

/*
 * The one rule for "this direction passes this hotspot", and its geometry, in
 * one place (split from geo.ts and stops.ts, 2026-09-29): the save (both
 * sides: route and hotspot), the save panel, the hotspot panel, the timeline,
 * the orange stretches and the published map's check all ask it.
 */

/**
 * How near a line must come to a box to pass it, in metres. A hintuan is
 * drawn where people stand — the roadside — and the line follows the road,
 * so the two touch without crossing by a metre or less. Five is enough for
 * that and short of the other carriageway, which on Quirino Highway sits
 * seven metres and more from a box on this side. Set 2026-09-22 from the
 * live boxes, replacing "the line enters the box" alone.
 */
export const PASS_WITHIN_M = 5

/**
 * Where along the line this box is passed: the vertex or segment index at
 * which the line first enters the box or comes within PASS_WITHIN_M of it,
 * or -1. The one rule for "this direction passes this hotspot"; the save
 * (both sides: route and hotspot), the save panel and the hotspot panel all
 * ask it, so what is shown is what is stored.
 */
export function passIndex(line: readonly LngLat[], ring: Ring): number {
  return firstNearIndex(line, ring, PASS_WITHIN_M)
}

/**
 * Where the line first enters the polygon or comes within `withinM` metres
 * of its edge: the vertex index, or the index of the segment that does it.
 * -1 if never. Two segments that do not cross are nearest at one of their
 * four ends, so that is all that is measured.
 */
export function firstNearIndex(line: readonly LngLat[], ring: Ring, withinM: number): number {
  const touch = firstTouchIndex(line, ring)
  const n = ring.length
  if (n < 3 || line.length === 0) return -1
  // A segment within `withinM` of the ring reaches the ring's box padded by
  // that much. A metre more: the box's longitude is scaled at its middle's
  // latitude, a distance at its own vertex's, and the margin keeps the box
  // from ever being the tighter of the two.
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

/**
 * The ground a line must reach for any of it to pass this box: the box,
 * `withinM` and two steps wider. A line whose own box (`bboxOf`) does not
 * overlap it has no stretch here, so a caller with many lines and many
 * boxes can skip the pair without walking the line.
 */
export function passBounds(ring: Ring, withinM = PASS_WITHIN_M, stepM = 1): BBox {
  return bboxOf(ring, withinM + 2 * stepM)
}

/**
 * The pieces of the line that pass this box: every stretch that is inside it
 * or within PASS_WITHIN_M of its edge, as short lines in travel order. The
 * same rule as `passIndex`, so a box is painted on a direction exactly when
 * the timeline lists it, and where the line runs beside a roadside box the
 * paint is the part alongside.
 *
 * The line is walked a metre at a time near the box — a snapped road has a
 * vertex every 20–30 m, so the box edges fall between vertices — and left
 * alone everywhere else. Two points at least, so a stretch is a line.
 */
export function passStretches(line: readonly LngLat[], ring: Ring, withinM = PASS_WITHIN_M, stepM = 1): LngLat[][] {
  if (ring.length < 3 || line.length < 2) return []
  // Only segments near the box's bounds are worth sampling, and only a
  // vertex inside them is worth measuring: the ring distance is the cost
  // here, and on a big map almost every vertex of almost every line is
  // nowhere near this box (1,000 directions and 500 hotspots took 142 s to
  // open before this check, 2026-09-25).
  const bounds = passBounds(ring, withinM, stepM)
  const [w, s, e, n] = bounds
  const nearBox = (a: LngLat, b: LngLat) =>
    Math.max(a[0], b[0]) >= w && Math.min(a[0], b[0]) <= e && Math.max(a[1], b[1]) >= s && Math.min(a[1], b[1]) <= n
  const near = (p: LngLat) => bboxContains(bounds, p) && distanceToRingM(p, ring) <= withinM

  const out: LngLat[][] = []
  // The stretch being walked, and the last near sample between vertices,
  // kept so the stretch ends where the box does and not at the vertex before.
  // `last` is the sample before this one: a stretch that is one point — a
  // line that only comes near at a vertex, its end most often — is drawn
  // from the sample before it, or to the one after, a metre's stub. Dropped,
  // passIndex listed the hintuan and the map painted nothing, and rideCut
  // found no stretch to end the ride at (review of 2026-10-03, finding 14).
  const st: { cur: LngLat[] | null; pending: LngLat | null; before: LngLat | null; last: LngLat | null } = {
    cur: null,
    pending: null,
    before: null,
    last: null,
  }
  const close = (after: LngLat | null) => {
    if (!st.cur) return
    if (st.pending) st.cur.push(st.pending)
    if (st.cur.length > 1) out.push(st.cur)
    else out.push(st.before ? [st.before, st.cur[0]] : [st.cur[0], after ?? st.cur[0]])
    st.cur = null
    st.pending = null
  }
  const take = (p: LngLat, isVertex: boolean) => {
    const before = st.last
    st.last = p
    if (!near(p)) return close(p)
    if (!st.cur) {
      st.cur = [p]
      st.before = before
    } else if (isVertex) st.cur.push(p)
    st.pending = isVertex ? null : st.cur[0] === p ? null : p
  }
  take(line[0], true)
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]]
    if (nearBox(a, b)) {
      const steps = Math.max(1, Math.ceil(haversine(a, b) / stepM))
      for (let t = 1; t < steps; t++) take([a[0] + ((b[0] - a[0]) * t) / steps, a[1] + ((b[1] - a[1]) * t) / steps], false)
    }
    take(b, true)
  }
  close(null)
  return out
}
