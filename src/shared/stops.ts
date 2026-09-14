import { polygonToRing, type LngLat, type Ring } from './geo'
import { requireSupabase } from './supabase'

/** Mirrors the `stop_kind` enum in supabase/migrations/0004_stop_hotspot.sql. */
export type StopKind = 'terminal' | 'hintuan'

export type PolygonGeoJSON = { type: 'Polygon'; coordinates: LngLat[][] }
export type PointGeoJSON = { type: 'Point'; coordinates: LngLat }

/** A hotspot. `area` is null only for legacy point-only stops (none exist). */
export type StopRow = {
  id: string
  owner_id: string
  name: string
  kind: StopKind
  point: PointGeoJSON
  area: PolygonGeoJSON | null
  note: string | null
  created_at: string
}

/** One row of route_stop: this direction passes through (or stages at) this hotspot. */
export type StopLink = {
  route_variant_id: string
  stop_id: string
  stop_sequence: number
}

/** The polygon corners of a saved hotspot. */
export function stopRing(s: StopRow): Ring {
  return polygonToRing(s.area)
}

/** Every hotspot. Public: RLS allows anyone to read. */
export async function listStops(): Promise<StopRow[]> {
  const { data, error } = await requireSupabase()
    .from('stop')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as StopRow[]
}

/** Every hotspot ↔ direction link. Public read. */
export async function listStopLinks(): Promise<StopLink[]> {
  const { data, error } = await requireSupabase()
    .from('route_stop')
    .select('route_variant_id, stop_id, stop_sequence')
  if (error) throw new Error(error.message)
  return (data ?? []) as StopLink[]
}
