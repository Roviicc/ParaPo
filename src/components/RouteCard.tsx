import { lineLength } from '../lib/geo'
import { MODES, variantLine, type VariantRow } from '../lib/routes'

type Props = {
  variant: VariantRow
  isOwner: boolean
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}

/** What a visitor sees when they tap a route. Owners also get edit and delete. */
export function RouteCard({ variant, isOwner, onEdit, onDelete, onClose }: Props) {
  const r = variant.route
  const km = (lineLength(variantLine(variant)) / 1000).toFixed(1)
  const mode = MODES.find((m) => m.value === r?.mode)?.label ?? r?.mode ?? ''
  const ends = [variant.origin_terminal, variant.destination_terminal].filter(Boolean).join(' → ')

  return (
    <div
      className="absolute left-4 top-4 z-10 w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-4
                 shadow-xl ring-1 ring-black/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-neutral-900">{r?.signboard}</p>
          {r?.long_name && <p className="truncate text-xs text-neutral-500">{r.long_name}</p>}
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

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-neutral-500">Direction</dt>
        <dd className="text-neutral-900">{variant.direction_name}</dd>
        {ends && (
          <>
            <dt className="text-neutral-500">Terminals</dt>
            <dd className="text-neutral-900">{ends}</dd>
          </>
        )}
        <dt className="text-neutral-500">Mode</dt>
        <dd className="text-neutral-900">{mode}</dd>
        <dt className="text-neutral-500">Length</dt>
        <dd className="text-neutral-900">{km} km</dd>
        {r?.fare_note && (
          <>
            <dt className="text-neutral-500">Fare</dt>
            <dd className="text-neutral-900">{r.fare_note}</dd>
          </>
        )}
        <dt className="text-neutral-500">Status</dt>
        <dd>
          <span
            className={
              'rounded-full px-2 py-0.5 text-xs ' +
              (variant.confidence === 'verified'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-700')
            }
          >
            {variant.confidence === 'verified' ? 'verified by riding' : 'drawn, not yet ridden'}
          </span>
        </dd>
      </dl>

      {isOwner && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
          >
            Edit route
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
