import type { VariantRow } from '../lib/routes'
import type { StopRow } from '../lib/stops'

type Props = {
  stop: StopRow
  /** Directions linked to this hotspot, in stop_sequence order. */
  linkedVariantIds: string[]
  variants: VariantRow[]
  isOwner: boolean
  onSelectVariant: (v: VariantRow) => void
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}

/** What a visitor sees when they tap a hotspot. Owners also get edit and delete. */
export function HotspotCard({
  stop,
  linkedVariantIds,
  variants,
  isOwner,
  onSelectVariant,
  onEdit,
  onDelete,
  onClose,
}: Props) {
  const isTerminal = stop.kind === 'terminal'
  const byId = new Map(variants.map((v) => [v.id, v]))
  const linked = linkedVariantIds.map((id) => byId.get(id)).filter((v): v is VariantRow => !!v)

  // Group by route so both directions of one signboard read as one entry.
  const groups = new Map<string, { signboard: string; directions: VariantRow[] }>()
  for (const v of linked) {
    const g = groups.get(v.route_id) ?? { signboard: v.route?.signboard ?? '(unnamed)', directions: [] }
    g.directions.push(v)
    groups.set(v.route_id, g)
  }

  return (
    <div
      className="absolute left-4 top-4 z-10 w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-4
                 shadow-xl ring-1 ring-black/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-neutral-900">{stop.name}</p>
          <span
            className={
              'mt-1 inline-block rounded-full px-2 py-0.5 text-xs ' +
              (isTerminal ? 'bg-sky-50 text-sky-700' : 'bg-orange-50 text-orange-700')
            }
          >
            {isTerminal ? 'Terminal · routes start here' : 'Hintuan · wait and board here'}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full px-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          ✕
        </button>
      </div>

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

      {isOwner && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
          >
            Edit {isTerminal ? 'terminal' : 'hintuan'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg px-3 py-2 text-sm text-red-600 ring-1 ring-red-200 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
