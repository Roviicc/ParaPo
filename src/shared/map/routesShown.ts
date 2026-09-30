import { isDrawn, type VariantSummary } from '../model/routes'

/*
 * What the saved directions show and light, worked out from what the sheet
 * and the cards hold. Pure; useSavedRoutes memoises each. Split from
 * useSavedRoutes.ts, 2026-09-29.
 */

/**
 * What is shown: the routes under the tap, the way round the list is
 * showing them — or, with no list, what a hotspot's cards show.
 */
export function showingOf<T extends VariantSummary>(
  candidates: readonly T[],
  back: boolean,
  variants: readonly T[],
  cardShows: readonly string[],
): T[] {
  return candidates.length > 0
    ? candidates.filter((v) => v.reversed === back && isDrawn(v))
    : variants.filter((v) => cardShows.includes(v.id) && isDrawn(v))
}

/**
 * What is lit: the chosen direction alone; or the Selected card's; or, with
 * none picked, everything shown.
 */
export function litOf<T extends VariantSummary>(
  selectedId: string | null,
  highlightIds: readonly string[] | null,
  variants: readonly T[],
  showing: T[],
): T[] {
  return selectedId
    ? variants.filter((v) => v.id === selectedId && isDrawn(v))
    : highlightIds
      ? variants.filter((v) => highlightIds.includes(v.id) && isDrawn(v))
      : showing
}

/**
 * What a tap where directions overlap keeps to: what is lit — but with a
 * card picked, everything shown, so the taps of 2026-09-25 (routeTaps.ts)
 * keep to the way round the list shows.
 */
export function shownOf(selectedId: string | null, lit: readonly string[], showing: readonly VariantSummary[]): readonly string[] {
  return selectedId || showing.length === 0 ? lit : showing.map((v) => v.id)
}
