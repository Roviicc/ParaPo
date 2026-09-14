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

export type LineStringGeoJSON = { type: 'LineString'; coordinates: LngLat[] }

/** One direction of a route, with the embedded parent `route`. */
export type VariantRow = {
  id: string
  route_id: string
  owner_id: string
  direction_name: string
  origin_terminal: string | null
  destination_terminal: string | null
  control_points: LngLat[]
  segments: Segment[]
  shape: LineStringGeoJSON | null
  confidence: Confidence
  updated_at: string
  route: RouteRow
}

/** A direction with its parent route embedded. */
export const VARIANT_SELECT = '*, route:route(*)'

/** Every saved direction of every route. Public: RLS allows anyone to read. */
export async function listVariants(): Promise<VariantRow[]> {
  const { data, error } = await requireSupabase()
    .from('route_variant')
    .select(VARIANT_SELECT)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as VariantRow[]
}

/** Geometry to draw on the public map: the stored shape, or rebuilt from segments. */
export function variantLine(v: VariantRow): LngLat[] {
  if (v.shape?.coordinates?.length) return v.shape.coordinates
  return joinSegments(v.segments ?? [])
}
