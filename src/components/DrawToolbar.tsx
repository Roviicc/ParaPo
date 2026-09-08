import type { Drawing } from '../lib/useDrawing'

function formatDistance(metres: number) {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(2)} km`
}

/**
 * Replaces the single idle button while drawing. Deliberately small: the map
 * is the document, and this is the only chrome allowed to compete with it.
 */
export function DrawToolbar({ draw, onDone }: { draw: Drawing; onDone: () => void }) {
  const points = draw.controlPoints.length
  const freehandCount = draw.segments.filter((s) => s?.snap === 'freehand').length

  return (
    <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
      {/* Dragging and right-clicking are not discoverable on a bare map. */}
      {points > 0 && (
        <p className="mb-2 text-center text-[11px] text-neutral-600 [text-shadow:0_1px_2px_white]">
          drag a point to move · right-click to delete · click the line to insert ·
          shift-click a stretch to straighten it
        </p>
      )}

      <div className="flex items-center gap-1 rounded-full bg-white p-1.5 shadow-lg ring-1 ring-black/10">
        <span className="px-3 text-xs tabular-nums text-neutral-500">
          {points} {points === 1 ? 'point' : 'points'}
          {draw.line.length > 1 && <> · {formatDistance(draw.metres)}</>}
          {freehandCount > 0 && (
            <span className="text-neutral-400"> · {freehandCount} freehand</span>
          )}
          {draw.snapping > 0 && <span className="text-rose-600"> · snapping…</span>}
        </span>

        <button
          type="button"
          onClick={() => draw.setFreehand(!draw.freehand)}
          aria-pressed={draw.freehand}
          title={
            draw.freehand
              ? 'New segments are straight lines. Click to route them along roads again.'
              : 'New segments follow roads. Click to draw straight lines instead — for paths the router refuses.'
          }
          className={
            'rounded-full px-3 py-2 text-sm transition-colors ' +
            (draw.freehand
              ? 'bg-rose-600 text-white'
              : 'text-neutral-700 hover:bg-neutral-100')
          }
        >
          〰 Freehand
        </button>

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
          onClick={onDone}
          disabled={points < 2 || draw.snapping > 0}
          title={
            points < 2
              ? 'Add at least two points'
              : draw.snapping > 0
                ? 'Waiting for the router'
                : 'Save this route'
          }
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
    </div>
  )
}
