import type { ReactNode } from 'react'
import type { VariantSummary } from './routes'
import { Sheet } from './Sheet'
import { placeSummary, siblingsOf, stopLabel, type StopSummary } from './stops'

type Props = {
  stop: StopSummary
  /** Directions linked to this hotspot, in stop_sequence order. */
  linkedVariantIds: string[]
  variants: VariantSummary[]
  onSelectVariant: (v: VariantSummary) => void
  /** Every hotspot, so the card can name the place this box belongs to and list its siblings. */
  stops?: readonly StopSummary[]
  /** Show a sibling box on the map: select it and go there. */
  onPickSibling?: (id: string) => void
  /** Buttons along the bottom. The editor passes Edit and Delete; the public map passes nothing. */
  actions?: ReactNode
  onClose: () => void
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
  stops = [],
  onPickSibling,
  actions,
  onClose,
}: Props) {
  const isTerminal = stop.kind === 'terminal'
  const label = stopLabel(stop)
  const siblings = siblingsOf(stop, stops)
  const byId = new Map(variants.map((v) => [v.id, v]))
  const linked = linkedVariantIds
    .map((id) => byId.get(id))
    .filter((v): v is VariantSummary => !!v)

  // Group by route so both directions of one route read as one entry.
  const groups = new Map<string, { signboard: string; directions: VariantSummary[] }>()
  for (const v of linked) {
    const g = groups.get(v.route_id) ?? { signboard: v.route?.name ?? '(unnamed)', directions: [] }
    g.directions.push(v)
    groups.set(v.route_id, g)
  }

  return (
    <Sheet
      onClose={onClose}
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

      <p className="mt-3 text-xs font-medium text-neutral-500">
        {isTerminal ? 'Routes that stage here' : 'Routes that pass through'}
      </p>
      {groups.size === 0 ? (
        <p className="mt-1 text-sm text-neutral-500">
          {isTerminal ? 'None recorded yet.' : 'No saved route passes through here yet.'}
        </p>
      ) : (
        <ul className="mt-1 space-y-2">
          {[...groups.values()].map((g) => (
            <li key={g.signboard}>
              <p className="text-sm font-medium text-neutral-900">{g.signboard}</p>
              <ul className="mt-0.5 flex flex-wrap gap-1">
                {g.directions.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => onSelectVariant(v)}
                      title="Show this direction on the map"
                      className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700
                                 hover:bg-neutral-900 hover:text-white"
                    >
                      {v.direction_name}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {actions && <div className="mt-4 flex gap-2">{actions}</div>}
    </Sheet>
  )
}
