import { normaliseName, hotspotLabel, type HotspotRow } from '@/features/routes/model/hotspots';
import { placeKey } from '@/features/routes/model/places';
import { haversine, type LngLat } from '@/shared/utils/geo';

/**
 * The places a route can end at, for the save panel's two pickers: pure, so
 * tests/unit/places-test.mjs can hold them (split from SavePanel.tsx,
 * 2026-09-29).
 */

/** The hotspot nearest a point, by centroid. Only a starting guess for the picker. */
export function nearestHotspot(hotspots: HotspotRow[], to: LngLat | undefined): string {
  if (!to || hotspots.length === 0) return '';
  let best = hotspots[0];
  let bestD = haversine(best.point.coordinates, to);
  for (const s of hotspots.slice(1)) {
    const d = haversine(s.point.coordinates, to);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best.id;
}

/**
 * A place a route can end at. A route ends at SM Fairview, not at one of the
 * five boxes drawn there: boxes that share the name people say are one place
 * (H3), so the pickers list places and the owner never sees a box name.
 * Case-folded, because "SM fairview" typed once must not become a second
 * place in the list. The row a route actually references is `boxFor`.
 */
export interface Place {
  key: string;
  label: string;
  boxes: HotspotRow[];
  terminal: HotspotRow | null;
}

/** Every place, the ones with a terminal first, then by name. */
export function groupPlaces(hotspots: HotspotRow[]): Place[] {
  const byKey = new Map<string, Place>();
  for (const s of hotspots) {
    const key = placeKey(s);
    const place = byKey.get(key) ?? { key, label: hotspotLabel(s), boxes: [], terminal: null };
    place.boxes.push(s);
    // The terminal's spelling names the place; it is the one box per place
    // the database holds to a single row (H4).
    if (s.kind === 'terminal' && !place.terminal) {
      place.terminal = s;
      place.label = hotspotLabel(s);
    }
    byKey.set(key, place);
  }
  return [...byKey.values()].sort(
    (a, b) => Number(!!b.terminal) - Number(!!a.terminal) || a.label.localeCompare(b.label),
  );
}

/**
 * The box a chosen place stands on, since `route.head_stop_id` references one
 * row: its terminal when it has one, else the box nearest that end of the
 * line — the one the jeep actually stops at.
 */
export function boxFor(place: Place, to: LngLat | undefined): string {
  return place.terminal?.id ?? nearestHotspot(place.boxes, to);
}

/**
 * The terminal already standing at the place this box would join, if any:
 * a place has one terminal (H4). The database refuses the second one
 * (0014_terminal_place_unique.sql); this says so before the save, in the
 * form, without a round trip. The place is read as hotspotLabel reads it, so a
 * box whose informal name is left blank joins the place its ground name
 * says — before 2026-10-03 two terminals both named "Tala" with nothing
 * informal slipped past the index, which only looked at the informal name.
 */
export function terminalAlreadyAt(
  hotspots: HotspotRow[],
  box: { id: string | null; name: string; informal: string },
): HotspotRow | null {
  const key = placeKey({
    name: normaliseName(box.name),
    informal: normaliseName(box.informal) || null,
  });
  if (!key) return null;
  return (
    hotspots.find((s) => s.kind === 'terminal' && s.id !== box.id && placeKey(s) === key) ?? null
  );
}
