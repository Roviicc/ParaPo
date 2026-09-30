/**
 * The route cards' colours — the jeepney liveries of the owner's RouteCard
 * set (Figma 3665:2265): red, orange, yellow, violet, rose and fuchsia. Violet
 * and rose came on 2026-09-30; later that day mist left ("mist is no longer
 * with us") and fuchsia joined. His rule of 2026-09-28:
 * shown at random, but kept for the whole visit, the same in the list and on
 * the trip's own card, and two cards side by side never alike.
 *
 * A colour belongs to the place a card leaves from, because a card is a
 * place: Tala → SM Fairview and Tala → Novaliches share Tala's card, and
 * whichever of them is opened wears it. Once open, a trip's card keeps that
 * colour until it closes, even SWITCHed to leave from another place: turned
 * round, it is the same card (the owner, 2026-09-29; `useTripLivery` in
 * commuter/TripCard.tsx, since its line wears the colour too).
 */
export const LIVERIES = ['red', 'orange', 'yellow', 'violet', 'rose', 'fuchsia'] as const
export type Livery = (typeof LIVERIES)[number]

/** This visit's draws, by place. A new visit draws again. */
const visit = new Map<string, Livery>()

const key = (place: string) => place.trim().toLowerCase()

/**
 * The colours for a list of cards, in order. A place drawn before keeps its
 * colour — unless that would put it beside the same colour, when it wears
 * another for this list only. A place new to the visit draws among the
 * colours its neighbours are not wearing, and keeps what it draws.
 */
export function liveriesFor(places: readonly string[], random = Math.random, drawn = visit): Livery[] {
  const out: Livery[] = []
  places.forEach((place, i) => {
    const before = out[i - 1]
    const kept = drawn.get(key(place))
    if (kept && kept !== before) {
      out.push(kept)
      return
    }
    const next = i + 1 < places.length ? drawn.get(key(places[i + 1])) : undefined
    const free = LIVERIES.filter((l) => l !== before && l !== next)
    const pick = free[Math.floor(random() * free.length)] ?? LIVERIES[0]
    if (!kept) drawn.set(key(place), pick)
    out.push(pick)
  })
  return out
}
