import { isDrawn, type Direction } from '../model/routes';

/*
 * What the saved directions show and light, worked out from what the sheet
 * and the cards hold. Pure; useSavedRoutes memoises each. Split from
 * useSavedRoutes.ts, 2026-09-29.
 */

/**
 * What is shown: what a hotspot's card shows, while one is open — else the
 * routes under the tap, the way round the list is showing them.
 *
 * The card first: a place opened from a trip's end keeps the list the trip
 * came from behind both, for ‹ (openPlace, keepList), and the hidden list
 * went on deciding what was lit over the place's card (review of
 * 2026-10-03). `cardShows` is null with no card open (HintuanCard's
 * onShown), so a card that shows no route still lights none of the list's.
 */
export function showingOf<T extends Direction>(
  candidates: readonly T[],
  back: boolean,
  directions: readonly T[],
  cardShows: readonly string[] | null,
): T[] {
  if (cardShows) return directions.filter((v) => cardShows.includes(v.id) && isDrawn(v));
  return candidates.filter((v) => v.reversed === back && isDrawn(v));
}

/**
 * What is lit: the chosen direction alone; or the Selected card's; or, with
 * none picked, everything shown.
 */
export function litOf<T extends Direction>(
  selectedId: string | null,
  highlightIds: readonly string[] | null,
  directions: readonly T[],
  showing: T[],
): T[] {
  return selectedId
    ? directions.filter((v) => v.id === selectedId && isDrawn(v))
    : highlightIds
      ? directions.filter((v) => highlightIds.includes(v.id) && isDrawn(v))
      : showing;
}

/**
 * What a tap where directions overlap keeps to: what is lit — but with a
 * card picked, everything shown, so the taps of 2026-09-25 (routeTaps.ts)
 * keep to the way round the list shows.
 */
export function shownOf(
  selectedId: string | null,
  lit: readonly string[],
  showing: readonly Direction[],
): readonly string[] {
  return selectedId || showing.length === 0 ? lit : showing.map((v) => v.id);
}

/**
 * `next`, or `was` when the two hold the very same things in the same
 * order: what is lit kept one array while it is unchanged (useSavedRoutes'
 * litDirections and lit). Every full line read makes a new list of
 * directions, and litOf made a new array of the same ones lit: a list's
 * (its rows keep the directions as they were tapped) at each of its lines,
 * a trip's at any other direction's. The chevrons, which start afresh with
 * a new list of lit rides, jumped back to the start of their lines, and
 * the rides, their ends and their names were worked out again (the
 * cheap-phone plan, step 16 (c), 2026-10-04). Compared by identity, never
 * by content: a lit direction whose own line arrives is a new object, and
 * makes a new array, as its chevrons must then follow the new line.
 */
export function steady<A extends readonly unknown[]>(was: A, next: A): A {
  if (was === next) return was;
  return was.length === next.length && was.every((x, i) => x === next[i]) ? was : next;
}
