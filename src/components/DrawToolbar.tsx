import type { Drawing } from '../lib/useDrawing'

function formatDistance(metres: number) {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(2)} km`
}

/**
 * Replaces the single idle button while drawing. Deliberately small: the map
 * is the document, this is the only chrome that competes with it.
 */
export function DrawToolbar({ draw }: { draw: Drawing }) {
  const points = draw.controlPoints.length

  return (
    <div
      className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1
                 rounded-full bg-white p-1.5 shadow-lg ring-1 ring-black/10"
    >
      <span className="px-3 text-xs tabular-nums text-neutral-500">
        {points} {points === 1 ? 'point' : 'points'}
        {draw.line.length > 1 && <> · {formatDistance(draw.metres)}</>}
        {draw.snapping > 0 && <span className="text-rose-600"> · snapping…</span>}
      </span>

      <button
        type="button"
        onClick={draw.undo}
        disabled={points === 0}
        title="Undo last point"
        className="rounded-full px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100
                   disabled:cursor-not-allowed disabled:opacity-40"
      >
        ↶ Undo
      </button>

      <button
        type="button"
        disabled
        title="Saving lands in M4"
        className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white
                   disabled:cursor-not-allowed disabled:opacity-40"
      >
        ✓ Done
      </button>

      <button
        type="button"
        onClick={draw.cancel}
        title="Discard this route"
        className="rounded-full px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100"
      >
        ✕
      </button>
    </div>
  )
}
