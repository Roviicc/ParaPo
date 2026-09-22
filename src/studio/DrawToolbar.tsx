import { useEffect } from 'react'
import type { Drawing } from './useDrawing'

function formatDistance(metres: number) {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(2)} km`
}

/** A key pressed while typing belongs to the field, never to the map. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
}

/**
 * Replaces the single idle button while drawing. Deliberately small: the map
 * is the document, and this is the only chrome allowed to compete with it.
 *
 * Serves both a route trace and a hotspot outline. The outline needs three
 * corners, has no router to wait for, and has no freehand toggle because every
 * edge is already straight.
 *
 * Three of the buttons answer to a key as well — Ctrl+Z, Enter, F — but only
 * while `keys` is true: the studio turns them off the moment a panel opens,
 * so Enter in the save form submits the form and Ctrl+Z in a field is the
 * browser's own undo. Esc is deliberately unbound (owner, 2026-09-22): cancel
 * discards the whole trace, and that should not be one stray key away.
 */
export function DrawToolbar({
  draw,
  onDone,
  keys = true,
}: {
  draw: Drawing
  onDone: () => void
  /** Whether the keyboard shortcuts may act. False while a panel is open. */
  keys?: boolean
}) {
  const points = draw.controlPoints.length
  const freehandCount = draw.segments.filter((s) => s?.snap === 'freehand').length
  const area = draw.area
  const minPoints = area ? 3 : 2
  const noun = area ? 'corner' : 'point'
  const uTurns = draw.uTurns.length
  // A stand-in still on the line is not road geometry yet, and must not be saved.
  const waiting = draw.snapping > 0 || draw.unresolved
  const canDone = points >= minPoints && !waiting

  useEffect(() => {
    if (!keys) return
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
        // Same as the button: nothing to undo is nothing to do, but the
        // browser's own undo must not run on the map either way.
        e.preventDefault()
        if (points > 0) draw.undo()
      } else if (!mod && !e.altKey && e.key === 'Enter') {
        if (!canDone) return
        e.preventDefault()
        onDone()
      } else if (!mod && !e.altKey && !area && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        draw.setFreehand(!draw.freehand)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keys, points, canDone, area, draw, onDone])

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
          {!area && uTurns > 0 && (
            <span
              className="text-amber-700"
              title={
                uTurns === 1
                  ? 'The route turns back on itself at the ringed point, drawn in amber. Drag the point to the corner to fix it, or keep it if the jeep really turns there.'
                  : 'The route turns back on itself at the ringed points, drawn in amber. Drag a point to its corner to fix it, or keep it if the jeep really turns there.'
              }
            >
              {' '}
              · ⚠ {uTurns} U-turn{uTurns === 1 ? '' : 's'}
            </span>
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
                ? 'New segments are straight lines. Click to route them along roads again. (F)'
                : 'New segments follow roads. Click to draw straight lines instead — for paths the router refuses. (F)'
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
          title={`Undo last ${noun} (Ctrl+Z)`}
          className="rounded-full px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100
                     disabled:cursor-not-allowed disabled:opacity-40"
        >
          ↶ Undo
        </button>

        <button
          type="button"
          onClick={onDone}
          disabled={!canDone}
          title={
            points < minPoints
              ? `Add at least ${minPoints} ${noun}s`
              : waiting
                ? 'Waiting for the router'
                : area
                  ? 'Save this hotspot (Enter)'
                  : 'Save this route (Enter)'
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
