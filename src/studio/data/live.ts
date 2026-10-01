import { nameVariants, type LineStringGeoJSON, type UnnamedVariantRow, type VariantDrawing, type VariantRow } from '../../shared/model/routes'
import type { StopLink, StopRow } from '../../shared/model/stops'
import { getSupabase } from './supabase'
import { readAll, type Page } from './readAll'

/**
 * Readers of the live tables, for the editor. They live in studio/, apart
 * from the types in shared/model/routes.ts and shared/model/stops.ts, on
 * purpose: the public map imports those types but reads the published file
 * instead (commuter/mapFile.ts), and check-boundaries.mjs forbids commuter/
 * importing studio/. So Supabase's address can never land in a chunk both pages share;
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
//
// `overview`, not `shape` (0009, 2026-09-29): the line thinned at 5 m, about
// a quarter of it. The list draws it and a tap finds it; a direction's full
// line is read when it is lit or opened (lineOf, withDrawing), and before a
// hotspot's links are worked out (linesOf). `shape` stayed in the list until
// then, 15–27 MB of it at a thousand directions.
//
// `signboards` (0010, 2026-10-01): a few file names, for the trip card's
// Signboard and the editor's own (SignboardEditor).
export const VARIANT_SELECT =
  'id, route_id, owner_id, direction_name, origin_terminal, destination_terminal, overview, reversed, confidence, updated_at, borrowed_from, borrowed_part, borrowed_m, signboards, route:route(*)'
/** The list as it was before 0009, for a database it has not reached yet. */
const VARIANT_SELECT_BEFORE_0009 = VARIANT_SELECT.replace('overview', 'shape')

/** The rest of a direction: its drawing, and its full line. */
const DRAWING_SELECT = 'control_points, segments, shape'

/** A row as the list reads it: its overview where its line will go. */
type ListedRow = Omit<UnnamedVariantRow, 'shape'> & { overview?: LineStringGeoJSON | null; shape?: LineStringGeoJSON | null }

/** Postgres's words for `overview` on a database 0009 has not reached (42703; readAll keeps the message). */
const NO_OVERVIEW = /\boverview\b.*does not exist/

/**
 * Every saved direction of every route, with the generated names filled in
 * from the hotspots at each route's ends. Public: RLS allows anyone to read.
 */
export async function listVariants(): Promise<VariantRow[]> {
  const client = getSupabase()
  if (!client) return []
  // The client reads a row type off the select and guesses the embedded
  // route as a list; the foreign key makes it one row. Cast, as the save does.
  const list = (select: string) =>
    readAll<ListedRow>((from, to) =>
      client
        .from('route_variant')
        .select(select, { count: 'exact' })
        .order('updated_at', { ascending: false })
        .order('id')
        .range(from, to)
        .then((r) => r as unknown as Page<ListedRow>),
    )
  const [listed, stops] = await Promise.all([
    list(VARIANT_SELECT).catch((e: unknown) => {
      if (!(e instanceof Error && NO_OVERVIEW.test(e.message))) throw e
      return list(VARIANT_SELECT_BEFORE_0009)
    }),
    listStops(),
  ])
  // A drawn row saved before 0009 and not backfilled has no overview yet: its
  // full line stands in, read for those rows alone.
  const missing = listed.some((r) => r.overview === null) ? await unsummarised() : new Map<string, LineStringGeoJSON>()
  const rows = listed.map(({ overview, shape, ...r }) => ({ ...r, shape: overview ?? shape ?? missing.get(r.id) ?? null }))
  return nameVariants(rows as UnnamedVariantRow[], stops)
}

/** The full lines of the drawn rows that have no overview yet, by id. */
async function unsummarised(): Promise<Map<string, LineStringGeoJSON>> {
  const client = getSupabase()
  if (!client) return new Map()
  const rows = await readAll<{ id: string; shape: LineStringGeoJSON | null }>((from, to) =>
    client
      .from('route_variant')
      .select('id, shape', { count: 'exact' })
      .is('overview', null)
      .not('shape', 'is', null)
      .order('id')
      .range(from, to),
  )
  return new Map(rows.filter((r) => r.shape).map((r) => [r.id, r.shape!]))
}

/** One direction's full line: what the list's overview stands for. */
export async function lineOf(id: string): Promise<LineStringGeoJSON | null> {
  const client = getSupabase()
  if (!client) return null
  const { data, error } = await client.from('route_variant').select('shape').eq('id', id).single()
  if (error) throw new Error(error.message)
  return (data as { shape: LineStringGeoJSON | null }).shape
}

/** How many ids one read of full lines names: its request line stays short (finding 4). */
const LINES_PER_READ = 50

/**
 * These directions with their full lines: the few a hotspot's outline
 * reaches, before its links are worked out on them, read LINES_PER_READ at
 * a time. A stop's `stop_sequence` is an index into the full line, so an
 * overview must never be what it is counted on.
 */
export async function linesOf<T extends VariantRow>(variants: readonly T[]): Promise<T[]> {
  const client = getSupabase()
  if (!client || variants.length === 0) return [...variants]
  const ids = variants.map((v) => v.id)
  const reads = []
  for (let i = 0; i < ids.length; i += LINES_PER_READ) {
    reads.push(client.from('route_variant').select('id, shape').in('id', ids.slice(i, i + LINES_PER_READ)))
  }
  const byId = new Map<string, LineStringGeoJSON | null>()
  for (const { data, error } of await Promise.all(reads)) {
    if (error) throw new Error(error.message)
    for (const r of data as { id: string; shape: LineStringGeoJSON | null }[]) byId.set(r.id, r.shape)
  }
  return variants.map((v) => ({ ...v, shape: byId.has(v.id) ? (byId.get(v.id) ?? null) : v.shape }))
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
  const d = data as { control_points: unknown; segments: unknown; shape: LineStringGeoJSON | null }
  return {
    ...v,
    shape: d.shape,
    control_points: Array.isArray(d.control_points) ? (d.control_points as VariantDrawing['control_points']) : [],
    segments: Array.isArray(d.segments) ? (d.segments as VariantDrawing['segments']) : [],
  }
}

/**
 * Every hotspot, in full. Public: RLS allows anyone to read.
 *
 * Both hooks load at once — the directions need the hotspots to name
 * themselves, the hotspots hook needs them to draw — and each used to read
 * the whole table (review finding 6: two reads a load, four under
 * StrictMode). A read already in flight is shared; the next load, after it
 * settles, reads afresh.
 */
let stopsInFlight: Promise<StopRow[]> | null = null
function listStops(): Promise<StopRow[]> {
  const client = getSupabase()
  if (!client) return Promise.resolve([])
  if (stopsInFlight) return stopsInFlight
  const read = readAll<StopRow>((from, to) =>
    client
      .from('stop')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
  stopsInFlight = read
  const settle = () => {
    if (stopsInFlight === read) stopsInFlight = null
  }
  read.then(settle, settle)
  return read
}

/** Every hotspot ↔ direction link. Public read. */
async function listStopLinks(): Promise<StopLink[]> {
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
