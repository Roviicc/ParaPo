import type { MapLibreMap } from 'maplibre-gl'
import { LAYERS } from './layers'

/**
 * How big a tap is, and what it lands on. A finger covers far more of the map
 * than a mouse pointer does, so on a phone we ask the map what is near the
 * tap, not what is under the single pixel it reported.
 */

/** Half-width in px of the box queried around a tap: a finger vs a mouse. */
const TAP_HALF_PX = { coarse: 20, fine: 5 } as const

/** The hit layers the two hooks draw (layers.ts), under the names the hooks have used. */
export const ROUTES_HIT_LAYER = LAYERS.routesHit
export const STOPS_FILL_LAYER = LAYERS.stopsFill

/**
 * Whether the tap that raised `event` came from a finger. The event itself
 * says so on every current browser (a click is a PointerEvent with a
 * `pointerType`), which is what tells a touched laptop screen from its
 * trackpad. Without an event, fall back to the device's primary pointer.
 */
function coarsePointer(event?: Event): boolean {
  const type = (event as { pointerType?: string } | undefined)?.pointerType
  if (type === 'touch' || type === 'pen') return true
  if (type === 'mouse') return false
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches
}

/** The box around a screen point to query hit layers with, sized for the pointer. */
function tapBox(
  p: { x: number; y: number },
  event?: Event,
): [[number, number], [number, number]] {
  const half = coarsePointer(event) ? TAP_HALF_PX.coarse : TAP_HALF_PX.fine
  return [
    [p.x - half, p.y - half],
    [p.x + half, p.y + half],
  ]
}

type IdFeature = { properties?: { id?: unknown; route_id?: unknown } }

/**
 * The ids a query hit, topmost first and each one once. A line crosses its
 * own tiles and a polygon is split across them, so the same feature comes
 * back several times.
 */
function idsInOrder(features: IdFeature[], key: 'id' | 'route_id' = 'id'): string[] {
  const seen = new Set<string>()
  for (const f of features) {
    const id = f.properties?.[key]
    if (typeof id === 'string') seen.add(id)
  }
  return [...seen]
}

/** What one tap landed on: every direction, every route those belong to, and every hotspot in its box. */
export type TapTargets = { routeIds: string[]; routeKeys: string[]; stopIds: string[] }

/**
 * One tap, one kind of thing (the owner's ask, 2026-09-30: "can we only
 * select one not two? select hintuan only show the card, then select route
 * show the route"). A tap inside a hotspot's box is the hotspot's, even
 * where a route runs through it; anywhere else it is the routes' under the
 * finger; and near nothing but a box — a finger's width off its edge — the
 * box's still. Until then everything under the finger was offered together,
 * the hotspots first (decided with him 2026-09-22). `routeKeys` counts
 * routes, not directions, because a route's two directions share most of
 * their road and are one thing to choose between.
 */
export function tapTargets(map: MapLibreMap, point: { x: number; y: number }, event?: Event): TapTargets {
  const box = tapBox(point, event)
  const features = (layer: string, where: typeof box | [number, number] = box) =>
    map.getLayer(layer) ? map.queryRenderedFeatures(where, { layers: [layer] }) : []
  const inside = idsInOrder(features(STOPS_FILL_LAYER, [point.x, point.y]))
  if (inside.length > 0) return { routeIds: [], routeKeys: [], stopIds: inside }
  const routes = features(ROUTES_HIT_LAYER)
  if (routes.length > 0) return { routeIds: idsInOrder(routes), routeKeys: idsInOrder(routes, 'route_id'), stopIds: [] }
  return { routeIds: [], routeKeys: [], stopIds: idsInOrder(features(STOPS_FILL_LAYER)) }
}

/**
 * What a tap means, the same in both hooks and both apps: nothing; one
 * route (its directions, to open the drawn outbound); one hotspot; or
 * several of one kind — routes sharing a road, or hotspots side by side —
 * which light up and go to the sheet.
 */
export type TapOutcome =
  | { kind: 'none' }
  | { kind: 'route'; routeIds: string[] }
  | { kind: 'stop'; stopId: string }
  | { kind: 'several'; routeIds: string[]; routeKeys: string[]; stopIds: string[] }

export function resolveTap(t: TapTargets): TapOutcome {
  const routes = t.routeKeys.length
  const stops = t.stopIds.length
  if (routes + stops === 0) return { kind: 'none' }
  if (routes === 1 && stops === 0) return { kind: 'route', routeIds: t.routeIds }
  if (stops === 1 && routes === 0) return { kind: 'stop', stopId: t.stopIds[0]! }
  return { kind: 'several', routeIds: t.routeIds, routeKeys: t.routeKeys, stopIds: t.stopIds }
}
