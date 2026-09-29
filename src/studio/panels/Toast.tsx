import type { ReactNode } from 'react'

/**
 * The studio's one toast, over the bottom of the map: what a save did, or
 * what went wrong. One slot — the workshop shows one toast at a time, the
 * newest (StudioApp) — where three once stood in the same place and did not
 * clear each other (the review's 6.7). `alert` is the red of a problem.
 */
export function Toast({
  tone = 'plain',
  children,
  action,
  onDismiss,
}: {
  tone?: 'plain' | 'alert'
  children: ReactNode
  /** A button beside the words: "Draw the return trip". */
  action?: ReactNode
  onDismiss: () => void
}) {
  return (
    <div
      role="status"
      className={
        'absolute bottom-24 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full px-4 py-2 text-sm text-white shadow-lg ' +
        (tone === 'alert' ? 'bg-red-600' : 'bg-neutral-900')
      }
    >
      <span>{children}</span>
      {action}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className={tone === 'alert' ? undefined : 'text-neutral-400 hover:text-white'}
      >
        ✕
      </button>
    </div>
  )
}
