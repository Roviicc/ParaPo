import { convexHull, type Ring } from '../geo/ring';
import { siblingsOf } from '../model/places';
import { stopRing, type StopSummary } from '../model/stops';

/*
 * What a tap marks on the saved hotspots, worked out from what is chosen and
 * what the sheet asks about. Pure; useSavedStops memoises each. Split from
 * useSavedStops.ts, 2026-09-29.
 */

/** A box's mark: lit (chosen, or under the tap while the sheet asks), a sibling of the chosen one, both, or the chosen one. */
export type BoxMark = 'lit' | 'sibling' | 'lit+sibling' | 'chosen';

/**
 * Each marked box's mark: the chosen one, its siblings, and what is lit —
 * the chosen box, or everything under a tap while the sheet asks which.
 * Nothing while muted.
 */
export function boxMarks(
  stops: readonly StopSummary[],
  selectedId: string | null,
  candidates: readonly StopSummary[],
  muted: boolean,
  /** The chosen box let go on its card: one of its place's boxes like the rest, none pressed. */
  letGo = false,
): Map<string, BoxMark> {
  const chosen = muted ? undefined : stops.find((s) => s.id === selectedId);
  const siblings = chosen ? siblingsOf(chosen, stops).map((s) => s.id) : [];
  const lit = muted ? [] : selectedId ? [selectedId] : candidates.map((s) => s.id);
  const now = new Map<string, BoxMark>();
  for (const id of lit) now.set(id, 'lit');
  for (const id of siblings) now.set(id, now.has(id) ? 'lit+sibling' : 'sibling');
  if (chosen) now.set(chosen.id, letGo ? 'sibling' : 'chosen');
  return now;
}

/**
 * The place highlight: a hull over the chosen box and its siblings, empty
 * with none, or while muted.
 */
export function placeHull(
  stops: readonly StopSummary[],
  selectedId: string | null,
  muted: boolean,
): Ring {
  const chosen = muted ? undefined : stops.find((s) => s.id === selectedId);
  const siblings = chosen ? siblingsOf(chosen, stops).filter((s) => stopRing(s).length >= 3) : [];
  return chosen && siblings.length > 0
    ? convexHull([chosen, ...siblings].flatMap((s) => stopRing(s)))
    : [];
}
