import * as z from 'zod/mini';

import type { LngLat } from '@/shared/utils/geo';

import { marksOf } from './contribution-events';
import { requireSupabase } from './supabase';

/** How far back the Contributors map looks, in days. */
export const CONTRIBUTION_PERIODS = [7, 30, 90] as const;
export type ContributionPeriod = (typeof CONTRIBUTION_PERIODS)[number];

/** The newest this many in a period: the map never asks for a whole table. */
export const CONTRIBUTION_LIMIT = 500;

const lngLat = (lng: number, lat: number): LngLat => [lng, lat];

const lineSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(z.tuple([z.number(), z.number()])),
});

const contributionRowSchema = z.pipe(
  z.object({
    id: z.string(),
    contributor_id: z.nullable(z.string()),
    started_at: z.string(),
    ended_at: z.string(),
    received_at: z.string(),
    vehicle: z.nullable(z.string()),
    start_name: z.nullable(z.string()),
    end_name: z.nullable(z.string()),
    description: z.nullable(z.string()),
    distance_m: z.number(),
    moving_s: z.number(),
    standing_s: z.number(),
    lost_s: z.number(),
    point_count: z.number(),
    line: z.nullable(lineSchema),
    west: z.nullable(z.number()),
    south: z.nullable(z.number()),
    east: z.nullable(z.number()),
    north: z.nullable(z.number()),
    hidden_at: z.nullable(z.string()),
    hidden_note: z.nullable(z.string()),
  }),
  z.transform((row) => ({
    id: row.id,
    /** The phone's whole identity: for blocking it, never shown. */
    contributorId: row.contributor_id,
    /** The phone, as the studio shows it: the first six characters of its identity, never more. */
    phoneCode: row.contributor_id?.slice(0, 6) ?? null,
    startedAt: Date.parse(row.started_at),
    endedAt: Date.parse(row.ended_at),
    receivedAt: Date.parse(row.received_at),
    vehicle: row.vehicle,
    startName: row.start_name ?? '',
    endName: row.end_name ?? '',
    description: row.description ?? '',
    distanceM: row.distance_m,
    movingSeconds: row.moving_s,
    standingSeconds: row.standing_s,
    lostSeconds: row.lost_s,
    pointCount: row.point_count,
    line: row.line?.coordinates ?? null,
    box:
      row.west === null || row.south === null || row.east === null || row.north === null
        ? null
        : ([row.west, row.south, row.east, row.north] as const),
    /** When an editor hid it; hidden is not deleted, and Show again undoes it. */
    hiddenAt: row.hidden_at === null ? null : Date.parse(row.hidden_at),
    hiddenNote: row.hidden_note ?? '',
  })),
);
type ContributionRow = z.infer<typeof contributionRowSchema>;

export interface Contribution extends ContributionRow {
  /** The account's name, read from the contributor row; never the number or the email. */
  contributorName: string | null;
}

const LIST_COLUMNS =
  'id, contributor_id, started_at, ended_at, received_at, vehicle, start_name, end_name, description, distance_m, moving_s, standing_s, lost_s, point_count, line, west, south, east, north, hidden_at, hidden_note';

const NAME_BATCH = 100;

const contributorNamesSchema = z.array(z.object({ id: z.string(), name: z.nullable(z.string()) }));

/**
 * The names of the accounts behind some uploads: name only, the number and email are never asked
 * for. A failed read leaves the uploads unnamed rather than failing the list.
 */
async function fetchContributorNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  // In pieces: a request line holding hundreds of ids is longer than the server reads.
  for (let start = 0; start < ids.length; start += NAME_BATCH) {
    const { data, error } = await requireSupabase()
      .from('contributor')
      .select('id, name')
      .in('id', ids.slice(start, start + NAME_BATCH));
    if (error) {
      console.warn(`Contributor names could not be read: ${error.message}`);
      return new Map();
    }
    for (const { id, name } of contributorNamesSchema.parse(data)) {
      if (name) names.set(id, name);
    }
  }
  return names;
}

export interface ContributionList {
  contributions: Contribution[];
  /** Whether the period held more than the newest CONTRIBUTION_LIMIT. */
  isCut: boolean;
}

/**
 * The uploads received in the last `days`, newest first, the hidden ones only
 * when asked for. Editors only: anyone else reads none.
 */
export async function fetchContributions(
  days: ContributionPeriod,
  showHidden: boolean,
  now = Date.now(),
): Promise<ContributionList> {
  const since = new Date(now - days * 86_400_000).toISOString();
  const query = requireSupabase()
    .from('contribution')
    .select(LIST_COLUMNS)
    .gte('received_at', since);
  const { data, error } = await (showHidden ? query : query.is('hidden_at', null))
    .order('received_at', { ascending: false })
    .order('id')
    .limit(CONTRIBUTION_LIMIT + 1);
  if (error) throw new Error(`Uploads could not be read: ${error.message}`);
  const allRows = z.array(contributionRowSchema).parse(data);
  const rows = allRows.slice(0, CONTRIBUTION_LIMIT);
  const ids = [...new Set(rows.flatMap((row) => (row.contributorId ? [row.contributorId] : [])))];
  const names = await fetchContributorNames(ids);
  return {
    contributions: rows.map((row) => ({
      ...row,
      contributorName: (row.contributorId && names.get(row.contributorId)) || null,
    })),
    isCut: allRows.length > CONTRIBUTION_LIMIT,
  };
}

const batchSchema = z.object({
  seq: z.number(),
  first_at: z.string(),
  first_lat: z.number(),
  first_lng: z.number(),
  dt_ms: z.array(z.number()),
  dlat: z.array(z.number()),
  dlng: z.array(z.number()),
});
type Batch = z.infer<typeof batchSchema>;

const hintoSchema = z.pipe(
  z.object({
    seq: z.number(),
    started_at: z.string(),
    seconds: z.number(),
    lat: z.number(),
    lng: z.number(),
  }),
  z.transform((h) => ({
    seq: h.seq,
    startedAt: Date.parse(h.started_at),
    seconds: h.seconds,
    at: lngLat(h.lng, h.lat),
  })),
);
export type ContributionHinto = z.infer<typeof hintoSchema>;

export interface TrailPoint {
  time: number;
  at: LngLat;
}

/** The points the phone sent, back in degrees and milliseconds: each batch starts absolute, the rest are steps. */
export function decodeTrail(batches: readonly Batch[]): TrailPoint[] {
  return [...batches]
    .sort((a, b) => a.seq - b.seq)
    .flatMap((batch) => {
      let time = Date.parse(batch.first_at);
      let lat = batch.first_lat;
      let lng = batch.first_lng;
      return batch.dt_ms.map((dt, i) => {
        if (i > 0) {
          time += dt;
          lat += batch.dlat[i] ?? 0;
          lng += batch.dlng[i] ?? 0;
        }
        return { time, at: lngLat(lng / 1e6, lat / 1e6) };
      });
    });
}

export interface ContributionDetail {
  trail: TrailPoint[];
  hintos: ContributionHinto[];
  /** The times the contributor pressed Mark, oldest first; each is placed on the trail by its time. */
  marks: number[];
}

/** One upload's whole trail, its hintos and its marks. */
export async function fetchContributionDetail(id: string): Promise<ContributionDetail> {
  const client = requireSupabase();
  const [batches, hintos, events] = await Promise.all([
    client
      .from('point_batch')
      .select('seq, first_at, first_lat, first_lng, dt_ms, dlat, dlng')
      .eq('contribution_id', id)
      .order('seq'),
    client
      .from('hinto')
      .select('seq, started_at, seconds, lat, lng')
      .eq('contribution_id', id)
      .order('seq'),
    client.from('contribution').select('id, events').eq('id', id),
  ]);
  if (batches.error) throw new Error(`The trail could not be read: ${batches.error.message}`);
  if (hintos.error) throw new Error(`The hintos could not be read: ${hintos.error.message}`);
  if (events.error) throw new Error(`The marks could not be read: ${events.error.message}`);
  return {
    trail: decodeTrail(z.array(batchSchema).parse(batches.data)),
    hintos: z.array(hintoSchema).parse(hintos.data),
    marks: marksOf(events.data[0]?.events),
  };
}
