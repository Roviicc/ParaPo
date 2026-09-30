/**
 * How BottomSheet's handle and drags decide, on a phone: every card's,
 * since the owner's ask of 2026-09-30 ("make it a universal rule as
 * component"). Moved out of the old Sheet.tsx, which went then.
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
 * sheet straight back — pulled up, it fell to peek (the reviewer's note,
 * fixed on the owner's word, 2026-09-29).
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
 * it (3815:4306).
 */
export type Snap = 'low' | 'middle' | 'max'

/**
 * Where a tap on the handle, or Enter on it, takes the sheet: round, Low →
 * Middle → Max → Low (the owner's defaults, 2026-09-30). Pulls go by snapFor.
 */
export function snapAfterTap(snap: Snap): Snap {
  return snap === 'low' ? 'middle' : snap === 'middle' ? 'max' : 'low'
}

/** A flick faster than this, in pixels a millisecond, goes one height on in its direction. */
export const FLICK = 0.5

/**
 * Where a drag lets go (the owner's ask of 2026-09-30: the sheet follows the
 * finger, fluid, and a swipe up at Middle takes it to Max). `shown` is how
 * much of the sheet is on screen as the finger lifts, `heights` what each
 * snap shows, `velocity` the finger's speed upwards in px/ms (negative:
 * downwards). A flick goes to the next height past where the sheet is, in
 * its direction — down past Low, it closes. A slow release settles on the
 * nearest height, or closes when less than half of Low still shows.
 */
export function snapFor(shown: number, velocity: number, heights: Record<Snap, number>): Snap | 'close' {
  const order: Snap[] = ['low', 'middle', 'max']
  if (velocity >= FLICK) return order.find((s) => heights[s] > shown + 1) ?? 'max'
  if (velocity <= -FLICK) return [...order].reverse().find((s) => heights[s] < shown - 1) ?? 'close'
  if (shown < heights.low / 2) return 'close'
  return order.reduce((a, b) => (Math.abs(heights[b] - shown) < Math.abs(heights[a] - shown) ? b : a))
}
