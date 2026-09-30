import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { useDialogFocus } from './useDialogFocus'
import { useEscape } from './useEscape'
import { DRAG_PX, snapAfter, snapFor, swallowTheTapsClick, type Snap } from './sheetGesture'

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

/** Middle shows this much of the map, as the owner's frames do (448 and 462 of 844). */
const MIDDLE = 0.55

/**
 * How far down the sheet slides at each snap, as a CSS length: it is always
 * the whole map tall and slides, so that moving between heights is one
 * smooth `translate` (the owner's ask of 2026-09-30: "motion ... so it
 * becomes fluid"), and a drag can follow the finger. `100%` is the sheet's
 * own height, the map's.
 */
function slide(snap: Snap, lowPx: number): string {
  if (snap === 'max') return '0px'
  if (snap === 'middle') return `${(1 - MIDDLE) * 100}%`
  return `calc(100% - ${lowPx}px)`
}

/**
 * Where the route list and a trip's card sit, one at a time, in the owner's
 * frames (2026-09-28, 2026-09-29): docked along the bottom until `@float:`,
 * then flush in the top-left corner, square, 384 wide — no room above it or
 * to its left (his 3750:1911, 2026-09-29). Taller than the room, the body
 * scrolls under the header, with no scrollbar drawn (his ask, 2026-09-28).
 *
 * On a phone it is his BottomSheetConfiguration (3815:5637, 2026-09-30): a
 * HandleNotch over the header, and three heights — Low, the header alone;
 * Middle, where it opens, about half the map, white below what it holds
 * ("Stretch should expand at the bottom"); Max, the whole map, clear of a
 * phone's notch. Square along the top, as his frames draw it.
 *
 * It moves as he asked the same day, fluid: a drag on the handle or the
 * header follows the finger and, let go, glides to the nearest height — a
 * flick, to the next one its way (snapFor); pulled down past Low it closes.
 * Below Max the body does not scroll: a swipe on it moves the sheet, so a
 * swipe up at Middle takes it to Max ("when I scroll up in middle, it should
 * go into max"); at Max the body scrolls, and the header brings it down. A
 * tap on the handle goes round, Low → Middle → Max. From `@float:` there is
 * none of this: the corner card it was.
 */
export function RouteDock({ label, testId, header, onClose, hidden = false, ref, children }: Props) {
  const own = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLButtonElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const [snap, setSnap] = useState<Snap>('middle')
  // How much of the sheet shows while a finger drags it; null at rest.
  const [dragged, setDragged] = useState<number | null>(null)
  // What Low shows: the notch and the header, measured.
  const [lowPx, setLowPx] = useState(80)
  useDialogFocus(own, hidden)
  useEscape(onClose, !hidden)

  useLayoutEffect(() => {
    const head = headRef.current
    const notch = handleRef.current
    if (!head || !notch) return
    const measure = () => setLowPx(Math.round(head.offsetHeight + notch.offsetHeight))
    measure()
    const seen = new ResizeObserver(measure)
    seen.observe(head)
    return () => seen.disconnect()
  }, [])

  const settle = (next: Snap | 'close') => {
    setDragged(null)
    if (next === 'close') onClose()
    else setSnap(next)
  }

  // A drag under way, let go of if the sheet closes before the finger lifts.
  const stopDrag = useRef<(() => void) | null>(null)
  useLayoutEffect(() => () => stopDrag.current?.(), [])

  // A drag and a tap are one gesture until it has travelled DRAG_PX. Taps on
  // what the sheet holds are left to it; the click after a drag, or after a
  // tap on the handle, is swallowed (sheetGesture).
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const sheet = own.current
    // From `@float:` the notch is not drawn: no gestures there.
    if (!sheet || !handleRef.current || handleRef.current.offsetParent === null) return
    // At Max the body scrolls as a list does; the header brings the sheet down.
    const onTop = headRef.current?.contains(e.target as Node) || handleRef.current.contains(e.target as Node)
    if (snap === 'max' && !onTop) return
    const h = sheet.offsetHeight
    const heights = { low: lowPx, middle: Math.round(h * MIDDLE), max: h }
    const onHandle = handleRef.current.contains(e.target as Node)
    const g = { startY: e.clientY, from: heights[snap], moving: false, y: e.clientY, t: e.timeStamp, v: 0 }
    const shownAt = (clientY: number) => Math.max(0, Math.min(heights.max, g.from + g.startY - clientY))

    // Followed on the window, not the sheet: a finger or a mouse dragged
    // above the sheet is over the map, and the sheet would stop hearing it.
    // Not captured, so a tap on what the sheet holds stays that thing's.
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      if (!g.moving) {
        if (Math.abs(g.startY - ev.clientY) <= DRAG_PX) return
        g.moving = true
      }
      // The finger's speed, smoothed over the last few moves: one jittery
      // sample must not decide whether a release is a flick.
      const dt = ev.timeStamp - g.t
      if (dt > 0) g.v = 0.7 * ((g.y - ev.clientY) / dt) + 0.3 * g.v
      g.y = ev.clientY
      g.t = ev.timeStamp
      setDragged(shownAt(ev.clientY))
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      stop()
      if (g.moving) {
        swallowTheTapsClick(ev.clientX, ev.clientY)
        // Held still before lifting: a placement, not a flick.
        const v = ev.timeStamp - g.t > 80 ? 0 : g.v
        settle(snapFor(shownAt(ev.clientY), v, heights))
      } else if (onHandle) {
        swallowTheTapsClick(ev.clientX, ev.clientY)
        settle(snapAfter(snap, 'tap'))
      }
    }
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      stop()
      setDragged(null)
    }
    const stop = () => {
      stopDrag.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
    stopDrag.current?.()
    stopDrag.current = stop
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  const y = dragged === null ? slide(snap, lowPx) : `calc(100% - ${dragged}px)`

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
      style={{ '--sheet-y': y } as CSSProperties}
      onPointerDown={onPointerDown}
      className={
        'absolute inset-0 z-10 outline-none flex flex-col overflow-clip bg-surface pb-[env(safe-area-inset-bottom)] ' +
        'translate-y-(--sheet-y) motion-reduce:transition-none ' +
        (dragged === null ? 'transition-[translate] duration-300 ease-out ' : '') +
        (snap === 'max' ? 'pt-[env(safe-area-inset-top)] ' : '') +
        '@float:inset-auto @float:top-0 @float:left-0 @float:max-h-full @float:w-96 @float:pt-0 @float:pb-0 ' +
        '@float:translate-y-0 @float:transition-none'
      }
    >
      {/* HandleNotch (3813:2963): 22 drawn, 44 to touch; `touch-none`, or the browser takes the pull for a scroll. */}
      <button
        ref={handleRef}
        type="button"
        data-testid="dock-handle"
        aria-label={HANDLE_LABEL[snap]}
        onClick={() => settle(snapAfter(snap, 'tap'))}
        className="relative flex w-full shrink-0 touch-none justify-center py-2 before:absolute before:inset-x-0 before:-inset-y-2.5 @float:hidden"
      >
        <span aria-hidden className="h-1.5 w-12 rounded-full bg-surface-quaternary" />
      </button>
      <div ref={headRef} className="shrink-0 touch-none @float:touch-auto">
        {header}
      </div>
      <div
        inert={snap === 'low' || undefined}
        className={
          'min-h-0 flex-1 scrollbar-none [&::-webkit-scrollbar]:hidden @float:overflow-y-auto @float:touch-auto ' +
          (snap === 'max' ? 'overflow-y-auto' : 'overflow-hidden touch-none')
        }
      >
        {children}
      </div>
    </div>
  )
}

/**
 * What a screen reader hears on the handle: the height the sheet is at, and
 * what Enter does (the ds-reviewer's finding, 2026-09-30). Sheet's handle
 * says the same with aria-expanded; this one has three states, not two.
 */
const HANDLE_LABEL = {
  low: 'Sheet lowered. Raise to half the screen',
  middle: 'Sheet at half the screen. Raise to full screen',
  max: 'Sheet at full screen. Lower it',
} satisfies Record<Snap, string>

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
