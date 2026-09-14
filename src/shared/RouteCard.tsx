import type { ReactNode } from 'react'
import { lineLength } from './geo'
import { MODES, variantLine, type VariantRow } from './routes'

type Props = {
  variant: VariantRow
  /** Buttons along the bottom. The editor passes Edit and Delete; the public map passes nothing. */
  actions?: ReactNode
  onClose: () => void
}

/**
 * What anyone sees when they tap a route. The card does not know who is
 * looking: whoever renders it decides which actions to offer.
 */
export function RouteCard({ variant, actions, onClose }: Props) {
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

      {actions && <div className="mt-4 flex gap-2">{actions}</div>}
    </div>
  )
}
