import type { LngLat } from '@/shared/utils/geo';

/*
 * The rules for a ride recorded on a phone: which fixes count, how far the
 * ride went, where it stood, and how much time the phone lost. Pure, with no
 * React and no browser API, so the contribute page and the studio apply the
 * same rules and a unit test can pin them.
 *
 * Nothing here imports shared/utils/geo at run time (only its LngLat type):
 * that module sits in the build's shared chunk, which carries MapLibre, and a
 * contributor's phone should not download a map to record a ride. The distance
 * below is geo.ts's haversine written out again, and a unit test holds the two
 * together.
 */

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two [lng, lat] points. */
export function distanceM([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** One location fix as the phone reported it. */
export interface Fix {
  /** When the phone took the fix, in milliseconds since the epoch. */
  time: number;
  at: LngLat;
  /** The phone's own estimate of the error, in metres. */
  accuracyM: number;
}

/**
 * Why a stretch of time has no fixes. `paused` is the contributor's own Stop
 * and Resume, which is not the phone's fault and is left out of the lost time.
 */
export type GapReason = 'hidden' | 'silent' | 'resumed' | 'paused';

/** A stretch of time the phone did not record, in milliseconds since the epoch. */
export interface Gap {
  from: number;
  to: number;
  /** Every reason that fell in this stretch, once merged. */
  reasons: readonly GapReason[];
}

/** Standing in one place: a hinto, the owner's word for a stop made during the ride. */
export interface Hinto {
  from: number;
  to: number;
  at: LngLat;
}

/** A fix implying more than this speed is a jump in the phone's position, not a vehicle. */
export const MAX_SPEED_KMH = 120;
/** A fix less certain than this is too vague to place the ride. */
export const MAX_ACCURACY_M = 50;
/** Standing this long within HINTO_RADIUS_M of where it began is a hinto. */
export const HINTO_MIN_SECONDS = 8;
export const HINTO_RADIUS_M = 25;
/** No fix for longer than this is a gap: the phone normally reports about once a second. */
export const SILENCE_SECONDS = 5;
/** Fixes that are all too fast for the last one that counted, but agree with each other, start a new anchor. */
export const REANCHOR_AFTER = 3;

const byTime = (a: Fix, b: Fix): number => a.time - b.time;

function speedKmh(from: Fix, to: Fix): number {
  return (distanceM(from.at, to.at) / ((to.time - from.time) / 1000)) * 3.6;
}

/**
 * The fixes that count, in time order: each is accurate enough, and implies no
 * more than MAX_SPEED_KMH from the last one that counted. A fix that is ignored
 * does not become the point the next is measured from, with one exception: if
 * the first fixes were wrong, every later one would look like a jump, so
 * REANCHOR_AFTER fast fixes in a row that agree with each other (each implies
 * no more than MAX_SPEED_KMH from the one before) are taken as the true
 * position, and the few fixes before them, which they contradict, are dropped.
 */
export function keptFixes(fixes: readonly Fix[]): Fix[] {
  let kept: Fix[] = [];
  let pending: Fix[] = [];
  for (const fix of [...fixes].sort(byTime)) {
    if (fix.accuracyM > MAX_ACCURACY_M) continue;
    const last = kept[kept.length - 1];
    if (last && fix.time <= last.time) continue;
    if (!last || speedKmh(last, fix) <= MAX_SPEED_KMH) {
      kept.push(fix);
      pending = [];
      continue;
    }
    const before = pending[pending.length - 1];
    pending = before && speedKmh(before, fix) <= MAX_SPEED_KMH ? [...pending, fix] : [fix];
    if (pending.length >= REANCHOR_AFTER) {
      if (kept.length < REANCHOR_AFTER) kept = [];
      kept.push(...pending);
      pending = [];
    }
  }
  return kept;
}

/**
 * The length of the path through these fixes, in metres. Across a gap the
 * straight line counts. Within a hinto it does not: standing still, the phone's
 * position wanders a few metres, and every wander is a leg that would add up.
 */
export function pathLengthM(fixes: readonly Fix[], hintos: readonly Hinto[] = []): number {
  const inside = (fix: Fix) => hintos.find((h) => fix.time >= h.from && fix.time <= h.to);
  let total = 0;
  for (let i = 1; i < fixes.length; i++) {
    const was = inside(fixes[i - 1]);
    if (was && was === inside(fixes[i])) continue;
    total += distanceM(fixes[i - 1].at, fixes[i].at);
  }
  return total;
}

/** Hintos that touch, or are no more than SILENCE_SECONDS apart, joined into one. */
function mergeHintos(hintos: readonly Hinto[]): Hinto[] {
  const merged: Hinto[] = [];
  for (const hinto of hintos) {
    const last = merged[merged.length - 1];
    if (last && (hinto.from - last.to) / 1000 <= SILENCE_SECONDS) {
      merged[merged.length - 1] = { ...last, to: Math.max(last.to, hinto.to) };
    } else {
      merged.push(hinto);
    }
  }
  return merged;
}

/**
 * Where the ride stood: each run of fixes that stays within HINTO_RADIUS_M of
 * the run's first fix and lasts HINTO_MIN_SECONDS or more. Runs that touch, or
 * are a few seconds apart, are one hinto: a crawl is a string of short runs,
 * and a single wild fix splits a long stand in two. Expects fixes that count
 * (keptFixes), in time order.
 */
export function hintosOf(fixes: readonly Fix[]): Hinto[] {
  const hintos: Hinto[] = [];
  let start = 0;
  const close = (end: number) => {
    const first = fixes[start];
    const last = fixes[end];
    if (end > start && (last.time - first.time) / 1000 >= HINTO_MIN_SECONDS) {
      hintos.push({ from: first.time, to: last.time, at: first.at });
    }
  };
  for (let i = 1; i < fixes.length; i++) {
    if (distanceM(fixes[start].at, fixes[i].at) > HINTO_RADIUS_M) {
      close(i - 1);
      start = i;
    }
  }
  if (fixes.length > 0) close(fixes.length - 1);
  return mergeHintos(hintos);
}

/**
 * Stretches with no fixes. The silence clock starts at `from`, the start of the
 * recording, and again at the end of each `paused` gap (a Stop and Resume), and
 * runs to `now`: the end of the recording, or the present while it runs. So
 * the wait for the first fix counts, and so does a phone that never answers.
 * Every fix the phone reported counts, kept or not: the phone was answering.
 */
export function silentGaps(
  fixes: readonly Fix[],
  from: number,
  now: number,
  paused: readonly Gap[] = [],
): Gap[] {
  const gaps: Gap[] = [];
  const times = [...fixes].sort(byTime).map((f) => f.time);
  const pauses = mergeGaps(paused);
  // The stretches the recording was running: between the pauses.
  const runs: [number, number][] = [];
  let runStart = from;
  for (const pause of pauses) {
    if (pause.to <= runStart) continue;
    if (pause.from > runStart) runs.push([runStart, Math.min(pause.from, now)]);
    runStart = Math.max(runStart, pause.to);
  }
  if (runStart < now) runs.push([runStart, now]);
  for (const [runFrom, runTo] of runs) {
    let last = runFrom;
    const silent = (to: number) => {
      if ((to - last) / 1000 > SILENCE_SECONDS) gaps.push({ from: last, to, reasons: ['silent'] });
    };
    for (const time of times) {
      if (time < runFrom || time > runTo) continue;
      silent(time);
      last = time;
    }
    silent(runTo);
  }
  return gaps;
}

/** Overlapping or touching gaps joined into one, in time order, with all their reasons. */
export function mergeGaps(gaps: readonly Gap[]): Gap[] {
  const sorted = [...gaps].sort((a, b) => a.from - b.from);
  const merged: Gap[] = [];
  for (const gap of sorted) {
    const last = merged[merged.length - 1];
    if (last && gap.from <= last.to) {
      merged[merged.length - 1] = {
        from: last.from,
        to: Math.max(last.to, gap.to),
        reasons: [...new Set([...last.reasons, ...gap.reasons])],
      };
    } else {
      merged.push({ ...gap, reasons: [...gap.reasons] });
    }
  }
  return merged;
}

const secondsIn = (gaps: readonly Gap[]): number =>
  gaps.reduce((sum, g) => sum + (g.to - g.from) / 1000, 0);

/** Seconds of `from`–`to` that fall inside the gaps, which must already be merged. */
function overlapSeconds(from: number, to: number, gaps: readonly Gap[]): number {
  let ms = 0;
  for (const gap of gaps) ms += Math.max(0, Math.min(to, gap.to) - Math.max(from, gap.from));
  return ms / 1000;
}

/** What a recording came to. */
export interface RideSummary {
  /** Fixes the phone reported, and how many of them count. */
  fixCount: number;
  keptCount: number;
  distanceM: number;
  movingSeconds: number;
  standingSeconds: number;
  /** Time the phone did not record: the merged gaps, clipped to the recording, without the pauses. */
  lostSeconds: number;
  /** The contributor's own Stop and Resume pauses, which are neither moving nor lost. */
  pausedSeconds: number;
  hintos: Hinto[];
  /** The gaps, merged, without the pauses. */
  gaps: Gap[];
}

/**
 * The totals of a recording. `logged` are the gaps the page saw happen
 * (hidden, resumed after a reload, paused between a Stop and a Resume); the
 * silent ones are found from the fixes. Standing is the hintos' time that was
 * neither lost nor paused, and moving is what is left of the recorded span
 * once standing, lost and paused time are taken out.
 */
export function summarize(
  fixes: readonly Fix[],
  logged: readonly Gap[],
  from: number,
  now: number,
): RideSummary {
  const clip = (g: Gap): Gap => ({ ...g, from: Math.max(g.from, from), to: Math.min(g.to, now) });
  const inside = (g: Gap): boolean => g.to > g.from;
  const paused = mergeGaps(logged.filter((g) => g.reasons.includes('paused')).map(clip)).filter(
    inside,
  );
  const others = logged.filter((g) => !g.reasons.includes('paused'));
  const kept = keptFixes(fixes);
  const gaps = mergeGaps([...others, ...silentGaps(fixes, from, now, paused)])
    .map(clip)
    .filter(inside);
  const blocked = mergeGaps([...gaps, ...paused]);
  const hintos = hintosOf(kept);
  const standingSeconds = hintos.reduce(
    (sum, h) => sum + (h.to - h.from) / 1000 - overlapSeconds(h.from, h.to, blocked),
    0,
  );
  const pausedSeconds = secondsIn(paused);
  const lostSeconds = secondsIn(blocked) - pausedSeconds;
  const spanSeconds = Math.max(0, (now - from) / 1000);
  return {
    fixCount: fixes.length,
    keptCount: kept.length,
    distanceM: pathLengthM(kept, hintos),
    movingSeconds: Math.max(0, spanSeconds - secondsIn(blocked) - standingSeconds),
    standingSeconds,
    lostSeconds,
    pausedSeconds,
    hintos,
    gaps,
  };
}
