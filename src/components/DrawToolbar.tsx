import type { Drawing } from '../lib/useDrawing'

function formatDistance(metres: number) {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(2)} km`
}

/**
 * Replaces the single idle button while drawing. Deliberately small: the map
 * is the document, and this is the only chrome allowed to compete with it.
 *
 * Serves both a route trace and a hotspot outline. The outline needs three
 * corners, has no router to wait for, and has no freehand toggle because every
 * edge is already straight.
 */
export function DrawToolbar({ draw, onDone }: { draw: Drawing; onDone: () => void }) {
  const points = draw.controlPoints.length
  const freehandCount = draw.segments.filter((s) => s?.snap === 'freehand').length
  const area = draw.area
  const minPoints = area ? 3 : 2
  const noun = area ? 'corner' : 'point'

  return (
    <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
      {/* Dragging and right-clicking are not discoverable on a bare map. */}
      {points > 0 && (
        <p className="mb-2 text-center text-[11px] text-neutral-600 [text-shadow:0_1px_2px_white]">
          {area
            ? 'drag a corner to move · right-click to delete · click an edge to insert a corner'
            : 'drag a point to move · right-click to delete · click the line to insert · shift-click a stretch to straighten it'}
        </p>
      )}

      <div className="flex items-center gap-1 rounded-full bg-white p-1.5 shadow-lg ring-1 ring-black/10">
        <span className="px-3 text-xs tabular-nums text-neutral-500">
          {area && (
            <span className="font-medium text-neutral-700">
              {area.kind === 'terminal' ? 'Terminal' : 'Hintuan'} ·{' '}
            </span>
          )}
          {points} {points === 1 ? noun : `${noun}s`}
          {!area && draw.line.length > 1 && <> · {formatDistance(draw.metres)}</>}
          {!area && freehandCount > 0 && (
            <span className="text-neutral-400"> · {freehandCount} freehand</span>
          )}
          {draw.snapping > 0 && <span className="text-rose-600"> · snapping…</span>}
        </span>

        {!area && (
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
        )}

        <button
          type="button"
          onClick={draw.undo}
          disabled={points === 0}
          title={`Undo last ${noun}`}
          className="rounded-full px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100
                     disabled:cursor-not-allowed disabled:opacity-40"
        >
          ↶ Undo
        </button>

        <button
          type="button"
          onClick={onDone}
          disabled={points < minPoints || draw.snapping > 0}
          title={
            points < minPoints
              ? `Add at least ${minPoints} ${noun}s`
              : draw.snapping > 0
                ? 'Waiting for the router'
                : area
                  ? 'Save this hotspot'
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
          title={area ? 'Discard this hotspot' : 'Discard this route'}
          className="rounded-full px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
