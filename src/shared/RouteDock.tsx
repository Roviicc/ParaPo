import { useEffect, type ReactNode } from 'react'

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
  children: ReactNode
}

/**
 * Where the route list and a trip's card sit, one at a time, in the owner's
 * frames (2026-09-28, 2026-09-29): docked along the bottom with its top
 * corners rounded until `@float:`, then floating top-left, 368 wide. Taller
 * than the room, the body scrolls under the header, with no scrollbar drawn
 * (his ask, 2026-09-28).
 */
export function RouteDock({ label, testId, header, onClose, hidden = false, children }: Props) {
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
      role="dialog"
      aria-label={label}
      data-testid={testId}
      hidden={hidden}
      className="absolute inset-x-0 bottom-0 z-10 flex max-h-[60vh] flex-col overflow-clip rounded-t-3xl bg-surface
                 pb-[env(safe-area-inset-bottom)]
                 @float:inset-x-auto @float:bottom-auto @float:top-4 @float:left-4 @float:max-h-[calc(100%-2rem)]
                 @float:w-92 @float:pb-0"
    >
      {header}
      <div className="min-h-0 overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden">{children}</div>
    </div>
  )
}
