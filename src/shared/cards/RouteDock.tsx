import { useEffect, useRef, type ReactNode, type Ref } from 'react'
import { useDialogFocus } from './useDialogFocus'

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
 * Where the route list and a trip's card sit, one at a time, in the owner's
 * frames (2026-09-28, 2026-09-29): docked along the bottom with its top
 * corners rounded until `@float:`, then flush in the top-left corner, square,
 * 384 wide — no room above it or to its left (his 3750:1911, 2026-09-29).
 * Taller than the room, the body scrolls under the header, with no scrollbar
 * drawn (his ask, 2026-09-28).
 */
export function RouteDock({ label, testId, header, onClose, hidden = false, ref, children }: Props) {
  const own = useRef<HTMLDivElement>(null)
  useDialogFocus(own, hidden)
  // Escape closes, as it does any dialog.
  useEffect(() => {
    if (hidden) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, hidden])

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
      hidden={hidden}
      className="absolute inset-x-0 outline-none bottom-0 z-10 flex max-h-[60vh] flex-col overflow-clip rounded-t-3xl bg-surface
                 pb-[env(safe-area-inset-bottom)]
                 @float:inset-x-auto @float:bottom-auto @float:top-0 @float:left-0 @float:max-h-full
                 @float:w-96 @float:rounded-none @float:pb-0"
    >
      {header}
      <div className="min-h-0 overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden">{children}</div>
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
