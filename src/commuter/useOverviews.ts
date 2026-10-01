import { useEffect, useRef, type RefObject } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { clearOfSheet, roomBeside } from '../shared/cards/BottomSheet'
import { shownAt, type Snap } from '../shared/cards/sheetGesture'
import { bboxOf, type LngLat } from '../shared/geo/geo'
import { APP_MOVE } from '../shared/map/MapView'
import type { Highlight } from '../shared/map/useSavedRoutes'
import { variantLine, type VariantSummary } from '../shared/model/routes'
import { zoomForScale } from './useLocator'

/*
 * The camera taking in routes whole — a trip opened, a RouteCard picked,
 * SWITCH pressed — zooming in or out, clear of the card's sheet: the owner's
 * asks of 2026-10-01, one fit for all three.
 */

/**
 * The farthest out the sheet going up takes the camera: the scale bar at
 * 5 km (the owner, 2026-10-01; 2.5 km at first, too close from Middle
 * up). Further out than that only by the
 * visitor's own hand.
 */
export const RAISED_FARTHEST_M = 5000

/**
 * The camera takes in these lines whole, zooming in or out, clear of the
 * sheet on show. `farthestM`: no further out than the scale bar reading
 * that, the lines' middle kept where the fit would put it.
 */
function overview(
  map: MapLibreMap,
  lines: readonly (readonly LngLat[])[],
  dock: HTMLElement | null,
  snap: Snap,
  farthestM?: number,
) {
  const points = lines.filter((l) => l.length >= 2).flat()
  if (points.length < 2) return
  const [w, s, e, n] = bboxOf(points)
  const padding = roomBeside(map.getContainer(), dock, snap)
  const floor = farthestM === undefined ? -Infinity : zoomForScale(farthestM, (s + n) / 2)
  const fit = map.cameraForBounds([[w, s], [e, n]], { padding, maxZoom: 16 })
  if (fit?.zoom === undefined || fit.zoom >= floor) {
    map.fitBounds([[w, s], [e, n]], { padding, maxZoom: 16, duration: 700, linear: true }, APP_MOVE)
    return
  }
  // In closer than the fit: the lines' middle at the middle of the room the sheet leaves.
  const offset: [number, number] = [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2]
  map.easeTo({ center: [(w + e) / 2, (s + n) / 2], zoom: floor, offset, duration: 700 }, APP_MOVE)
}

/**
 * A trip opened — from a card, a tap on its line, a shared link: the camera
 * takes in its whole route, zooming in or out, clear of the card (the
 * owner's ask, 2026-10-01). Keyed on the route, so SWITCH, which covers the
 * same ground the other way, leaves the view as it is; the card's height and
 * the trip's own changes move nothing.
 */
export function useTripOverview(
  map: MapLibreMap | null,
  trip: VariantSummary | null,
  dock: RefObject<HTMLDivElement | null>,
  snap: Snap,
): void {
  const routeId = trip?.route_id
  useEffect(() => {
    if (!map || !trip) return
    overview(map, [variantLine(trip)], dock.current, snap)
    // Only as a trip opens (see above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routeId])
}

/**
 * A RouteCard picked — in the route list or on a hotspot's card: the camera
 * takes in the routes it stands for, as a trip's row does for its trip (the
 * owner's ask, 2026-10-01), clear of the sheet on show. Keyed on the card
 * and what it shows, so a card let go leaves the view as it is until another
 * is picked; SWITCH has its own (useSwitchOverview).
 */
export function useCardOverview(
  map: MapLibreMap | null,
  picked: Highlight | null,
  variants: readonly VariantSummary[],
  dock: () => HTMLElement | null,
  snap: Snap,
): void {
  const key = picked ? `${picked.where}\n${picked.from}\n${picked.ids.join()}` : null
  useEffect(() => {
    if (!map || !picked) return
    const ids = new Set(picked.ids)
    overview(map, variants.filter((v) => ids.has(v.id)).map(variantLine), dock(), snap)
    // Only as a card is picked (see above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key])
}

/**
 * SWITCH pressed — on the route list, a hotspot's card or a trip: the camera
 * takes in what is lit now, the routes the other way round, as a pick does
 * (the owner's ask, 2026-10-01). `switches` counts the presses. What is lit
 * is read a frame later: a hotspot's card says what it shows from its own
 * effect, a render after the press.
 */
export function useSwitchOverview(
  map: MapLibreMap | null,
  lit: readonly VariantSummary[],
  switches: number,
  dock: () => HTMLElement | null,
  snap: Snap,
): void {
  const litRef = useRef(lit)
  litRef.current = lit
  useEffect(() => {
    if (!map || switches === 0) return
    const frame = requestAnimationFrame(() => overview(map, litRef.current.map(variantLine), dock(), snap))
    return () => cancelAnimationFrame(frame)
    // Only as SWITCH is pressed (see above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, switches])
}

/** What a card frames: routes whole, or a place kept in view. */
export type Framed = { lines: readonly (readonly LngLat[])[] } | { at: LngLat } | null

/**
 * The sheet settled at another height — Low, Middle, Max, or where a drag
 * left it: the camera takes in again what the card on show frames, in what
 * map the sheet leaves now (the owner's ask, 2026-10-01: "zooming out and
 * zoom in when bottomsheet is low, middle and max"). Routes are fitted whole,
 * in close above Low, out above Middle — and at Max, which on a phone covers
 * the whole map, as at Middle (roomBeside); a place is brought into view at
 * its zoom. Whatever the visitor did to the map since, the
 * overview comes back (their "the camera reset to overview"). Going up, it
 * zooms out no further than RAISED_FARTHEST_M on the scale bar ("for
 * scrolling up only"); coming down, the whole route. `frame` is read as the
 * sheet settles; null, with no card on show, moves nothing.
 */
export function useHeightOverview(
  map: MapLibreMap | null,
  snap: Snap,
  frame: () => Framed,
  dock: () => HTMLElement | null,
): void {
  const last = useRef(snap)
  const now = useRef({ frame, dock })
  now.current = { frame, dock }
  useEffect(() => {
    const was = last.current
    if (was === snap) return
    last.current = snap
    const framed = now.current.frame()
    if (!map || !framed) return
    const sheet = now.current.dock()
    const h = sheet?.offsetHeight ?? 0
    const up = shownAt(snap, h) > shownAt(was, h)
    if ('lines' in framed) overview(map, framed.lines, sheet, snap, up ? RAISED_FARTHEST_M : undefined)
    else map.easeTo({ center: framed.at, offset: clearOfSheet(map.getContainer(), sheet, snap), duration: 700 }, APP_MOVE)
  }, [map, snap])
}

type Camera = { center: LngLat; zoom: number; bearing: number; pitch: number }

/**
 * A hotspot's RouteCard picked and let go: the camera goes back to where the
 * visitor had it before the pick's overview (the owner, 2026-10-01:
 * "deselecting head route … should go back to original camera of the user,
 * after the overview"). `keep` as a card is picked with none picked yet — so
 * moving between cards keeps the camera from before them all — and `back`
 * as it is let go.
 */
export function useCameraBefore(map: MapLibreMap | null) {
  const kept = useRef<Camera | null>(null)
  return {
    keep: () => {
      if (!map) return
      const c = map.getCenter()
      kept.current = { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }
    },
    back: () => {
      const was = kept.current
      kept.current = null
      if (map && was) map.easeTo({ ...was, duration: 700 }, APP_MOVE)
    },
  }
}
