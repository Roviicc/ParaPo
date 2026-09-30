/**
 * How BottomSheet's handle and drags decide, on a phone: every card's,
 * since the owner's ask of 2026-09-30 ("make it a universal rule as
 * component").
 */

/** How far a drag must travel before it counts as a pull rather than a tap. */
export const DRAG_PX = 24

/**
 * Drops the `click` the browser sends after a tap on the handle. By the time
 * it is dispatched the sheet has already re-rendered, so the click is aimed at
 * whatever now lies under the finger: pulled down, the map, which would read
 * it as a tap on nothing and close the card; pulled up, whatever the sheet
 * now shows there — a hotspot's route, which it would open (seen 2026-09-29,
 * with the old rows and the RouteCards alike). Caught at the capture phase on
 * the document, before MapLibre or React sees it, and only where the finger
 * lifted: a tap on the sheet's ✕ right after lands elsewhere, and is one the
 * visitor meant. Forgotten when the next gesture starts, if none came — not
 * after a set time: on a busy page the click came a second after the finger
 * lifted, long after the 300 ms this once waited, and landed on the RouteCard
 * the sheet had pulled up under it (a phone-sized page slowed 20×, and the
 * Philcoa card on GitHub's runners once its routes flowed, 2026-09-29).
 * Armed after a drag too: a finger's sends no click, and the next touch ends
 * the watch; a mouse's clicks the handle it was held on, which toggled the
 * sheet straight back (the reviewer's note, fixed on the owner's word,
 * 2026-09-29).
 */
export function swallowTheTapsClick(x: number, y: number) {
  const stop = (e: MouseEvent) => {
    // No pointer's: Enter or Space, or a script. Left for the watch's own click.
    if (e.detail === 0) return
    cleanup()
    // As far as a finger may travel and still tap.
    if (Math.hypot(e.clientX - x, e.clientY - y) > DRAG_PX) return
    e.stopPropagation()
    e.preventDefault()
  }
  const cleanup = () => {
    document.removeEventListener('click', stop, true)
    document.removeEventListener('pointerdown', cleanup, true)
  }
  document.addEventListener('click', stop, true)
  document.addEventListener('pointerdown', cleanup, true)
}

/**
 * The three heights of the owner's BottomSheetConfiguration (Figma 3815:5637,
 * 2026-09-30), on a phone: Low, the header and a trip's origin along the bottom (3814:3976);
 * Middle, about half the screen, where a trip opens (3813:3755, 3815:4040);
 * Max, the whole screen, the header at the top and the rest scrolling under
 * it (3815:4306). Between Middle and Max there is no magnet (the owner's
 * ask, 2026-09-30: "the scrolling up for middle to max has no magnet, make
 * it freely"): a sheet let go there stays, a number — the share of the map
 * it shows, over Middle's and under 1.
 */
export type Snap = 'low' | 'middle' | 'max' | number

/** What a sheet at `snap` is called on it (`data-snap`) and by a screen reader: a free height is `free`. */
export type SnapName = 'low' | 'middle' | 'max' | 'free'
export const snapName = (snap: Snap): SnapName => (typeof snap === 'number' ? 'free' : snap)

/** Covering more of the map than Middle does: Max, or a free height. */
export const aboveMiddle = (snap: Snap) => snap === 'max' || typeof snap === 'number'

/**
 * Where a tap on the handle, or Enter on it, takes the sheet: round, Low →
 * Middle → Max → Low (the owner's defaults, 2026-09-30); from a free height,
 * on up to Max. Pulls go by snapFor.
 */
export function snapAfterTap(snap: Snap): Snap {
  return snap === 'low' ? 'middle' : snap === 'max' ? 'low' : 'max'
}

/**
 * A flick faster than this, in pixels a millisecond, goes to the end its way.
 * 0.5 at first; the owner, trying it (2026-09-30), found that "too
 * sensitive" — "even if I scroll up gently it doesn't stay on the middle" —
 * and asked for 7/10, 5/10 and 2/10 of it, then settled on 4/10: 0.5 ÷ 0.4.
 * With the speed read over the last moves only, a gentle swipe settles on
 * the nearest height.
 */
const FLICK = 1.25

/** How far back the speed at release is read: only the finger's last moves count. */
const RECENT_MS = 100

/** Middle shows this much of the map: 45% since the owner's ask of 2026-09-30 (55% before, as his frames had it). */
const MIDDLE = 0.45

/**
 * What Low shows, the same for every card (the owner's 3817:6007,
 * 2026-09-30: "same height, same interaction, same motion"; 137 since his
 * change to it that day): the notch, the header and the top of the first
 * card, down past its title — cut to one line there (`sheet-low:`).
 */
export const LOW_PX = 137

/** What each magnet shows of a sheet `h` tall, the map's height. */
export function heightsFor(h: number): Record<SnapName & ('low' | 'middle' | 'max'), number> {
  return { low: LOW_PX, middle: Math.round(h * MIDDLE), max: h }
}

/** What a sheet `h` tall shows at `snap`, a free height's included. */
export function shownAt(snap: Snap, h: number): number {
  return typeof snap === 'number' ? Math.round(h * snap) : heightsFor(h)[snap]
}

/** How far down a sheet at `snap` slides, as a CSS length: `100%` is its own height, the map's. */
export function slide(snap: Snap): string {
  if (snap === 'max') return '0px'
  // Below Max its bottom padding is off the screen: what shows stands clear
  // of a phone's home indicator by lifting it that much.
  if (snap === 'middle') return `calc(${(1 - MIDDLE) * 100}% - env(safe-area-inset-bottom))`
  if (typeof snap === 'number') return `calc(${(1 - snap) * 100}% - env(safe-area-inset-bottom))`
  return `calc(100% - ${LOW_PX}px - env(safe-area-inset-bottom))`
}

/** How far down a sheet slides while `shown` px of it follow a finger. Never above the map's top. */
export function slideShowing(shown: number): string {
  return `max(0px, calc(100% - ${shown}px - env(safe-area-inset-bottom)))`
}

/**
 * A finger, or a mouse, holding a sheet `max` tall that showed `from` when
 * it took hold at `startY`: how much shows as it moves, and where it lands
 * let go (snapFor). Its speed at release is the finger's over its last
 * RECENT_MS only, so a swipe that slowed before lifting is read as slow,
 * however fast it began (the owner's "even if I scroll up gently it doesn't
 * stay on the middle", 2026-09-30); held still 80 ms before lifting, it is a
 * placement, not a flick. The touch pull at Max and the pointer drag share it.
 */
export function follow(startY: number, t: number, from: number, max: number) {
  let y = startY
  let last = t
  const moves: { at: number; t: number }[] = [{ at: startY, t }]
  const shown = (at: number) => Math.max(0, Math.min(max, from + startY - at))
  return {
    move(at: number, now: number): number {
      y = at
      last = now
      moves.push({ at, t: now })
      while (moves.length > 2 && now - moves[1].t > RECENT_MS) moves.shift()
      return shown(at)
    },
    /** Where it lands let go at `at` (the last move's, when the release has no position). */
    release(now: number, at = y): Snap | 'close' {
      const first = moves.find((m) => last - m.t <= RECENT_MS) ?? moves[moves.length - 1]
      const dt = last - first.t
      const v = now - last > 80 || dt <= 0 ? 0 : (first.at - y) / dt
      return snapFor(shown(at), v, heightsFor(max))
    },
  }
}

/** Let go this close under Middle's top, it is Middle still; this close under the map's top, Max. */
const MIDDLE_PULL_PX = 32
const MAX_PULL_PX = 64

/**
 * Where a drag lets go (the owner's asks of 2026-09-30: the sheet follows the
 * finger, fluid; then "like google maps and apple maps"). `shown` is how
 * much of the sheet is on screen as the finger lifts, `heights` what each
 * magnet shows, `velocity` the finger's speed upwards in px/ms (negative:
 * downwards). A flick goes to the end in its direction: up, to Max, from Low
 * or Middle alike; down, to Low, from Max or Middle alike — and down from
 * Low, it closes. Let go slowly between Middle and Max, it stays where it is
 * (the owner's "no magnet ... make it freely"), unless near enough either
 * end to be drawn in — up near the map's top, to Max ("when the scroll up
 * go over, make it to max"). Below Middle it settles on Middle or Low, the
 * nearer, or closes when less than half of Low still shows.
 */
export function snapFor(shown: number, velocity: number, heights: ReturnType<typeof heightsFor>): Snap | 'close' {
  if (velocity >= FLICK) return 'max'
  if (velocity <= -FLICK) return shown > heights.low + 1 ? 'low' : 'close'
  if (shown >= heights.max - MAX_PULL_PX) return 'max'
  if (shown > heights.middle + MIDDLE_PULL_PX) return shown / heights.max
  if (shown < heights.low / 2) return 'close'
  return Math.abs(heights.middle - shown) < Math.abs(heights.low - shown) ? 'middle' : 'low'
}
