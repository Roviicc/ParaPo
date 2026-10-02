import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react'
import { IconButton } from '../../design-system/primitives/IconButton'
import { CloseIcon } from './RouteIcons'
import { useDialogFocus } from './useDialogFocus'
import { useEscape } from './useEscape'
import { DRAG_PX, aboveMiddle, follow, shownAt, slide, slideShowing, snapAfterTap, snapName, swallowTheTapsClick, type Snap, type SnapName } from './sheetGesture'

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
  /** The sheet itself, for the map to keep what it glides to clear of it (clearOfDock). */
  ref?: Ref<HTMLDivElement>
  /**
   * What it is on a wide screen, where it stops being a sheet: the route
   * list's, a trip's and a place's (the public map's HintuanCard) panel in
   * the top-left corner from `@float:` (`corner`, the default), or the card
   * the studio's hotspot and route cards have always floated as, 16 in, from
   * `@wide:` (`card`). What it holds
   * reads which with `sheet-floating:` and `sheet-low:` (index.css).
   */
  floats?: 'corner' | 'card'
  /**
   * The height, when the caller keeps it: sheets that stand in for one
   * another — the route list, a hotspot's card and the trip opened from
   * them — share one, so ‹ and a pick keep Low, Middle or Max as they were
   * (the owner's ask of 2026-09-30). Without it, the sheet keeps its own.
   */
  height?: SheetHeight
  children: ReactNode
}

/** A sheet's height kept by its caller (BottomSheet's `height`). */
export type SheetHeight = { snap: Snap; onSnap: (snap: Snap) => void }

/**
 * Where each kind floats, and how wide; in each kind's own variant, so its
 * `inset-auto` comes before its `top` and `left`. The rest is `sheet-floating:`.
 */
const FLOATS_AT = {
  corner: '@float:inset-auto @float:top-0 @float:left-0 @float:max-h-full @float:w-96 @float:pt-0 @float:pb-0',
  card:
    '@wide:inset-auto @wide:top-4 @wide:left-4 @wide:w-80 @wide:max-w-[calc(100%-2rem)] @wide:max-h-[calc(100%-2rem)] ' +
    '@wide:rounded-xl @wide:shadow-xl @wide:ring-1 @wide:ring-black/10 @wide:pt-4 @wide:pb-4',
}

/**
 * Every card on the map is this one sheet (the owner's ask of 2026-09-30:
 * "make it a universal rule as component"): the route list, a trip's card, a
 * hotspot's card and the studio's route card alike. Only what it floats as
 * on a wide screen differs (`floats`): the list and a trip flush in the
 * top-left corner, 384 wide (his 3750:1911, 2026-09-29), the body scrolling
 * under the header with no scrollbar drawn (his ask, 2026-09-28).
 *
 * On a phone it is his BottomSheetConfiguration (3815:5637, 2026-09-30),
 * square along the top: a HandleNotch over the header, and three heights
 * (sheetGesture) — Low, the header and the top of the first card, a tap on
 * it raising the sheet; Middle, where it opens; Max, the whole map, clear of
 * a phone's notch. It is always the whole map tall and slides (`--sheet-y`),
 * so moving between heights is one smooth `translate` ("motion ... so it
 * becomes fluid"): a drag on the handle or the header follows the finger
 * and, let go slowly, glides to the nearest height; flicked, it goes to the
 * end its way, Max or Low, as Google's and Apple's maps do (the owner's ask,
 * 2026-09-30); flicked down from Low, it closes. Below Max the body does
 * not scroll: a swipe on it moves the sheet ("when I scroll up in middle, it
 * should go into max"); at Max it scrolls, and a pull down from its top
 * takes hold of the sheet — to Middle held slowly, to Low flicked. A tap on
 * the handle goes round, Low → Middle → Max. Between Middle and Max it
 * stays where it is let go (sheetGesture's snapFor), its body still.
 */
export function BottomSheet({ label, testId, header, onClose, hidden = false, ref, floats = 'corner', height, children }: Props) {
  const own = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLButtonElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [ownSnap, setOwnSnap] = useState<Snap>('middle')
  const snap = height?.snap ?? ownSnap
  const setSnap = height?.onSnap ?? setOwnSnap
  // A finger on it: the glide is off, and --sheet-y is the drag's, written
  // straight onto the sheet move by move rather than rendered.
  const [dragging, setDragging] = useState(false)
  // Where it first stands, drawn with it: a card opening over another (a
  // place's name tapped) is new, and without this it showed at Max for a
  // moment and glided down to its height. Never changed after, so React
  // leaves the drag's and the glide's --sheet-y alone.
  const [opensAt] = useState(() => ({ '--sheet-y': slide(snap) }) as CSSProperties)
  useDialogFocus(own, hidden)
  useEscape(onClose, !hidden)

  useLayoutEffect(() => {
    if (!dragging) at(slide(snap))
    // What follows the sheet on the page (the LocatorButton) glides with it,
    // or keeps up with the finger.
    own.current?.closest('[data-dock-host]')?.toggleAttribute('data-dock-dragging', dragging && !hidden)
  }, [snap, dragging, hidden])

  const settle = (next: Snap | 'close') => {
    setDragging(false)
    if (next === 'close') onClose()
    else setSnap(next)
  }
  // Read by the listeners bound once below: today's snap and settle.
  const now = useRef({ snap, settle })
  now.current = { snap, settle }

  /** Docked, not floating: the notch is drawn only then. */
  const docked = () => handleRef.current?.offsetParent != null
  const show = (shown: number) => at(slideShowing(shown))
  /**
   * Where the sheet slides to. The page's `[data-dock-host]` hears it too, as
   * `--dock-y`, while this is the sheet on show: what sits on the map above
   * the sheet follows it (the owner's ScreenLocationBehavior, 3870:5941,
   * 2026-10-01). The same length, so both glide alike.
   */
  function at(y: string) {
    const sheet = own.current
    if (!sheet) return
    sheet.style.setProperty('--sheet-y', y)
    if (!sheet.hidden) sheet.closest<HTMLElement>('[data-dock-host]')?.style.setProperty('--dock-y', y)
  }

  // When a finger or a mouse last pressed on the sheet: focus that follows a
  // press is the press's, not the keyboard's (the body's onFocus).
  const lastPress = useRef(-Infinity)

  // A drag under way, let go of if the sheet closes before the finger lifts.
  const drag = useRef<AbortController | null>(null)
  useLayoutEffect(() => () => drag.current?.abort(), [])

  // At Max, the pull down from the list's top. Touch events, not pointer
  // ones: the browser takes a scroll for itself and cancels the pointer, but
  // a non-passive touchmove can still be claimed. A wheel does the same at
  // the top of the list, and turned the other way at Middle raises the sheet.
  useLayoutEffect(() => {
    const body = bodyRef.current
    const sheet = own.current
    if (!body || !sheet) return
    let pull: { startY: number; t: number; track: ReturnType<typeof follow> | null } | null = null

    const start = (e: TouchEvent) => {
      if (now.current.snap !== 'max' || !docked() || e.touches.length !== 1) return
      pull = { startY: e.touches[0].clientY, t: e.timeStamp, track: null }
    }
    const move = (e: TouchEvent) => {
      if (!pull) return
      const y = e.touches[0].clientY
      if (!pull.track) {
        // Only a pull down from the very top of the list; anything else scrolls.
        if (body.scrollTop > 0 || y < pull.startY) {
          pull = null
          return
        }
        if (y - pull.startY <= DRAG_PX / 3) return
        const h = sheet.offsetHeight
        pull.track = follow(pull.startY, pull.t, h, h)
        setDragging(true)
      }
      e.preventDefault()
      show(pull.track.move(y, e.timeStamp))
    }
    const end = (e: TouchEvent) => {
      const track = pull?.track
      pull = null
      if (track) now.current.settle(track.release(e.timeStamp))
    }
    // A wheel moves the sheet only on a deliberate push: its deltas are added
    // up and act past DRAG_PX, and never inside a scroll's tail, however long
    // a trackpad's momentum lasts — reaching the top is not a pull down.
    let pushed = 0
    let lastWheel = 0
    let scrolledAt = -Infinity
    const wheel = (e: WheelEvent) => {
      if (!docked()) return
      if (e.timeStamp - lastWheel > 200) pushed = 0
      lastWheel = e.timeStamp
      const at = now.current.snap
      if ((at === 'max' && body.scrollTop > 0) || e.timeStamp - scrolledAt < 300) {
        scrolledAt = e.timeStamp
        pushed = 0
        return
      }
      pushed += e.deltaY
      if (aboveMiddle(at) && pushed < -DRAG_PX) {
        pushed = 0
        now.current.settle('middle')
      } else if (at !== 'max' && at !== 'low' && pushed > DRAG_PX) {
        pushed = 0
        now.current.settle('max')
      }
    }
    const bound = new AbortController()
    const on = { signal: bound.signal }
    body.addEventListener('touchstart', start, { ...on, passive: true })
    body.addEventListener('touchmove', move, { ...on, passive: false })
    body.addEventListener('touchend', end, on)
    body.addEventListener('touchcancel', end, on)
    body.addEventListener('wheel', wheel, { ...on, passive: true })
    return () => bound.abort()
    // Bound once; what changes is read through `now`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A drag and a tap are one gesture until it has travelled DRAG_PX. Taps on
  // what the sheet holds are left to it; the click after a drag, or after a
  // tap on the handle, is swallowed (sheetGesture).
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    lastPress.current = e.timeStamp
    const sheet = own.current
    const handle = handleRef.current
    // One pointer at a time, a mouse's main button only, and docked only.
    if (drag.current || e.button !== 0 || !sheet || !handle || !docked()) return
    const target = e.target as Node
    // At Max the body scrolls as a list does; the header brings the sheet down.
    if (snap === 'max' && !headRef.current?.contains(target) && !handle.contains(target)) return
    // At Low the top of the body is not for picking: a tap there raises the
    // sheet, as one on the handle does.
    const raises = handle.contains(target) || (snap === 'low' && !!bodyRef.current?.contains(target))
    const h = sheet.offsetHeight
    const track = follow(e.clientY, e.timeStamp, shownAt(snap, h), h)
    let moving = false

    // Followed on the window, not the sheet: a finger or a mouse dragged
    // above the sheet is over the map, and the sheet would stop hearing it.
    // Not captured, so a tap on what the sheet holds stays that thing's.
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      if (!moving) {
        if (Math.abs(e.clientY - ev.clientY) <= DRAG_PX) return
        moving = true
        setDragging(true)
      }
      show(track.move(ev.clientY, ev.timeStamp))
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      stop()
      if (moving || raises) swallowTheTapsClick(ev.clientX, ev.clientY)
      if (moving) now.current.settle(track.release(ev.timeStamp, ev.clientY))
      else if (raises) now.current.settle(snapAfterTap(snap))
    }
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      stop()
      setDragging(false)
    }
    const stop = () => {
      drag.current?.abort()
      drag.current = null
    }
    drag.current = new AbortController()
    const on = { signal: drag.current.signal }
    window.addEventListener('pointermove', move, on)
    window.addEventListener('pointerup', up, on)
    window.addEventListener('pointercancel', cancel, on)
  }

  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      own.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) ref.current = el
    },
    [ref],
  )

  return (
    <div
      ref={setRefs}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      data-testid={testId}
      data-snap={snapName(snap)}
      data-floats={floats}
      hidden={hidden}
      style={opensAt}
      onPointerDown={onPointerDown}
      className={
        // Docked, it casts BottomSheet/TopShadow (3817:6007) up onto the map;
        // floating as a card, its own shadow-xl takes over.
        'absolute inset-0 z-10 outline-none flex flex-col overflow-clip bg-surface shadow-bottom-sheet-top-shadow ' +
        'pb-[env(safe-area-inset-bottom)] ' +
        'translate-y-(--sheet-y) motion-reduce:transition-none ' +
        (dragging ? '' : 'transition-[translate] duration-sheet ease-enter ') +
        (snap === 'max' ? 'pt-[env(safe-area-inset-top)] ' : '') +
        'sheet-floating:translate-y-0 sheet-floating:transition-none ' +
        FLOATS_AT[floats]
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
        aria-label={HANDLE_LABEL[snapName(snap)]}
        title={HANDLE_LABEL[snapName(snap)]}
        onClick={() => setSnap(snapAfterTap(snap))}
        // The owner's HandleNotch: 8 above the bar, 4 below (3742:1049, 2026-10-01).
        className="flex w-full shrink-0 touch-none justify-center pt-2 pb-1 sheet-floating:hidden"
      >
        <span aria-hidden className="h-1.5 w-12 rounded-full bg-surface-quaternary" />
      </button>
      <div ref={headRef} className="shrink-0 touch-none sheet-floating:touch-auto">
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
          if (snap !== 'max' && fromKeys && docked()) setSnap('max')
        }}
        className={
          'min-h-0 flex-1 scrollbar-none [&::-webkit-scrollbar]:hidden sheet-floating:overflow-y-auto sheet-floating:touch-auto ' +
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
 * what was tapped, and ✕ — the route cards' own IconButton since the
 * owner's yes of 2026-09-30, so every card closes the same way. The route
 * list and a trip's card bring their own header (RouteCardHeader). Their
 * bodies sit 16 in, as this does (px-4).
 */
export function SheetHeader({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4">
      <div className="min-w-0 flex-1">{children}</div>
      <IconButton icon={<CloseIcon />} label="Close" tooltip="top" onClick={onClose} />
    </div>
  )
}

/**
 * What a screen reader hears on the handle: the height the sheet is at, and
 * what Enter does (the ds-reviewer's finding, 2026-09-30).
 */
const HANDLE_LABEL = {
  low: 'Sheet lowered. Raise to half the screen',
  middle: 'Sheet at half the screen. Raise to full screen',
  max: 'Sheet at full screen. Lower it',
  free: 'Sheet raised past half the screen. Raise to full screen',
} satisfies Record<SnapName, string>

/**
 * Where a point the camera glides to should sit, from the map's centre, so
 * the dock does not cover it: in the middle of the map left showing — to the
 * dock's right from `@float:`, where it sits in the top-left corner, above it
 * where it is docked along the bottom. For MapLibre's `offset`, measured as
 * the glide starts: on a phone the sheet shows as much as its snap does — or,
 * given `snap`, as much as it will once there, for a sheet on its way.
 */
export function clearOfDock(map: HTMLElement, dock: HTMLElement | null, snap?: Snap): [number, number] {
  if (!dock || dock.hidden) return [0, 0]
  const m = map.getBoundingClientRect()
  const d = dock.getBoundingClientRect()
  // In the corner, short of the map's right edge: the room is to its right.
  if (d.right < m.right - 1) return [Math.max(0, d.right - m.left) / 2, 0]
  // Along the bottom: the room is above it.
  return [0, -Math.max(0, snap ? showsAt(dock, snap) : m.bottom - d.top) / 2]
}

/**
 * The height a sheet is measured at when the camera glides to a point under
 * it: its own, or Middle when it is higher — the sheet stays put (the owner,
 * 2026-10-01), and what the camera brings in is there to see when it comes
 * down. A whole route fitted is framed at the sheet's own height (roomBeside).
 */
const framedAt = (snap: Snap): Snap => (aboveMiddle(snap) ? 'middle' : snap)

/** Between a route fitted whole and the map's edges, or the sheet's. */
const FIT_MARGIN_PX = 48
/**
 * Over the top margin, an end's Start or End badge and its gap: the names
 * stand over their circles (EndTitles), and a route starting at the top of
 * the room kept its name in the margin but put the badge under the map's edge.
 */
const FIT_BADGE_PX = 28
/** The least map a whole route is fitted into, the margins given up for it where the sheet leaves less. */
const FIT_ROOM_MIN_PX = 48

/**
 * The room a sheet leaves for a whole route the camera fits, as MapLibre's
 * fit padding: beside the sheet where it floats in the corner, above it
 * where it is docked along the bottom, at its own height (the owner,
 * 2026-10-01: in close above Low, out above Middle). Where it leaves less
 * than FIT_ROOM_MIN_PX — Max, on a phone the whole screen — at Middle's
 * (`framedAt`), so the route is there to see as it comes down.
 */
export function roomBeside(
  map: HTMLElement,
  dock: HTMLElement | null,
  snap: Snap,
): { top: number; bottom: number; left: number; right: number } {
  const room = { top: FIT_MARGIN_PX + FIT_BADGE_PX, bottom: FIT_MARGIN_PX, left: FIT_MARGIN_PX, right: FIT_MARGIN_PX }
  if (!dock || dock.hidden) return room
  const m = map.getBoundingClientRect()
  const d = dock.getBoundingClientRect()
  if (d.right < m.right - 1) {
    room.left += Math.max(0, d.right - m.left)
    return room
  }
  let shows = showsAt(dock, snap)
  if (m.height - shows < FIT_ROOM_MIN_PX) shows = showsAt(dock, framedAt(snap))
  // A thin strip above a tall sheet: the margins give way, so the route still fits.
  const margin = Math.max(0, Math.min(FIT_MARGIN_PX, (m.height - shows - FIT_ROOM_MIN_PX) / 2))
  room.top = margin + Math.max(0, Math.min(FIT_BADGE_PX, m.height - shows - FIT_ROOM_MIN_PX - 2 * margin))
  room.bottom = shows + margin
  return room
}

/**
 * How much of a docked sheet shows at `snap`: below Max, lifted clear of a
 * phone's home indicator by its bottom padding, as `slide` lifts it.
 */
function showsAt(sheet: HTMLElement, snap: Snap): number {
  const h = sheet.offsetHeight
  if (snap === 'max') return h
  return shownAt(snap, h) + (parseFloat(getComputedStyle(sheet).paddingBottom) || 0)
}

/**
 * The camera is about to glide to a point on the map — a hintuan picked on
 * a trip, one of its ends, another box of a place. The sheet stays at the
 * height it was left at (the owner's ask, 2026-10-01: "since the card can
 * settle anywhere, don't move the bottomsheet to the middle"; until then
 * Max came down to Middle). Returns where the point should sit
 * (clearOfDock): above the sheet at `framedAt`'s height, or beside it in the
 * corner.
 */
export function clearOfSheet(map: HTMLElement, dock: HTMLElement | null, snap: Snap): [number, number] {
  return clearOfDock(map, dock, framedAt(snap))
}
