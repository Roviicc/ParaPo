import type { LngLat, Segment } from './geo'
import { joinSegments } from './geo'

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

/** Geometry to draw: the stored shape, or rebuilt from segments when the row has them. */
export function variantLine(v: VariantSummary & { segments?: Segment[] | null }): LngLat[] {
  if (v.shape?.coordinates?.length) return v.shape.coordinates
  return joinSegments(v.segments ?? [])
}
