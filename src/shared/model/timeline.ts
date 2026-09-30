import { haversine, type LngLat } from '../geo/geo'
import { passIndex } from '../geo/pass'
import { placeKey } from './places'
import { stopLabel, stopRing, type StopKind, type StopSummary } from './stops'

/*
 * A direction as a string of places: the hintuans its line passes, in order,
 * and the timeline its card reads. Split from stops.ts, 2026-09-29.
 */

/**
 * The hintuans a line passes, in the order it reaches them. `index` is
 * where along the line, which is what `route_stop.stop_sequence` stores.
 * Terminals are not listed: a route's ends come from the route itself.
 */
export function hintuansAlong<S extends StopSummary>(line: LngLat[], stops: readonly S[]): { stop: S; index: number }[] {
  const along: { stop: S; index: number }[] = []
  for (const stop of stops) {
    if (stop.kind !== 'hintuan' || !stop.area) continue
    const index = passIndex(line, stopRing(stop))
    if (index >= 0) along.push({ stop, index })
  }
  return along.sort((a, b) => a.index - b.index)
}

/** One row of a direction's timeline. */
export type TimelineStop = { id: string; label: string; kind: StopKind }

/**
 * A direction as a string of places: where it leaves from, the hintuans on
 * the way in order, where it is going. What a signboard is, generated.
 */
export type Timeline = { from: TimelineStop | null; to: TimelineStop | null; between: TimelineStop[] }

/**
 * The timeline of a direction with these ends. `along` is the hintuans in
 * the order the line reaches them. A row is a hintuan, named by its stop
 * name: the boxes of one place passed one after another — a mini stop on
 * each side of the road, or the several of SM Fairview — are one row, and a
 * box's own ground name is for the hotspot card, not the route. The ends'
 * places are left out of the middle: the rider is already getting off
 * there. The owner's model of 2026-09-28, replacing "SM Fairview – Main
 * Babaan" rows. When the line was drawn from the far end (the save panel
 * allows it with a warning) and `lineStart` says so, the middle is turned
 * round to read in travel order. The row keeps the first box's id.
 */
export function timelineFor(
  head: StopSummary | null | undefined,
  tail: StopSummary | null | undefined,
  reversed: boolean,
  along: readonly StopSummary[],
  lineStart?: LngLat,
): Timeline {
  // An end is its place, never a box: "SM Fairview", not the terminal's long name.
  const row = (s: StopSummary): TimelineStop => ({ id: s.id, label: stopLabel(s), kind: s.kind })
  const [from, to] = reversed ? [tail, head] : [head, tail]
  const endPlaces = new Set([head, tail].filter((s) => !!s).map((s) => placeKey(s!)))
  let between = along.filter((s) => s.kind === 'hintuan' && !endPlaces.has(placeKey(s)))
  if (lineStart && from && to && drawnFromTheEnd(lineStart, from, to)) between = between.reverse()
  const rows = between.filter((s, i) => i === 0 || placeKey(s) !== placeKey(between[i - 1])).map(row)
  return { from: from ? row(from) : null, to: to ? row(to) : null, between: rows }
}

/**
 * Whether a line that starts at `lineStart` was drawn from the far end of its
 * ride: its first point nearer where the ride goes than where it leaves. The
 * stored points run whichever way the owner drew them, and the save panel
 * lets a return be drawn from the far end with only a warning, so the ends
 * decide, not the drawing. The one travel-order rule (the review's 6.5): the
 * timeline's middle, the ride-to cut and the arrows' line all turn on it.
 */
export function drawnFromTheEnd(lineStart: LngLat, from: StopSummary, to: StopSummary): boolean {
  return haversine(lineStart, to.point.coordinates) < haversine(lineStart, from.point.coordinates)
}
