import { useEffect, useMemo } from 'react'
import { fareFor, hasFareRule, manilaDate, pesoRange, ruleOn } from './fares'
import { lineLength } from './geo'
import { liveriesFor } from './liveries'
import { RouteCard } from './RouteCard'
import { RouteCardHeader } from './RouteCardHeader'
import { departures, variantLine, type VariantSummary } from './routes'

type Props = {
  /** Every direction of every route under the tap, slots included, as the hooks hand them over. */
  routes: readonly VariantSummary[]
  /** Whether the way back is showing rather than the way there. */
  back: boolean
  /** SWITCH: show them all the other way round. */
  onFlip: () => void
  /** Called with the direction picked. */
  onRoute: (v: VariantSummary) => void
  onClose: () => void
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
 * Docked along the bottom with its top corners rounded until `@float:`,
 * then floating top-left, 368 wide, as his frames lay it; taller than the
 * room, the cards scroll under the header, with no scrollbar drawn (his
 * ask, the same day). A tap that also hit a hotspot
 * still gets the Chooser, which the owner has not redrawn yet.
 */
export function RouteCardList({ routes, back, onFlip, onRoute, onClose }: Props) {
  // Escape closes, as it does any dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

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

  const today = ruleOn(manilaDate())
  const fareOf = (vs: readonly VariantSummary[]): string | undefined => {
    if (!today) return undefined
    // Every way out priced, or no fare line: a UV Express beside a jeepney
    // must not wear the jeepney's pesos. The owner's routes are jeepneys
    // (the Jeep in the header says so); the studio can save other modes.
    if (!vs.every((v) => hasFareRule(v.route?.mode))) return undefined
    const priced = vs.map((v) => fareFor(lineLength(variantLine(v)), today.rule))
    if (priced.length === 0) return undefined
    const low = Math.min(...priced.map((f) => f.low.regular))
    const high = Math.max(...priced.map((f) => f.high.regular))
    return pesoRange(low, high)
  }

  const count = `${places.length} ${places.length === 1 ? 'Route' : 'Routes'}`
  const byId = new Map(places.flatMap((p) => p.directions.map((d) => [d.v.id, d.v] as const)))

  return (
    <div
      role="dialog"
      aria-label={count}
      data-testid="chooser"
      className="absolute inset-x-0 bottom-0 z-10 flex max-h-[60vh] flex-col overflow-clip rounded-t-3xl bg-surface
                 pb-[env(safe-area-inset-bottom)]
                 @float:inset-x-auto @float:bottom-auto @float:top-4 @float:left-4 @float:max-h-[calc(100%-2rem)]
                 @float:w-92 @float:pb-0"
    >
      <RouteCardHeader
        routeCount={count}
        onSwitch={onFlip}
        switchable={switchable}
        back={back}
        onClose={onClose}
      />
      {/* Scrolls, but draws no scrollbar: the owner's ask of 2026-09-28. */}
      <div className="min-h-0 overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
        {places.map((p, i) => (
          <RouteCard
            key={p.from}
            livery={liveries[i]}
            fare={fareOf(p.directions.map((d) => d.v))}
            routeOrigin={p.from}
            endPoints={p.directions.map((d) => ({ id: d.v.id, routeDirection: d.to }))}
            onPick={(id) => {
              const v = byId.get(id)
              if (v) onRoute(v)
            }}
          />
        ))}
      </div>
    </div>
  )
}
