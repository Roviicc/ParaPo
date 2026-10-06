// The parts of the walking-link trial (walk-links.mjs) that are plain logic,
// kept apart so the unit checks can hold them (tests/unit/walk-links-test.mjs).
// Written 2026-10-06 for the owner's "try it on Caloocan's hintuans".

import { haversine, roundLngLat, simplifyLine } from '../../src/shared/geo/geo.ts'
import { pointInRing } from '../../src/shared/geo/ring.ts'

/** Whether p lies in a GeoJSON Polygon or MultiPolygon: in an outer ring and in none of its holes. */
export function inArea(p, geometry) {
  const polygons =
    geometry?.type === 'MultiPolygon' ? geometry.coordinates : geometry?.type === 'Polygon' ? [geometry.coordinates] : []
  return polygons.some(([outer, ...holes]) => pointInRing(p, outer) && !holes.some((hole) => pointInRing(p, hole)))
}

/**
 * Every pair of hotspots at most `withinM` apart in a straight line, each pair
 * once, nearest first (then by id, so a run lists them the same way twice).
 * Two boxes of one place count: across the road from each other is the walk
 * a footbridge or a crossing is for.
 */
export function pairsWithin(hotspots, withinM) {
  const pairs = []
  for (let i = 0; i < hotspots.length; i++) {
    for (let j = i + 1; j < hotspots.length; j++) {
      const [a, b] = [hotspots[i], hotspots[j]].sort((x, y) => (x.id < y.id ? -1 : 1))
      const straightM = haversine(a.point.coordinates, b.point.coordinates)
      if (straightM <= withinM) pairs.push({ a, b, straightM })
    }
  }
  return pairs.sort((x, y) => x.straightM - y.straightM || (x.a.id + x.b.id < y.a.id + y.b.id ? -1 : 1))
}

/** Valhalla's encoded shape (a polyline at six decimals, latitude first) as [lng, lat] pairs. */
export function decodePolyline6(encoded) {
  const points = []
  let i = 0
  let lat = 0
  let lng = 0
  while (i < encoded.length) {
    const delta = () => {
      let shift = 0
      let result = 0
      let byte
      do {
        byte = encoded.charCodeAt(i++) - 63
        result |= (byte & 0x1f) << shift
        shift += 5
      } while (byte >= 0x20)
      return result & 1 ? ~(result >> 1) : result >> 1
    }
    lat += delta()
    lng += delta()
    points.push([lng / 1e6, lat / 1e6])
  }
  return points
}

// What Valhalla says an edge is for (trace_attributes' edge.use), sorted into
// what a walker meets. Metro Manila's sidewalks are seldom drawn apart from
// their road in OpenStreetMap, so most walks come back as "road": along the
// road, its sidewalk if it has one. A crossing is OpenStreetMap's
// footway=crossing, marked or not.
const ROAD = new Set([
  'road', 'ramp', 'turn_channel', 'track', 'driveway', 'alley', 'parking_aisle', 'emergency_access',
  'drive_through', 'culdesac', 'living_street', 'service_road',
])
const FOOTPATH = new Set(['footway', 'sidewalk', 'path', 'pedestrian', 'cycleway', 'mountain_bike', 'bridleway'])
const LIFT = new Set(['elevator', 'escalator'])

/** The kind of ground one edge is, by its use. */
export function groundOf(use) {
  if (ROAD.has(use)) return 'road'
  if (use === 'pedestrian_crossing') return 'crossing'
  if (use === 'steps') return 'stairs'
  if (LIFT.has(use)) return 'lift'
  if (FOOTPATH.has(use)) return 'footpath'
  return 'other'
}

/**
 * Metres of a walk by what it is on, from trace_attributes' edges (lengths in
 * kilometres). `footbridge` and `underpass` overlap the others: a footbridge's
 * deck is footpath and its stairs are stairs, and both count toward it. A road
 * bridge walked along is road, never a footbridge.
 */
export function walkedOn(edges) {
  const on = { road: 0, footpath: 0, crossing: 0, stairs: 0, lift: 0, other: 0, footbridge: 0, underpass: 0 }
  for (const e of edges) {
    const m = (e.length ?? 0) * 1000
    const ground = groundOf(e.use)
    on[ground] += m
    if (ground !== 'road') {
      if (e.bridge) on.footbridge += m
      if (e.tunnel) on.underpass += m
    }
  }
  return Object.fromEntries(Object.entries(on).map(([k, v]) => [k, Math.round(v)]))
}

/**
 * One walking link as the studio reads it (src/studio/walk/walkLinks.ts): the
 * pair, its straight-line and walking metres, the walk's seconds, what it is
 * on, and its line thinned at a metre.
 */
export function linkRecord({ a, b, straightM }, { shape, lengthKm, timeS }, edges) {
  return {
    from: a.id,
    to: b.id,
    from_name: a.name,
    to_name: b.name,
    straight_m: Math.round(straightM),
    walk_m: Math.round(lengthKm * 1000),
    walk_s: Math.round(timeS),
    on: walkedOn(edges),
    line: simplifyLine(decodePolyline6(shape), 1).map(roundLngLat),
  }
}
