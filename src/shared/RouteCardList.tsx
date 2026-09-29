import { useMemo } from 'react'
import { wholeRideFare } from './fares'
import { liveriesFor, type Livery } from './liveries'
import { RouteCard } from './RouteCard'
import { RouteCardHeader } from './RouteCardHeader'
import { RouteDock } from './RouteDock'
import { departures, type VariantSummary } from './routes'

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
 * RouteCardHeader over a RouteCard per place the routes leave from, each in
 * its own livery (liveries.ts: at random, kept for the visit, never two
 * alike side by side). The grouping is today's (departures): one way round
 * at a time, SWITCH flips them all, and the count is of cards — "1 Route"
 * for Tala with its two ways out, as his frame has it.
 *
 * Only drawn directions are listed: the owner dropped "not mapped yet"
 * (2026-09-28), and a row that opens nothing is no row. SWITCH rests
 * disabled when the other way round has nothing drawn. A card's fare is its
 * whole rides' span — one direction's range, or from the cheapest to the
 * dearest of several — the same pesos its trip card will lead with, shown
 * only when every way out has a fare rule.
 *
 * It sits where RouteDock puts it, as the trip card does. A tap that also
 * hit a hotspot still gets the Chooser, which the owner has not redrawn yet.
 */
export function RouteCardList({ routes, back, onFlip, onRoute, onClose, hidden }: Props) {
  const drawnOnly = (way: boolean) =>
    departures(routes, way)
      .map((p) => ({ ...p, directions: p.directions.filter((d) => d.drawn) }))
      .filter((p) => p.directions.length > 0)
  const places = drawnOnly(back)
  const switchable = drawnOnly(!back).length > 0

  // Drawn once per list, not per render: a place whose kept colour would
  // match its neighbour's wears a random other one, and must not flicker.
  const placeKey = places.map((p) => p.from).join('\n')
  const liveries = useMemo(() => (placeKey ? liveriesFor(placeKey.split('\n')) : []), [placeKey])

  const count = `${places.length} ${places.length === 1 ? 'Route' : 'Routes'}`
  const byId = new Map(places.flatMap((p) => p.directions.map((d) => [d.v.id, d.v] as const)))

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
      {places.map((p, i) => (
        <RouteCard
          key={p.from}
          livery={liveries[i]}
          fare={wholeRideFare(p.directions.map((d) => d.v))}
          routeOrigin={p.from}
          endPoints={p.directions.map((d) => ({ id: d.v.id, routeDirection: d.to }))}
          onPick={(id) => {
            const v = byId.get(id)
            if (v) onRoute(v, liveries[i])
          }}
        />
      ))}
    </RouteDock>
  )
}
