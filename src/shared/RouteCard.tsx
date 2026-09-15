import type { ReactNode } from 'react'
import { lineLength } from './geo'
import { MODES, variantLine, type VariantSummary } from './routes'
import { Sheet } from './Sheet'

type Props = {
  variant: VariantSummary
  /** Buttons along the bottom. The editor passes Edit and Delete; the public map passes nothing. */
  actions?: ReactNode
  onClose: () => void
}

/**
 * What anyone sees when they tap a route. The card does not know who is
 * looking: whoever renders it decides which actions to offer.
 *
 * `Sheet` decides the shape — a floating card on a wide screen, a bottom sheet
 * on a phone. The peek is the signboard and the direction, which is the least
 * a commuter needs to know whether this is the right jeep.
 */
export function RouteCard({ variant, actions, onClose }: Props) {
  const r = variant.route
  const km = (lineLength(variantLine(variant)) / 1000).toFixed(1)
  const mode = MODES.find((m) => m.value === r?.mode)?.label ?? r?.mode ?? ''
  const ends = [variant.origin_terminal, variant.destination_terminal].filter(Boolean).join(' → ')

  return (
    <Sheet
      onClose={onClose}
      peek={
        <>
          <p className="truncate text-base font-semibold text-neutral-900">{r?.signboard}</p>
          {r?.long_name && <p className="truncate text-xs text-neutral-500">{r.long_name}</p>}
          {/*
            Phone only. On a wide screen this row keeps its place in the single
            <dl> below, so the value column lines up with every other row.
          */}
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-sm @wide:hidden">
            <dt className="text-neutral-500">Direction</dt>
            <dd className="truncate text-neutral-900">{variant.direction_name}</dd>
          </dl>
        </>
      }
    >
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="hidden text-neutral-500 @wide:block">Direction</dt>
        <dd className="hidden text-neutral-900 @wide:block">{variant.direction_name}</dd>
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
    </Sheet>
  )
}
