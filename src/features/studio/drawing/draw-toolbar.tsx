import { useEffect, useState } from 'react'
import { coarsePointer } from '@/features/routes/map/tap'
import { FollowChip, PointBar, PutBack } from './point-bar'
import type { Drawing } from './use-drawing'

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
 * corners, has no router to wait for, and has no Tap | Draw switch because
 * every edge is already straight.
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
  ends = null,
}: {
  draw: Drawing
  onDone: () => void
  /** Whether the keyboard shortcuts may act. False while a panel is open. */
  keys?: boolean
  /**
   * While extending: the places the direction being extended runs from and
   * to, and whether its stored line runs the other way round, so the two
   * keep buttons can say which part they keep in the jeep's own order.
   */
  ends?: { from: string; to: string; backwards: boolean } | null
}) {
  if (draw.picking) return <PickBar draw={draw} ends={ends} />
  return <Toolbar draw={draw} onDone={onDone} keys={keys} />
}

/**
 * Extend, before anything is drawn: tap where the new route leaves the line,
 * then keep the part before that spot or the part after it.
 */
function PickBar({ draw, ends }: { draw: Drawing; ends: { from: string; to: string; backwards: boolean } | null }) {
  const spot = draw.picking?.spot
  const from = ends?.from ?? 'the start'
  const to = ends?.to ?? 'the end'
  // The keep buttons speak in travel order; `part` is the stored line's order.
  const options = [
    { part: 'start' as const, label: `Keep ${from} → here`, hint: 'the new route carries on from here' },
    { part: 'end' as const, label: `Keep here → ${to}`, hint: 'the new route joins here' },
  ].map((o) => (ends?.backwards ? { ...o, part: o.part === 'start' ? ('end' as const) : ('start' as const) } : o))

  return (
    <div className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 z-10 w-max max-w-[calc(100%-2rem)] -translate-x-1/2">
      <p className="mb-2 text-center text-[11px] text-neutral-600 [text-shadow:0_1px_2px_white]">
        {spot
          ? `${(spot.metres / 1000).toFixed(2)} km along the line · tap again to move the spot`
          : 'Tap the blue line where the new route leaves it'}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1 rounded-2xl bg-white p-1.5 shadow-lg ring-1 ring-black/10">
        {spot ? (
          options.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => draw.keep(o.part)}
              data-testid={`keep-${o.part}`}
              className="rounded-xl px-3 py-1.5 text-left text-sm text-neutral-800 hover:bg-neutral-100"
            >
              <span className="font-medium">{o.label}</span>
              <span className="block text-[11px] text-neutral-500">{o.hint}</span>
            </button>
          ))
        ) : (
          <span className="px-3 text-xs text-neutral-500">Extend a route</span>
        )}
        <button
          type="button"
          onClick={draw.cancel}
          title="Stop extending"
          className="rounded-full px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

function Toolbar({ draw, onDone, keys }: { draw: Drawing; onDone: () => void; keys: boolean }) {
  const points = draw.controlPoints.length
  const freehandCount = draw.segments.filter((s) => s?.snap === 'freehand').length
  const area = draw.area
  const minPoints = area ? 3 : 2
  const noun = area ? 'corner' : 'point'
  const uTurns = draw.uTurns.length
  // A stand-in still on the line is not road geometry yet, and must not be saved.
  const waiting = draw.snapping > 0 || draw.unresolved
  const canDone = points >= minPoints && !waiting
  // A phone has no hover for a title, no right-click and no shift key: it is
  // told what a finger does, asked before ✕ throws the drawing away, and
  // gets the point bar (PointBar.tsx) for what the mouse's clicks do.
  const finger = coarsePointer()
  const [confirming, setConfirming] = useState(false)
  const [uTurnHelp, setUTurnHelp] = useState(false)
  const uTurnText =
    uTurns === 1
      ? 'The route turns back on itself at the ringed point, drawn in amber. Drag the point to the corner to fix it, or keep it if the jeep really turns there.'
      : 'The route turns back on itself at the ringed points, drawn in amber. Drag a point to its corner to fix it, or keep it if the jeep really turns there.'
  const doneReason =
    points < minPoints ? `Add at least ${minPoints} ${noun}s` : waiting ? 'Waiting for the router' : null

  useEffect(() => {
    // While ✕ asks, Enter must not save what is about to be thrown away.
    if (!keys || confirming) return
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
        // Same as the button: nothing to undo is nothing to do, but the
        // browser's own undo must not run on the map either way.
        e.preventDefault()
        if (points > 0) draw.undo()
      } else if (!mod && !e.altKey && e.key === 'Enter') {
        // Enter on a focused button or link presses it, as everywhere: it
        // also opened the save panel under it (review of 2026-10-03).
        const pressable = (e.target as Element | null)?.closest?.('button, a[href], [role="button"], [role^="menuitem"], summary')
        if (!canDone || pressable) return
        e.preventDefault()
        onDone()
      } else if (!mod && !e.altKey && !area && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        draw.setFreehand(!draw.freehand)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keys, confirming, points, canDone, area, draw, onDone])

  const hint = uTurnHelp
    ? uTurnText
    : finger
      ? area
        ? points === 0
          ? 'Tap the corners of the hotspot'
          : 'Tap to add a corner · tap a corner for options · drag one to move'
        : points === 0
          ? 'Tap where the jeep starts'
          : 'Tap to add · tap a point for options · drag a point to move'
      : points === 0
        ? null
        : area
          ? 'drag a corner to move · right-click to delete · click an edge to insert a corner'
          : 'drag a point to move · right-click it to delete · click the line to insert · shift-click a stretch to straighten it · right-click a blue line to follow it to its end'
  const contextual = draw.selected !== null || draw.canPutBack || draw.followOffer !== null

  return (
    <div
      data-testid="draw-toolbar"
      className="absolute left-1/2 z-10 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col items-center gap-2
                 bottom-[calc(1.5rem+env(safe-area-inset-bottom))]"
    >
      {/* Dragging and right-clicking are not discoverable on a bare map. */}
      {hint && !contextual && (
        <p
          className={
            finger
              ? 'rounded-full bg-neutral-900/80 px-3 py-1.5 text-center text-xs text-white'
              : 'text-center text-[11px] text-neutral-600 [text-shadow:0_1px_2px_white]'
          }
        >
          {hint}
        </p>
      )}

      <PointBar draw={draw} />
      <PutBack draw={draw} />
      <FollowChip draw={draw} />

      {!area && <TapDraw draw={draw} />}

      <div className="flex flex-col items-center rounded-3xl bg-white p-1.5 shadow-lg ring-1 ring-black/10">
        <span className="px-3 pt-0.5 text-center text-xs tabular-nums text-neutral-500">
          {area && (
            <span className="font-medium text-neutral-700">
              {area.kind === 'terminal' ? 'Terminal' : 'Hintuan'} ·{' '}
            </span>
          )}
          {points} {points === 1 ? noun : `${noun}s`}
          {!area && draw.line.length > 1 && <> · {formatDistance(draw.metres)}</>}
          {!area && freehandCount > 0 && <span className="text-neutral-400"> · {freehandCount} straight</span>}
          {!area && uTurns > 0 && (
            <button
              type="button"
              onClick={() => setUTurnHelp(!uTurnHelp)}
              title={uTurnText}
              className="text-amber-700 underline decoration-dotted underline-offset-2"
            >
              · ⚠ {uTurns} U-turn{uTurns === 1 ? '' : 's'}
            </button>
          )}
          {draw.snapping > 0 && <span className="text-rose-600"> · snapping…</span>}
          {finger && doneReason && points > 0 && !draw.snapping && (
            <span className="text-neutral-400"> · {doneReason.toLowerCase()}</span>
          )}
        </span>

        {confirming ? (
          <div className="flex items-center gap-1">
            <span className="px-2 text-sm text-neutral-700">Discard this {area ? 'hotspot' : 'route'}?</span>
            <button type="button" onClick={() => setConfirming(false)} className={TOOL}>
              Keep
            </button>
            <button type="button" onClick={draw.cancel} className={TOOL + ' text-red-600'}>
              Discard
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={draw.undo}
              disabled={points === 0}
              title={`Undo last ${noun} (Ctrl+Z)`}
              className={TOOL}
            >
              ↶ Undo
            </button>

            <button
              type="button"
              onClick={onDone}
              disabled={!canDone}
              title={doneReason ?? (area ? 'Save this hotspot (Enter)' : 'Save this route (Enter)')}
              className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white pointer-coarse:min-h-11
                         disabled:cursor-not-allowed disabled:opacity-40"
            >
              ✓ Done
            </button>

            <button
              type="button"
              onClick={finger && points > 0 ? () => setConfirming(true) : draw.cancel}
              title={area ? 'Discard this hotspot' : 'Discard this route'}
              className={TOOL + ' text-neutral-500 pointer-coarse:min-w-11'}
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** A tool button: 44 px tall under a finger, as small as ever under a mouse. */
const TOOL =
  'rounded-full px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 pointer-coarse:min-h-11 disabled:cursor-not-allowed disabled:opacity-40'

/**
 * Tap | Draw (the owner's pick, 2026-10-02, after AllTrails' route builder):
 * how the next stretch is drawn. Tap follows the streets, Draw goes straight
 * from point to point. It is the freehand switch the F key flips; a stretch
 * already drawn is turned from the point bar, or with a shift-click.
 */
function TapDraw({ draw }: { draw: Drawing }) {
  const option = (straight: boolean, label: string, title: string) => (
    <button
      type="button"
      aria-pressed={draw.freehand === straight}
      onClick={() => draw.setFreehand(straight)}
      title={title}
      className={
        'rounded-full px-4 py-1.5 text-sm font-medium transition-colors pointer-coarse:min-h-11 ' +
        (draw.freehand === straight ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100')
      }
    >
      {label}
    </button>
  )
  return (
    <div data-testid="tap-draw" className="flex rounded-full bg-white p-1 shadow-lg ring-1 ring-black/10">
      {option(false, 'Tap', 'New stretches follow the streets (F)')}
      {option(true, 'Draw', 'New stretches go straight from point to point, for paths the router refuses (F)')}
    </div>
  )
}
