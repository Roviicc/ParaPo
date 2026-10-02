import type { ReactNode } from 'react'

export type ToastTone = 'plain' | 'alert'

const TONE = {
  plain: { box: 'bg-neutral-900', dismiss: 'text-neutral-400 hover:text-white' },
  alert: { box: 'bg-red-600', dismiss: undefined },
} satisfies Record<ToastTone, { box: string; dismiss: string | undefined }>

/**
 * The studio's one toast, over the bottom of the map — at the top on a
 * phone, where the New buttons and the drawing's bars fill the foot of the
 * screen, as wide as the screen and wrapping: what a save did, or
 * what went wrong. One slot — the workshop shows one toast at a time, the
 * newest (StudioApp) — where three once stood in the same place and did not
 * clear each other (the review's 6.7). `alert` is the red of a problem, and
 * is announced as one.
 */
export function Toast({
  tone = 'plain',
  children,
  action,
  onDismiss,
}: {
  tone?: ToastTone
  children: ReactNode
  /** A button beside the words: "Draw the return trip". */
  action?: ReactNode
  onDismiss: () => void
}) {
  return (
    <div
      role={tone === 'alert' ? 'alert' : 'status'}
      data-testid="toast"
      className={
        'absolute bottom-24 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full px-4 py-2 text-sm text-white shadow-lg ' +
        'max-sm:inset-x-4 max-sm:bottom-auto max-sm:top-[calc(4rem+env(safe-area-inset-top))] max-sm:translate-x-0 max-sm:flex-wrap max-sm:rounded-2xl max-sm:py-3 ' +
        TONE[tone].box
      }
    >
      <span className="max-sm:min-w-0 max-sm:flex-1">{children}</span>
      {action}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className={'pointer-coarse:min-h-11 pointer-coarse:min-w-11 ' + (TONE[tone].dismiss ?? '')}
      >
        ✕
      </button>
    </div>
  )
}
