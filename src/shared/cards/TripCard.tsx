import { useState, type ReactNode, type Ref } from 'react'
import { RouteTripDetail, type Fares } from './RouteTripDetail'
import { useFareKind } from './useFareKind'
import type { SheetHeight } from './BottomSheet'
import { lineLength } from '../geo/geo'
import { manilaDate, rideFare } from '../model/fares'
import { liveriesFor, type Livery } from '../model/liveries'
import { directionEnds, isDrawn, variantLine, type VariantSummary } from '../model/routes'
import { otherDirection, otherRoutesFrom } from '../model/departures'
import type { Timeline } from '../model/timeline'

/**
 * The trip's colour, one owner for it (the review's 6.6): decided as the trip
 * opens — the RouteCard's it was picked from, in the list or a hotspot's card,
 * while that card stands behind it (a clash colour is "for this list only",
 * liveries.ts), else its place's for the visit (drawn when first met, kept
 * after) — and kept until it closes, through SWITCH and even when a tap on
 * its own line closes the list behind it: a card never changes colour while
 * it is open (the owner, 2026-09-29). Its line wears it too, so the page
 * reads it, not the card. Settled while rendering, as derived state is, so
 * the card never shows a frame in the wrong colour.
 */
export function useTripLivery(
  open: VariantSummary | null,
  worn: { id: string; livery: Livery } | null,
  wornBehind: boolean,
): Livery | null {
  const [tripWears, setTripWears] = useState<{ routeId: string; livery: Livery } | null>(null)
  let tripLivery = open && tripWears?.routeId === open.route_id ? tripWears.livery : null
  if (open && !tripLivery) {
    tripLivery = (wornBehind && worn?.id === open.id ? worn.livery : undefined) ?? liveriesFor([directionEnds(open).from])[0]
    setTripWears({ routeId: open.route_id, livery: tripLivery })
  } else if (!open && tripWears) {
    setTripWears(null)
  }
  return tripLivery
}

/**
 * The chosen direction as the owner's trip card (RouteTripDetail,
 * 2026-09-29), from what the map file knows: its ends as the list names
 * them, the whole ride's length and pesos, the hintuans on the way, and the colour of
 * the place it leaves from — the one its RouteCard wore, when it was picked
 * from one, in the list or in a hotspot's card. SWITCH turns it round, what
 * it was picked from staying behind it, and the card keeps the colour it
 * opened in: turned round, it is still the same card (the owner, 2026-09-29).
 *
 * Share, the length, the mode and the status went with the old card: the
 * owner dropped them for now, to design later (2026-09-28). The ride-to
 * preview went too, and came back as his picked hintuan (2026-09-29): its
 * pill prices the ride from the trip's start to there, as the tile prices
 * the whole.
 * So did the old card's fare details — the students/seniors/PWDs price, the
 * fare rule line, the route's fare_note, the estimate's source line and the
 * "old ₱13" grace warning (fare.previous): his frames carry only the pesos,
 * and he dropped them all on 2026-09-29. The studio shows them under the
 * tiles (`extras`): the same card, with what an editor needs below it (the
 * owner's pick, 2026-09-30: "most of the interaction of public map should
 * be in studio").
 *
 * The address still follows the card (useShareLink), so a link can be copied
 * from the address bar, and still opens its trip.
 */
export function TripCard({
  variant,
  variants,
  timeline,
  livery,
  onBackToList,
  onSwitch,
  onClose,
  picked,
  pickedMetres,
  onPick,
  onEnd,
  endPicked,
  dockRef,
  height,
  onOtherRoute,
  signboardUrl = publishedSignboard,
  extras,
}: {
  variant: VariantSummary
  variants: readonly VariantSummary[]
  timeline: Timeline
  /** The colour it opened in, kept through SWITCH; its line wears it too. */
  livery: Livery
  onBackToList: (() => void) | null
  onSwitch: (sibling: VariantSummary) => void
  onClose: () => void
  /** The hintuan picked on the timeline (useRideTo), and how far the ride to it runs, when its line reaches it. */
  picked: string | null
  pickedMetres: number | undefined
  onPick: (id: string) => void
  /** The origin's or the destination's row: the whole ride, and that end on the map. */
  onEnd: (end: 'from' | 'to') => void
  /** The end picked from its row (useRideTo's `endPicked`), or null. */
  endPicked: 'from' | 'to' | null
  dockRef: Ref<HTMLDivElement>
  /** Its sheet's height, shared with the list or card behind it (BottomSheet). */
  height: SheetHeight
  /** A row of "Other routes" tapped: that direction's trip in this one's place. Without it, no rows. */
  onOtherRoute?: (variant: VariantSummary) => void
  /** Where a signboard's file is read: beside the published map, or the studio's bucket. */
  signboardUrl?: (name: string) => string
  /** Under the tiles, the studio's alone: its facts and its Edit, Extend and Delete. */
  extras?: ReactNode
}) {
  const { from, to } = directionEnds(variant)
  const sibling = otherDirection(variants, variant)
  const switchable = !!sibling && isDrawn(sibling)
  // The whole ride, measured once on its full line — the index's figure, so
  // an overview drawn while the line is read never prices it: its Kilometer
  // and its Expected fare.
  const metres = variant.metres ?? lineLength(variantLine(variant))
  const [fareKind, setFareKind] = useFareKind()
  const others = onOtherRoute ? otherRoutesFrom(variants, variant) : []
  return (
    <RouteTripDetail
      livery={livery}
      metres={metres}
      pickedMetres={pickedMetres}
      discounted={fareKind === 'discounted'}
      onDiscounted={(d) => setFareKind(d ? 'discounted' : 'regular')}
      fare={faresFor(variant.route?.mode, metres)}
      routeOrigin={from}
      hintuans={timeline.between}
      picked={picked}
      pickedFare={pickedMetres === undefined ? undefined : faresFor(variant.route?.mode, pickedMetres)}
      onPick={onPick}
      onEnd={onEnd}
      endPicked={endPicked}
      dockRef={dockRef}
      height={height}
      routeDirection={to}
      switchable={switchable}
      back={variant.reversed}
      onSwitch={() => {
        if (sibling && switchable) onSwitch(sibling)
      }}
      onBackToList={onBackToList}
      onClose={onClose}
      signboards={(variant.signboards ?? []).map(signboardUrl)}
      otherRoutes={others.map((v) => ({ id: v.id, to: directionEnds(v).to }))}
      onOtherRoute={(id) => {
        const v = others.find((o) => o.id === id)
        if (v) onOtherRoute?.(v)
      }}
    >
      {extras}
    </RouteTripDetail>
  )
}

/** A ride's pesos, regular and discounted, for the fare tile; undefined when no fare rule prices it. */
function faresFor(mode: Parameters<typeof rideFare>[0], metres: number): Fares | undefined {
  const date = manilaDate()
  const regular = rideFare(mode, metres, date)
  const discounted = rideFare(mode, metres, date, 'discounted')
  return regular && discounted ? { regular, discounted } : undefined
}

/** A board as the publish writes it, beside the map's own files. */
const publishedSignboard = (name: string) => `/data/signboards/${encodeURIComponent(name)}`
