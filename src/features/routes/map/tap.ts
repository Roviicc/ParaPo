import type { MapLibreMap, MapMouseEvent } from 'maplibre-gl'
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

/**
 * Binds a layer's mouseenter and mouseleave, the hand the cursor turns into
 * over a line or a box (routeTaps.ts, stopTaps.ts), only where a pointer can
 * hover. MapLibre answers such a pair with a query of the rendered features
 * on every mousemove, and a finger's tap raises one before its click, so a
 * phone paid four queries a tap for a cursor it never shows (the cheap-phone
 * plan, step 7, 2026-10-04). Where `(any-hover: hover)` holds as the hook
 * binds (a mouse, a trackpad, a laptop's touch screen with its trackpad),
 * the pair is bound at once, as on every device before step 7. Where it
 * does not, the pair waits for it to hold: a mouse paired with a phone or a
 * tablet, a keyboard with a trackpad attached. Until the taps review
 * (2026-10-05) the query was read once, as the page was read, and such a
 * pointer got no hand until a reload. Once bound, the pair stays until the
 * returned undo, the pointer gone again or not, as before step 7: unbound
 * while the hand showed, the hand would come back with the next pointer
 * over nothing. Without matchMedia it is bound at once, as before.
 */
export function bindHover(
  map: MapLibreMap,
  layer: string,
  enter: (e: MapMouseEvent) => void,
  leave: (e: MapMouseEvent) => void,
): () => void {
  const query =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(any-hover: hover)')
      : null
  let bound = false
  const bind = () => {
    if (bound || (query && !query.matches)) return
    bound = true
    query?.removeEventListener('change', bind)
    map.on('mouseenter', layer, enter)
    map.on('mouseleave', layer, leave)
  }
  bind()
  if (!bound) query?.addEventListener('change', bind)
  return () => {
    query?.removeEventListener('change', bind)
    if (!bound) return
    bound = false
    map.off('mouseenter', layer, enter)
    map.off('mouseleave', layer, leave)
  }
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
 * Each tap's answer, kept for the other hook (the cheap-phone plan, step 7,
 * 2026-10-04). Both hooks hear the map's one `click` (routeTaps, stopTaps)
 * and each asks what it landed on: the same question, in the same task, of
 * a map nothing has changed in between (their setters render later), so the
 * second takes the first's answer instead of querying the rendered features
 * again — up to three queries a tap. Keyed on the browser's event, which
 * MapLibre hands every listener of a click, or, without one, on the point it
 * made for them; weakly, so an answer goes with its event. The same map and
 * the same point too, or it is asked afresh. The answer is shared: read it,
 * never change it.
 */
const answered = new WeakMap<object, { map: MapLibreMap; x: number; y: number; targets: TapTargets }>()

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
  const key: object = event ?? point
  const kept = answered.get(key)
  if (kept && kept.map === map && kept.x === point.x && kept.y === point.y) return kept.targets
  const targets = queryTargets(map, point, event)
  answered.set(key, { map, x: point.x, y: point.y, targets })
  return targets
}

/** What a tap landed on, asked of the map: tapTargets, unkept. */
function queryTargets(map: MapLibreMap, point: { x: number; y: number }, event?: Event): TapTargets {
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
