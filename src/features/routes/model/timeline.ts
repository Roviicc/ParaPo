import { haversine, metresAlong, nearestOnSegment, type LngLat } from '@/shared/utils/geo';

import { hotspotLabel, hotspotRing, type HotspotKind, type Hotspot } from './hotspots';
import { placeKey } from './places';
import { servedBy, type ServedRoute } from './routes';
import { passIndex } from '../geo/pass';
import type { Ring } from '../geo/ring';

/*
 * A direction as a string of places: the hintuans its line passes, in order,
 * and the timeline its card reads. Split from hotspots.ts, 2026-09-29.
 */

/**
 * The hintuans a line passes, in the order it reaches them. `index` is
 * where along the line, which is what `route_stop.sequence` stores.
 * Terminals are not listed: a route's ends come from the route itself, and
 * neither are the hintuans this route does not stop at (`servedBy`): the
 * jeep hintuans under a train's track, the stations over a jeep's road.
 */
export function hintuansAlong<S extends Hotspot>(
  line: readonly LngLat[],
  hotspots: readonly S[],
  route: ServedRoute,
): { hotspot: S; index: number }[] {
  const along: { hotspot: S; index: number; at: number }[] = [];
  for (const hotspot of hotspots) {
    if (!listedAlong(hotspot, route)) continue;
    const where = passedAt(line, hotspotRing(hotspot), hotspot);
    if (where) along.push({ hotspot, ...where });
  }
  return along.sort(inPassingOrder).map(({ hotspot, index }) => ({ hotspot, index }));
}

/**
 * Whether hintuansAlong lists this hotspot for this route, wherever the line
 * runs: a hintuan with a box, at which the route stops (`servedBy`). Split
 * out with passedAt and inPassingOrder for the babaan sides, which ask it of
 * only the boxes their line cuts (the cheap-phone plan, step 8, 2026-10-04).
 */
export function listedAlong(hotspot: Hotspot, route: ServedRoute): boolean {
  return hotspot.kind === 'hintuan' && !!hotspot.area && servedBy(hotspot, route);
}

/**
 * Where along the line this box (`ring`, the hotspot's own) is passed: its
 * `index` (passIndex), and `at`, how far along that segment the hotspot's
 * middle is. Null when the line does not pass it.
 */
export function passedAt(
  line: readonly LngLat[],
  ring: Ring,
  hotspot: Hotspot,
): { index: number; at: number } | null {
  const index = passIndex(line, ring);
  // Two boxes met on one segment, a snapped road's 20–30 m, tied and kept
  // in the order the hotspots were read (review of 2026-10-03): the one
  // whose middle is further along that segment is reached later.
  return index >= 0
    ? {
        index,
        at: nearestOnSegment(hotspot.point.coordinates, line[index], line[index + 1] ?? line[index])
          .t,
      }
    : null;
}

/** The order the line reaches what passedAt placed; a stable sort keeps ties as read. */
export const inPassingOrder = (
  a: { index: number; at: number },
  b: { index: number; at: number },
): number => a.index - b.index || a.at - b.at;

/**
 * The hotspots a direction is linked to, in the order its line reaches
 * them: by `sequence`, and two on one segment (the same sequence) by
 * how far along the line their middles are — the card's timeline, as
 * hintuansAlong orders the save panel's (review of 2026-10-03). `line` may
 * be the overview: a position along it is, an index into it is not.
 */
export function orderLinked<S extends Hotspot>(
  linked: readonly { hotspot: S; sequence: number }[],
  line: readonly LngLat[],
): S[] {
  const keyed = linked.map((l) => ({ ...l, at: -1 }));
  const tied = new Set<number>();
  keyed.forEach((l, i) =>
    keyed.forEach((m, j) => i !== j && l.sequence === m.sequence && tied.add(i)),
  );
  for (const i of tied) keyed[i].at = metresAlong(line, keyed[i].hotspot.point.coordinates);
  return keyed.sort((a, b) => a.sequence - b.sequence || a.at - b.at).map((l) => l.hotspot);
}

/** One row of a direction's timeline. */
export interface TimelineRow {
  id: string;
  label: string;
  kind: HotspotKind;
}

/**
 * A direction as a string of places: where it leaves from, the hintuans on
 * the way in order, where it is going. What a signboard is, generated.
 */
export interface Timeline {
  from: TimelineRow | null;
  to: TimelineRow | null;
  between: TimelineRow[];
}

/**
 * The timeline of a direction with these ends. `along` is the hintuans in
 * the order the line reaches them. A row is a hintuan, named by its hotspot
 * name: the boxes of one place passed one after another — a mini hotspot on
 * each side of the road, or the several of SM Fairview — are one row, and a
 * box's own ground name is for the hotspot card, not the route. The ends'
 * places are left out of the middle: the rider is already getting off
 * there. The owner's model of 2026-09-28, replacing "SM Fairview – Main
 * Babaan" rows. When the line was drawn from the far end (the save panel
 * allows it with a warning) and `lineStart` says so, the middle is turned
 * round to read in travel order. The row keeps the first box's id.
 */
export function timelineFor(
  head: Hotspot | null | undefined,
  tail: Hotspot | null | undefined,
  reversed: boolean,
  along: readonly Hotspot[],
  lineStart?: LngLat,
): Timeline {
  // An end is its place, never a box: "SM Fairview", not the terminal's long name.
  const row = (s: Hotspot): TimelineRow => ({ id: s.id, label: hotspotLabel(s), kind: s.kind });
  const [from, to] = reversed ? [tail, head] : [head, tail];
  const endPlaces = new Set([head, tail].filter((s) => !!s).map((s) => placeKey(s!)));
  let between = along.filter((s) => s.kind === 'hintuan' && !endPlaces.has(placeKey(s)));
  if (lineStart && from && to && drawnFromTheEnd(lineStart, from, to)) between = between.reverse();
  const rows = between
    .filter((s, i) => i === 0 || placeKey(s) !== placeKey(between[i - 1]))
    .map(row);
  return { from: from ? row(from) : null, to: to ? row(to) : null, between: rows };
}

/**
 * Whether a line that starts at `lineStart` was drawn from the far end of its
 * ride: its first point nearer where the ride goes than where it leaves. The
 * stored points run whichever way the owner drew them, and the save panel
 * lets a return be drawn from the far end with only a warning, so the ends
 * decide, not the drawing. The one travel-order rule (the review's 6.5): the
 * timeline's middle, the ride-to cut and the arrows' line all turn on it.
 */
export function drawnFromTheEnd(lineStart: LngLat, from: Hotspot, to: Hotspot): boolean {
  return haversine(lineStart, to.point.coordinates) < haversine(lineStart, from.point.coordinates);
}
