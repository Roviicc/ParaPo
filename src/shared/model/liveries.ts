/**
 * The route cards' colours — the jeepney liveries of the owner's RouteCard
 * set (Figma 3665:2265): red, orange, mist, yellow, and violet and rose since
 * 2026-09-30. His rule of 2026-09-28:
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
export const LIVERIES = ['red', 'orange', 'mist', 'yellow', 'violet', 'rose'] as const
export type Livery = (typeof LIVERIES)[number]

/** This visit's draws, by place. A new visit draws again. */
const visit = new Map<string, Livery>()

const key = (place: string) => place.trim().toLowerCase()

/**
 * The colours for a list of cards, in order. No colour comes twice in a list
 * until every one has come once (the owner's ask, 2026-09-30: "it must
 * exhaust the existing colors before repeating it"); then the round starts
 * again, never beside the same colour. A place drawn before keeps its colour
 * — unless this round has had it, or it would sit beside itself, when it
 * wears another for this list only. A place new to the visit draws among the
 * colours this round has not had, leaving those that places further down
 * keep, and keeps what it draws.
 */
export function liveriesFor(places: readonly string[], random = Math.random, drawn = visit): Livery[] {
  const out: Livery[] = []
  let round = new Set<Livery>()
  places.forEach((place, i) => {
    if (round.size === LIVERIES.length) round = new Set()
    const before = out[i - 1]
    const kept = drawn.get(key(place))
    let pick: Livery
    if (kept && !round.has(kept) && kept !== before) pick = kept
    else {
      // Kept further down this round: left for the places that keep them.
      const ahead = new Set(
        places
          .slice(i + 1, i + 1 + LIVERIES.length - round.size)
          .map((p) => drawn.get(key(p)))
          .filter((l): l is Livery => !!l),
      )
      const open = LIVERIES.filter((l) => !round.has(l) && l !== before)
      const free = open.filter((l) => !ahead.has(l))
      const from = free.length ? free : open.length ? open : LIVERIES.filter((l) => l !== before)
      pick = from[Math.floor(random() * from.length)] ?? LIVERIES[0]
      if (!kept) drawn.set(key(place), pick)
    }
    round.add(pick)
    out.push(pick)
  })
  return out
}
