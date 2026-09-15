import type { MapLibreMap } from 'maplibre-gl'

/**
 * How big a tap is, and what it lands on. A finger covers far more of the map
 * than a mouse pointer does, so on a phone we ask the map what is near the
 * tap, not what is under the single pixel it reported.
 */

/** Half-width in px of the box queried around a tap: a finger vs a mouse. */
const TAP_HALF_PX = { coarse: 20, fine: 5 } as const

/** The hit layers the two hooks draw. Named here so each can see the other's. */
export const ROUTES_HIT_LAYER = 'saved-routes-hit'
export const STOPS_FILL_LAYER = 'saved-stops-fill'

/**
 * Whether the tap that raised `event` came from a finger. The event itself
 * says so on every current browser (a click is a PointerEvent with a
 * `pointerType`), which is what tells a touched laptop screen from its
 * trackpad. Without an event, fall back to the device's primary pointer.
 */
export function coarsePointer(event?: Event): boolean {
  const type = (event as { pointerType?: string } | undefined)?.pointerType
  if (type === 'touch' || type === 'pen') return true
  if (type === 'mouse') return false
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches
}

/** The box around a screen point to query hit layers with, sized for the pointer. */
export function tapBox(
  p: { x: number; y: number },
  event?: Event,
): [[number, number], [number, number]] {
  const half = coarsePointer(event) ? TAP_HALF_PX.coarse : TAP_HALF_PX.fine
  return [
    [p.x - half, p.y - half],
    [p.x + half, p.y + half],
  ]
}

type IdFeature = { properties?: { id?: unknown } }

/**
 * The ids a query hit, topmost first and each one once. A line crosses its
 * own tiles and a polygon is split across them, so the same feature comes
 * back several times.
 */
export function idsInOrder(features: IdFeature[]): string[] {
  const seen = new Set<string>()
  for (const f of features) {
    const id = f.properties?.id
    if (typeof id === 'string') seen.add(id)
  }
  return [...seen]
}

/**
 * What one tap landed on: the route ids and hotspot ids in its box. A route
 * drawn right under the tapped pixel wins outright, as it always has — a line
 * crossing a hotspot must stay tappable. Otherwise everything in the box is
 * offered, so a terminal 25 px from its own route is still one tap away.
 */
export function tapTargets(map: MapLibreMap, point: { x: number; y: number }, event?: Event) {
  const query = (geometry: Parameters<MapLibreMap['queryRenderedFeatures']>[0], layer: string) =>
    map.getLayer(layer) ? idsInOrder(map.queryRenderedFeatures(geometry, { layers: [layer] })) : []
  const underPoint = query([point.x, point.y], ROUTES_HIT_LAYER)
  if (underPoint.length > 0) return { routeIds: underPoint, stopIds: [] as string[] }
  const box = tapBox(point, event)
  return { routeIds: query(box, ROUTES_HIT_LAYER), stopIds: query(box, STOPS_FILL_LAYER) }
}
