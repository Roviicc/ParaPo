import type { LngLat, Segment } from './geo'
import { joinSegments } from './geo'
import { supabase, supabaseConfigError } from './supabase'

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

/** What the save panel collects. Route fields are ignored when routeId is set. */
export type SaveInput = {
  routeId: string | null
  variantId: string | null
  signboard: string
  long_name: string
  mode: TransportMode
  fare_note: string
  direction_name: string
  origin_terminal: string
  destination_terminal: string
  control_points: LngLat[]
  segments: Segment[]
}

const VARIANT_SELECT = '*, route:route(*)'

function requireClient() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured')
  return supabase
}

const blankToNull = (s: string) => (s.trim() === '' ? null : s.trim())

/** Every saved direction of every route. Public: RLS allows anyone to read. */
export async function listVariants(): Promise<VariantRow[]> {
  const { data, error } = await requireClient()
    .from('route_variant')
    .select(VARIANT_SELECT)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as VariantRow[]
}

/**
 * Create or update one direction. Creates the parent route first when there
 * is no routeId. Writes require a signed-in owner; RLS enforces it.
 */
export async function saveVariant(input: SaveInput): Promise<VariantRow> {
  const client = requireClient()

  let routeId = input.routeId
  if (!routeId) {
    const { data, error } = await client
      .from('route')
      .insert({
        signboard: input.signboard.trim(),
        long_name: blankToNull(input.long_name),
        mode: input.mode,
        fare_note: blankToNull(input.fare_note),
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    routeId = data.id as string
  }

  const shape: LineStringGeoJSON = {
    type: 'LineString',
    coordinates: joinSegments(input.segments),
  }
  const row = {
    route_id: routeId,
    direction_name: input.direction_name.trim(),
    origin_terminal: blankToNull(input.origin_terminal),
    destination_terminal: blankToNull(input.destination_terminal),
    control_points: input.control_points,
    segments: input.segments,
    shape,
  }

  const query = input.variantId
    ? client.from('route_variant').update(row).eq('id', input.variantId)
    : client.from('route_variant').insert(row)

  const { data, error } = await query.select(VARIANT_SELECT).single()
  if (error) throw new Error(error.message)
  return data as VariantRow
}

/** Delete one direction. The parent route stays; delete it when it is empty. */
export async function deleteVariant(variant: VariantRow): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('route_variant').delete().eq('id', variant.id)
  if (error) throw new Error(error.message)

  const { count } = await client
    .from('route_variant')
    .select('id', { count: 'exact', head: true })
    .eq('route_id', variant.route_id)
  if (count === 0) {
    await client.from('route').delete().eq('id', variant.route_id)
  }
}

/** Geometry to draw on the public map: the stored shape, or rebuilt from segments. */
export function variantLine(v: VariantRow): LngLat[] {
  if (v.shape?.coordinates?.length) return v.shape.coordinates
  return joinSegments(v.segments ?? [])
}
