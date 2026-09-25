import { departures, groupByRoute, type VariantSummary } from './routes'
import { Sheet } from './Sheet'
import { stopLabel, type StopSummary } from './stops'
import { SwitchIcon } from './SwitchIcon'

type Props = {
  /** Every direction of every route under the tap, slots included. */
  routes?: VariantSummary[]
  stops?: StopSummary[]
  /** Whether the routes are shown the way back rather than outbound. */
  back?: boolean
  /** Show them the other way round. Without it no switch is offered. */
  onFlip?: () => void
  /** Called with the direction picked. */
  onRoute: (v: VariantSummary) => void
  onStop: (s: StopSummary) => void
  onClose: () => void
}

/** "2 routes", "1 hotspot", "2 routes · 1 hotspot". */
function title(routes: number, stops: number): string {
  const parts = []
  if (routes > 0) parts.push(`${routes} ${routes === 1 ? 'route' : 'routes'}`)
  if (stops > 0) parts.push(`${stops} ${stops === 1 ? 'hotspot' : 'hotspots'}`)
  return parts.join(' · ') + ' here'
}

/**
 * Several things under one tap.
 *
 * A finger covers about 20 px of map, and in Metro Manila most roads carry
 * more than one route, so a tap that hits two or three lines is the normal
 * case, not the edge case; a terminal has its own route running through it.
 * Rather than guess which one was meant, list them all: hotspots first (a
 * box is small and deliberate), then the routes. Decided with the owner
 * 2026-09-22.
 *
 * The routes are shown one way round at a time, grouped by the place they
 * leave from — Tala, then → SM Fairview and → Novaliches — with ⇄ to show
 * them all the way back: SM Fairview → Tala, Novaliches → Tala. The map
 * lights what the list shows, each with its arrows and a circle at either
 * end. The owner's layout of 2026-09-25. A row opens that direction's card;
 * one still a slot says so and opens nothing.
 *
 * It opens pulled up: a chooser that only peeks would hide the very choice it
 * exists to offer. Whoever renders it gives it a key from what it lists, so a
 * fresh tap gets a fresh, open sheet.
 */
export function Chooser({ routes = [], stops = [], back = false, onFlip, onRoute, onStop, onClose }: Props) {
  const routeCount = groupByRoute(routes).length
  const places = departures(routes, back)
  const flipLabel = back ? 'Show the way there' : 'Show the way back'
  return (
    <Sheet
      onClose={onClose}
      initial="open"
      testId="chooser"
      peek={
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-base font-semibold text-neutral-900">
            {title(routeCount, stops.length)}
          </p>
          {onFlip && routeCount > 0 && (
            <button
              type="button"
              data-testid="chooser-flip"
              aria-pressed={back}
              onClick={onFlip}
              aria-label={flipLabel}
              title={flipLabel}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-700 hover:bg-neutral-100"
            >
              <SwitchIcon />
            </button>
          )}
        </div>
      }
    >
      {/* Full-bleed rows: a whole row is the target, not the words inside it. */}
      <ul className="-mx-4 mt-3 border-t border-neutral-200">
        {stops.map((s) => (
          <li key={s.id} className="border-b border-neutral-200 last:border-b-0">
            <button
              type="button"
              data-testid="chooser-item"
              onClick={() => onStop(s)}
              className="block w-full px-4 py-2.5 text-left hover:bg-neutral-100"
            >
              <span className="block truncate font-medium text-neutral-900">{stopLabel(s)}</span>
              <span className="block truncate text-xs text-neutral-500">
                {s.kind === 'terminal' ? 'Terminal' : 'Hintuan'}
                {stopLabel(s) !== s.name && ` · ${s.name}`}
              </span>
            </button>
          </li>
        ))}
        {places.map((p) => (
          <li key={p.from} data-testid="chooser-origin" className="border-b border-neutral-200 last:border-b-0">
            <p className="px-4 pt-2.5 text-sm font-semibold text-neutral-900">{p.from}</p>
            <ul className="pb-1">
              {p.directions.map(({ v, to, drawn }) => (
                <li key={v.id}>
                  <button
                    type="button"
                    data-testid="chooser-item"
                    disabled={!drawn}
                    onClick={() => drawn && onRoute(v)}
                    className="flex w-full items-baseline gap-2 px-4 py-2 text-left hover:bg-neutral-100
                               disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <span aria-hidden="true" className="text-neutral-400">
                      →
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={'block truncate font-medium ' + (drawn ? 'text-neutral-900' : 'text-neutral-400')}>
                        {to}
                      </span>
                      {!drawn && <span className="block truncate text-xs text-amber-700">Not mapped yet</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
