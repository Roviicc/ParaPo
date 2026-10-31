import { keptFixes, mergeGaps, summarize, type Fix } from '@/features/routes/model/ride-recording';
import { overviewOf, type LngLat } from '@/shared/utils/geo';

import type { ContributionPayload, PointBatch } from './contribution-payload-schema';
import { uploadedFare } from './upload-fare';
import { walkRideSplit } from './walk-ride-split';
import { UPLOAD_LIMITS } from '../recorder/recording-limits';
import { marksThatFit } from '../recorder/recording-marks';
import { RECORDING_VERSION, type Recording, type RideKind } from '../storage/recording-schema';

/**
 * The rules that made the totals, the hintos and the line; bump when ride-recording.ts changes them.
 * 2 counts hintos only while on ride.
 */
export const RULES_VERSION = 2;

/** The Philippines, as the database checks it. */
const BOX = { south: 4, north: 22, west: 116, east: 127 } as const;
const MICRO = 1e6;
/** Metres per millionth of a degree of latitude, as the database measures. */
const M_PER_MICRO = 0.11132;

/** Why a recording cannot be uploaded at all, whatever the signal. */
export type PackRefusal = 'too-long' | 'line-too-large';

export type PackResult =
  | { ok: true; payload: ContributionPayload; droppedPoints: number }
  | { ok: false; reason: PackRefusal };

/** The vehicles the database's contribution check takes, by the name the phone keeps. */
export const VEHICLE_OF = {
  Jeep: 'jeep',
  'E-Jeep': 'e_jeep',
  'UV Express': 'uv_express',
  Bus: 'bus',
  Train: 'train',
  Ferry: 'ferry',
  Tricycle: 'tricycle',
  Other: 'other',
} as const satisfies Record<RideKind, string>;

const iso = (ms: number): string => new Date(ms).toISOString();
const inBox = (lat: number, lng: number): boolean =>
  lat >= BOX.south && lat <= BOX.north && lng >= BOX.west && lng <= BOX.east;

interface MicroPoint {
  time: number;
  lat: number;
  lng: number;
  accuracyM: number;
}

/**
 * The fixes the database will take, in whole millionths of a degree: inside the
 * Philippines, each after the one before, none faster than the limit from the
 * last one kept. Measured as the database measures, so what passes here passes there.
 */
function acceptedPoints(fixes: readonly Fix[]): MicroPoint[] {
  const points: MicroPoint[] = [];
  for (const fix of [...fixes].sort((a, b) => a.time - b.time)) {
    const [lng, lat] = fix.at;
    if (!inBox(lat, lng)) continue;
    const point = {
      time: Math.round(fix.time),
      lat: Math.round(lat * MICRO),
      lng: Math.round(lng * MICRO),
      accuracyM: Math.min(32_767, Math.max(0, Math.round(fix.accuracyM))),
    };
    const last = points[points.length - 1];
    if (last) {
      const seconds = (point.time - last.time) / 1000;
      if (seconds <= 0) continue;
      const cos = Math.cos(((point.lat / MICRO) * Math.PI) / 180);
      const metres = M_PER_MICRO * Math.hypot(point.lat - last.lat, (point.lng - last.lng) * cos);
      if (metres / seconds > UPLOAD_LIMITS.speedKmh / 3.6) continue;
    }
    points.push(point);
  }
  return points;
}

/**
 * At most `limit` of the points, evenly spaced through the ride, the first and the last always
 * among them: a ride with more fixes than the database keeps (one a second for over four hours)
 * goes up thinned rather than not at all. Leaving points out only lengthens the step between two
 * kept ones, so none of them is faster than the limit.
 */
function thinnedPoints(points: readonly MicroPoint[], limit: number): MicroPoint[] {
  if (points.length <= limit) return [...points];
  const step = (points.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => points[Math.round(index * step)]);
}

function batchesOf(points: readonly MicroPoint[]): PointBatch[] {
  const batches: PointBatch[] = [];
  for (let start = 0; start < points.length; start += UPLOAD_LIMITS.pointsPerBatch) {
    const slice = points.slice(start, start + UPLOAD_LIMITS.pointsPerBatch);
    const first = slice[0];
    if (!first) break;
    batches.push({
      seq: batches.length,
      first_at: iso(first.time),
      first_lat: first.lat,
      first_lng: first.lng,
      point_count: slice.length,
      dt_ms: slice.map((p, i) => (i === 0 ? 0 : p.time - (slice[i - 1]?.time ?? p.time))),
      dlat: slice.map((p, i) => (i === 0 ? 0 : p.lat - (slice[i - 1]?.lat ?? p.lat))),
      dlng: slice.map((p, i) => (i === 0 ? 0 : p.lng - (slice[i - 1]?.lng ?? p.lng))),
      accuracy_m: slice.map((p) => p.accuracyM),
    });
  }
  return batches;
}

function boxOf(
  line: readonly LngLat[],
): Pick<ContributionPayload, 'west' | 'south' | 'east' | 'north'> {
  if (line.length === 0) return { west: null, south: null, east: null, north: null };
  const lngs = line.map(([lng]) => lng);
  const lats = line.map(([, lat]) => lat);
  return {
    west: Math.min(...lngs),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    north: Math.max(...lats),
  };
}

/**
 * A saved recording in the shape the database stores, or why it can never be
 * stored. Pure: the same recording and fixes always pack the same way, apart
 * from `sentAt`, so a retry sends the same contribution.
 */
export function packRecording(
  recording: Recording,
  fixes: readonly Fix[],
  consentVersion: number,
  sentAt: number,
): PackResult {
  const ended = Math.max(
    recording.stoppedAt ?? recording.savedAt ?? recording.startedAt,
    recording.startedAt + 1000,
  );
  if (ended - recording.startedAt > UPLOAD_LIMITS.hours * 3_600_000) {
    return { ok: false, reason: 'too-long' };
  }
  const points = thinnedPoints(acceptedPoints(fixes), UPLOAD_LIMITS.points);

  const summary = summarize(fixes, recording.gaps, recording.startedAt, ended, recording.modes);
  const distanceM = Math.round(summary.distanceM);
  const movingS = Math.round(summary.movingSeconds);
  const standingS = Math.round(summary.standingSeconds);
  const paused = recording.gaps.filter((g) => g.reasons.includes('paused'));
  const split = walkRideSplit(
    fixes,
    mergeGaps([...summary.gaps, ...paused]),
    recording.startedAt,
    ended,
    recording.modes,
  );
  // Walk is rounded and ride is the rest, so the two add up to the totals exactly.
  const walkM = Math.min(Math.round(split.walkM), distanceM);
  const walkS = Math.min(Math.round(split.walkSeconds), movingS + standingS);
  const kept = keptFixes(fixes).filter(({ at: [lng, lat] }) => inBox(lat, lng));
  const thinned = overviewOf(kept.map((fix) => fix.at));
  const line = thinned.length >= 2 ? { type: 'LineString' as const, coordinates: thinned } : null;
  if (line && JSON.stringify(line).length > UPLOAD_LIMITS.lineBytes) {
    return { ok: false, reason: 'line-too-large' };
  }

  // The mode it started on and every switch: a contribution with none is all ride.
  const modes = recording.modes.map((m) => ({ time: m.time, kind: 'mode', to: m.to }));
  // The start, stop and save always go in, so marks are what yields to the limit.
  const marks = marksThatFit(recording.marks ?? [], modes.length + 3).map((m) => ({
    time: m.time,
    kind: 'mark',
  }));
  // Array.sort is stable: a mode and a mark at the same millisecond keep that order.
  const between = [...modes, ...marks]
    .sort((a, b) => a.time - b.time)
    .map(({ time, kind, ...rest }) => ({ kind, at: iso(time), ...rest }));
  const tail = [
    ...(recording.stoppedAt === null ? [] : [{ kind: 'stop', at: iso(recording.stoppedAt) }]),
    ...(recording.savedAt === null ? [] : [{ kind: 'save', at: iso(recording.savedAt) }]),
  ];
  // The start, stop and save go in whatever else is cut: past the limit, the latest between them go.
  const fare = uploadedFare(recording.farePhp);
  const events = [
    { kind: 'start', at: iso(recording.startedAt) },
    ...between.slice(0, UPLOAD_LIMITS.listEntries - 1 - tail.length),
    ...tail,
  ];

  return {
    ok: true,
    droppedPoints: fixes.length - points.length,
    payload: {
      id: recording.id,
      format_version: RECORDING_VERSION,
      rules_version: RULES_VERSION,
      consent_version: consentVersion,
      started_at: iso(recording.startedAt),
      ended_at: iso(ended),
      sent_at: iso(sentAt),
      vehicle: recording.rideKind === null ? null : VEHICLE_OF[recording.rideKind],
      start_name: recording.startPointName.trim().slice(0, UPLOAD_LIMITS.nameLength),
      end_name: recording.endPointName.trim().slice(0, UPLOAD_LIMITS.nameLength),
      description: recording.description.trim().slice(0, UPLOAD_LIMITS.descriptionLength),
      distance_m: distanceM,
      moving_s: movingS,
      standing_s: standingS,
      lost_s: Math.round(summary.lostSeconds),
      walk_m: walkM,
      ride_m: distanceM - walkM,
      walk_s: walkS,
      ride_s: movingS + standingS - walkS,
      // Only with a fare: a ride without one goes up as it always has, the column left null.
      ...(fare === null ? {} : { fare_php: fare }),
      point_count: points.length,
      events,
      gaps: summary.gaps
        .slice(0, UPLOAD_LIMITS.listEntries)
        .map((g) => ({ from: iso(g.from), to: iso(g.to), reasons: [...g.reasons] })),
      line,
      ...boxOf(thinned),
      batches: batchesOf(points),
      hintos: summary.hintos
        .filter(({ at: [lng, lat] }) => inBox(lat, lng))
        .slice(0, UPLOAD_LIMITS.hintos)
        .map((h, seq) => ({
          seq,
          started_at: iso(h.from),
          seconds: Math.min(21_600, Math.max(1, Math.round((h.to - h.from) / 1000))),
          lat: h.at[1],
          lng: h.at[0],
        })),
    },
  };
}
