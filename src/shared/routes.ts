import type { LngLat, Segment } from './geo'
import { haversine, joinSegments } from './geo'
import { stopLabel, timelineFor, type StopSummary, type Timeline } from './stops'

/** Mirrors the `transport_mode` enum in supabase/migrations/0001_init.sql. */
export type TransportMode =
  | 'jeepney'
  | 'e_jeepney'
  | 'uv_express'
  | 'bus'
  | 'p2p'
  | 'tricycle'

export const MODES: { value: TransportMode; label: string }[] = [
  { value: 'jeepney', label: 'Jeepney' },
  { value: 'e_jeepney', label: 'Modern e-jeepney' },
  { value: 'uv_express', label: 'UV Express' },
  { value: 'bus', label: 'Bus' },
  { value: 'p2p', label: 'P2P bus' },
  { value: 'tricycle', label: 'Tricycle' },
]

export type Confidence = 'drawn' | 'verified'

export type RouteRow = {
  id: string
  owner_id: string
  /**
   * What is painted on the windshield. Optional since 0006: the generated name
   * took over the job of making a route recognisable, which leaves the
   * signboard as the observed fact it really is — filled in when the owner is
   * sure of it, rather than invented at save time.
   */
  signboard: string | null
  route_code: string | null
  short_name: string | null
  long_name: string | null
  mode: TransportMode
  fare_note: string | null
  fare_as_of: string | null
  /** The two ends, as hotspots. The name is generated from them; see routeName. */
  head_stop_id: string
  tail_stop_id: string
  /** Set only when another route shares both ends by a different road. */
  via: string | null
}

/**
 * The parent route as the public map shows it. `name` is not a column: it is
 * generated from the two end hotspots by whoever reads the rows — the studio
 * after loading (live.ts), the publish script before writing the file.
 */
export type RouteSummary = Pick<
  RouteRow,
  'id' | 'signboard' | 'long_name' | 'mode' | 'fare_note' | 'head_stop_id' | 'tail_stop_id' | 'via'
> & { name: string }

/** Spaced en dash. R3: applied by the app, never typed, so it cannot vary. */
const DASH = '–'

/**
 * `Tala – SM Fairview`, or `Tala – Novaliches via Zabarte`.
 *
 * R1–R4, decided 2026-09-21. Nothing stores this: it is generated wherever a
 * name is shown, from the two hotspots' current names, so renaming a hotspot
 * renames every route through it and no copy can fall behind.
 */
export function routeName(head: string, tail: string, via?: string | null): string {
  const base = `${head} ${DASH} ${tail}`
  return via && via.trim() ? `${base} via ${via.trim()}` : base
}

/**
 * `SM Fairview → Tala` — a direction named from where it leaves to where it is
 * going. Generated too: a direction is only which way round the route is
 * ridden, so it has nothing of its own to name. Both ends are said, because
 * "to Tala" beside the route name "Tala – SM Fairview" read as not reversed
 * at all (the owner, on his first return trip, 2026-09-22).
 */
export function directionName(head: string, tail: string, reversed: boolean): string {
  return reversed ? `${tail} → ${head}` : `${head} → ${tail}`
}

export type LineStringGeoJSON = { type: 'LineString'; coordinates: LngLat[] }

/**
 * One direction as the public map needs it: its line and what its card shows.
 * No control points or segments — those exist for editing.
 */
export type VariantSummary = {
  id: string
  route_id: string
  direction_name: string | null
  origin_terminal: string | null
  destination_terminal: string | null
  /**
   * Null until this direction is drawn. Saving one direction creates the other
   * at once as an empty slot, so the card can always be flipped and the studio
   * has a list of what is still undrawn. 0006.
   */
  shape: LineStringGeoJSON | null
  /** false = head to tail, true = the way back. Exactly two per route. */
  reversed: boolean
  confidence: Confidence
  route: RouteSummary
}

/** One direction with everything the editor needs to reopen and re-save it. */
export type VariantRow = VariantSummary & {
  owner_id: string
  control_points: LngLat[]
  segments: Segment[]
  updated_at: string
  route: RouteRow & { name: string }
  /**
   * Set when this line was started from part of another direction's (Extend,
   * 0008): which one, which part of *this* line it is ('start' or 'end'), and
   * how many metres of it still run on the other's. The borrowed part is a
   * copy; this only remembers where it came from. Optional so fixtures and
   * rows read before 0008 need not carry it.
   */
  borrowed_from?: string | null
  borrowed_part?: 'start' | 'end' | null
  borrowed_m?: number | null
}

/** A VariantRow straight from the database, before nameVariants has run. */
export type UnnamedVariantRow = Omit<VariantRow, 'route'> & { route: RouteRow }

type StopName = Pick<StopSummary, 'id' | 'name' | 'informal'>
type Unnamed = {
  reversed: boolean
  direction_name: string | null
  route: Pick<RouteRow, 'signboard' | 'head_stop_id' | 'tail_stop_id' | 'via'>
}

/**
 * Fill in the generated names from the hotspots at each route's ends. Nothing
 * stores them (R1, 2026-09-21), so a renamed hotspot shows its new name on the
 * next load or the next publish, and no copy can fall behind. The name read is
 * the hotspot's informal one when it has one (stopLabel, 0007): a route is
 * `Tala – SM Fairview`, never `Tala Jeepney Terminal – SM Fairview Terminal A`.
 *
 * A route whose ends cannot be found falls back to its signboard: the foreign
 * keys make that impossible from the database, so it only means an old file.
 */
export function nameVariants<V extends Unnamed>(
  variants: V[],
  stops: StopName[],
): (V & { route: V['route'] & { name: string } })[] {
  const byId = new Map(stops.map((s) => [s.id, stopLabel(s)]))
  return variants.map((v) => {
    const head = byId.get(v.route.head_stop_id)
    const tail = byId.get(v.route.tail_stop_id)
    if (!head || !tail) {
      return { ...v, route: { ...v.route, name: v.route.signboard ?? '(unnamed)' } }
    }
    return {
      ...v,
      direction_name: directionName(head, tail, v.reversed),
      route: { ...v.route, name: routeName(head, tail, v.route.via) },
    }
  })
}

/** Whether a direction has a line to draw, as opposed to being a slot. */
export function isDrawn(v: VariantSummary & { segments?: Segment[] | null }): boolean {
  return variantLine(v).length > 1
}

/** One route with its directions, for a sheet that lists routes, not directions. */
export type RouteGroup<V extends VariantSummary> = { routeId: string; route: RouteSummary; directions: V[] }

/** Directions gathered by route, in the order their routes were first met. */
export function groupByRoute<V extends VariantSummary>(variants: readonly V[]): RouteGroup<V>[] {
  const groups = new Map<string, RouteGroup<V>>()
  for (const v of variants) {
    const g = groups.get(v.route_id) ?? { routeId: v.route_id, route: v.route, directions: [] }
    g.directions.push(v)
    groups.set(v.route_id, g)
  }
  return [...groups.values()]
}

/**
 * The places a direction runs from and to, as its generated name says them —
 * `Tala → SM Fairview` — so a list reads exactly what the card's title will.
 * Falls back to the route's name, read the way this direction rides it, for a
 * row that has no direction name (a file from before names were generated).
 */
export function directionEnds(v: VariantSummary): { from: string; to: string } {
  const [from, to] = (v.direction_name ?? '').split(' → ')
  if (from && to) return { from, to }
  const [head = '', tail = ''] = (v.route?.name ?? '').replace(/ via .*$/, '').split(` ${DASH} `)
  return v.reversed ? { from: tail, to: head } : { from: head, to: tail }
}

/** One place in the chooser, and the directions shown leaving it. */
export type Departures<V extends VariantSummary> = {
  from: string
  directions: { v: V; to: string; drawn: boolean }[]
}

/**
 * The routes under a tap one way round — outbound, or with `back` the way
 * back — gathered by the place each leaves from, in the order met. Tala →
 * SM Fairview and Tala → Novaliches read as Tala, then its two ends; the way
 * back reads SM Fairview, then Tala, and Novaliches, then Tala. The owner's
 * layout of 2026-09-25. A direction still a slot is listed, marked undrawn.
 */
export function departures<V extends VariantSummary>(variants: readonly V[], back: boolean): Departures<V>[] {
  const byPlace = new Map<string, Departures<V>>()
  for (const g of groupByRoute(variants)) {
    const v = g.directions.find((d) => d.reversed === back)
    if (!v) continue
    const { from, to } = directionEnds(v)
    const key = from.toLowerCase()
    const place = byPlace.get(key) ?? { from, directions: [] }
    place.directions.push({ v, to, drawn: isDrawn(v) })
    byPlace.set(key, place)
  }
  return [...byPlace.values()]
}

/**
 * The direction a route opens with when it is picked as a whole: the
 * outbound when it has a line, else the return — predictable, and ⇄ is one
 * tap away. Decided with the owner 2026-09-22. Null only for a route with
 * nothing drawn, which no tap can reach.
 */
export function directionToOpen<V extends VariantSummary>(directions: readonly V[]): V | null {
  return directions.find((v) => !v.reversed && isDrawn(v)) ?? directions.find(isDrawn) ?? directions[0] ?? null
}

/**
 * The route's other direction, for the switch on a card: drawn or not, so the
 * card can say "not mapped yet" instead of offering an empty line. Null when
 * the route has only this one.
 */
export function otherDirection<V extends VariantSummary>(all: readonly V[], of: V): V | null {
  return all.find((v) => v.route_id === of.route_id && v.id !== of.id) ?? null
}

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
  return timelineFor(head, tail, v.reversed, along, stops, variantLine(v)[0])
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

/** Geometry to draw: the stored shape, or rebuilt from segments when the row has them. */
export function variantLine(v: VariantSummary & { segments?: Segment[] | null }): LngLat[] {
  if (v.shape?.coordinates?.length) return v.shape.coordinates
  return joinSegments(v.segments ?? [])
}
