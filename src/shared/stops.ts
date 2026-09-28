import { bboxContains, bboxOf, polygonToRing, type BBox, type LngLat, type Ring, distanceToRingM, firstNearIndex, haversine } from './geo'

/** Mirrors the `stop_kind` enum in supabase/migrations/0004_stop_hotspot.sql. */
export type StopKind = 'terminal' | 'hintuan'

export type PolygonGeoJSON = { type: 'Polygon'; coordinates: LngLat[][] }
export type PointGeoJSON = { type: 'Point'; coordinates: LngLat }

/** A hotspot as the public map shows it. `area` is null only for legacy point-only stops (none exist). */
export type StopSummary = {
  id: string
  /** The ground name: what is written on the ground, "SM Fairview Terminal B". */
  name: string
  /**
   * The stop name: what people say, "SM Fairview". Optional; `stopLabel`
   * falls back to the ground name. The route name reads this (R1), and
   * boxes that share it are one stop to a commuter, whatever is written on
   * each — a terminal and two hintuans under one stop name. 0007; the
   * owner's two words for the two names, 2026-09-26.
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

/**
 * The ground a line must reach for any of it to pass this box: the box,
 * `withinM` and two steps wider. A line whose own box (`bboxOf`) does not
 * overlap it has no stretch here, so a caller with many lines and many
 * boxes can skip the pair without walking the line.
 */
export function passBounds(ring: Ring, withinM = PASS_WITHIN_M, stepM = 1): BBox {
  return bboxOf(ring, withinM + 2 * stepM)
}

/**
 * The pieces of the line that pass this box: every stretch that is inside it
 * or within PASS_WITHIN_M of its edge, as short lines in travel order. The
 * same rule as `passIndex`, so a box is painted on a direction exactly when
 * the timeline lists it, and where the line runs beside a roadside box the
 * paint is the part alongside.
 *
 * The line is walked a metre at a time near the box — a snapped road has a
 * vertex every 20–30 m, so the box edges fall between vertices — and left
 * alone everywhere else. Two points at least, so a stretch is a line.
 */
export function passStretches(line: LngLat[], ring: Ring, withinM = PASS_WITHIN_M, stepM = 1): LngLat[][] {
  if (ring.length < 3 || line.length < 2) return []
  // Only segments near the box's bounds are worth sampling, and only a
  // vertex inside them is worth measuring: the ring distance is the cost
  // here, and on a big map almost every vertex of almost every line is
  // nowhere near this box (1,000 directions and 500 hotspots took 142 s to
  // open before this check, 2026-09-25).
  const bounds = passBounds(ring, withinM, stepM)
  const [w, s, e, n] = bounds
  const nearBox = (a: LngLat, b: LngLat) =>
    Math.max(a[0], b[0]) >= w && Math.min(a[0], b[0]) <= e && Math.max(a[1], b[1]) >= s && Math.min(a[1], b[1]) <= n
  const near = (p: LngLat) => bboxContains(bounds, p) && distanceToRingM(p, ring) <= withinM

  const out: LngLat[][] = []
  // The stretch being walked, and the last near sample between vertices,
  // kept so the stretch ends where the box does and not at the vertex before.
  const st: { cur: LngLat[] | null; pending: LngLat | null } = { cur: null, pending: null }
  const close = () => {
    if (!st.cur) return
    if (st.pending) st.cur.push(st.pending)
    if (st.cur.length > 1) out.push(st.cur)
    st.cur = null
    st.pending = null
  }
  const take = (p: LngLat, isVertex: boolean) => {
    if (!near(p)) return close()
    if (!st.cur) st.cur = [p]
    else if (isVertex) st.cur.push(p)
    st.pending = isVertex ? null : st.cur[0] === p ? null : p
  }
  take(line[0], true)
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]]
    if (nearBox(a, b)) {
      const steps = Math.max(1, Math.ceil(haversine(a, b) / stepM))
      for (let t = 1; t < steps; t++) take([a[0] + ((b[0] - a[0]) * t) / steps, a[1] + ((b[1] - a[1]) * t) / steps], false)
    }
    take(b, true)
  }
  close()
  return out
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

/**
 * "terminal + hintuan · 2 mini stops", "hintuan · 2 mini stops": what a place
 * is made of. A place's hintuan boxes are one hintuan to a rider; each box is
 * a mini stop, there for information. The owner's model, 2026-09-28.
 */
export function placeSummary(boxes: readonly StopSummary[]): string {
  const terminals = boxes.filter((s) => s.kind === 'terminal').length
  const minis = boxes.length - terminals
  const parts: string[] = []
  if (terminals > 0) parts.push(terminals === 1 ? 'terminal' : `${terminals} terminals`)
  if (minis > 0) parts.push(minis === 1 ? 'hintuan' : `hintuan · ${minis} mini stops`)
  return parts.join(' + ')
}

/**
 * How many hotspots there are, as a rider counts them: each terminal, and
 * each place's hintuan once however many mini stops it has. The owner's
 * rule of 2026-09-28; the pill reads it.
 */
export function hotspotCount(stops: readonly StopSummary[]): number {
  const hintuans = new Set(stops.filter((s) => s.kind === 'hintuan').map(placeKey))
  return stops.filter((s) => s.kind === 'terminal').length + hintuans.size
}

/** How far apart two boxes of one name may be and still be one hintuan: both sides of a road. */
export const SAME_HINTUAN_M = 100

/**
 * One map label per hintuan: boxes of the same kind and name within
 * SAME_HINTUAN_M of each other — one traced on each side of the road — share
 * a label halfway between them, so one hintuan does not read as two. The
 * owner's ask of 2026-09-28, with Bestlink. Farther apart, each keeps its own.
 */
export function labelGroups<S extends StopSummary>(stops: readonly S[]): { ids: string[]; kind: StopKind; name: string; point: LngLat }[] {
  const groups: { key: string; boxes: S[] }[] = []
  for (const s of stops) {
    const key = `${s.kind}|${s.name.trim().toLowerCase()}`
    const near = groups.find(
      (g) => g.key === key && g.boxes.some((b) => haversine(b.point.coordinates, s.point.coordinates) <= SAME_HINTUAN_M),
    )
    if (near) near.boxes.push(s)
    else groups.push({ key, boxes: [s] })
  }
  return groups.map(({ boxes }) => ({
    ids: boxes.map((b) => b.id),
    kind: boxes[0].kind,
    name: boxes[0].name,
    point: [
      boxes.reduce((a, b) => a + b.point.coordinates[0], 0) / boxes.length,
      boxes.reduce((a, b) => a + b.point.coordinates[1], 0) / boxes.length,
    ],
  }))
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
  if (lineStart && from && to) {
    const toFrom = haversine(lineStart, from.point.coordinates)
    const toTo = haversine(lineStart, to.point.coordinates)
    if (toTo < toFrom) between = between.reverse()
  }
  const rows = between.filter((s, i) => i === 0 || placeKey(s) !== placeKey(between[i - 1])).map(row)
  return { from: from ? row(from) : null, to: to ? row(to) : null, between: rows }
}
