import { departures, type VariantSummary } from './routes'

type Props = {
  /** Every direction of every route to list, slots included. */
  routes: readonly VariantSummary[]
  /** Whether the routes are shown the way back rather than outbound. */
  back: boolean
  /** Called with the direction picked. */
  onRoute: (v: VariantSummary) => void
  /** The `data-testid` of each place and of each row: `<prefix>-origin`, `<prefix>-item`. */
  testId: string
}

/**
 * Routes one way round, grouped by the place they leave from — Tala, then
 * → SM Fairview and → Novaliches. The chooser under a tap shows its routes
 * so, and the hotspot card shows the routes through its box the same way
 * (the owner's ask, 2026-09-26: one shape for "the routes here", wherever
 * it is asked). A row still a slot says so and opens nothing. Full-bleed
 * rows: a whole row is the target, not the words inside it.
 */
export function Departures({ routes, back, onRoute, testId }: Props) {
  return (
    <>
      {departures(routes, back).map((p) => (
        <li key={p.from} data-testid={`${testId}-origin`} className="border-b border-neutral-200 last:border-b-0">
          <p className="px-4 pt-2.5 text-sm font-semibold text-neutral-900">{p.from}</p>
          <ul className="pb-1">
            {p.directions.map(({ v, to, drawn }) => (
              <li key={v.id}>
                <button
                  type="button"
                  data-testid={`${testId}-item`}
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
    </>
  )
}
