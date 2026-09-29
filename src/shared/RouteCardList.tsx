import type { Livery } from './liveries'
import { RouteCardHeader } from './RouteCardHeader'
import { RouteCardStack } from './RouteCardStack'
import { RouteDock } from './RouteDock'
import { drawnDepartures, type VariantSummary } from './routes'

type Props = {
  /** Every direction of every route under the tap, slots included, as the hooks hand them over. */
  routes: readonly VariantSummary[]
  /** Whether the way back is showing rather than the way there. */
  back: boolean
  /** SWITCH: show them all the other way round. */
  onFlip: () => void
  /** Called with the direction picked, and the colour its card wore: its trip wears the same. */
  onRoute: (v: VariantSummary, livery: Livery) => void
  onClose: () => void
  /** Kept but not shown, while a trip picked from it is on top: ‹ comes back to it as it was. */
  hidden?: boolean
}

/**
 * The routes under a tap that hit more than one — the owner's
 * RouteCardExample (Figma 3746:1237 and its layouts, 3750:1911, 2026-09-28):
 * RouteCardHeader over a RouteCard per place the routes leave from
 * (RouteCardStack: each in its own livery, its fare, its drawn ways out). The
 * grouping is today's (departures): one way round at a time, SWITCH flips
 * them all, and the count is of cards — "1 Route" for Tala with its two ways
 * out, as his frame has it.
 *
 * Only drawn directions are listed: the owner dropped "not mapped yet"
 * (2026-09-28), and a row that opens nothing is no row. SWITCH rests
 * disabled when the other way round has nothing drawn.
 *
 * It sits where RouteDock puts it, as the trip card does. A tap that also
 * hit a hotspot still gets the Chooser, which the owner has not redrawn yet.
 */
export function RouteCardList({ routes, back, onFlip, onRoute, onClose, hidden }: Props) {
  const places = drawnDepartures(routes, back)
  const switchable = drawnDepartures(routes, !back).length > 0
  const count = `${places.length} ${places.length === 1 ? 'Route' : 'Routes'}`

  return (
    <RouteDock
      label={count}
      testId="chooser"
      onClose={onClose}
      hidden={hidden}
      header={
        <RouteCardHeader routeCount={count} onSwitch={onFlip} switchable={switchable} back={back} onClose={onClose} />
      }
    >
      <RouteCardStack routes={routes} back={back} onRoute={onRoute} testId="chooser" />
    </RouteDock>
  )
}
