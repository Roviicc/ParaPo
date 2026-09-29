import type { ComponentPropsWithoutRef } from 'react'

/**
 * The 29 px rounded square MapLibre's own controls are, for the two the app
 * adds down the map's right edge: Map design and "Where am I". One chrome
 * where each had a copy (the review's 6.5); each still says its own colours
 * (`className`). Not IconButton on purpose: that is the owner's 40/32 px
 * Special pill, and moving these onto it would change how the map looks —
 * his call, listed for him (stage 9 of the clean-up, 2026-09-29).
 */
export function MapControlButton({ className = '', children, ...rest }: ComponentPropsWithoutRef<'button'>) {
  return (
    <button
      type="button"
      {...rest}
      className={'grid h-[29px] w-[29px] place-items-center rounded shadow-[0_0_0_2px_rgba(0,0,0,0.1)] ' + className}
    >
      {children}
    </button>
  )
}
