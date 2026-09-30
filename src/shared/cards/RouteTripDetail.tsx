import type { Ref } from 'react'
import { kmLabel } from '../geo/geo'
import { RouteCardHeader } from './RouteCardHeader'
import { BottomSheet, type SheetHeight } from './BottomSheet'
import { TripTimeline, type TripTimelineProps } from './TripTimeline'

type Props = TripTimelineProps & {
  /** Figma's Kilometer tile: the whole ride's length, in metres; written `12.8km`. */
  metres: number
  /** Figma's Expected fare tile: the whole ride's pesos, `₱24–28`. Omitted when unpriced, and the tile with it. */
  fare?: string
  /** SWITCH: the same route the other way. */
  onSwitch: () => void
  /** False when the route has no other way drawn; SWITCH then rests disabled. */
  switchable: boolean
  /** Whether this trip is the route's way back: SWITCH is pressed then, as over the list. */
  back: boolean
  /** ‹: back to what the trip was picked from — the list, a hotspot's card — or to its route with those sharing an end; null when there is none. */
  onBackToList: (() => void) | null
  onClose: () => void
  /** The dock the card sits in, for the map to glide clear of it. */
  dockRef?: Ref<HTMLDivElement>
  /** Its height, shared with the list or card it was opened from (BottomSheet). */
  height?: SheetHeight
}

/**
 * One direction as a trip — the owner's RouteTripDetail (Figma 3778:3183,
 * 2026-09-29): RouteCardHeader's Variant2; a card in the livery of the place
 * the trip leaves from, inset from the sides and rounded, where a rail runs
 * from the origin (TimelineTop) down to the place it goes to
 * (TimelineBottomEndRoute); then two tiles under it, the ride's Kilometer and
 * its Expected fare (moved under the card in his redrawing the same day).
 * The pesos moved off the rail into their tile with this set; a route no
 * fare rule prices has no Expected fare tile, and Kilometer takes the row
 * (the owner kept that default, 2026-09-29: nothing is drawn for it).
 *
 * The card and its rail are TripTimeline's.
 */
export function RouteTripDetail({
  livery,
  metres,
  fare,
  routeOrigin,
  hintuans,
  picked,
  onPick,
  pickedFare,
  onEnd,
  endPicked,
  routeDirection,
  onSwitch,
  switchable,
  back,
  onBackToList,
  onClose,
  dockRef,
  height,
}: Props) {
  return (
    <BottomSheet
      ref={dockRef}
      height={height}
      label={`${routeOrigin} → ${routeDirection}`}
      testId="card"
      onClose={onClose}
      header={
        <RouteCardHeader
          onBackToList={onBackToList}
          onSwitch={onSwitch}
          switchable={switchable}
          back={back}
          onClose={onClose}
        />
      }
    >
      {/* On a phone the card sits right under the header (the owner's 3817:6007, 2026-09-30); floating, 12 below it. */}
      <div className="w-full px-3 @float:pt-3">
        <TripTimeline
          livery={livery}
          routeOrigin={routeOrigin}
          hintuans={hintuans}
          picked={picked}
          onPick={onPick}
          pickedFare={pickedFare}
          onEnd={onEnd}
          endPicked={endPicked}
          routeDirection={routeDirection}
        />
      </div>
      <dl className="flex w-full gap-3 bg-surface px-3 pt-3 pb-4 text-center font-sn-pro">
        <Tile testId="trip-km" label="Kilometer" value={kmLabel(metres)} />
        {fare && <Tile testId="trip-fare" label="Expected fare" value={fare} />}
      </dl>
    </BottomSheet>
  )
}

/**
 * One of the two tiles under the card, in Figma's row of them (3771:3055): a
 * figure under its name, on Background/surface-secondary, read out as the
 * pair it is. Figma writes the figure in a raw black; Content/primary is the
 * token nearest it.
 */
function Tile({ testId, label, value }: { testId: 'trip-km' | 'trip-fare'; label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-surface-secondary p-4">
      <dt className="text-sm/5 font-normal text-content-tertiary">{label}</dt>
      <dd data-testid={testId} className="text-2xl/8 font-bold text-content-primary">
        {value}
      </dd>
    </div>
  )
}
