import { useEffect, useState } from 'react'
import type { WhereAmI as State } from './whereAmI'

type Props = {
  where: State
  /** Under the map-design button: a finger's row on a phone, the desktop's lower. */
  coarse: boolean
}

/**
 * The round button that asks "Where am I", under the map-design button at
 * the top right. Off: an outline. On and following: filled. On but let go
 * of (the visitor dragged the map): outlined in blue, and a tap follows
 * again. A long press, or a second tap while following, turns it off.
 * Denied or unavailable: a short note under it, and the button stays
 * plain so it can be tried again after the browser's setting is changed.
 */
export function WhereAmIButton({ where, coarse }: Props) {
  const { status, follow, ask, stop } = where
  const on = status === 'on' || status === 'asking'
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'denied') setNote('Location is off for this site. Allow it in your browser settings, then try again.')
    else if (status === 'unavailable') setNote('This browser cannot give a location.')
    else if (status === 'error') setNote('No fix yet. Try again outdoors, or check that location is on.')
    else setNote(null)
  }, [status])
  useEffect(() => {
    if (!note) return
    const t = window.setTimeout(() => setNote(null), 5000)
    return () => window.clearTimeout(t)
  }, [note])

  const label = !on ? 'Where am I' : follow ? 'Stop following me' : 'Follow me again'
  const state = !on ? status : follow ? 'following' : 'on'
  return (
    <div className={`absolute right-2.5 z-10 flex flex-col items-end gap-1 ${coarse ? 'top-[5.25rem]' : 'top-[9.75rem]'}`}>
      <button
        type="button"
        onClick={() => (on && follow ? stop() : ask())}
        aria-label={label}
        aria-pressed={on}
        title={label}
        data-testid="where"
        data-state={state}
        className={
          'grid h-[29px] w-[29px] place-items-center rounded shadow-[0_0_0_2px_rgba(0,0,0,0.1)] ' +
          (on && follow
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : on
              ? 'bg-white text-blue-600 hover:bg-blue-50'
              : 'bg-white text-neutral-800 hover:bg-neutral-100')
        }
      >
        {/* A compass needle: the usual sign for "my location". */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M14 2 2 7l6 1 1 6z" fill={on ? 'currentColor' : 'none'} />
        </svg>
      </button>
      {note && (
        <p
          role="status"
          data-testid="where-note"
          className="max-w-[14rem] rounded-lg bg-neutral-900/90 px-3 py-2 text-right text-xs text-white shadow backdrop-blur"
        >
          {note}
        </p>
      )}
    </div>
  )
}
