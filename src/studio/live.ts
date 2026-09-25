import { nameVariants, type UnnamedVariantRow, type VariantRow } from '../shared/routes'
import type { StopLink, StopRow } from '../shared/stops'
import { getSupabase } from '../shared/supabase'
import { readAll } from './readAll'

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

/** A direction with its parent route embedded. */
export const VARIANT_SELECT = '*, route:route(*)'

/**
 * Every saved direction of every route, in full, with the generated names
 * filled in from the hotspots at each route's ends. Public: RLS allows anyone
 * to read.
 */
export async function listVariants(): Promise<VariantRow[]> {
  const client = getSupabase()
  if (!client) return []
  const [rows, stops] = await Promise.all([
    readAll<UnnamedVariantRow>((from, to) =>
      client
        .from('route_variant')
        .select(VARIANT_SELECT, { count: 'exact' })
        .order('updated_at', { ascending: false })
        .order('id')
        .range(from, to),
    ),
    listStops(),
  ])
  return nameVariants(rows, stops)
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
