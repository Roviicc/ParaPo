import {
  firstTouchIndex,
  ringCentroid,
  ringToPolygon,
  type Ring,
} from '@/features/routes/geo/ring';
import {
  normaliseName,
  type PointGeoJSON,
  type HotspotKind,
  type HotspotLink,
  type HotspotRow,
} from '@/features/routes/model/hotspots';
import { directionLine, type DirectionRow } from '@/features/routes/model/routes';
import { hintuansAlong } from '@/features/routes/model/timeline';
import { roundLngLat } from '@/shared/utils/geo';

import { linksThrough } from './hotspots-geometry';
import { readAll } from './read-all';
import { requireSupabase } from './supabase';

const blankToNull = (s: string) => (s.trim() === '' ? null : s.trim());

export interface SaveStopInput {
  stopId: string | null;
  kind: HotspotKind;
  /** What is written on the ground. Required. */
  name: string;
  /** What people say. Blank means "the same as the name". */
  informal: string;
  /** Other names for the same place, already split and cleaned (parseAliases). */
  aliases: string[];
  note: string;
  ring: Ring;
  /** Terminal only: the directions the owner ticked. Ignored for a hintuan. */
  directionIds?: string[];
  /** Every saved direction — needed to compute hintuan links and sequences. */
  directions: DirectionRow[];
}

/**
 * Create or update a hotspot and replace its route links. Writes require a
 * signed-in editor who owns the rows; RLS enforces it on both tables.
 *
 * Two steps, not one transaction, as a direction's save is (saveRoute.ts):
 * `onWritten` hears of the row the moment it is in, so a retry after the
 * links failed updates that row instead of inserting a second box on the
 * same ground (review of 2026-10-03, finding 4).
 */
export async function saveStop(
  input: SaveStopInput,
  onWritten?: (stopId: string) => void,
): Promise<HotspotRow> {
  const client = requireSupabase();
  if (input.ring.length < 3) throw new Error('A hotspot needs at least three corners');

  // Names are normalised here, not in the database: a stray double space
  // would otherwise make "SM  Fairview" a second group, and the terminal
  // uniqueness index (0007) compares what is stored.
  const name = normaliseName(input.name);
  const informal = normaliseName(input.informal);
  if (!name) throw new Error('A hotspot needs a name');
  // Six decimals, about 0.1 m, as a direction's points are saved: a traced
  // corner carried 15 or more, and the publish script rounded them anyway.
  const ring = input.ring.map(roundLngLat);
  const row = {
    name,
    informal: informal && informal.toLowerCase() !== name.toLowerCase() ? informal : null,
    aliases: input.aliases,
    kind: input.kind,
    note: blankToNull(input.note),
    area: ringToPolygon(ring),
    point: { type: 'Point', coordinates: roundLngLat(ringCentroid(ring)) } as PointGeoJSON,
  };

  const query = input.stopId
    ? client.from('stop').update(row).eq('id', input.stopId)
    : client.from('stop').insert(row);
  const { data, error } = await query.select('*').single();
  if (error) {
    // 0014 keys the index on the place, the informal name or else the
    // ground name; before it, a blank informal name slipped past (review of
    // 2026-10-03). The old name stays matched until the owner applies 0014.
    if (
      error.code === '23505' &&
      (error.message.includes('stop_terminal_place_unique') ||
        error.message.includes('stop_terminal_informal_unique'))
    ) {
      throw new Error(
        `There is already a terminal at "${informal || name}". A place has one terminal; draw the others as hintuans under the same name.`,
      );
    }
    throw new Error(error.message);
  }
  const hotspot = data as HotspotRow;
  onWritten?.(hotspot.id);

  // Links: computed for a hintuan, chosen for a terminal. Either way the
  // sequence is where the direction first meets the outline (0 when a ticked
  // terminal route never actually enters it — still a valid, ordered link).
  const byId = new Map(input.directions.map((v) => [v.id, v]));
  const links: HotspotLink[] =
    input.kind === 'hintuan'
      ? linksThrough(ring, input.directions, hotspot.line ?? null).map((l) => ({
          route_variant_id: l.variantId,
          stop_id: hotspot.id,
          stop_sequence: l.sequence,
        }))
      : (input.directionIds ?? [])
          .filter((id) => byId.has(id))
          .map((id) => ({
            route_variant_id: id,
            stop_id: hotspot.id,
            stop_sequence: Math.max(0, firstTouchIndex(directionLine(byId.get(id)!), ring)),
          }));

  try {
    await replaceLinks(hotspot.id, links);
  } catch (err) {
    throw new Error(
      `The hotspot is saved, but its route links are not: ${err instanceof Error ? err.message : String(err)}. ` +
        'Press Save again to retry.',
    );
  }
  return hotspot;
}

/** Replace every link for one hotspot with the given set. */
async function replaceLinks(stopId: string, links: HotspotLink[]) {
  const client = requireSupabase();
  const del = await client.from('route_stop').delete().eq('stop_id', stopId);
  if (del.error) throw new Error(del.error.message);
  if (links.length === 0) return;
  const ins = await client.from('route_stop').insert(links);
  if (ins.error) throw new Error(ins.error.message);
}

/**
 * Delete one hotspot. Its links go with it (route_stop cascades). A delete
 * RLS will not let through is not an error to PostgREST, only no rows: the
 * rows are read back, and none is said (review of 2026-10-03, finding 6).
 */
export async function deleteStop(hotspot: HotspotRow): Promise<void> {
  const { data, error } = await requireSupabase()
    .from('stop')
    .delete()
    .eq('id', hotspot.id)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(NOTHING_CHANGED);
}

/** What a write that matched no row says: the session ended, or the row is not this account's. */
export const NOTHING_CHANGED =
  'Nothing was changed: the session may have ended, or this is not yours to change. Sign in again and retry.';

/**
 * Keep every hintuan's list honest after a direction is saved: link it to each
 * hintuan it now passes under, unlink it from each it no longer does. Terminal
 * links are the owner's and are never touched here.
 */
export async function syncHintuanLinks(direction: DirectionRow): Promise<void> {
  const client = requireSupabase();
  // Paged, as every table read is (readAll.ts): past 1,000 hintuans one
  // request would silently see a subset (review finding 4).
  const [hintuans, linked] = await Promise.all([
    readAll<HotspotRow>((from, to) =>
      client
        .from('stop')
        .select('*', { count: 'exact' })
        .eq('kind', 'hintuan')
        .not('area', 'is', null)
        .order('id')
        .range(from, to),
    ),
    // This direction's links as they stand: one small request.
    readAll<{ stop_id: string }>((from, to) =>
      client
        .from('route_stop')
        .select('stop_id', { count: 'exact' })
        .eq('route_variant_id', direction.id)
        .order('stop_id')
        .range(from, to),
    ),
  ]);
  if (hintuans.length === 0) return;

  // The same rule the save panel showed before Save was pressed. A link to a
  // hintuan this route does not stop at (servedBy) is one it no longer earns.
  const along = hintuansAlong(directionLine(direction), hintuans, direction.route);
  const keep: HotspotLink[] = along.map(({ hotspot, index }) => ({
    route_variant_id: direction.id,
    stop_id: hotspot.id,
    stop_sequence: index,
  }));
  const kept = new Set(keep.map((k) => k.stop_id));
  // Only the hintuan links this direction has and no longer earns — usually
  // none. It once listed every hintuan the line does not pass, a request line
  // that grows with the map past what the gateway accepts (finding 4).
  const isHintuan = new Set(hintuans.map((h) => h.id));
  const drop = linked.map((l) => l.stop_id).filter((id) => isHintuan.has(id) && !kept.has(id));

  if (drop.length > 0) {
    const del = await client
      .from('route_stop')
      .delete()
      .eq('route_variant_id', direction.id)
      .in('stop_id', drop);
    if (del.error) throw new Error(del.error.message);
  }
  if (keep.length > 0) {
    const up = await client
      .from('route_stop')
      .upsert(keep, { onConflict: 'route_variant_id,stop_id' });
    if (up.error) throw new Error(up.error.message);
  }
}
