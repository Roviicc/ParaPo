import type { VariantRow } from '../shared/routes'
import type { StopLink, StopRow } from '../shared/stops'
import { getSupabase } from '../shared/supabase'

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
 */

/** A direction with its parent route embedded. */
export const VARIANT_SELECT = '*, route:route(*)'

/** Every saved direction of every route, in full. Public: RLS allows anyone to read. */
export async function listVariants(): Promise<VariantRow[]> {
  const client = getSupabase()
  if (!client) return []
  const { data, error } = await client
    .from('route_variant')
    .select(VARIANT_SELECT)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as VariantRow[]
}

/** Every hotspot, in full. Public: RLS allows anyone to read. */
export async function listStops(): Promise<StopRow[]> {
  const client = getSupabase()
  if (!client) return []
  const { data, error } = await client.from('stop').select('*').order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as StopRow[]
}

/** Every hotspot ↔ direction link. Public read. */
export async function listStopLinks(): Promise<StopLink[]> {
  const client = getSupabase()
  if (!client) return []
  const { data, error } = await client.from('route_stop').select('route_variant_id, stop_id, stop_sequence')
  if (error) throw new Error(error.message)
  return (data ?? []) as StopLink[]
}

/** What the editor's stops hook loads. Module-level, so it never changes between renders. */
export const loadStopsFromSupabase = async () => {
  const [stops, links] = await Promise.all([listStops(), listStopLinks()])
  return { stops, links }
}
