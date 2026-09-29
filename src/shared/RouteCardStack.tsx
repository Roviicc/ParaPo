import { useMemo } from 'react'
import { wholeRideFare } from './fares'
import { liveriesFor, type Livery } from './liveries'
import { RouteCard } from './RouteCard'
import { drawnDepartures, type VariantSummary } from './routes'

type Props = {
  /** Every direction of every route to show, slots included, as the hooks hand them over. */
  routes: readonly VariantSummary[]
  /** Whether they are shown the way back rather than outbound. */
  back: boolean
  /** Called with the direction picked, and the colour its card wore: its trip wears the same. */
  onRoute: (v: VariantSummary, livery: Livery) => void
  /** What the suites call each card and row (RouteCard). */
  testId: 'chooser' | 'card'
}

/**
 * Routes one way round as the owner's RouteCards (2026-09-28): a card per
 * place they leave from (departures), each in its livery — liveries.ts: at
 * random, kept for the visit, never two alike side by side — with a row per
 * drawn direction, and the whole rides' pesos: one direction's range, or from
 * the cheapest to the dearest of several, the same pesos its trip card leads
 * with, and only when every way out has a fare rule. The route list stacks
 * them under its header; the public map's hotspot card under "Routes that
 * pass through", or a terminal's "Routes that stage here" (the owner,
 * 2026-09-29), edge to edge in both.
 */
export function RouteCardStack({ routes, back, onRoute, testId }: Props) {
  const places = drawnDepartures(routes, back)

  // Drawn once per stack, not per render: a place whose kept colour would
  // match its neighbour's wears a random other one, and must not flicker.
  const placeKey = places.map((p) => p.from).join('\n')
  const liveries = useMemo(() => (placeKey ? liveriesFor(placeKey.split('\n')) : []), [placeKey])

  const byId = new Map(places.flatMap((p) => p.directions.map((d) => [d.v.id, d.v] as const)))

  return (
    <>
      {places.map((p, i) => (
        <RouteCard
          key={p.from}
          testId={testId}
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
    </>
  )
}
