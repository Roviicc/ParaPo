import { haversine, lineLength, type LngLat } from '../geo/geo'
import { passStretches } from '../geo/pass'
import { placeKey } from './places'
import { stopRing, type StopSummary } from './stops'
import { timelineFor, type Timeline } from './timeline'
import { variantLine, type VariantSummary } from './routes'

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
  const head = stops.find((s) => s.id === v.route?.head_stop_id) ?? null
  const tail = stops.find((s) => s.id === v.route?.tail_stop_id) ?? null
  return timelineFor(head, tail, v.reversed, along, variantLine(v)[0])
}

/** Distance along the line of a point lying on it: the first segment that holds the point wins. */
function distanceAlong(line: LngLat[], p: LngLat): number {
  let cum = 0
  for (let i = 1; i < line.length; i++) {
    const ab = haversine(line[i - 1], line[i])
    const ap = haversine(line[i - 1], p)
    // On the segment when going a → p → b adds nothing to a → b.
    if (ap + haversine(p, line[i]) - ab < 0.05) return cum + ap
    cum += ab
  }
  return cum
}

/** The point `metres` along the line, and the last vertex before it. */
function pointAt(line: LngLat[], metres: number): { point: LngLat; index: number } {
  let cum = 0
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]]
    const seg = haversine(a, b)
    if (cum + seg >= metres && seg > 0) {
      const t = (metres - cum) / seg
      return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], index: i - 1 }
    }
    cum += seg
  }
  return { point: line[line.length - 1], index: line.length - 2 }
}

/** One get-off circle of the ride-to preview: a mini stop, the middle of its orange stretch, and how far in that is. */
export type RideDot = { stopId: string; at: LngLat; metres: number }

/**
 * The ride cut short at one hintuan — what tapping a timeline row previews,
 * the owner's asks of 2026-09-28. The row is a place; each of its mini
 * stops the line passes gets a dot at the middle of its orange stretch
 * (`passStretches`, the one rule, walked rather than the stored
 * `stop_sequence`, which indexes the editor's full line and overshoots the
 * published, thinned one). The ride ends at `endStopId`'s dot when given —
 * tapping a dot toggles the get-off side without moving the hintuan — and
 * at the last dot otherwise. `ridden` runs from the place this direction
 * leaves; the line may have been drawn from the far end (the save panel
 * allows it with a warning), and is turned to rider order by the same
 * nearest-end rule `timelineFor` reads the middle with. `rest` is the way
 * not ridden, for the map to fade.
 */
export function rideCut(
  v: VariantSummary,
  stops: readonly StopSummary[],
  rowStopId: string,
  endStopId: string | null = null,
): { ridden: LngLat[]; rest: LngLat[]; metres: number; at: LngLat; endStopId: string; dots: RideDot[] } | null {
  const row = stops.find((s) => s.id === rowStopId)
  const line = variantLine(v)
  if (!row || line.length < 2) return null
  const head = stops.find((s) => s.id === v.route?.head_stop_id)
  const tail = stops.find((s) => s.id === v.route?.tail_stop_id)
  const from = v.reversed ? tail : head
  const to = v.reversed ? head : tail
  const fromStart =
    !from || !to || haversine(line[0], from.point.coordinates) <= haversine(line[0], to.point.coordinates)
  const ride = fromStart ? line : [...line].reverse()
  const key = placeKey(row)
  const dots: RideDot[] = []
  for (const s of stops) {
    if (s.kind !== 'hintuan' || placeKey(s) !== key || !s.area) continue
    const piece = passStretches(ride, stopRing(s))[0]
    if (!piece) continue
    const metres = distanceAlong(ride, piece[0]) + lineLength(piece) / 2
    dots.push({ stopId: s.id, at: pointAt(ride, metres).point, metres })
  }
  dots.sort((a, b) => a.metres - b.metres)
  const end = dots.find((d) => d.stopId === endStopId) ?? dots[dots.length - 1]
  if (!end || end.metres < 1) return null
  const { point, index } = pointAt(ride, end.metres)
  return {
    ridden: [...ride.slice(0, index + 1), point],
    rest: [point, ...ride.slice(index + 1)],
    metres: end.metres,
    at: point,
    endStopId: end.stopId,
    dots,
  }
}

/**
 * The direction's line in travel order: from where it leaves to where it is
 * going. The stored points run whichever way the owner drew them, and the
 * save panel lets a return be drawn from the far end with only a warning, so
 * the ends decide, not the drawing. What the arrows and the glow follow.
 */
export function travelLine(v: VariantSummary, stops: readonly StopSummary[]): LngLat[] {
  const line = variantLine(v)
  if (line.length < 2) return line
  const head = stops.find((s) => s.id === v.route?.head_stop_id)
  const tail = stops.find((s) => s.id === v.route?.tail_stop_id)
  const [from, to] = v.reversed ? [tail, head] : [head, tail]
  if (!from || !to) return line
  const start = line[0]
  const backwards = haversine(start, to.point.coordinates) < haversine(start, from.point.coordinates)
  return backwards ? [...line].reverse() : line
}
