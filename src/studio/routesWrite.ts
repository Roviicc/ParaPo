import type { LngLat, Segment } from '../shared/geo'
import { joinSegments } from '../shared/geo'
import { VARIANT_SELECT } from './live'
import type { LineStringGeoJSON, TransportMode, UnnamedVariantRow, VariantRow } from '../shared/routes'
import { requireSupabase } from '../shared/supabase'

/**
 * What the save panel collects. Route fields — the ends, the signboard, the
 * mode — are ignored when routeId is set, because they belong to the route and
 * are shared by both its directions.
 */
export type SaveInput = {
  routeId: string | null
  variantId: string | null
  /** Optional since 0006: an observed fact, filled in when the owner is sure. */
  signboard: string
  mode: TransportMode
  fare_note: string
  /** The two ends, as hotspots. The name is generated from them. */
  head_stop_id: string
  tail_stop_id: string
  /** Only when another route shares both ends by a different road. */
  via: string
  /** false = head to tail; true = the way back. */
  reversed: boolean
  control_points: LngLat[]
  segments: Segment[]
}

const blankToNull = (s: string) => (s.trim() === '' ? null : s.trim())

/**
 * Create or update one direction.
 *
 * A new route is born with **both** of its directions: the one just drawn, and
 * the other as an empty slot with no line. That is what lets a card always be
 * flipped, gives the studio a list of what is still undrawn, and makes "draw
 * the return trip" a fill rather than an insert. Decided 2026-09-21.
 *
 * Writes require a signed-in editor who owns the row; RLS enforces it. The row
 * comes back without its generated name: the caller has the hotspot list and
 * runs nameVariants on it.
 */
/** Postgres: a unique index refused the row. */
const UNIQUE_VIOLATION = '23505'

/**
 * The route with these ends already exists. If it has no directions it is an
 * orphan — a save whose second request failed, before or after the client
 * learned to clean up after itself — and the honest thing is to use it: same
 * ends, same name, nobody can reach it from a card. Its facts are brought up
 * to what was just typed. If it has directions, it is a real duplicate, and
 * the answer is a `via`.
 */
async function adoptEmptyRoute(
  client: ReturnType<typeof requireSupabase>,
  ends: { head_stop_id: string; tail_stop_id: string; via: string | null },
  facts: { signboard: string | null; mode: TransportMode; fare_note: string | null },
): Promise<string> {
  let query = client
    .from('route')
    .select('id, route_variant(id)')
    .eq('head_stop_id', ends.head_stop_id)
    .eq('tail_stop_id', ends.tail_stop_id)
  query = ends.via === null ? query.is('via', null) : query.eq('via', ends.via)
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('A route with these ends already exists, but it could not be read back.')
  const directions = (data.route_variant as { id: string }[] | null) ?? []
  if (directions.length > 0) {
    throw new Error(
      'A route between these two places already exists. If this one takes a different road, ' +
        'give it a via — the place that tells them apart.',
    )
  }
  const { error: updateError } = await client.from('route').update(facts).eq('id', data.id)
  if (updateError) throw new Error(updateError.message)
  return data.id as string
}

export async function saveVariant(input: SaveInput): Promise<UnnamedVariantRow> {
  const client = requireSupabase()

  let routeId = input.routeId
  const newRoute = !routeId
  if (!routeId) {
    const facts = {
      signboard: blankToNull(input.signboard),
      mode: input.mode,
      fare_note: blankToNull(input.fare_note),
    }
    const ends = {
      head_stop_id: input.head_stop_id,
      tail_stop_id: input.tail_stop_id,
      via: blankToNull(input.via),
    }
    const { data, error } = await client
      .from('route')
      .insert({ ...facts, ...ends })
      .select('id')
      .single()
    if (error && error.code === UNIQUE_VIOLATION) {
      routeId = await adoptEmptyRoute(client, ends, facts)
    } else if (error) {
      throw new Error(error.message)
    } else {
      routeId = data.id as string
    }
  }

  const shape: LineStringGeoJSON = {
    type: 'LineString',
    coordinates: joinSegments(input.segments),
  }
  const drawn = {
    route_id: routeId,
    reversed: input.reversed,
    control_points: input.control_points,
    segments: input.segments,
    shape,
  }

  if (newRoute) {
    // The other direction, as an empty slot. Every key is spelled out: rows
    // inserted together must share one column list, and PostgREST fills a
    // key one row lacks with null — not the column's default. Sent bare, the
    // slot arrived as control_points = null and the table refused it
    // (2026-09-22, the owner's first route).
    const slot = {
      route_id: routeId,
      reversed: !input.reversed,
      control_points: [] as LngLat[],
      segments: [] as Segment[],
      shape: null,
    }
    const { data, error } = await client
      .from('route_variant')
      .insert([drawn, slot])
      .select(VARIANT_SELECT)
    if (error) {
      // Two requests, not one transaction: the route row is already in.
      // Take it back out, or the next press meets route_ends_unique for a
      // route that has no directions and cannot be reached from any card.
      await client.from('route').delete().eq('id', routeId)
      throw new Error(error.message)
    }
    const saved = (data as UnnamedVariantRow[]).find((v) => v.reversed === input.reversed)
    if (!saved) throw new Error('Saved the route but could not read the direction back')
    return saved
  }

  // An existing route: either an edit of a drawn direction, or the first
  // drawing of the empty slot its route was born with. Both are updates —
  // the unique index means there is never a third row to insert.
  const target = input.variantId
    ? client.from('route_variant').update(drawn).eq('id', input.variantId)
    : client.from('route_variant').update(drawn).eq('route_id', routeId).eq('reversed', input.reversed)

  const { data, error } = await target.select(VARIANT_SELECT).maybeSingle()
  if (error) throw new Error(error.message)
  if (data) return data as UnnamedVariantRow

  // No slot to fill. Only reachable for a route saved before 0006, or one
  // whose slot was deleted by hand; an insert is the honest repair.
  const { data: made, error: insertError } = await client
    .from('route_variant')
    .insert(drawn)
    .select(VARIANT_SELECT)
    .single()
  if (insertError) throw new Error(insertError.message)
  return made as UnnamedVariantRow
}

/**
 * Delete one direction. Emptying a direction leaves its slot: a route always
 * has two. The route itself goes only when both of its directions are gone.
 */
export async function deleteVariant(variant: VariantRow): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.from('route_variant').delete().eq('id', variant.id)
  if (error) throw new Error(error.message)

  const { count } = await client
    .from('route_variant')
    .select('id', { count: 'exact', head: true })
    .eq('route_id', variant.route_id)
    .not('shape', 'is', null)
  if (count === 0) {
    await client.from('route_variant').delete().eq('route_id', variant.route_id)
    await client.from('route').delete().eq('id', variant.route_id)
  }
}
