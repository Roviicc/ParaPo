import { useEffect, type RefObject } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { roomBeside } from '../shared/cards/BottomSheet'
import type { Snap } from '../shared/cards/sheetGesture'
import { bboxOf } from '../shared/geo/geo'
import { APP_MOVE } from '../shared/map/MapView'
import { variantLine, type VariantSummary } from '../shared/model/routes'

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
    const line = variantLine(trip)
    if (line.length < 2) return
    const [w, s, e, n] = bboxOf(line)
    const padding = roomBeside(map.getContainer(), dock.current, snap)
    map.fitBounds([[w, s], [e, n]], { padding, maxZoom: 16, duration: 700, linear: true }, APP_MOVE)
    // Only as a trip opens (see above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routeId])
}
