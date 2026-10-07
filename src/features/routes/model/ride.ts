import { haversine, lineLength, type LngLat } from '@/shared/utils/geo';

import { placeKey } from './places';
import { servedBy, variantLine, type VariantSummary } from './routes';
import { stopRing, type StopSummary } from './stops';
import { drawnFromTheEnd, timelineFor, type Timeline } from './timeline';
import { passStretches } from '../geo/pass';

/*
 * A direction ridden: its line in the jeep's order, its timeline of
 * hintuans, and the ride cut short at one. Split from routes.ts, 2026-09-29.
 */

/**
 * A saved direction as a string of places, for its card: its route's two ends
 * resolved to hotspots, and the hotspots its links say it passes, in order.
 */
export function routeTimeline(
  v: VariantSummary,
  stops: readonly StopSummary[],
  along: readonly StopSummary[],
): Timeline {
  const head = stops.find((s) => s.id === v.route?.head_stop_id) ?? null;
  const tail = stops.find((s) => s.id === v.route?.tail_stop_id) ?? null;
  return timelineFor(head, tail, v.reversed, along, variantLine(v)[0]);
}

/** Distance along the line of a point lying on it: the first segment that holds the point wins. */
function distanceAlong(line: readonly LngLat[], p: LngLat): number {
  let cum = 0;
  for (let i = 1; i < line.length; i++) {
    const ab = haversine(line[i - 1], line[i]);
    const ap = haversine(line[i - 1], p);
    // On the segment when going a → p → b adds nothing to a → b.
    if (ap + haversine(p, line[i]) - ab < 0.05) return cum + ap;
    cum += ab;
  }
  return cum;
}

/** The point `metres` along the line, and the last vertex before it. */
function pointAt(line: readonly LngLat[], metres: number): { point: LngLat; index: number } {
  let cum = 0;
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const seg = haversine(a, b);
    if (cum + seg >= metres && seg > 0) {
      const t = (metres - cum) / seg;
      return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], index: i - 1 };
    }
    cum += seg;
  }
  return { point: line[line.length - 1], index: line.length - 2 };
}

/** One get-off circle of the ride-to preview: a mini stop, the middle of its orange stretch, and how far in that is. */
export type RideDot = { stopId: string; at: LngLat; metres: number };

/**
 * The ride cut short at one hintuan — what tapping a timeline row previews,
 * the owner's asks of 2026-09-28. The row is a place; each of its mini
 * stops the line passes gets a dot at the middle of its orange stretch
 * (`passStretches`, the one rule, walked rather than the stored
 * `stop_sequence`, which indexes the editor's full line and overshoots the
 * published, thinned one). The ride ends at `endStopId`'s dot when given —
 * tapping a dot toggles the get-off side without moving the hintuan — and
 * at the last dot otherwise. `ridden` runs from the place this direction
 * leaves: it is cut from `travelLine`, turned to rider order by the one
 * rule `timelineFor` reads the middle with (drawnFromTheEnd). `rest` is the
 * way not ridden, for the map to fade.
 */
export function rideCut(
  v: VariantSummary,
  stops: readonly StopSummary[],
  rowStopId: string,
  endStopId: string | null = null,
): {
  ridden: LngLat[];
  rest: LngLat[];
  metres: number;
  at: LngLat;
  endStopId: string;
  dots: RideDot[];
} | null {
  const row = stops.find((s) => s.id === rowStopId);
  const ride = travelLine(v, stops);
  if (!row || ride.length < 2) return null;
  const key = placeKey(row);
  const dots: RideDot[] = [];
  for (const s of stops) {
    if (s.kind !== 'hintuan' || placeKey(s) !== key || !s.area || !servedBy(s, v.route)) continue;
    const piece = passStretches(ride, stopRing(s))[0];
    if (!piece) continue;
    const metres = distanceAlong(ride, piece[0]) + lineLength(piece) / 2;
    dots.push({ stopId: s.id, at: pointAt(ride, metres).point, metres });
  }
  dots.sort((a, b) => a.metres - b.metres);
  const end = dots.find((d) => d.stopId === endStopId) ?? dots[dots.length - 1];
  if (!end || end.metres < 1) return null;
  const { point, index } = pointAt(ride, end.metres);
  return {
    ridden: [...ride.slice(0, index + 1), point],
    rest: [point, ...ride.slice(index + 1)],
    metres: end.metres,
    at: point,
    endStopId: end.stopId,
    dots,
  };
}

/**
 * The direction's line in travel order: from where it leaves to where it is
 * going, whichever way it was drawn (drawnFromTheEnd). What the arrows, the
 * glow and the ride-to cut follow.
 *
 * Read-only: a line drawn from the far end comes back as its reversed copy,
 * made once per line and kept (reversedOf), so the same line turned round is
 * the same array every render (the cheap-phone plan, step 16 (b),
 * 2026-10-04). Which way round is still asked each time, of the stops as
 * they are now.
 */
export function travelLine(v: VariantSummary, stops: readonly StopSummary[]): readonly LngLat[] {
  const line = variantLine(v);
  if (line.length < 2) return line;
  const head = stops.find((s) => s.id === v.route?.head_stop_id);
  const tail = stops.find((s) => s.id === v.route?.tail_stop_id);
  const [from, to] = v.reversed ? [tail, head] : [head, tail];
  if (!from || !to) return line;
  return drawnFromTheEnd(line[0], from, to) ? reversedOf(line) : line;
}

const reversed = new WeakMap<readonly LngLat[], readonly LngLat[]>();

/**
 * The line turned round, made once per array. Keyed on the line array
 * itself, which is safe as lineBounds's box is (geo.ts): a loaded line is
 * one array for as long as it is loaded and no line is changed in place, so
 * a new line — a full line read, a save, a reload — is a new key, never a
 * stale copy; and the copy is handed out read-only, so no caller can change
 * what the next one gets. It had been made afresh for every hook that asked,
 * every render: the chevrons, the babaan sides, the ride-to cut.
 */
function reversedOf(line: readonly LngLat[]): readonly LngLat[] {
  let r = reversed.get(line);
  if (!r) {
    r = [...line].reverse();
    reversed.set(line, r);
  }
  return r;
}
