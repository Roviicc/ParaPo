import { haversine, type LngLat } from '../../shared/geo/geo'
import { placeKey } from '../../shared/model/places'
import { stopLabel, type StopRow } from '../../shared/model/stops'

/**
 * The places a route can end at, for the save panel's two pickers: pure, so
 * tests/unit/places-test.mjs can hold them (split from SavePanel.tsx,
 * 2026-09-29).
 */

/** The hotspot nearest a point, by centroid. Only a starting guess for the picker. */
export function nearestStop(stops: StopRow[], to: LngLat | undefined): string {
  if (!to || stops.length === 0) return ''
  let best = stops[0]
  let bestD = haversine(best.point.coordinates, to)
  for (const s of stops.slice(1)) {
    const d = haversine(s.point.coordinates, to)
    if (d < bestD) {
      best = s
      bestD = d
    }
  }
  return best.id
}

/**
 * A place a route can end at. A route ends at SM Fairview, not at one of the
 * five boxes drawn there: boxes that share the name people say are one place
 * (H3), so the pickers list places and the owner never sees a box name.
 * Case-folded, because "SM fairview" typed once must not become a second
 * place in the list. The row a route actually references is `boxFor`.
 */
export type Place = { key: string; label: string; boxes: StopRow[]; terminal: StopRow | null }

/** Every place, the ones with a terminal first, then by name. */
export function groupPlaces(stops: StopRow[]): Place[] {
  const byKey = new Map<string, Place>()
  for (const s of stops) {
    const key = placeKey(s)
    const place = byKey.get(key) ?? { key, label: stopLabel(s), boxes: [], terminal: null }
    place.boxes.push(s)
    // The terminal's spelling names the place; it is the one box per place
    // the database holds to a single row (H4).
    if (s.kind === 'terminal' && !place.terminal) {
      place.terminal = s
      place.label = stopLabel(s)
    }
    byKey.set(key, place)
  }
  return [...byKey.values()].sort(
    (a, b) => Number(!!b.terminal) - Number(!!a.terminal) || a.label.localeCompare(b.label),
  )
}

/**
 * The box a chosen place stands on, since `route.head_stop_id` references one
 * row: its terminal when it has one, else the box nearest that end of the
 * line — the one the jeep actually stops at.
 */
export function boxFor(place: Place, to: LngLat | undefined): string {
  return place.terminal?.id ?? nearestStop(place.boxes, to)
}
