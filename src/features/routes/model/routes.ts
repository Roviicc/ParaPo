import type { LngLat, Segment } from '@/shared/utils/geo'
import { joinSegments } from '@/shared/utils/geo'
import { stopLabel, type StopSummary } from './stops'

/** Mirrors the `transport_mode` enum in supabase/migrations/0001_init.sql. */
export type TransportMode =
  | 'jeepney'
  | 'e_jeepney'
  | 'uv_express'
  | 'bus'
  | 'p2p'
  | 'tricycle'
  | 'lrt'
  | 'mrt'
  | 'ferry'

export const MODES: { value: TransportMode; label: string }[] = [
  { value: 'jeepney', label: 'Jeepney' },
  { value: 'e_jeepney', label: 'Modern e-jeepney' },
  { value: 'uv_express', label: 'UV Express' },
  { value: 'bus', label: 'Bus' },
  { value: 'p2p', label: 'P2P bus' },
  { value: 'tricycle', label: 'Tricycle' },
  { value: 'lrt', label: 'LRT' },
  { value: 'mrt', label: 'MRT' },
  { value: 'ferry', label: 'Ferry' },
]

/**
 * The train lines (0011, the owner's ask of 2026-10-02): LRT-1, LRT-2 and
 * MRT-3, each a route whose `route_code` names its line. A train runs on its
 * own track and stops only at its own stations, so everything that asks
 * which hintuans a line passes asks `servedBy` too.
 */
export const RAIL_MODES: readonly TransportMode[] = ['lrt', 'mrt']

/** The lines a route_code or a station's `line` may name; 0011 holds `stop.line` to them. */
export const RAIL_LINES = ['LRT-1', 'LRT-2', 'MRT-3'] as const
export type RailLine = (typeof RAIL_LINES)[number]
export const isRailLine = (code: string | null | undefined): code is RailLine => (RAIL_LINES as readonly string[]).includes(code ?? '')

export const isRail = (mode: TransportMode | null | undefined): boolean => !!mode && RAIL_MODES.includes(mode)

/**
 * The ferry lines (0012, the owner's ask of 2026-10-03): the Pasig River
 * Ferry, PRFS. A ferry runs on the river as a train on its track, stopping
 * only at its own stations, so it is a line as a train is.
 */
export const FERRY_MODES: readonly TransportMode[] = ['ferry']
export const FERRY_LINES = ['PRFS'] as const

/** Every mode that runs on a line of its own: the trains and the ferry. */
export const LINE_MODES: readonly TransportMode[] = [...RAIL_MODES, ...FERRY_MODES]
/** Every line a route_code or a station's `line` may name; 0011 and 0012 hold `stop.line` to them. */
export const LINES: readonly string[] = [...RAIL_LINES, ...FERRY_LINES]

export const isLineMode = (mode: TransportMode | null | undefined): boolean => !!mode && LINE_MODES.includes(mode)
export const isFerry = (mode: TransportMode | null | undefined): boolean => !!mode && FERRY_MODES.includes(mode)

/**
 * A line's own words under its trip's tiles, fixed: never a live status (the
 * owner's rule, nothing may look like live tracking). The ferry stops for
 * weather, holidays and repairs often, and MMDA says when.
 */
export const LINE_NOTES: Readonly<Record<string, string>> = {
  PRFS: 'Mon–Sat, daytime · Suspended in bad weather: check MMDA',
}

/** What `servedBy` reads of a route. `route_code` is absent from files published before 0011. */
export type ServedRoute = { mode: TransportMode; route_code?: string | null }

/**
 * Whether a direction of this route stops at this hintuan, beyond passing
 * within reach of its box. A line — a train, the ferry — stops only at its
 * own stations; a jeep at every hintuan that is not a station — the owner's
 * default of 2026-10-02, open to change. A line with none named stops
 * nowhere, so it can never pick up the jeep hintuans under its track or
 * along its river.
 */
export function servedBy(stop: { line?: string | null }, route: ServedRoute): boolean {
  const line = stop.line ?? null
  if (!isLineMode(route.mode)) return line === null
  return line !== null && line === (route.route_code ?? null)
}

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
> & {
  name: string
  /** The train line, 'LRT-1', for a rail route (0011). Absent from files published before it. */
  route_code?: string | null
}

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
  /**
   * The ride's length in metres, measured on its full line: the published
   * index carries it, so a trip's Kilometer and fare never read an overview.
   * Absent from the studio's rows and from map.json's, whose lines are whole.
   */
  metres?: number | null
  /**
   * Its signboards as pictures, in order (0010, the owner's ask of
   * 2026-10-01): file names — in the studio's bucket for the editor, beside
   * the map (/data/signboards/) for the public. Absent when it has none.
   */
  signboards?: readonly string[]
}

/**
 * One direction as the editor lists it: what the map, the cards, the links
 * and a save need to know about every direction, without its drawing. The
 * drawing — the clicks and the road between each pair — is read on its own
 * when a direction is opened (VariantDrawing, live.ts withDrawing): it is
 * half of every row, and the editor lists a thousand rows to open one.
 */
export type VariantRow = VariantSummary & {
  owner_id: string
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

/** A direction with its drawing, for reopening and re-saving it. */
export type VariantDrawing = VariantRow & {
  control_points: LngLat[]
  segments: Segment[]
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

/** The hotspots a direction runs from and to: its route's head and tail, the way it rides them. */
export function directionEndStops(v: VariantSummary): { fromStop: string | null; toStop: string | null } {
  const head = v.route?.head_stop_id ?? null
  const tail = v.route?.tail_stop_id ?? null
  return v.reversed ? { fromStop: tail, toStop: head } : { fromStop: head, toStop: tail }
}

/** Geometry to draw: the stored shape, or rebuilt from segments when the row has them. */
export function variantLine(v: VariantSummary & { segments?: Segment[] | null }): LngLat[] {
  if (v.shape?.coordinates?.length) return v.shape.coordinates
  return joinSegments(v.segments ?? [])
}
