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
