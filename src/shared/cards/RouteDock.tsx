import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react'
import { useDialogFocus } from './useDialogFocus'
import { useEscape } from './useEscape'
import { DRAG_PX, snapAfter, swallowTheTapsClick, type Snap } from './sheetGesture'

type Props = {
  /** What a screen reader calls it: the list by its count, a trip by its direction. */
  label: string
  /** The suites find the list as `chooser` and a direction's card as `card`. */
  testId: 'chooser' | 'card'
  /** Fixed at the top; everything else scrolls under it. */
  header: ReactNode
  /** Escape does what ✕ does. */
  onClose: () => void
  /**
   * Kept, but not shown: the route list, while a trip it opened is on top, so
   * that ‹ finds it as it was left — scrolled where it was, in the same
   * colours. Escape is the trip's then, not the list's.
   */
  hidden?: boolean
  /** The dock itself, for the map to keep what it glides to clear of it (clearOfDock). */
  ref?: Ref<HTMLDivElement>
  children: ReactNode
}

/**
 * The dock's height at each of its three snaps, on a phone (the owner's
 * BottomSheetConfiguration, Figma 3815:5637, 2026-09-30). Middle is about
 * half the map, as his frames draw it (448 and 462 of 844), white below
 * what it holds when that is shorter ("Stretch should expand at the
 * bottom"); Max is the whole map, clear of a phone's notch. Measured against
 * the map the dock sits in, not the window. From `@float:` there are no
 * snaps: the dock is the corner card it was.
 */
const HEIGHT = {
  low: '',
  middle: 'h-[55%]',
  max: 'h-full pt-[env(safe-area-inset-top)]',
} satisfies Record<Snap, string>

/**
 * Where the route list and a trip's card sit, one at a time, in the owner's
 * frames (2026-09-28, 2026-09-29): docked along the bottom until `@float:`,
 * then flush in the top-left corner, square, 384 wide — no room above it or
 * to its left (his 3750:1911, 2026-09-29). Taller than the room, the body
 * scrolls under the header, with no scrollbar drawn (his ask, 2026-09-28).
 *
 * On a phone it is his BottomSheetConfiguration (3815:5637, 2026-09-30): a
 * HandleNotch over the header, and three heights — Low, the header alone;
 * Middle, where it opens; Max, the whole screen. A pull on the handle moves it
 * one height; pulled down at Low it closes; a tap goes round, Low → Middle →
 * Max. Square along the top, as his frames draw it. Scrolling the body up at
 * Middle to reach Max is the next step, not this one.
 */
export function RouteDock({ label, testId, header, onClose, hidden = false, ref, children }: Props) {
  const own = useRef<HTMLDivElement>(null)
  const [snap, setSnap] = useState<Snap>('middle')
  useDialogFocus(own, hidden)
  useEscape(onClose, !hidden)

  const go = (gesture: 'up' | 'down' | 'tap') => {
    const next = snapAfter(snap, gesture)
    if (next === 'close') onClose()
    else setSnap(next)
  }

  // As Sheet's handle: a drag and a tap are one gesture until it has
  // travelled DRAG_PX; `handled` keeps one drag from moving it twice, and the
  // click a tap sends is swallowed, so onClick hears only Enter and Space.
  const drag = useRef<{ startY: number; handled: boolean } | null>(null)
  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    drag.current = { startY: e.clientY, handled: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || d.handled) return
    const up = d.startY - e.clientY
    if (Math.abs(up) > DRAG_PX) {
      d.handled = true
      go(up > 0 ? 'up' : 'down')
    }
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    drag.current = null
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (!d) return
    swallowTheTapsClick(e.clientX, e.clientY)
    if (!d.handled) go('tap')
  }

  return (
    <div
      ref={(el) => {
        own.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) ref.current = el
      }}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      data-testid={testId}
      data-snap={snap}
      hidden={hidden}
      className={
        'absolute inset-x-0 bottom-0 z-10 outline-none flex flex-col overflow-clip bg-surface ' +
        'pb-[env(safe-area-inset-bottom)] ' +
        HEIGHT[snap] +
        ' @float:inset-x-auto @float:bottom-auto @float:top-0 @float:left-0 @float:h-auto @float:max-h-full ' +
        '@float:w-96 @float:pt-0 @float:pb-0'
      }
    >
      {/* HandleNotch (3813:2963). `touch-none`, or the browser takes the pull for a scroll. */}
      <button
        type="button"
        data-testid="dock-handle"
        aria-label="Pull up or down"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onClick={() => go('tap')}
        className="flex w-full shrink-0 touch-none justify-center py-2 @float:hidden"
      >
        <span aria-hidden className="h-1.5 w-12 rounded-full bg-surface-quaternary" />
      </button>
      {header}
      <div
        className={
          'min-h-0 flex-1 overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden ' +
          (snap === 'low' ? 'hidden @float:block' : '')
        }
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Where a point the camera glides to should sit, from the map's centre, so
 * the dock does not cover it: in the middle of the map left showing — to the
 * dock's right from `@float:`, where it sits in the top-left corner, above it
 * where it is docked along the bottom. For MapLibre's `offset`, measured as
 * the glide starts: the dock's height changes with a trip's fold.
 */
export function clearOfDock(map: HTMLElement, dock: HTMLElement | null): [number, number] {
  if (!dock || dock.hidden) return [0, 0]
  const m = map.getBoundingClientRect()
  const d = dock.getBoundingClientRect()
  // In the corner, short of the map's right edge: the room is to its right.
  if (d.right < m.right - 1) return [Math.max(0, d.right - m.left) / 2, 0]
  // Along the bottom: the room is above it.
  return [0, -Math.max(0, m.bottom - d.top) / 2]
}
