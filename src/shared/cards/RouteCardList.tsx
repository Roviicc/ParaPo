import type { Livery } from '../model/liveries'
import { RouteCardHeader } from './RouteCardHeader'
import { RouteCardStack, type PickedPlace } from './RouteCardStack'
import { RouteDock } from './RouteDock'
import { drawnDepartures } from '../model/departures'
import type { VariantSummary } from '../model/routes'
import { hotspotCount, stopLabel, type StopSummary } from '../model/stops'

type Props = {
  /** Every direction of every route under the tap, slots included, as the hooks hand them over. */
  routes: readonly VariantSummary[]
  /** The hotspots under the tap, listed first. */
  stops?: readonly StopSummary[]
  /** Whether the way back is showing rather than the way there. */
  back: boolean
  /** SWITCH: show them all the other way round. */
  onFlip: () => void
  /** The place whose card is Selected, by name; null when none is. */
  selected: string | null
  /** A card was picked — the map lights its directions alone — or let go (null): everything listed lit again. */
  onSelect: (place: PickedPlace | null) => void
  /** Called with the direction a row opens, and the colour its card wore: its trip wears the same. */
  onRoute: (v: VariantSummary, livery: Livery) => void
  /** A hotspot's row: open its card. */
  onStop: (s: StopSummary) => void
  onClose: () => void
  /** Kept but not shown, while a trip picked from it is on top: ‹ comes back to it as it was left, every card at rest. */
  hidden?: boolean
}

/**
 * Everything under a tap that hit more than one thing — the owner's
 * RouteCardExample (Figma 3746:1237 and its layouts, 3750:1911, 2026-09-28):
 * RouteCardHeader over a RouteCard per place the routes leave from
 * (RouteCardStack: each in its own livery, its drawn ways out). The
 * grouping is today's (departures): one way round at a time, SWITCH flips
 * them all, and the count is of cards — "1 Route" for Tala with its two ways
 * out, as his frame has it. The map lights every direction listed, the way
 * round it is showing them; a tap on a card off its rows narrows that to the
 * card's, and a second tap, SWITCH, a map tap or closing let it go. A row
 * opens its trip straight away and picks no card, and the trip's ‹ comes
 * back to every card at rest (the owner, 2026-09-29).
 *
 * Only drawn directions are listed: the owner dropped "not mapped yet"
 * (2026-09-28), and a row that opens nothing is no row. SWITCH rests
 * disabled when the other way round has nothing drawn.
 *
 * The hotspots under the tap come first, as they did in the Chooser this
 * list replaced on both maps (the owner, 2026-09-29: "replace the chooser
 * with routeStackCard list since they are the same UI"): a box is small and
 * deliberate (2026-09-22). They are the Chooser's rows until his hintuan
 * design, a row a box, and the count stays the routes'; only with no route
 * to count does it count the hotspots, "2 Hotspots", as a rider counts them
 * (hotspotCount): both boxes of one hintuan, either side of the road, are
 * "1 Hotspot" over two rows. All three his picks, the same day.
 *
 * It sits where RouteDock puts it, as the trip card does.
 */
export function RouteCardList({ routes, stops = [], back, onFlip, selected, onSelect, onRoute, onStop, onClose, hidden }: Props) {
  const places = drawnDepartures(routes, back)
  const switchable = drawnDepartures(routes, !back).length > 0
  const hotspots = hotspotCount(stops)
  const count =
    places.length === 0 && hotspots > 0
      ? `${hotspots} ${hotspots === 1 ? 'Hotspot' : 'Hotspots'}`
      : `${places.length} ${places.length === 1 ? 'Route' : 'Routes'}`

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
      {stops.length > 0 && (
        // Full-bleed rows: a whole row is the target, not the words inside it.
        <ul className="border-t border-border-primary">
          {stops.map((s) => (
            <li key={s.id} className="border-b border-border-primary last:border-b-0">
              <button
                type="button"
                data-testid="chooser-item"
                onClick={() => onStop(s)}
                className="block w-full px-4 py-2.5 text-left hover:bg-surface-secondary"
              >
                <span className="block truncate font-medium text-content-primary">{stopLabel(s)}</span>
                <span className="block truncate text-xs text-content-quaternary">
                  {s.kind === 'terminal' ? 'Terminal' : 'Hintuan'}
                  {stopLabel(s) !== s.name && ` · ${s.name}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <RouteCardStack routes={routes} back={back} selected={selected} onSelect={onSelect} onRoute={onRoute} testId="chooser" />
    </RouteDock>
  )
}
