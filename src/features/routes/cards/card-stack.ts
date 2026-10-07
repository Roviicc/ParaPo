import type { Snap } from '@/shared/ui/sheet-gesture';
import type { LngLat } from '@/shared/utils/geo';

import { sharingAnEnd } from '../model/departures';
import { isDrawn, variantLine, type VariantSummary } from '../model/routes';

/*
 * The cards that stand in for one another over the map — the route list, a
 * hotspot's card, the trip opened from either — and what each does to the
 * others: the decisions, as plain functions both apps call, so the rules are
 * written once and tested (tests/unit/card-stack-test.mjs). Split from
 * CommuterApp and StudioApp, which each had them inline (2026-10-01).
 */

/** Several things under one tap — routes, hotspots or both: the route list asks which. */
export function isChoosing(routes: readonly unknown[], stops: readonly unknown[]): boolean {
  return routes.length + stops.length > 1;
}

/**
 * What a trip's ‹ goes back to: the card it was picked from, kept behind it —
 * the route list, a hotspot's card (`behind`); opened with nothing behind it,
 * its route listed with those sharing its head or its tail, its way round,
 * when another of them is drawn that way (`fan`, the owner's asks of
 * 2026-09-29); else nothing, and no ‹.
 */
export function tripBack(
  trip: VariantSummary | null,
  variants: readonly VariantSummary[],
  behind: boolean,
): 'behind' | 'fan' | null {
  if (behind) return 'behind';
  if (!trip) return null;
  const sameWay = sharingAnEnd(variants, trip).filter(
    (v) => v.reversed === trip.reversed && isDrawn(v),
  );
  return sameWay.length > 1 ? 'fan' : null;
}

/**
 * The height the sheets share: a pick and ‹ keep Low, Middle or Max as they
 * were (the owner's ask of 2026-09-30); with nothing open it goes back to
 * Middle, where every sheet opens.
 */
export function sharedSnap(snap: Snap, anyOpen: boolean): Snap {
  return anyOpen ? snap : 'middle';
}

/**
 * A trip stepped behind a place's card when its name on the map was tapped
 * (the owner's ask, 2026-10-01): it stays there, for the card's ‹, only
 * while that card is open and no trip is — anything else opening or closing
 * lets it go.
 */
export function tripBehindHolds(tripOpen: boolean, placeOpen: boolean): boolean {
  return placeOpen && !tripOpen;
}

/**
 * A HintuanCard's Selected row let go (the owner's ask, 2026-10-01): it
 * stays let go only while that box is still the one the card is on.
 */
export function letGoHolds(letGoId: string | null, selectedId: string | null): boolean {
  return letGoId !== null && letGoId === selectedId;
}

/** What a card frames: routes whole, or a place kept in view. */
export type Framed = { lines: readonly (readonly LngLat[])[] } | { at: LngLat } | null;

/**
 * What the card on show frames as the sheet settles at another height
 * (useHeightOverview): an open trip, its route; a place's card, the routes
 * of the RouteCard picked on it, else the place; the route list, the picked
 * card's routes, else what it lights (`lit`); nothing open, nothing. `picked`
 * is the picked card's directions, null with no card picked.
 */
export function framedBy(
  trip: VariantSummary | null,
  placeAt: LngLat | null,
  choosing: boolean,
  picked: readonly VariantSummary[] | null,
  lit: readonly VariantSummary[],
): Framed {
  const card = picked && { lines: picked.map(variantLine) };
  if (trip) return { lines: [variantLine(trip)] };
  if (placeAt) return card ?? { at: placeAt };
  if (choosing) return card ?? { lines: lit.map(variantLine) };
  return null;
}
