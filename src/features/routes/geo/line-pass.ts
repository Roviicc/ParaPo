import { bboxOf, bboxesOverlap, type BBox, type LngLat } from '@/shared/utils/geo';

import { passBounds, passStretches } from './pass';
import type { Ring } from './ring';
import { hotspotRing, type Hotspot } from '../model/hotspots';
import { servedBy, directionLine, type Direction } from '../model/routes';

/*
 * The orange stretches as a direction's line file carries them (the
 * cheap-phone plan, step 13, 2026-10-05).
 *
 * Working out where a lit line passes its hintuans is a metre-by-metre walk
 * of the line near every box it reaches, done on the phone as each lit
 * line's full line arrives. In the cheap-phone timer (CPU 4× slower), on an
 * unminified build with the profiler attached, 79 ms of the main thread
 * after a six-route list tap and 39 ms after a trip tap (the medians of
 * three). On the minified build, as shipped, taking them from the file
 * took 41 ms off the list tap's total blocking time (207 -> 166 ms); the
 * trip tap's change (208 -> 193 ms) was within its run-to-run spread. The
 * publish works the stretches out once a night instead
 * (scripts/publish/lineFile.mjs), with these very functions, and writes
 * them into each line file beside the line: `pass`, the stretches, and
 * `passKey`, a short hash of what they were worked out against — the id
 * and the rounded box of every hintuan the route stops at whose ground the
 * line reaches. Pure, and nothing from npm: the publish workflow runs
 * without `npm ci`.
 *
 * The app works the key out again from the index it has, and takes the
 * stretches from the file only when the two agree; otherwise it walks the
 * line as it always did. That is a line file published before this (no
 * `pass`), a line file and an index from different publishes (the service
 * worker answers each from its own store when the network is slow), a
 * hintuan moved, added or no longer stopped at since, a rule changed since
 * (PASS_RULE), and the studio, whose lines never carry any.
 */

/**
 * The rule the stretches were worked out by, mixed into every key. Bump it
 * whenever what passStretches paints changes — PASS_WITHIN_M, the step, the
 * walk — so that line files published by the old rule are worked out again
 * by the new one until the next publish, rather than painted as they were.
 * tests/unit/pass-stretches-test.mjs pins what the rule paints on a small
 * map, and fails until this is bumped.
 */
export const PASS_RULE = 1;

/** A hintuan's box as the stretches are worked out against it: its ring, and the ground a line must reach (passBounds). */
export interface PassBox {
  hotspot: Hotspot;
  ring: Ring;
  bounds: BBox;
}

/** One orange stretch, as the map's source takes it: its direction's id on it, for the lighting. */
export interface PassFeature {
  type: 'Feature';
  properties: { id: string; route_id: string };
  geometry: { type: 'LineString'; coordinates: LngLat[] };
}

/** What a line file carries of its orange stretches: each stretch's points, and what they were worked out against. */
export interface LinePass {
  pass: LngLat[][];
  passKey: string;
}

/** Every hintuan with a box: what the stretches are worked out against. */
export function passBoxes(hotspots: readonly Hotspot[]): readonly PassBox[] {
  return hotspots
    .filter((s) => s.kind === 'hintuan' && s.area)
    .map((s) => {
      const ring = hotspotRing(s);
      return { hotspot: s, ring, bounds: passBounds(ring) };
    });
}

/**
 * The boxes a direction's stretches are worked out against, in the order
 * they are walked: only those whose ground the line's own bounds reach — on
 * a big map most directions and most boxes are nowhere near each other —
 * and only the hintuans its route stops at: a train's track over a jeep
 * hintuan is not a stretch of its ride (servedBy).
 */
export function boxesReached(
  v: Direction,
  line: readonly LngLat[],
  boxes: readonly PassBox[],
): PassBox[] {
  const reach = bboxOf(line);
  return boxes.filter((b) => bboxesOverlap(reach, b.bounds) && servedBy(b.hotspot, v.route));
}

/** The stretches of `line` past these boxes, box by box in their order. */
function stretchesAlong(line: readonly LngLat[], reached: readonly PassBox[]): LngLat[][] {
  return reached.flatMap(({ ring }) => passStretches(line, ring));
}

const feature = (v: Direction, coordinates: LngLat[]): PassFeature => ({
  type: 'Feature',
  properties: { id: v.id, route_id: v.route_id },
  geometry: { type: 'LineString', coordinates },
});

/** One direction's orange stretches past these boxes, worked out afresh. */
export function stretchesPast(v: Direction, boxes: readonly PassBox[]): PassFeature[] {
  const line = directionLine(v);
  if (line.length < 2) return [];
  return stretchesAlong(line, boxesReached(v, line, boxes)).map((coordinates) =>
    feature(v, coordinates),
  );
}

/**
 * The key of a set of stretches: a short hash of the rule and of each box
 * they were worked out against, in order, by its hintuan's id and its
 * corners in millionths of a degree (the 6 decimals the publish writes).
 * The same boxes give the same key in the publish and in any browser: whole
 * numbers and Math.imul only.
 */
export function passKey(reached: readonly PassBox[]): string {
  let text = `${PASS_RULE}`;
  for (const { hotspot, ring } of reached) {
    text += `|${hotspot.id}:`;
    for (const [x, y] of ring) text += `${Math.round(x * 1e6)},${Math.round(y * 1e6)};`;
  }
  return hash53(text).toString(36);
}

/**
 * What the publish writes into a direction's line file: its stretches past
 * the index's boxes, exactly as stretchesPast works them out in the app — the
 * same points, not rounded, since JSON carries a number exactly — and their
 * key. A line of fewer than two points has none, and the key of no box.
 */
export function linePass(v: Direction, boxes: readonly PassBox[]): LinePass {
  const line = directionLine(v);
  const reached = line.length < 2 ? [] : boxesReached(v, line, boxes);
  return { pass: stretchesAlong(line, reached), passKey: passKey(reached) };
}

// The stretches each line file brought, by the very line object read from
// it (fetch-line.ts, fetchLine): that object becomes the direction's `shape`
// as it is (useSavedRoutes), so whatever is kept here is the stretches of
// that line and no other, and goes when the line does.
const published = new WeakMap<object, LinePass>();

const isPoint = (p: unknown): p is LngLat =>
  Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** True for stretches as the publish writes them: each two points or more, each point two numbers. */
export function readablePass(pass: unknown): pass is LngLat[][] {
  return (
    Array.isArray(pass) && pass.every((s) => Array.isArray(s) && s.length >= 2 && s.every(isPoint))
  );
}

/**
 * Keeps the stretches a line file brought, under the line object it brought
 * (`shape`). A file without them, or with something else under their names,
 * keeps nothing, and that line's stretches are worked out as before.
 */
export function keepLinePass(shape: object, file: { pass?: unknown; passKey?: unknown }): void {
  if (typeof file.passKey === 'string' && readablePass(file.pass))
    published.set(shape, { pass: file.pass, passKey: file.passKey });
}

/**
 * The direction's stretches past these boxes as its line file brought them,
 * when they were worked out against these very boxes (their key is the one
 * these give); null when its line brought none or they were worked out
 * against others, and the caller works them out (stretchesPast). Read
 * against the index's own boxes each time, so a line file that is newer or
 * older than the index is never painted with another map's hintuans.
 */
export function publishedStretches(v: Direction, boxes: readonly PassBox[]): PassFeature[] | null {
  const kept = v.shape ? published.get(v.shape) : undefined;
  if (!kept) return null;
  const line = directionLine(v);
  if (line.length < 2 || passKey(boxesReached(v, line, boxes)) !== kept.passKey) return null;
  return kept.pass.map((coordinates) => feature(v, coordinates));
}

/** cyrb53 (public domain): a 53-bit hash of a string, steady everywhere. Not for secrets; for telling two inputs apart. */
function hash53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
