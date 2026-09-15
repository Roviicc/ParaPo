import type { ReactNode } from 'react'
import type { VariantSummary } from './routes'
import { Sheet } from './Sheet'
import type { StopRow } from './stops'

type Props = {
  stop: StopRow
  /** Directions linked to this hotspot, in stop_sequence order. */
  linkedVariantIds: string[]
  variants: VariantSummary[]
  onSelectVariant: (v: VariantSummary) => void
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
  actions,
  onClose,
}: Props) {
  const isTerminal = stop.kind === 'terminal'
  const byId = new Map(variants.map((v) => [v.id, v]))
  const linked = linkedVariantIds
    .map((id) => byId.get(id))
    .filter((v): v is VariantSummary => !!v)

  // Group by route so both directions of one signboard read as one entry.
  const groups = new Map<string, { signboard: string; directions: VariantSummary[] }>()
  for (const v of linked) {
    const g = groups.get(v.route_id) ?? { signboard: v.route?.signboard ?? '(unnamed)', directions: [] }
    g.directions.push(v)
    groups.set(v.route_id, g)
  }

  return (
    <Sheet
      onClose={onClose}
      peek={
        <>
          <p className="truncate text-base font-semibold text-neutral-900">{stop.name}</p>
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
