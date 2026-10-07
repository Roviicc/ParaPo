import type { LngLat } from '@/shared/utils/geo';
import { polygonToRing, type Ring } from '../geo/ring';

/** Mirrors the `stop_kind` enum in supabase/migrations/0004_stop_hotspot.sql. */
export type StopKind = 'terminal' | 'hintuan';

export type PolygonGeoJSON = { type: 'Polygon'; coordinates: LngLat[][] };
export type PointGeoJSON = { type: 'Point'; coordinates: LngLat };

/** A hotspot as the public map shows it. `area` is null only for legacy point-only stops (none exist). */
export type StopSummary = {
  id: string;
  /** The ground name: what is written on the ground, "SM Fairview Terminal B". */
  name: string;
  /**
   * The stop name: what people say, "SM Fairview". Optional; `stopLabel`
   * falls back to the ground name. The route name reads this (R1), and
   * boxes that share it are one stop to a commuter, whatever is written on
   * each — a terminal and two hintuans under one stop name. 0007; the
   * owner's two words for the two names, 2026-09-26.
   */
  informal: string | null;
  /** Other ways people say the same place, for a search or a suggestion list. */
  aliases: string[];
  kind: StopKind;
  point: PointGeoJSON;
  area: PolygonGeoJSON | null;
  note: string | null;
  created_at: string;
  /**
   * The line this hintuan is a station of: a train's, 'LRT-1' (0011), or the
   * ferry's, 'PRFS' (0012); null for every other hintuan and every terminal.
   * Only that line stops here, and no jeep does (servedBy). Absent from files
   * published before.
   */
  line?: string | null;
};

/** A hotspot with what the editor needs: who owns it. */
export type StopRow = StopSummary & { owner_id: string };

/** One row of route_stop: this direction passes through (or stages at) this hotspot. */
export type StopLink = {
  route_variant_id: string;
  stop_id: string;
  stop_sequence: number;
};

/** The polygon corners of a saved hotspot. */
export function stopRing(s: StopSummary): Ring {
  return polygonToRing(s.area);
}

/**
 * The name a hotspot is shown by: the informal one when there is one, else
 * what is written on the ground. The one rule, so no row ever shows blank and
 * every route name, card and picker agrees. The label on the map is the one
 * exception: it names the box under it, so it reads `name` (useSavedStops).
 */
export function stopLabel(s: Pick<StopSummary, 'name' | 'informal'>): string {
  return s.informal?.trim() || s.name;
}

/** Trim and collapse inner spaces, so "SM  Fairview " and "SM Fairview" are one group. Case is left alone. */
export function normaliseName(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * "Fairview, SM City Fairview, Fairview Terminal" → the list, normalised,
 * without blanks or repeats, and without the names it would only repeat.
 */
export function parseAliases(text: string, exclude: string[] = []): string[] {
  const seen = new Set(exclude.map((e) => normaliseName(e).toLowerCase()));
  const out: string[] = [];
  for (const raw of text.split(/[,;\n]/)) {
    const a = normaliseName(raw);
    const key = a.toLowerCase();
    if (!a || seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}
