import type { Drawing } from './use-drawing'

/**
 * What a finger has instead of a right-click and a shift-click: the bar of a
 * point it tapped, the Put back after that bar's Delete, and the offer to
 * follow a saved line a tap landed on. Each shows only after a touch (see
 * useDrawEvents.ts); a mouse keeps its clicks and never sees them.
 */

const BAR = 'rounded-2xl bg-white p-1.5 text-sm shadow-lg ring-1 ring-black/10'
const BUTTON =
  'min-h-11 rounded-xl px-3 text-sm text-neutral-800 ring-1 ring-neutral-200 hover:bg-neutral-50 disabled:opacity-40'

/**
 * The selected point's actions: Delete, and for a route each stretch beside it
 * turned between following the streets and going straight. A hotspot keeps at
 * least three corners, so its third-from-last cannot be deleted here.
 */
export function PointBar({ draw }: { draw: Drawing }) {
  const i = draw.selected
  if (i === null) return null
  const n = draw.controlPoints.length
  const area = draw.area
  const noun = area ? 'Corner' : 'Point'
  const canDelete = !area || n > 3
  // The stretch into this point is gap i - 1, the one out of it gap i.
  const stretches = area
    ? []
    : [
        { gap: i - 1, label: `Stretch from point ${i}` },
        { gap: i, label: `Stretch to point ${i + 2}` },
      ].filter((s) => s.gap >= 0 && s.gap < n - 1)

  return (
    <div data-testid="point-bar" className={BAR + ' w-80 max-w-full'}>
      <div className="flex items-center gap-2 pl-2">
        <span className="flex-1 font-medium text-neutral-900">
          {noun} {i + 1} of {n}
        </span>
        {canDelete ? (
          <button type="button" onClick={draw.deleteSelected} className={BUTTON + ' text-red-600 ring-red-200'}>
            Delete
          </button>
        ) : (
          <span className="text-xs text-neutral-500">A hotspot needs 3 corners</span>
        )}
        <button
          type="button"
          onClick={() => draw.select(null)}
          aria-label="Close"
          className="min-h-11 min-w-11 rounded-xl text-neutral-500 hover:bg-neutral-100"
        >
          ✕
        </button>
      </div>
      {stretches.map(({ gap, label }) => {
        const straight = draw.segments[gap]?.snap === 'freehand'
        return (
          <div key={gap} className="mt-1 flex items-center gap-2 border-t border-neutral-100 pl-2 pt-1">
            <span className="flex-1 text-neutral-600">
              {label}
              <span className="block text-xs text-neutral-400">{straight ? 'straight' : 'follows the streets'}</span>
            </span>
            <button
              type="button"
              data-testid={`stretch-${gap}`}
              onClick={() => void draw.toggleSegment(gap)}
              className={BUTTON}
            >
              {straight ? 'Follow streets' : 'Go straight'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** For a few seconds after the point bar's Delete: the point back where it was. */
export function PutBack({ draw }: { draw: Drawing }) {
  if (!draw.canPutBack) return null
  return (
    <div className={BAR + ' flex items-center gap-2 pl-3'}>
      <span className="text-neutral-600">{draw.area ? 'Corner' : 'Point'} deleted</span>
      <button type="button" onClick={draw.putBack} className={BUTTON}>
        Put back
      </button>
    </div>
  )
}

/** A finger tap added a point on a saved line: follow that line to its end instead. */
export function FollowChip({ draw }: { draw: Drawing }) {
  if (!draw.followOffer) return null
  return (
    <button
      type="button"
      data-testid="follow-chip"
      onClick={draw.takeFollowOffer}
      className="min-h-11 rounded-full bg-white px-4 text-sm font-medium text-neutral-900 shadow-lg ring-1 ring-black/10 hover:bg-neutral-50"
    >
      Follow this line to its end ›
    </button>
  )
}
