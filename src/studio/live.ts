import { nameVariants, type UnnamedVariantRow, type VariantDrawing, type VariantRow } from '../shared/routes'
import type { StopLink, StopRow } from '../shared/stops'
import { getSupabase } from '../shared/supabase'
import { readAll, type Page } from './readAll'

/**
 * Readers of the live tables, for the editor. They live in studio/, apart
 * from the types in shared/routes.ts and shared/stops.ts, on purpose: the
 * public map imports those types but reads the published file instead
 * (shared/mapFile.ts), and check-boundaries.mjs forbids commuter/ importing
 * studio/. So Supabase's address can never land in a chunk both pages share;
 * check-build.mjs proves it stays out of the public page's build too.
 *
 * Each returns nothing when the build has no Supabase, so the studio shows
 * its config banner rather than a load error on top of it.
 *
 * Each reads its table in pages (readAll.ts): Supabase answers at most 1,000
 * rows a request and does not say when it cut, and the links table passes
 * 1,000 at about forty routes. The publish script pages the same way.
 */

/**
 * A direction as the editor lists it, with its parent route embedded: every
 * column but the drawing. `control_points` and `segments` were half of every
 * row and are read only when a direction is opened (withDrawing): with 1,000
 * directions the list was 25 MB a load, measured 2026-09-25.
 *
 * Named columns, not `*`: a column added later is left out of the list until
 * it is named here, which is the point — the list stays as light as it is.
 */
// One literal, not pieces joined: the client reads the row's type off it.
export const VARIANT_SELECT =
  'id, route_id, owner_id, direction_name, origin_terminal, destination_terminal, shape, reversed, confidence, updated_at, borrowed_from, borrowed_part, borrowed_m, route:route(*)'

/** The rest of a direction: its drawing. */
const DRAWING_SELECT = 'control_points, segments'

/**
 * Every saved direction of every route, with the generated names filled in
 * from the hotspots at each route's ends. Public: RLS allows anyone to read.
 */
export async function listVariants(): Promise<VariantRow[]> {
  const client = getSupabase()
  if (!client) return []
  const [rows, stops] = await Promise.all([
    // The client reads a row type off the select and guesses the embedded
    // route as a list; the foreign key makes it one row. Cast, as the save does.
    readAll<UnnamedVariantRow>((from, to) =>
      client
        .from('route_variant')
        .select(VARIANT_SELECT, { count: 'exact' })
        .order('updated_at', { ascending: false })
        .order('id')
        .range(from, to)
        .then((r) => r as unknown as Page<UnnamedVariantRow>),
    ),
    listStops(),
  ])
  return nameVariants(rows, stops)
}

/**
 * The direction with its drawing, read when it is opened to edit, extend or
 * follow: one small request for the one row, in place of every row's drawing
 * on every load.
 */
export async function withDrawing(v: VariantRow): Promise<VariantDrawing> {
  const client = getSupabase()
  if (!client) throw new Error('Supabase is not configured')
  const { data, error } = await client.from('route_variant').select(DRAWING_SELECT).eq('id', v.id).single()
  if (error) throw new Error(error.message)
  const d = data as { control_points: unknown; segments: unknown }
  return {
    ...v,
    control_points: Array.isArray(d.control_points) ? (d.control_points as VariantDrawing['control_points']) : [],
    segments: Array.isArray(d.segments) ? (d.segments as VariantDrawing['segments']) : [],
  }
}

/** Every hotspot, in full. Public: RLS allows anyone to read. */
export async function listStops(): Promise<StopRow[]> {
  const client = getSupabase()
  if (!client) return []
  return readAll<StopRow>((from, to) =>
    client
      .from('stop')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
}

/** Every hotspot ↔ direction link. Public read. */
export async function listStopLinks(): Promise<StopLink[]> {
  const client = getSupabase()
  if (!client) return []
  return readAll<StopLink>((from, to) =>
    client
      .from('route_stop')
      .select('route_variant_id, stop_id, stop_sequence', { count: 'exact' })
      .order('route_variant_id')
      .order('stop_sequence')
      .order('stop_id')
      .range(from, to),
  )
}

/** What the editor's stops hook loads. Module-level, so it never changes between renders. */
export const loadStopsFromSupabase = async () => {
  const [stops, links] = await Promise.all([listStops(), listStopLinks()])
  return { stops, links }
}
