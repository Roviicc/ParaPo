import type { LngLat, Segment } from '../shared/geo'
import { joinSegments, roundLngLat } from '../shared/geo'
import { VARIANT_SELECT } from './live'
import type { LineStringGeoJSON, TransportMode, UnnamedVariantRow, VariantRow } from '../shared/routes'
import { requireSupabase } from '../shared/supabase'
import type { BorrowPart } from './borrow'

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
  /**
   * What this line borrowed, when it was started with Extend (0008). Null
   * when it borrows nothing, including a borrowed part since redrawn away.
   */
  borrowed_from: string | null
  borrowed_part: BorrowPart | null
  borrowed_m: number | null
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
 * comes back as the list reads it (VARIANT_SELECT, without the drawing just
 * sent) and without its generated name: the caller has the hotspot list and
 * runs nameVariants on it.
 */
/** Postgres: a unique index refused the row. */
const UNIQUE_VIOLATION = '23505'

/**
 * The route with these ends already exists. Three cases:
 *
 * - It has no directions: an orphan — a save whose second request failed,
 *   before or after the client learned to clean up after itself. Use it: same
 *   ends, same name, nobody can reach it from a card. Its facts are brought up
 *   to what was just typed, and both directions are inserted as for a new one.
 * - This direction is still its empty slot: the line fills it. This is how a
 *   return trip drawn with Extend — from another route's line — lands on the
 *   route its outbound created, with nothing to pick. The route's facts are
 *   its own and are left alone.
 * - This direction is drawn already: a real duplicate, refused.
 */
async function claimExistingRoute(
  client: ReturnType<typeof requireSupabase>,
  ends: { head_stop_id: string; tail_stop_id: string; via: string | null },
  facts: { signboard: string | null; mode: TransportMode; fare_note: string | null },
  reversed: boolean,
): Promise<{ routeId: string; fillSlot: boolean }> {
  let query = client
    .from('route')
    .select('id, route_variant(id, reversed, shape)')
    .eq('head_stop_id', ends.head_stop_id)
    .eq('tail_stop_id', ends.tail_stop_id)
  query = ends.via === null ? query.is('via', null) : query.eq('via', ends.via)
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('A route with these ends already exists, but it could not be read back.')
  const directions = (data.route_variant as { id: string; reversed: boolean; shape: unknown }[] | null) ?? []
  if (directions.length === 0) {
    const { error: updateError } = await client.from('route').update(facts).eq('id', data.id)
    if (updateError) throw new Error(updateError.message)
    return { routeId: data.id as string, fillSlot: false }
  }
  const mine = directions.find((d) => d.reversed === reversed)
  if (mine && mine.shape === null) return { routeId: data.id as string, fillSlot: true }
  throw new Error(
    'A route between these two places already has this direction drawn. To change it, open it and ' +
      'press Edit route.',
  )
}

export async function saveVariant(input: SaveInput): Promise<UnnamedVariantRow> {
  const client = requireSupabase()

  let routeId = input.routeId
  let newRoute = !routeId
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
      const claimed = await claimExistingRoute(client, ends, facts, input.reversed)
      routeId = claimed.routeId
      newRoute = !claimed.fillSlot
    } else if (error) {
      throw new Error(error.message)
    } else {
      routeId = data.id as string
    }
  }

  // Six decimals, about 0.1 m (roundLngLat): the router's points carry 15 or
  // more, and those digits were half of every row. The line is joined from
  // the rounded segments, so a segment's end and the shape's point are the
  // same number, and the publish script's rounding then changes nothing.
  const segments: Segment[] = input.segments.map((s) => ({ ...s, coordinates: s.coordinates.map(roundLngLat) }))
  const shape: LineStringGeoJSON = {
    type: 'LineString',
    coordinates: joinSegments(segments),
  }
  const drawn = {
    route_id: routeId,
    reversed: input.reversed,
    control_points: input.control_points.map(roundLngLat),
    segments,
    shape,
    borrowed_from: input.borrowed_from,
    borrowed_part: input.borrowed_from ? input.borrowed_part : null,
    borrowed_m: input.borrowed_from ? input.borrowed_m : null,
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
      borrowed_from: null,
      borrowed_part: null,
      borrowed_m: null,
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
    const saved = (data as unknown as UnnamedVariantRow[]).find((v) => v.reversed === input.reversed)
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
  if (data) return data as unknown as UnnamedVariantRow

  // No slot to fill. Only reachable for a route saved before 0006, or one
  // whose slot was deleted by hand; an insert is the honest repair.
  const { data: made, error: insertError } = await client
    .from('route_variant')
    .insert(drawn)
    .select(VARIANT_SELECT)
    .single()
  if (insertError) throw new Error(insertError.message)
  return made as unknown as UnnamedVariantRow
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
