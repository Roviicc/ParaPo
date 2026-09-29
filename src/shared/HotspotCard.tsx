import { useState, type ReactNode } from 'react'
import { Departures } from './Departures'
import type { Livery } from './liveries'
import { RouteCardStack } from './RouteCardStack'
import { departures, drawnDepartures, type VariantSummary } from './routes'
import { Sheet } from './Sheet'
import { placeSummary, siblingsOf, stopLabel, type StopSummary } from './stops'
import { SwitchIcon } from './SwitchIcon'

type Props = {
  stop: StopSummary
  /** Directions linked to this hotspot, in stop_sequence order. */
  linkedVariantIds: string[]
  variants: VariantSummary[]
  /** Called with the direction picked, and, from a RouteCard, the colour its card wore: its trip wears the same. */
  onSelectVariant: (v: VariantSummary, livery?: Livery) => void
  /**
   * The routes through here as the owner's RouteCards, as the route list
   * shows them — the public map's, 2026-09-29. Without it, the rows the
   * studio keeps: their "Not mapped yet" is its list of returns still to draw.
   */
  routeCards?: boolean
  /** Every hotspot, so the card can name the place this box belongs to and list its siblings. */
  stops?: readonly StopSummary[]
  /** Show a sibling box on the map: select it and go there. */
  onPickSibling?: (id: string) => void
  /** Buttons along the bottom. The editor passes Edit and Delete; the public map passes nothing. */
  actions?: ReactNode
  onClose: () => void
  /** Kept but not shown, while a trip picked from it is on top: ‹ comes back to it as it was. */
  hidden?: boolean
}

/**
 * What anyone sees when they tap a hotspot. The card does not know who is
 * looking: whoever renders it decides which actions to offer.
 *
 * `Sheet` decides the shape. The peek is the name and what kind of place it
 * is; the list of routes through it is what the sheet is pulled up for.
 */
export function HotspotCard({
  stop,
  linkedVariantIds,
  variants,
  onSelectVariant,
  routeCards = false,
  stops = [],
  onPickSibling,
  actions,
  onClose,
  hidden,
}: Props) {
  const isTerminal = stop.kind === 'terminal'
  const label = stopLabel(stop)
  const siblings = siblingsOf(stop, stops)
  const byId = new Map(variants.map((v) => [v.id, v]))
  const linked = linkedVariantIds
    .map((id) => byId.get(id))
    .filter((v): v is VariantSummary => !!v)
  // The routes through here, listed as the chooser under a tap lists them:
  // one way round, by the place each leaves from, ⇄ for the way back. Both
  // directions of a route are linked to a box on a two-way road, so each
  // route shows once either way round; a route linked one way only is a
  // slot the other way, and reads "not mapped yet" there.
  // A box on a one-way street, or beside one carriageway, is passed one way
  // only: then that way is the one shown, and there is nothing to flip to.
  // The RouteCards list drawn directions only (the owner dropped "not mapped
  // yet" from them, 2026-09-28), so for them a way round with nothing drawn
  // is no way round at all.
  const listed = routeCards ? drawnDepartures : departures
  const [flipped, setFlipped] = useState(false)
  const there = listed(linked, false).length > 0
  const backToo = listed(linked, true).length > 0
  const back = there && backToo ? flipped : backToo
  const flipLabel = back ? 'Show the way there' : 'Show the way back'
  const none = routeCards ? !there && !backToo : linked.length === 0

  return (
    <Sheet
      onClose={onClose}
      hidden={hidden}
      peek={
        <>
          <p className="truncate text-base font-semibold text-neutral-900">{label}</p>
          {label !== stop.name && (
            <p className="truncate text-xs text-neutral-500">{stop.name}</p>
          )}
          <span
            className={
              'mt-1 inline-block rounded-full px-2 py-0.5 text-xs ' +
              (isTerminal ? 'bg-sky-50 text-sky-700' : 'bg-orange-50 text-orange-700')
            }
          >
            {isTerminal ? 'Terminal · routes start here' : 'Hintuan · wait and board here'}
          </span>
        </>
      }
    >
      {stop.note && <p className="mt-3 text-sm text-neutral-700">{stop.note}</p>}

      {/* The place this box belongs to, when it has company: the map shows
          *that* they belong together, this says *what* the place has, and each
          sibling is one tap away — a rider at a hintuan looking for the
          terminal. Decided with the owner 2026-09-22. */}
      {siblings.length > 0 && (
        <div data-testid="card-place" className="mt-3 rounded-lg bg-neutral-50 px-3 py-2">
          <p className="text-xs font-medium text-neutral-600">
            Part of {label} · {placeSummary([stop, ...siblings])}
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {siblings.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  data-testid="card-sibling"
                  onClick={() => onPickSibling?.(s.id)}
                  disabled={!onPickSibling}
                  title="Show this box on the map"
                  className={
                    'rounded-full px-2.5 py-1 text-xs ' +
                    (s.kind === 'terminal' ? 'bg-sky-50 text-sky-800' : 'bg-orange-50 text-orange-800') +
                    (onPickSibling ? ' hover:bg-neutral-900 hover:text-white' : '')
                  }
                >
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <p className="min-w-0 flex-1 text-xs font-medium text-neutral-500">
          {isTerminal ? 'Routes that stage here' : 'Routes that pass through'}
        </p>
        {there && backToo && (
          <button
            type="button"
            data-testid="card-flip"
            aria-pressed={back}
            onClick={() => setFlipped((b) => !b)}
            aria-label={flipLabel}
            title={flipLabel}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-700 hover:bg-neutral-100"
          >
            <SwitchIcon />
          </button>
        )}
      </div>
      {none ? (
        <p className="mt-1 text-sm text-neutral-500">
          {isTerminal ? 'None recorded yet.' : 'No saved route passes through here yet.'}
        </p>
      ) : routeCards ? (
        // Edge to edge, as the route list stacks them (the owner, 2026-09-29);
        // the rest of this card waits for his hintuan design.
        <div className="-mx-4 mt-1">
          <RouteCardStack routes={linked} back={back} onRoute={onSelectVariant} testId="card" />
        </div>
      ) : (
        <ul className="-mx-4 mt-1 border-t border-neutral-200">
          <Departures routes={linked} back={back} onRoute={onSelectVariant} testId="card" />
        </ul>
      )}

      {actions && <div className="mt-4 flex gap-2">{actions}</div>}
    </Sheet>
  )
}
