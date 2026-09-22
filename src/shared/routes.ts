import type { LngLat, Segment } from './geo'
import { joinSegments } from './geo'
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

/** Geometry to draw: the stored shape, or rebuilt from segments when the row has them. */
export function variantLine(v: VariantSummary & { segments?: Segment[] | null }): LngLat[] {
  if (v.shape?.coordinates?.length) return v.shape.coordinates
  return joinSegments(v.segments ?? [])
}
