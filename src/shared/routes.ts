import type { LngLat, Segment } from './geo'
import { joinSegments } from './geo'
import { requireSupabase } from './supabase'

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
  signboard: string
  route_code: string | null
  short_name: string | null
  long_name: string | null
  mode: TransportMode
  fare_note: string | null
  fare_as_of: string | null
}

/** The parent route as the public map shows it. */
export type RouteSummary = Pick<RouteRow, 'id' | 'signboard' | 'long_name' | 'mode' | 'fare_note'>

export type LineStringGeoJSON = { type: 'LineString'; coordinates: LngLat[] }

/**
 * One direction as the public map needs it: its line and what its card shows.
 * No control points or segments — those exist for editing.
 */
export type VariantSummary = {
  id: string
  route_id: string
  direction_name: string
  origin_terminal: string | null
  destination_terminal: string | null
  shape: LineStringGeoJSON | null
  confidence: Confidence
  route: RouteSummary
}

/** One direction with everything the editor needs to reopen and re-save it. */
export type VariantRow = VariantSummary & {
  owner_id: string
  control_points: LngLat[]
  segments: Segment[]
  updated_at: string
  route: RouteRow
}

/** A direction with its parent route embedded. */
export const VARIANT_SELECT = '*, route:route(*)'

/** Exactly the columns a VariantSummary holds. */
const SUMMARY_SELECT =
  'id, route_id, direction_name, origin_terminal, destination_terminal, shape, confidence, ' +
  'route:route(id, signboard, long_name, mode, fare_note)'

/** Every saved direction of every route, in full. Public: RLS allows anyone to read. */
export async function listVariants(): Promise<VariantRow[]> {
  const { data, error } = await requireSupabase()
    .from('route_variant')
    .select(VARIANT_SELECT)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as VariantRow[]
}

/** Every saved direction, as the public map draws it. */
export async function listVariantSummaries(): Promise<VariantSummary[]> {
  const { data, error } = await requireSupabase()
    .from('route_variant')
    .select(SUMMARY_SELECT)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as VariantSummary[]
}

/** Geometry to draw: the stored shape, or rebuilt from segments when the row has them. */
export function variantLine(v: VariantSummary & { segments?: Segment[] | null }): LngLat[] {
  if (v.shape?.coordinates?.length) return v.shape.coordinates
  return joinSegments(v.segments ?? [])
}
