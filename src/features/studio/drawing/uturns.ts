import { haversine, pointToSegmentM, type LngLat, type Segment } from '@/shared/utils/geo';

/**
 * Where a routed line turns back on itself: pure geometry over the router's
 * segments, shown to the owner and never changed (the U-turns ringed in
 * amber). Split from snap.ts, the router's client, 2026-09-29; held by
 * tests/unit/uturns-test.mjs.
 */

/** Two router vertices this close are the same place: one OSM node, reached twice. */
const SAME_M = 0.5;

/** A turn sharper than this, from the edge a segment arrives on to the edge the next leaves on, is turning back. */
const UTURN_DEG = 150;

/**
 * A turn back shorter than this is a click that snapped a metre or two past a
 * junction: nothing to see under the ring, and nothing a drag could fix.
 */
const MIN_UTURN_M = 5;

/** How far off the longer edge the shorter one may be and still count as running back along it. */
const ALONG_M = 2;

/**
 * Where a road cannot turn back — a one-way street, one carriageway of a
 * divided road — the router drives on and comes round, through a U-turn slot
 * or round the block. A segment that has gone at least LOOP_MIN_M and is back
 * within LOOP_NEAR_M of its point has done that: the way back runs beside the
 * way out, and at editing zoom the two read as one line.
 */
const LOOP_MIN_M = 100;
const LOOP_NEAR_M = 30;

/** Compass bearing from a to b, in degrees clockwise from north. */
function bearing([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLng = rad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(rad(lat2));
  const x =
    Math.cos(rad(lat1)) * Math.sin(rad(lat2)) -
    Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * A segment's coordinates with repeats removed (a vertex within SAME_M of the
 * one before), or [] when they are not a list of points. Segments saved by
 * older code can hold repeats, and a stored row can be malformed.
 */
function distinct(coords: unknown): LngLat[] {
  if (!Array.isArray(coords)) return [];
  const out: LngLat[] = [];
  for (const c of coords) {
    if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return [];
    const point: LngLat = [c[0], c[1]];
    if (out.length === 0 || haversine(out[out.length - 1], point) > SAME_M) out.push(point);
  }
  return out;
}

/** A control point where the route turns back on itself. */
export interface UTurn {
  /** Which control point. */
  point: number;
  /** The stretch that doubles back, so it can be drawn over the line. */
  stub: LngLat[];
  /** That stretch's length, in metres. */
  metres: number;
}

type Turn = Omit<UTurn, 'point'>;

/** The next segment runs back over the road nodes the previous one came in on. */
function retrace(p: LngLat[], n: LngLat[]): Turn | null {
  if (haversine(p[p.length - 1], n[0]) > SAME_M) return null;
  let i = p.length - 1;
  let j = 0;
  let metres = 0;
  while (i > 0 && j < n.length - 1 && haversine(p[i - 1], n[j + 1]) <= SAME_M) {
    metres += haversine(p[i - 1], p[i]);
    i--;
    j++;
  }
  return metres >= MIN_UTURN_M ? { stub: p.slice(i), metres } : null;
}

/**
 * With no node between: the edge in and the edge out point opposite ways, and
 * the shorter lies along the longer. A sharp turn onto another road points
 * nearly opposite too, but does not run back along this one.
 */
function oppositeEdges(p: LngLat[], n: LngLat[]): Turn | null {
  const a = p[p.length - 2];
  const join = p[p.length - 1];
  const b = n[1];
  const inM = haversine(a, join);
  const outM = haversine(n[0], b);
  const d = Math.abs(bearing(a, join) - bearing(n[0], b)) % 360;
  if ((d > 180 ? 360 - d : d) < UTURN_DEG) return null;
  const shorterIn = inM <= outM;
  const off = shorterIn ? pointToSegmentM(a, n[0], b) : pointToSegmentM(b, a, join);
  const metres = Math.min(inM, outM);
  if (off > ALONG_M || metres < MIN_UTURN_M) return null;
  return { stub: shorterIn ? [a, join] : [b, n[0]], metres };
}

/** Where the road cannot turn back, the router comes round: either segment is back beside the point. */
function loopBack(p: LngLat[], n: LngLat[]): Turn | null {
  const join = p[p.length - 1];
  let walked = 0;
  for (let j = 1; j < n.length; j++) {
    walked += haversine(n[j - 1], n[j]);
    if (walked >= LOOP_MIN_M && haversine(n[j], join) <= LOOP_NEAR_M)
      return { stub: n.slice(0, j + 1), metres: walked };
  }
  walked = 0;
  for (let i = p.length - 2; i >= 0; i--) {
    walked += haversine(p[i], p[i + 1]);
    if (walked >= LOOP_MIN_M && haversine(p[i], join) <= LOOP_NEAR_M)
      return { stub: p.slice(i), metres: walked };
  }
  return null;
}

/**
 * Every control point where the route turns back on itself: the next segment
 * runs back over the road the previous one arrived on (shared nodes, or with
 * no node between, opposite edges), or — where the road cannot turn back — the
 * route goes on and comes round to beside the point.
 *
 * Nothing is changed. A doubled-back stretch overlaps itself or runs beside
 * itself, so on the map it cannot be seen; reporting it is what makes it
 * visible. `ignore` skips segments that are not road geometry yet (stand-ins).
 */
export function findUTurns(
  segments: Segment[],
  ignore: (s: Segment) => boolean = () => false,
): UTurn[] {
  const found: UTurn[] = [];
  for (let k = 0; k + 1 < segments.length; k++) {
    const a = segments[k];
    const b = segments[k + 1];
    if (a?.snap !== 'snapped' || b?.snap !== 'snapped' || ignore(a) || ignore(b)) continue;
    const p = distinct(a.coordinates);
    const n = distinct(b.coordinates);
    if (p.length < 2 || n.length < 2) continue;
    const turn = retrace(p, n) ?? oppositeEdges(p, n) ?? loopBack(p, n);
    if (turn) found.push({ point: k + 1, ...turn });
  }
  return found;
}
