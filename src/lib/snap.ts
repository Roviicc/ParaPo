import type { LngLat, Segment } from './geo'

/**
 * FOSSGIS public OSRM. No API key, and it sends
 * `Access-Control-Allow-Origin: *`, so the browser calls it directly.
 *
 * It is a shared demo server with no SLA. That is acceptable for one person
 * drawing a handful of routes; if ParaPo ever takes real traffic the upgrade
 * is OpenRouteService with a key (host `api.heigit.org`) or self-hosted OSRM.
 * Both return the same thing, so only this file changes.
 */
const OSRM = 'https://router.project-osrm.org/route/v1/driving'

/** A straight line: correct topology, wrong geometry, always editable. */
export function straightSegment(from: LngLat, to: LngLat): Segment {
  return { snap: 'freehand', coordinates: [from, to] }
}

/**
 * Ask the router for road-following geometry between two points.
 *
 * Falls back to a straight line rather than throwing. A visibly wrong segment
 * you can fix beats a silently missing one, and jeepneys do take paths a car
 * router refuses.
 */
export async function snapSegment(
  from: LngLat,
  to: LngLat,
  signal?: AbortSignal,
): Promise<Segment> {
  const url =
    `${OSRM}/${from[0]},${from[1]};${to[0]},${to[1]}` +
    `?overview=full&geometries=geojson`

  try {
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`OSRM ${res.status}`)

    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.length) {
      throw new Error(data.code ?? 'no route')
    }

    const coordinates = data.routes[0].geometry.coordinates as LngLat[]
    if (coordinates.length < 2) throw new Error('degenerate route')

    return { snap: 'snapped', coordinates }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    return straightSegment(from, to)
  }
}
