import { polygonToRing, type LngLat, type Ring, firstNearIndex, haversine } from './geo'

/** Mirrors the `stop_kind` enum in supabase/migrations/0004_stop_hotspot.sql. */
export type StopKind = 'terminal' | 'hintuan'

export type PolygonGeoJSON = { type: 'Polygon'; coordinates: LngLat[][] }
export type PointGeoJSON = { type: 'Point'; coordinates: LngLat }

/** A hotspot as the public map shows it. `area` is null only for legacy point-only stops (none exist). */
export type StopSummary = {
  id: string
  /** What is written on the ground: "SM Fairview Terminal B". */
  name: string
  /**
   * What people say: "SM Fairview". Optional; `stopLabel` falls back to `name`.
   * The route name reads this (R1), and boxes that share it are one place to
   * a commuter — a terminal and two hintuans under one informal name. 0007.
   */
  informal: string | null
  /** Other ways people say the same place, for a search or a suggestion list. */
  aliases: string[]
  kind: StopKind
  point: PointGeoJSON
  area: PolygonGeoJSON | null
  note: string | null
  created_at: string
}

/** A hotspot with what the editor needs: who owns it. */
export type StopRow = StopSummary & { owner_id: string }

/** One row of route_stop: this direction passes through (or stages at) this hotspot. */
export type StopLink = {
  route_variant_id: string
  stop_id: string
  stop_sequence: number
}

/** The polygon corners of a saved hotspot. */
export function stopRing(s: StopSummary): Ring {
  return polygonToRing(s.area)
}

/**
 * The name a hotspot is shown by: the informal one when there is one, else
 * what is written on the ground. The one rule, so no row ever shows blank and
 * every route name, card and picker agrees. The label on the map is the one
 * exception: it names the box under it, so it reads `name` (useSavedStops).
 */
export function stopLabel(s: Pick<StopSummary, 'name' | 'informal'>): string {
  return s.informal?.trim() || s.name
}

/** Trim and collapse inner spaces, so "SM  Fairview " and "SM Fairview" are one group. Case is left alone. */
export function normaliseName(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * "Fairview, SM City Fairview, Fairview Terminal" → the list, normalised,
 * without blanks or repeats, and without the names it would only repeat.
 */
export function parseAliases(text: string, exclude: string[] = []): string[] {
  const seen = new Set(exclude.map((e) => normaliseName(e).toLowerCase()))
  const out: string[] = []
  for (const raw of text.split(/[,;\n]/)) {
    const a = normaliseName(raw)
    const key = a.toLowerCase()
    if (!a || seen.has(key)) continue
    seen.add(key)
    out.push(a)
  }
  return out
}

// ------------------------------------------------------------ along the line

/**
 * How near a line must come to a box to pass it, in metres. A hintuan is
 * drawn where people stand — the roadside — and the line follows the road,
 * so the two touch without crossing by a metre or less. Five is enough for
 * that and short of the other carriageway, which on Quirino Highway sits
 * seven metres and more from a box on this side. Set 2026-09-22 from the
 * live boxes, replacing "the line enters the box" alone.
 */
export const PASS_WITHIN_M = 5

/**
 * Where along the line this box is passed: the vertex or segment index at
 * which the line first enters the box or comes within PASS_WITHIN_M of it,
 * or -1. The one rule for "this direction passes this hotspot"; the save
 * (both sides: route and hotspot), the save panel and the hotspot panel all
 * ask it, so what is shown is what is stored.
 */
export function passIndex(line: LngLat[], ring: Ring): number {
  return firstNearIndex(line, ring, PASS_WITHIN_M)
}

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

// ------------------------------------------------------------------- places

/**
 * What makes two boxes one place: the same label, case-folded, so "SM
 * fairview" typed once does not become a second place (H3). The pickers
 * group by it and the timeline names by it.
 */
export function placeKey(s: Pick<StopSummary, 'name' | 'informal'>): string {
  return stopLabel(s).trim().toLowerCase()
}

/**
 * The other boxes of this box's place — SM Fairview's terminal and hintuans
 * when one of them is tapped — terminal first, then by name. Empty for a
 * place with one box. What the card's "Part of …" line lists, so a rider
 * who tapped a hintuan can find the terminal. Decided with the owner
 * 2026-09-22.
 */
export function siblingsOf<S extends StopSummary>(stop: StopSummary, all: readonly S[]): S[] {
  const key = placeKey(stop)
  return all
    .filter((s) => s.id !== stop.id && placeKey(s) === key)
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'terminal' ? -1 : 1))
}

/** "terminal + 2 hintuans", "3 hintuans", "terminal": what a place is made of. */
export function placeSummary(boxes: readonly StopSummary[]): string {
  const terminals = boxes.filter((s) => s.kind === 'terminal').length
  const hintuans = boxes.length - terminals
  const parts: string[] = []
  if (terminals > 0) parts.push(terminals === 1 ? 'terminal' : `${terminals} terminals`)
  if (hintuans > 0) parts.push(`${hintuans} ${hintuans === 1 ? 'hintuan' : 'hintuans'}`)
  return parts.join(' + ')
}

/** How many boxes each place has, by place key. */
export function placeSizes(stops: readonly StopSummary[]): Map<string, number> {
  const sizes = new Map<string, number>()
  for (const s of stops) sizes.set(placeKey(s), (sizes.get(placeKey(s)) ?? 0) + 1)
  return sizes
}

/**
 * How a hotspot reads on a timeline: its place, and its own name after a
 * dash when the place has several boxes and the box has a name of its own —
 * "SM Fairview – Main Babaan" tells a rider which side of the mall. A box
 * whose informal name is its name, or the only box of its place, is just
 * its label. The owner's rule, 2026-09-22.
 */
export function timelineLabel(s: StopSummary, sizes: Map<string, number>): string {
  const label = stopLabel(s)
  const own = s.name.trim()
  const several = (sizes.get(placeKey(s)) ?? 0) > 1
  return several && own && own.toLowerCase() !== label.toLowerCase() ? `${label} – ${own}` : label
}

// ----------------------------------------------------------------- timeline

/** One row of a direction's timeline. */
export type TimelineStop = { id: string; label: string; kind: StopKind }

/**
 * A direction as a string of places: where it leaves from, the hintuans on
 * the way in order, where it is going. What a signboard is, generated.
 */
export type Timeline = { from: TimelineStop | null; to: TimelineStop | null; between: TimelineStop[] }

/**
 * The timeline of a direction with these ends. `along` is the hintuans in
 * the order the line reaches them; `all` is every hotspot, so a place with
 * several boxes can name each. The ends' own boxes are dropped from the
 * middle; a place's other boxes stay, since "SM Fairview – Main Babaan" on
 * the way to the terminal is what a rider wants to see. When the line was
 * drawn from the far end (the save panel allows it with a warning) and
 * `lineStart` says so, the middle is turned round to read in travel order.
 */
export function timelineFor(
  head: StopSummary | null | undefined,
  tail: StopSummary | null | undefined,
  reversed: boolean,
  along: readonly StopSummary[],
  all: readonly StopSummary[] = along,
  lineStart?: LngLat,
): Timeline {
  const sizes = placeSizes(all)
  const row = (s: StopSummary): TimelineStop => ({ id: s.id, label: timelineLabel(s, sizes), kind: s.kind })
  // An end is its place, never a box: "SM Fairview", not the terminal's long name.
  const end = (s: StopSummary): TimelineStop => ({ id: s.id, label: stopLabel(s), kind: s.kind })
  const [from, to] = reversed ? [tail, head] : [head, tail]
  const ends = new Set([head?.id, tail?.id])
  let between = along.filter((s) => s.kind === 'hintuan' && !ends.has(s.id)).map(row)
  if (lineStart && from && to) {
    const toFrom = haversine(lineStart, from.point.coordinates)
    const toTo = haversine(lineStart, to.point.coordinates)
    if (toTo < toFrom) between = between.reverse()
  }
  return { from: from ? end(from) : null, to: to ? end(to) : null, between }
}
