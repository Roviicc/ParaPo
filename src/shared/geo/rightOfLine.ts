import { bboxOf, type LngLat } from './geo'
import { pointInRing, type Ring } from './ring'

/* The babaan side: a box's half on a line's right (split from geo.ts, 2026-09-29). */

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
