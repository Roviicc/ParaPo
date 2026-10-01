import { useEffect, useRef, type RefObject } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { roomBeside } from '../shared/cards/BottomSheet'
import type { Snap } from '../shared/cards/sheetGesture'
import { bboxOf, type LngLat } from '../shared/geo/geo'
import { APP_MOVE } from '../shared/map/MapView'
import type { Highlight } from '../shared/map/useSavedRoutes'
import { variantLine, type VariantSummary } from '../shared/model/routes'

/*
 * The camera taking in routes whole — a trip opened, a RouteCard picked,
 * SWITCH pressed — zooming in or out, clear of the card's sheet: the owner's
 * asks of 2026-10-01, one fit for all three.
 */

/** The camera takes in these lines whole, zooming in or out, clear of the sheet on show. */
function overview(map: MapLibreMap, lines: readonly (readonly LngLat[])[], dock: HTMLElement | null, snap: Snap) {
  const points = lines.filter((l) => l.length >= 2).flat()
  if (points.length < 2) return
  const [w, s, e, n] = bboxOf(points)
  const padding = roomBeside(map.getContainer(), dock, snap)
  map.fitBounds([[w, s], [e, n]], { padding, maxZoom: 16, duration: 700, linear: true }, APP_MOVE)
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
