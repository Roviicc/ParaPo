import { Button } from '../design-system/primitives/Button'
import { IconButton } from '../design-system/primitives/IconButton'
import { ChevronLeftIcon, CloseIcon, JeepIcon } from './RouteIcons'

type Props = {
  /** SWITCH: the other way round — every route in the list, or the trip's own. */
  onSwitch: () => void
  /** False when the other way round has nothing drawn to show; SWITCH then rests disabled. */
  switchable: boolean
  /**
   * Whether the way back is what is showing: SWITCH is pressed then. Its
   * name stays the word on it, so "tap SWITCH" finds it by voice too.
   */
  back: boolean
  onClose: () => void
} & (
  | {
      /** Figma's Default, over the route list: the Jeep and its count, `2 Routes`, `1 Route`. */
      routeCount: string
      onBackToList?: never
    }
  | {
      /**
       * Figma's Variant2, over a trip: ‹ back to the list the trip was
       * picked from; null when there is none behind it (a tap on one route,
       * a shared link) — then nothing stands in its place.
       */
      onBackToList: (() => void) | null
      routeCount?: never
    }
)

/**
 * The top of the route list and of a trip — the owner's RouteCardHeader
 * (Figma 3742:1049, 2026-09-28): on the left the Jeep and the count in SN Pro
 * Bold (Default) or ‹ (Variant2, the trip's, 2026-09-29); on the right
 * SWITCH (Button, Special) and ✕ (IconButton), on Background/surface. SWITCH
 * answers to `chooser-flip` over the list and `card-switch` over a trip, as
 * the suites have known each since before the redesign.
 *
 * The tooltips hang below their buttons: above, they would leave the card
 * at the top of the screen.
 */
export function RouteCardHeader({ routeCount, onBackToList, onSwitch, switchable, back, onClose }: Props) {
  return (
    <div className="flex w-full items-center gap-2 bg-surface p-3">
      {routeCount !== undefined ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 text-content-primary">
          <span aria-hidden className="size-6 shrink-0 *:size-full">
            <JeepIcon />
          </span>
          <p className="min-w-0 flex-1 truncate font-sn-pro text-xl/7 font-bold">{routeCount}</p>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center">
          {onBackToList && <IconButton icon={<ChevronLeftIcon />} label="Back" tooltip="top" onClick={onBackToList} />}
        </div>
      )}
      <div className="flex shrink-0 items-center gap-3">
        <Button
          variant="special"
          label="SWITCH"
          data-testid={routeCount !== undefined ? 'chooser-flip' : 'card-switch'}
          aria-pressed={back}
          disabled={!switchable}
          onClick={onSwitch}
        />
        <IconButton icon={<CloseIcon />} label="Close" tooltip="top" onClick={onClose} />
      </div>
    </div>
  )
}
