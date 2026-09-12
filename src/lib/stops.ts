import {
  entryDistance,
  firstTouchIndex,
  polygonToRing,
  ringCentroid,
  ringToPolygon,
  type LngLat,
  type Ring,
} from './geo'
import { variantLine, type VariantRow } from './routes'
import { supabase, supabaseConfigError } from './supabase'

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

function requireClient() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured')
  return supabase
}

const blankToNull = (s: string) => (s.trim() === '' ? null : s.trim())

/** The polygon corners of a saved hotspot. */
export function stopRing(s: StopRow): Ring {
  return polygonToRing(s.area)
}

// ------------------------------------------------------------------- reads

/** Every hotspot. Public: RLS allows anyone to read. */
export async function listStops(): Promise<StopRow[]> {
  const { data, error } = await requireClient()
    .from('stop')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as StopRow[]
}

/** Every hotspot ↔ direction link. Public read. */
export async function listStopLinks(): Promise<StopLink[]> {
  const { data, error } = await requireClient()
    .from('route_stop')
    .select('route_variant_id, stop_id, stop_sequence')
  if (error) throw new Error(error.message)
  return (data ?? []) as StopLink[]
}

// ---------------------------------------------------------------- geometry
//
// Pure functions, so they can be unit-tested and so the save panel can show
// exactly what a save will write before it writes it.

/**
 * Which directions pass under this outline, and where along each one. This
 * is a hintuan's whole route list: the polygon decides, nothing else.
 */
export function linksThrough(
  ring: Ring,
  variants: VariantRow[],
): { variantId: string; sequence: number }[] {
  const out: { variantId: string; sequence: number }[] = []
  for (const v of variants) {
    const idx = firstTouchIndex(variantLine(v), ring)
    if (idx >= 0) out.push({ variantId: v.id, sequence: idx })
  }
  return out
}

/** How far into a route "starts here" still holds, in metres. */
const STARTS_WITHIN_M = 100

/**
 * Directions that begin at this outline — the pre-ticked suggestion for a
 * terminal. The owner adjusts from there.
 *
 * "Begins at" means the route touches the outline within its first 100 m,
 * not that its very first vertex is inside: a hand-traced corner is often a
 * metre or two off the road, and the first real terminal traced (Tala) had
 * the route start 20 cm outside its outline.
 */
export function variantsStartingIn(ring: Ring, variants: VariantRow[]): string[] {
  return variants
    .filter((v) => {
      const d = entryDistance(variantLine(v), ring)
      return d >= 0 && d <= STARTS_WITHIN_M
    })
    .map((v) => v.id)
}

// ------------------------------------------------------------------ writes

export type SaveStopInput = {
  stopId: string | null
  kind: StopKind
  name: string
  note: string
  ring: Ring
  /** Terminal only: the directions the owner ticked. Ignored for a hintuan. */
  variantIds?: string[]
  /** Every saved direction — needed to compute hintuan links and sequences. */
  variants: VariantRow[]
}

/**
 * Create or update a hotspot and replace its route links. Writes require a
 * signed-in owner; RLS enforces it on both tables.
 */
export async function saveStop(input: SaveStopInput): Promise<StopRow> {
  const client = requireClient()
  if (input.ring.length < 3) throw new Error('A hotspot needs at least three corners')

  const row = {
    name: input.name.trim(),
    kind: input.kind,
    note: blankToNull(input.note),
    area: ringToPolygon(input.ring),
    point: { type: 'Point', coordinates: ringCentroid(input.ring) } as PointGeoJSON,
  }

  const query = input.stopId
    ? client.from('stop').update(row).eq('id', input.stopId)
    : client.from('stop').insert(row)
  const { data, error } = await query.select('*').single()
  if (error) throw new Error(error.message)
  const stop = data as StopRow

  // Links: computed for a hintuan, chosen for a terminal. Either way the
  // sequence is where the direction first meets the outline (0 when a ticked
  // terminal route never actually enters it — still a valid, ordered link).
  const byId = new Map(input.variants.map((v) => [v.id, v]))
  const links: StopLink[] =
    input.kind === 'hintuan'
      ? linksThrough(input.ring, input.variants).map((l) => ({
          route_variant_id: l.variantId,
          stop_id: stop.id,
          stop_sequence: l.sequence,
        }))
      : (input.variantIds ?? [])
          .filter((id) => byId.has(id))
          .map((id) => ({
            route_variant_id: id,
            stop_id: stop.id,
            stop_sequence: Math.max(0, firstTouchIndex(variantLine(byId.get(id)!), input.ring)),
          }))

  await replaceLinks(stop.id, links)
  return stop
}

/** Replace every link for one hotspot with the given set. */
async function replaceLinks(stopId: string, links: StopLink[]) {
  const client = requireClient()
  const del = await client.from('route_stop').delete().eq('stop_id', stopId)
  if (del.error) throw new Error(del.error.message)
  if (links.length === 0) return
  const ins = await client.from('route_stop').insert(links)
  if (ins.error) throw new Error(ins.error.message)
}

/** Delete one hotspot. Its links go with it (route_stop cascades). */
export async function deleteStop(stop: StopRow): Promise<void> {
  const { error } = await requireClient().from('stop').delete().eq('id', stop.id)
  if (error) throw new Error(error.message)
}

/**
 * Keep every hintuan's list honest after a direction is saved: link it to each
 * hintuan it now passes under, unlink it from each it no longer does. Terminal
 * links are the owner's and are never touched here.
 */
export async function syncHintuanLinks(variant: VariantRow): Promise<void> {
  const client = requireClient()
  const { data, error } = await client
    .from('stop')
    .select('*')
    .eq('kind', 'hintuan')
    .not('area', 'is', null)
  if (error) throw new Error(error.message)
  const hintuans = (data ?? []) as StopRow[]
  if (hintuans.length === 0) return

  const line = variantLine(variant)
  const keep: StopLink[] = []
  const drop: string[] = []
  for (const h of hintuans) {
    const idx = firstTouchIndex(line, stopRing(h))
    if (idx >= 0) keep.push({ route_variant_id: variant.id, stop_id: h.id, stop_sequence: idx })
    else drop.push(h.id)
  }

  if (drop.length > 0) {
    const del = await client
      .from('route_stop')
      .delete()
      .eq('route_variant_id', variant.id)
      .in('stop_id', drop)
    if (del.error) throw new Error(del.error.message)
  }
  if (keep.length > 0) {
    const up = await client
      .from('route_stop')
      .upsert(keep, { onConflict: 'route_variant_id,stop_id' })
    if (up.error) throw new Error(up.error.message)
  }
}
