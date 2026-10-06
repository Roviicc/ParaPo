import { useState, type ReactNode, type Ref } from 'react'
import { FREE, RouteTripDetail, type Fare, type Fares } from './RouteTripDetail'
import { useFareKind } from './useFareKind'
import type { SheetHeight } from './BottomSheet'
import { lineLength } from '../geo/geo'
import { manilaDate, rideFare } from '../model/fares'
import { liveriesFor, type Livery } from '../model/liveries'
import { directionEnds, isDrawn, isFerry, isRail, LINE_NOTES, variantLine, type VariantSummary } from '../model/routes'
import { railFares } from '../model/railFares'
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
 * No link to a trip either: the address followed the card (`?r=<id>`, a
 * link that opened its trip) until the owner took trip links out for now,
 * 2026-10-03.
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
      fare={fareFor(variant, metres, timeline)}
      routeOrigin={from}
      hintuans={timeline.between}
      picked={picked}
      pickedFare={pickedFareFor(variant, pickedMetres, timeline, picked)}
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
      note={LINE_NOTES[variant.route?.route_code ?? '']}
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

/** A ride's pesos, regular and discounted, for the fare tile; undefined when no fare rule prices it. A train's are by its stations (railFares). */
function faresFor(mode: Parameters<typeof rideFare>[0], metres: number): Fares | undefined {
  const date = manilaDate()
  const regular = rideFare(mode, metres, date)
  const discounted = rideFare(mode, metres, date, 'discounted')
  return regular && discounted ? { regular, discounted } : undefined
}

/** The whole ride's fare: a train's by its stations (railFares), the ferry's free, a jeep's by its metres. */
function fareFor(variant: VariantSummary, metres: number, timeline: Timeline): Fare | undefined {
  if (isFerry(variant.route?.mode)) return FREE
  if (isRail(variant.route?.mode)) return railFares(variant.route.route_code, timeline.from?.label, timeline.to?.label)
  return faresFor(variant.route?.mode, metres)
}

/** The fare to the picked hintuan: a jeep's by the metres to it, a train's to that station, the ferry's free. */
function pickedFareFor(variant: VariantSummary, pickedMetres: number | undefined, timeline: Timeline, picked: string | null): Fare | undefined {
  if (isFerry(variant.route?.mode)) return picked ? FREE : undefined
  if (isRail(variant.route?.mode)) {
    const row = picked ? timeline.between.find((r) => r.id === picked) : undefined
    return row ? railFares(variant.route.route_code, timeline.from?.label, row.label) : undefined
  }
  return pickedMetres === undefined ? undefined : faresFor(variant.route?.mode, pickedMetres)
}

/** A board as the publish writes it, beside the map's own files. */
const publishedSignboard = (name: string) => `/data/signboards/${encodeURIComponent(name)}`
