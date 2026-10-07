import type { ComponentPropsWithoutRef } from 'react'
import type { Livery } from '../model/liveries'
import { ROW_PRESSED } from './livery-card'
import { CircleArrowRightIcon } from '@/shared/ui/route-icons'

type Props = Omit<ComponentPropsWithoutRef<'button'>, 'type' | 'children'> & {
  /** Figma's routeDirection: the place the row's route goes to. */
  routeDirection: string
  /**
   * What it sits on: a RouteCard in its livery, the row pressing to the
   * card's timeline colour (ROW_PRESSED); or the sheet's own surface, under a
   * trip's tiles, the row rounded and pressing grey as the fare tile does.
   */
  on: Livery | 'surface'
}

const BAR = 'flex w-full items-center gap-1 px-4 py-2 text-left text-base/6 font-medium'
const ON_SURFACE =
  'rounded-full text-content-primary transition-colors duration-quick ease-move hover:bg-surface-tertiary active:bg-surface-quaternary'

/**
 * The owner's .RouteEndPointBar (Figma 3656:132): a route by where it goes,
 * the circled arrow before it, a button that opens it. One component where
 * Figma has one — a RouteCard's rows (RouteCard) and a trip's "Other routes"
 * (RouteTripDetail) — so a change to the row is made once.
 */
export function RouteEndPointBar({ routeDirection, on, className, ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      className={BAR + ' ' + (on === 'surface' ? ON_SURFACE : ROW_PRESSED[on]) + (className ? ' ' + className : '')}
    >
      <span aria-hidden className="size-6 shrink-0 *:size-full">
        <CircleArrowRightIcon />
      </span>
      <span className="min-w-0 flex-1">{routeDirection}</span>
    </button>
  )
}
