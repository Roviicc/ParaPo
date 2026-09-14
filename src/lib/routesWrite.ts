import type { LngLat, Segment } from './geo'
import { joinSegments } from './geo'
import {
  VARIANT_SELECT,
  type LineStringGeoJSON,
  type TransportMode,
  type VariantRow,
} from './routes'
import { requireSupabase } from './supabase'

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

const blankToNull = (s: string) => (s.trim() === '' ? null : s.trim())

/**
 * Create or update one direction. Creates the parent route first when there
 * is no routeId. Writes require a signed-in editor who owns the row; RLS
 * enforces it.
 */
export async function saveVariant(input: SaveInput): Promise<VariantRow> {
  const client = requireSupabase()

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
  const client = requireSupabase()
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
