import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

/** How far a drag must travel before it counts as a pull rather than a tap. */
const DRAG_PX = 24

type SheetState = 'peek' | 'open'

/**
 * Drops the `click` the browser sends after a tap on the handle. By the time
 * it is dispatched the sheet has already re-rendered, so the click is aimed at
 * whatever now lies under the finger — the map, which would read it as a tap
 * on nothing and close the card. Caught at the capture phase on the document,
 * before MapLibre sees it, and only if it lands outside the sheet: a click on
 * the sheet's own ✕ or a chooser row is one the visitor meant. Forgotten after
 * a moment if none comes. Not armed after a drag, which sends no click.
 */
function swallowNextClickOutside(sheet: HTMLElement | null) {
  const stop = (e: MouseEvent) => {
    cleanup()
    if (sheet && e.target instanceof Node && sheet.contains(e.target)) return
    e.stopPropagation()
    e.preventDefault()
  }
  const cleanup = () => {
    document.removeEventListener('click', stop, true)
    window.clearTimeout(timer)
  }
  const timer = window.setTimeout(cleanup, 300)
  document.addEventListener('click', stop, true)
}

type Props = {
  /** Always visible: on a phone this is what shows before the sheet is pulled up. */
  peek: ReactNode
  /** The rest, shown when the sheet is open, and always on a wide screen. */
  children?: ReactNode
  onClose: () => void
  /** Phone only: start pulled up. Default 'peek'. */
  initial?: SheetState
  /** data-testid on the root. Default 'card'. */
  testId?: string
}

/**
 * The one container every card on the map lives in.
 *
 * Wide (the container is at least `--container-wide`, 40rem): the floating card
 * ParaPo has always had, top-left, everything shown at once. Narrow: a bottom
 * sheet, because on a phone the map IS the interface and a card pinned to the
 * top-left would cover the very thing it describes. The sheet peeks with just
 * enough to recognise what was tapped, and is pulled up for the rest.
 *
 * The breakpoint is a container query, not a viewport one: the apps mark their
 * root `@container`, so a card looks right in Storybook's small frames too.
 */
export function Sheet({ peek, children, onClose, initial = 'peek', testId = 'card' }: Props) {
  const [state, setState] = useState<SheetState>(initial)
  const rootRef = useRef<HTMLDivElement>(null)

  // Escape closes, as it does any dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // A pointer drag and a tap arrive as the same gesture until it has travelled
  // far enough, so the decision waits for pointermove/pointerup. `handled`
  // stops one drag firing twice. The `click` the browser sends after a tap is
  // swallowed (see swallowNextClickOutside), so only keyboard Enter/Space,
  // which fire click alone, reach onClick.
  const dragRef = useRef<{ startY: number; handled: boolean } | null>(null)

  const toggle = () => setState((s) => (s === 'peek' ? 'open' : 'peek'))

  /** Pulling down while already at peek is how a sheet is dismissed. */
  const pullDown = () => {
    if (state === 'peek') onClose()
    else setState('peek')
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    dragRef.current = { startY: e.clientY, handled: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.handled) return
    const up = drag.startY - e.clientY
    if (up > DRAG_PX) {
      drag.handled = true
      setState('open')
    } else if (up < -DRAG_PX) {
      drag.handled = true
      pullDown()
    }
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    // Travelled less than the threshold: it was a tap, and a click will follow.
    if (drag && !drag.handled) {
      swallowNextClickOutside(rootRef.current)
      toggle()
    }
  }

  /** The browser took the gesture (a scroll, a system edge swipe): it was neither a tap nor a pull. */
  const onPointerCancel = () => {
    dragRef.current = null
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      data-testid={testId}
      data-sheet={state}
      className="absolute bottom-0 left-0 right-0 z-10 rounded-t-2xl bg-white shadow-2xl ring-1
                 ring-black/10 pb-[calc(1rem+env(safe-area-inset-bottom))]
                 @wide:bottom-auto @wide:left-4 @wide:right-auto @wide:top-4 @wide:w-80
                 @wide:max-w-[calc(100%-2rem)] @wide:rounded-t-xl @wide:rounded-b-xl
                 @wide:shadow-xl @wide:pt-4 @wide:pb-4"
    >
      {/*
        `touch-none` matters: without touch-action none the browser claims the
        vertical drag for scrolling and pointermove never reaches us.
      */}
      <button
        type="button"
        data-testid="sheet-handle"
        aria-label="Pull up or down"
        aria-expanded={state === 'open'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={toggle}
        className="flex h-11 w-full touch-none items-center justify-center @wide:hidden"
      >
        <span className="h-1 w-9 rounded-full bg-neutral-300" aria-hidden="true" />
      </button>

      <div className="flex items-start justify-between gap-3 px-4">
        <div className="min-w-0 flex-1">{peek}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full px-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          ✕
        </button>
      </div>

      {children && (
        <div
          className={
            'px-4 @wide:max-h-none @wide:overflow-y-visible ' +
            (state === 'open'
              ? 'max-h-[60vh] overflow-y-auto'
              : 'hidden @wide:block')
          }
        >
          {children}
        </div>
      )}
    </div>
  )
}
