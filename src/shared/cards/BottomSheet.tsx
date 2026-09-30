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
import { DRAG_PX, snapAfterTap, snapFor, swallowTheTapsClick, type Snap } from './sheetGesture'

type Props = {
  /** What a screen reader calls it: the list by its count, a trip by its direction, a card by its place. */
  label: string
  /** The suites find the list as `chooser`, and every other card as `card`. */
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
  /**
   * What it is on a wide screen, where it stops being a sheet: the route
   * list's and a trip's panel in the top-left corner from `@float:`
   * (`corner`, the default), or the card a hotspot's and the studio's route
   * card have always floated as, 16 in, from `@wide:` (`card`). On a phone
   * every sheet is the same.
   */
  floats?: Floats
  children: ReactNode
}

type Floats = 'corner' | 'card'

/**
 * The classes that turn the sheet into what it floats as. Written out whole,
 * one set per kind, so Tailwind finds them.
 */
const FLOAT: Record<Floats, { root: string; handle: string; head: string; body: string }> = {
  corner: {
    root:
      '@float:inset-auto @float:top-0 @float:left-0 @float:max-h-full @float:w-96 @float:pt-0 @float:pb-0 ' +
      '@float:translate-y-0 @float:transition-none',
    handle: '@float:hidden',
    head: '@float:touch-auto',
    body: '@float:overflow-y-auto @float:touch-auto',
  },
  card: {
    root:
      '@wide:inset-auto @wide:top-4 @wide:left-4 @wide:w-80 @wide:max-w-[calc(100%-2rem)] @wide:max-h-[calc(100%-2rem)] ' +
      '@wide:rounded-xl @wide:shadow-xl @wide:ring-1 @wide:ring-black/10 @wide:pt-4 @wide:pb-4 ' +
      '@wide:translate-y-0 @wide:transition-none',
    handle: '@wide:hidden',
    head: '@wide:touch-auto',
    body: '@wide:overflow-y-auto @wide:touch-auto',
  },
}

/** Middle shows this much of the map, as the owner's frames do (448 and 462 of 844). */
const MIDDLE = 0.55

/**
 * What Low shows, the same for the route list and a trip's card (the owner's
 * 3817:6007, 2026-09-30: "same height, same interaction, same motion"): the
 * notch, the header and the top of the first card, down past its title —
 * cut to one line there (group-data-[snap=low]/sheet:line-clamp-1).
 */
const LOW_PX = 140

/**
 * How far down the sheet slides at each snap, as a CSS length: it is always
 * the whole map tall and slides, so that moving between heights is one
 * smooth `translate` (the owner's ask of 2026-09-30: "motion ... so it
 * becomes fluid"), and a drag can follow the finger. `100%` is the sheet's
 * own height, the map's.
 */
function slide(snap: Snap): string {
  if (snap === 'max') return '0px'
  // Below Max the sheet's own bottom padding is off the screen: what shows
  // stands clear of a phone's home indicator by lifting it that much.
  if (snap === 'middle') return `calc(${(1 - MIDDLE) * 100}% - env(safe-area-inset-bottom))`
  return `calc(100% - ${LOW_PX}px - env(safe-area-inset-bottom))`
}

/**
 * Every card on the map is this one sheet (the owner's ask of 2026-09-30:
 * "make it a universal rule as component"): the route list, a trip's card, a
 * hotspot's card and the studio's route card alike, the same heights, the
 * same gestures, the same motion. Only what it floats as on a wide screen
 * differs (`floats`).
 *
 * Where the route list and a trip's card sit, one at a time, in the owner's
 * frames (2026-09-28, 2026-09-29): docked along the bottom until `@float:`,
 * then flush in the top-left corner, square, 384 wide — no room above it or
 * to its left (his 3750:1911, 2026-09-29). Taller than the room, the body
 * scrolls under the header, with no scrollbar drawn (his ask, 2026-09-28).
 *
 * On a phone it is his BottomSheetConfiguration (3815:5637, 2026-09-30): a
 * HandleNotch over the header, and three heights — Low, the header and a
 * trip's origin on one line (3814:3976), a tap on it raising the sheet;
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
export function BottomSheet({ label, testId, header, onClose, hidden = false, ref, floats = 'corner', children }: Props) {
  const wide = FLOAT[floats]
  const own = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLButtonElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [snap, setSnap] = useState<Snap>('middle')
  // How much of the sheet shows while a finger drags it; null at rest.
  const [dragged, setDragged] = useState<number | null>(null)
  useDialogFocus(own, hidden)
  useEscape(onClose, !hidden)

  const settle = (next: Snap | 'close') => {
    setDragged(null)
    if (next === 'close') onClose()
    else setSnap(next)
  }

  // When a finger or a mouse last pressed on the sheet: focus that follows a
  // press is the press's, not the keyboard's (the body's onFocus).
  const lastPress = useRef(-Infinity)

  // A drag under way, let go of if the sheet closes before the finger lifts.
  const stopDrag = useRef<(() => void) | null>(null)
  useLayoutEffect(() => () => stopDrag.current?.(), [])

  // At Max the body scrolls; pulled down from its top, the sheet comes down
  // with the finger instead and glides to Middle (the owner's ask of
  // 2026-09-30: "at max, when scroll down it should go to middle
  // smoothly"). Touch events, not pointer ones: the browser takes a scroll
  // for itself and cancels the pointer, but a non-passive touchmove can
  // still be claimed. A wheel does the same at the top of the list, and
  // turned the other way at Middle raises the sheet to Max.
  // Read by listeners bound once: today's snap, and today's settle (its onClose).
  const snapNow = useRef(snap)
  snapNow.current = snap
  const settleNow = useRef(settle)
  settleNow.current = settle
  useLayoutEffect(() => {
    const body = bodyRef.current
    const sheet = own.current
    if (!body || !sheet) return
    const onPhone = () => handleRef.current?.offsetParent != null
    let pull: { startY: number; y: number; t: number; v: number; taking: boolean; h: number } | null = null

    const start = (e: TouchEvent) => {
      if (snapNow.current !== 'max' || !onPhone() || e.touches.length !== 1) return
      const y = e.touches[0].clientY
      pull = { startY: y, y, t: e.timeStamp, v: 0, taking: false, h: sheet.offsetHeight }
    }
    const move = (e: TouchEvent) => {
      if (!pull) return
      const y = e.touches[0].clientY
      if (!pull.taking) {
        // Only a pull down from the very top of the list; anything else scrolls.
        if (body.scrollTop > 0 || y - pull.startY < 0) {
          pull = null
          return
        }
        if (y - pull.startY <= DRAG_PX / 3) return
        pull.taking = true
      }
      e.preventDefault()
      const dt = e.timeStamp - pull.t
      if (dt > 0) pull.v = 0.7 * ((pull.y - y) / dt) + 0.3 * pull.v
      pull.y = y
      pull.t = e.timeStamp
      setDragged(Math.max(0, Math.min(pull.h, pull.h - (y - pull.startY))))
    }
    const end = (e: TouchEvent) => {
      const p = pull
      pull = null
      if (!p?.taking) return
      const heights = { low: LOW_PX, middle: Math.round(p.h * MIDDLE), max: p.h }
      const v = e.timeStamp - p.t > 80 ? 0 : p.v
      settleNow.current(snapFor(Math.max(0, Math.min(p.h, p.h - (p.y - p.startY))), v, heights))
    }
    // A wheel moves the sheet only on a deliberate push: its deltas are added
    // up and act past DRAG_PX, and not while a list's scroll is still coming
    // to rest — a trackpad's momentum reaching the top is not a pull down.
    let pushed = 0
    let lastWheel = 0
    let scrolledAt = -Infinity
    const wheel = (e: WheelEvent) => {
      if (!onPhone()) return
      if (e.timeStamp - lastWheel > 200) pushed = 0
      lastWheel = e.timeStamp
      if (snapNow.current === 'max' && body.scrollTop > 0) {
        scrolledAt = e.timeStamp
        pushed = 0
        return
      }
      // Still inside a scroll's tail: the tail goes on, however long a
      // trackpad's momentum lasts, and moves nothing.
      if (e.timeStamp - scrolledAt < 300) {
        scrolledAt = e.timeStamp
        return
      }
      pushed += e.deltaY
      if (snapNow.current === 'max' && pushed < -DRAG_PX) {
        pushed = 0
        setSnap('middle')
      } else if (snapNow.current === 'middle' && pushed > DRAG_PX) {
        pushed = 0
        setSnap('max')
      }
    }
    body.addEventListener('touchstart', start, { passive: true })
    body.addEventListener('touchmove', move, { passive: false })
    body.addEventListener('touchend', end)
    body.addEventListener('touchcancel', end)
    body.addEventListener('wheel', wheel, { passive: true })
    return () => {
      body.removeEventListener('touchstart', start)
      body.removeEventListener('touchmove', move)
      body.removeEventListener('touchend', end)
      body.removeEventListener('touchcancel', end)
      body.removeEventListener('wheel', wheel)
    }
  }, [])

  // A drag and a tap are one gesture until it has travelled DRAG_PX. Taps on
  // what the sheet holds are left to it; the click after a drag, or after a
  // tap on the handle, is swallowed (sheetGesture).
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    lastPress.current = e.timeStamp
    const sheet = own.current
    // One pointer at a time, and a mouse's main button only.
    if (stopDrag.current || e.button !== 0) return
    // Floating, the notch is not drawn: no gestures there.
    if (!sheet || !handleRef.current || handleRef.current.offsetParent === null) return
    // At Max the body scrolls as a list does; the header brings the sheet down.
    const onTop = headRef.current?.contains(e.target as Node) || handleRef.current.contains(e.target as Node)
    if (snap === 'max' && !onTop) return
    const h = sheet.offsetHeight
    const heights = { low: LOW_PX, middle: Math.round(h * MIDDLE), max: h }
    const onHandle = handleRef.current.contains(e.target as Node)
    // At Low what peeks of the body is not for picking: a tap there raises
    // the sheet, as one on the handle does.
    const raises = onHandle || (snap === 'low' && !!bodyRef.current?.contains(e.target as Node))
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
        settleNow.current(snapFor(shownAt(ev.clientY), v, heights))
      } else if (raises) {
        swallowTheTapsClick(ev.clientX, ev.clientY)
        settleNow.current(snapAfterTap(snap))
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
    stopDrag.current = stop
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  // Never above the map's top: at Max the inset is not taken off, so a drag there must not either.
  const y = dragged === null ? slide(snap) : `max(0px, calc(100% - ${dragged}px - env(safe-area-inset-bottom)))`

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
        'group/sheet absolute inset-0 z-10 outline-none flex flex-col overflow-clip bg-surface pb-[env(safe-area-inset-bottom)] ' +
        'translate-y-(--sheet-y) motion-reduce:transition-none ' +
        (dragged === null ? 'transition-[translate] duration-sheet ease-enter ' : '') +
        (snap === 'max' ? 'pt-[env(safe-area-inset-top)] ' : '') +
        wide.root
      }
    >
      {/*
        HandleNotch (3813:2963), 22 tall as drawn. It is not the only place to
        take hold: the header under it drags the sheet too, some 80 together.
        `touch-none`, or the browser takes the pull for a scroll.
      */}
      <button
        ref={handleRef}
        type="button"
        data-testid="dock-handle"
        aria-label={HANDLE_LABEL[snap]}
        title={HANDLE_LABEL[snap]}
        onClick={() => settle(snapAfterTap(snap))}
        className={'flex w-full shrink-0 touch-none justify-center py-2 ' + wide.handle}
      >
        <span aria-hidden className="h-1.5 w-12 rounded-full bg-surface-quaternary" />
      </button>
      <div ref={headRef} className={'shrink-0 touch-none ' + wide.head}>
        {header}
      </div>
      <div
        ref={bodyRef}
        // Focus from the keyboard below Max lands on rows that may be below
        // the screen: the sheet rises to Max, where the list scrolls them
        // into view (the ds-reviewer, 2026-09-30). Focus that follows a press
        // is the press's own and leaves the sheet where it is.
        onFocus={(e) => {
          const fromKeys = e.timeStamp - lastPress.current > 800 && e.target.matches(':focus-visible')
          if (snap !== 'max' && fromKeys && handleRef.current?.offsetParent != null) setSnap('max')
        }}
        className={
          'min-h-0 flex-1 scrollbar-none [&::-webkit-scrollbar]:hidden ' +
          wide.body +
          ' ' +
          (snap === 'max' ? 'overflow-y-auto' : 'overflow-hidden touch-none')
        }
      >
        {children}
      </div>
    </div>
  )
}

/**
 * The header a hotspot's card and the studio's route card have always had:
 * what was tapped, and ✕. The route list and a trip's card bring their own
 * (RouteCardHeader). Their bodies sit 16 in, as this does (px-4).
 */
export function SheetHeader({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4">
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="rounded-full px-2 text-neutral-400 hover:bg-surface-secondary hover:text-content-tertiary"
      >
        ✕
      </button>
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
 * the glide starts: on a phone the sheet shows as much as its snap does.
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
