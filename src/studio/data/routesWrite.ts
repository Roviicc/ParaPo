import type { LngLat, Segment } from '../../shared/geo/geo'
import { joinSegments, overviewOf, roundLngLat } from '../../shared/geo/geo'
import { VARIANT_SELECT } from './live'
import type { LineStringGeoJSON, TransportMode, UnnamedVariantRow, VariantRow } from '../../shared/model/routes'
import { requireSupabase } from './supabase'
import { NOTHING_CHANGED } from './stopsWrite'
import type { BorrowPart } from '../drawing/borrow'

/**
 * What the save panel collects. Route fields — the ends, the via, the
 * signboard, the mode, the fare note — belong to the route and are shared by
 * both its directions. With routeId set they are written only when
 * `writeRoute` says so: Edit route changes them (the owner's ask of
 * 2026-09-29 — "Phase 1 – Novaliches" had to become "Bagong Silang Kanan 5 –
 * Novaliches" without a delete); drawing a route's return trip leaves them.
 */
export type SaveInput = {
  routeId: string | null
  variantId: string | null
  /** With routeId: write the route's facts too (Edit route). */
  writeRoute?: boolean
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
  throw new Error(DRAWN_ALREADY)
}

/** The one sentence for route_ends_unique refusing an edit. */
export const ENDS_TAKEN =
  'Another route already runs between these two places. Give one of them a via to tell them apart, or pick other ends.'

const DRAWN_ALREADY =
  'A route between these two places already has this direction drawn. To change it, open it and press Edit route.'

export async function saveVariant(input: SaveInput): Promise<UnnamedVariantRow> {
  const client = requireSupabase()

  let routeId = input.routeId
  let newRoute = !routeId
  // Whether the route row is this call's own insert. Only then may a failed
  // save take it back out: a route claimed from claimExistingRoute may be
  // another save's, in flight, and deleting it cascaded that save's line
  // away when two saves of one new route overlapped (review of 2026-10-03).
  let createdRoute = false
  if (routeId && input.writeRoute) {
    // The route row first: its ends are what both directions' names are
    // made of, and a clash with another route's ends is refused before any
    // line is touched. Terminal links stay as the owner set them.
    const { error } = await client
      .from('route')
      .update({
        signboard: blankToNull(input.signboard),
        mode: input.mode,
        fare_note: blankToNull(input.fare_note),
        head_stop_id: input.head_stop_id,
        tail_stop_id: input.tail_stop_id,
        via: blankToNull(input.via),
      })
      .eq('id', routeId)
    if (error?.code === UNIQUE_VIOLATION) throw new Error(ENDS_TAKEN)
    if (error) throw new Error(error.message)
  }
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
      createdRoute = true
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
    // What the list draws (0009): the same line, thinned at 5 m.
    overview: shape.coordinates.length > 1 ? ({ type: 'LineString', coordinates: overviewOf(shape.coordinates) } as LineStringGeoJSON) : null,
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
      overview: null,
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
      // A claimed route is left: the next press claims it again, or finds
      // the other save's directions in it.
      if (createdRoute) await client.from('route').delete().eq('id', routeId)
      throw new Error(error.message)
    }
    const saved = (data as unknown as UnnamedVariantRow[]).find((v) => v.reversed === input.reversed)
    if (!saved) throw new Error('Saved the route but could not read the direction back')
    return withLine(saved, shape)
  }

  // An existing route: either an edit of a drawn direction, or the first
  // drawing of the empty slot its route was born with. Both are updates —
  // the unique index means there is never a third row to insert. Without a
  // direction in hand only an empty slot is a target (`shape is null`): a
  // return trip started on a route whose both ways are drawn once matched the
  // drawn row and replaced its line (review finding 2).
  const target = input.variantId
    ? client.from('route_variant').update(drawn).eq('id', input.variantId)
    : client
        .from('route_variant')
        .update(drawn)
        .eq('route_id', routeId)
        .eq('reversed', input.reversed)
        .is('shape', null)

  const { data, error } = await target.select(VARIANT_SELECT).maybeSingle()
  if (error) throw new Error(error.message)
  if (data) return withLine(data as unknown as UnnamedVariantRow, shape)

  // No slot to fill. Only reachable for a route saved before 0006, or one
  // whose slot was deleted by hand; an insert is the honest repair. When the
  // direction is there and drawn, the one-per-direction index refuses it.
  const { data: made, error: insertError } = await client
    .from('route_variant')
    .insert(drawn)
    .select(VARIANT_SELECT)
    .single()
  if (insertError?.code === UNIQUE_VIOLATION) throw new Error(DRAWN_ALREADY)
  if (insertError) throw new Error(insertError.message)
  return withLine(made as unknown as UnnamedVariantRow, shape)
}

/**
 * The row as the list reads it comes back with its overview (VARIANT_SELECT);
 * the caller gets it with the line it wrote, which its links are worked out on.
 */
function withLine(row: UnnamedVariantRow & { overview?: unknown }, shape: LineStringGeoJSON): UnnamedVariantRow {
  const { overview: _overview, ...rest } = row
  return { ...rest, shape }
}

/**
 * Delete one direction. Emptying a direction leaves its slot: a route always
 * has two. The route itself goes only when both of its directions are gone.
 *
 * The row is emptied, not deleted — deleting it left a route with one row, no
 * slot to redraw into and a card that could not flip, and `+ New Route` with
 * the same ends was then refused as "already drawn" (review finding 3). What
 * deleting the row did on its own is done by hand: its hotspot links go (the
 * cascade), and a line extended from it forgets its parent (`on delete set
 * null`, 0008) and keeps its own copy.
 *
 * Every step reads its error (finding 16): a refused clean-up is said, not
 * left as a route nobody can reach.
 */
export async function deleteVariant(variant: VariantRow): Promise<void> {
  const client = requireSupabase()
  const emptied = await client
    .from('route_variant')
    .update({
      control_points: [] as LngLat[],
      segments: [] as Segment[],
      shape: null,
      overview: null,
      borrowed_from: null,
      borrowed_part: null,
      borrowed_m: null,
    })
    .eq('id', variant.id)
    .select('id')
  if (emptied.error) throw new Error(emptied.error.message)
  // RLS refusing an update is no rows, not an error: said, not reloaded as
  // if done (review of 2026-10-03, finding 6).
  if (!emptied.data?.length) throw new Error(NOTHING_CHANGED)
  const unlinked = await client.from('route_stop').delete().eq('route_variant_id', variant.id)
  if (unlinked.error) throw new Error(unlinked.error.message)
  const orphaned = await client.from('route_variant').update({ borrowed_from: null }).eq('borrowed_from', variant.id)
  if (orphaned.error) throw new Error(orphaned.error.message)

  const { count, error: countError } = await client
    .from('route_variant')
    .select('id', { count: 'exact', head: true })
    .eq('route_id', variant.route_id)
    .not('shape', 'is', null)
  if (countError) throw new Error(countError.message)
  if (count === 0) {
    // Both ways empty: the route goes, its two slots with it (cascade).
    const gone = await client.from('route').delete().eq('id', variant.route_id).select('id')
    if (gone.error) throw new Error(gone.error.message)
    if (!gone.data?.length) throw new Error(NOTHING_CHANGED)
  }
}
