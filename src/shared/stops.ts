import { polygonToRing, type LngLat, type Ring } from './geo'

/** Mirrors the `stop_kind` enum in supabase/migrations/0004_stop_hotspot.sql. */
export type StopKind = 'terminal' | 'hintuan'

export type PolygonGeoJSON = { type: 'Polygon'; coordinates: LngLat[][] }
export type PointGeoJSON = { type: 'Point'; coordinates: LngLat }

/** A hotspot as the public map shows it. `area` is null only for legacy point-only stops (none exist). */
export type StopSummary = {
  id: string
  name: string
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

