// The parts of the hintuan drafts (hintuan-drafts.mjs) that are plain logic,
// kept apart so the unit checks can hold them (tests/unit/hintuan-drafts-test.mjs).
// Written 2026-10-06 for the owner's "generate drafts around Caloocan only".

import { haversine, roundLngLat } from '../../src/shared/geo/geo.ts'
import { distanceToRingM, pointInRing, polygonToRing } from '../../src/shared/geo/ring.ts'

/** A drafted box: as long along the road and as deep as the owner's hintuan boxes (median of 37, 2026-10-06). */
export const BOX = { lengthM: 31, depthM: 7 }
/**
 * Its edge nearest the road at most this far from the line: a direction
 * passes a hotspot whose box comes within 5 m of its line (CONTEXT.md,
 * "Passes"), so a draft is passed as drawn.
 */
export const INNER_MAX_M = 3
/** A stop at most this far from the line is on the road itself: which side it serves is not known. */
export const ON_ROAD_M = 2

/** Metres east and north of `o`, in a frame flat enough for a street. */
const frame = (o) => {
  const kx = 111_320 * Math.cos((o[1] * Math.PI) / 180)
  const ky = 110_574
  return {
    to: (p) => [(p[0] - o[0]) * kx, (p[1] - o[1]) * ky],
    from: ([x, y]) => [o[0] + x / kx, o[1] + y / ky],
  }
}

/**
 * Where `p` meets a line: the nearest point on it, metres from p to it, the
 * line's direction there (a unit vector east and north, the way the line was
 * drawn), and the side of the line p is on: 1 left, -1 right, 0 on the road
 * (within ON_ROAD_M).
 */
export function meetLine(p, line) {
  const f = frame(p)
  let best = null
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = f.to(line[i - 1])
    const [bx, by] = f.to(line[i])
    const dx = bx - ax
    const dy = by - ay
    const l2 = dx * dx + dy * dy
    if (l2 === 0) continue
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2))
    const qx = ax + t * dx
    const qy = ay + t * dy
    const d = Math.hypot(qx, qy)
    if (!best || d < best.metres) {
      const len = Math.sqrt(l2)
      const dir = [dx / len, dy / len]
      // p is at the frame's origin: the cross product of the direction and q→p.
      const cross = dir[0] * -qy - dir[1] * -qx
      best = { metres: d, point: f.from([qx, qy]), dir, side: d <= ON_ROAD_M ? 0 : cross > 0 ? 1 : -1 }
    }
  }
  return best
}

/**
 * A box beside the road at `at` (a point on the line), `dir` along it: BOX's
 * length centred on `at`, its depth reaching away from the road on `side`
 * from no further than INNER_MAX_M out (or from `offsetM` less half the depth,
 * if the stop is nearer), or straddling the line when the side is 0. Four
 * corners, counterclockwise, not closed: a ring as the studio's outlines are.
 */
export function roadsideBox(at, dir, side, offsetM = INNER_MAX_M) {
  const f = frame(at)
  const half = BOX.lengthM / 2
  const left = [-dir[1], dir[0]]
  const inner = side === 0 ? -BOX.depthM / 2 : Math.max(0, Math.min(offsetM - BOX.depthM / 2, INNER_MAX_M))
  const outer = inner + BOX.depthM
  const n = side === -1 ? [-left[0], -left[1]] : left
  const corner = (along, out) => f.from([dir[0] * along + n[0] * out, dir[1] * along + n[1] * out])
  const ring = [corner(-half, inner), corner(half, inner), corner(half, outer), corner(-half, outer)]
  // Counterclockwise whichever side it is on.
  return (side === -1 ? ring.reverse() : ring).map(roundLngLat)
}

/** The OpenStreetMap POIs that are stops: a bus stop, or a shelter or station with "jeep" in its name. */
export function isStop(poi) {
  if (poi.class === 'bus' && poi.subclass === 'bus_stop') return true
  return (poi.class === 'shelter' || poi.subclass === 'bus_station') && /jeep/i.test(poi.name ?? '')
}

/** How far `p` is from a hotspot's box: 0 inside it. */
export function metresFromBox(p, stop) {
  const ring = polygonToRing(stop.area)
  if (ring.length < 3) return haversine(p, stop.point.coordinates)
  return pointInRing(p, ring) ? 0 : distanceToRingM(p, ring)
}

/**
 * The stops worth a draft: named, on a jeepney line (within `routeM`), and
 * at least `clearM` from every saved hotspot's box. Each comes with where it
 * meets its nearest line and the hotspot nearest it.
 */
export function candidates(pois, { lines, hotspots, routeM = 25, clearM = 40 }) {
  const out = []
  for (const poi of pois) {
    if (!isStop(poi) || !poi.name) continue
    let meet = null
    for (const line of lines) {
      const m = meetLine(poi.at, line)
      if (m && (!meet || m.metres < meet.metres)) meet = m
    }
    if (!meet || meet.metres > routeM) continue
    let nearest = null
    for (const s of hotspots) {
      const d = metresFromBox(poi.at, s)
      if (!nearest || d < nearest.metres) nearest = { name: s.name, metres: d }
    }
    if (nearest && nearest.metres < clearM) continue
    out.push({ ...poi, meet, nearest })
  }
  return out
}

/**
 * One draft for stops on the same side within `mergeM` of each other (a
 * stop and its shelter, mapped twice): the first by the order given keeps
 * its place and name, the others' names are kept beside it.
 */
export function mergeNear(cands, mergeM = 20) {
  const kept = []
  for (const c of cands) {
    const twin = kept.find((k) => k.meet.side === c.meet.side && haversine(k.at, c.at) <= mergeM)
    if (twin) {
      if (!twin.names.includes(c.name)) twin.names.push(c.name)
    } else kept.push({ ...c, names: [c.name] })
  }
  return kept
}

/** A draft's id: the same stop gives the same id, run after run. */
export function draftId(name, at) {
  const key = `${name}|${at[0].toFixed(5)}|${at[1].toFixed(5)}`
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0
  return `draft-${h.toString(36)}`
}

/** A draft as the studio reads it (src/studio/drafts/drafts.ts). */
export function draftRecord(c) {
  return {
    id: draftId(c.name, c.at),
    name: c.name,
    kind: 'hintuan',
    // On the road itself, OpenStreetMap's stop says nothing of the side: the box straddles it.
    on_road: c.meet.side === 0,
    ring: roadsideBox(c.meet.point, c.meet.dir, c.meet.side, c.meet.metres),
    at: roundLngLat(c.at),
    osm_names: c.names,
    route_m: Math.round(c.meet.metres),
    nearest: c.nearest && { name: c.nearest.name, metres: Math.round(c.nearest.metres) },
  }
}
