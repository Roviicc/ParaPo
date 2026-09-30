import type { ComponentPropsWithoutRef } from 'react'

/** Its three looks: at rest, on, and on and doing it (filled). */
export type MapControlLook = 'plain' | 'on' | 'filled'

const LOOK = {
  plain: 'bg-surface text-content-secondary hover:bg-surface-secondary',
  on: 'bg-surface text-blue-600 hover:bg-blue-50',
  filled: 'bg-blue-600 text-content-inverse hover:bg-blue-700',
} satisfies Record<MapControlLook, string>

type Props = Omit<
  ComponentPropsWithoutRef<'button'>,
  'className' | 'style' | 'dangerouslySetInnerHTML' | 'type' | 'aria-label' | 'title'
> & {
  look?: MapControlLook
  /** An icon-only button: its name for a screen reader, and its tooltip. */
  'aria-label': string
  title: string
}

/**
 * The 29 px rounded square MapLibre's own controls are, for the two the app
 * adds down the map's right edge: Map design and "Where am I". One chrome
 * where each had a copy (the review's 6.5), and its looks in one map. Not
 * IconButton on purpose: that is the owner's 40/32 px Special pill, and
 * moving these onto it would change how the map looks — the owner's call,
 * listed for them (stage 9 of the clean-up, 2026-09-29).
 */
export function MapControlButton({ look = 'plain', children, ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      className={'grid h-[29px] w-[29px] place-items-center rounded shadow-[0_0_0_2px_rgba(0,0,0,0.1)] ' + LOOK[look]}
    >
      {children}
    </button>
  )
}
