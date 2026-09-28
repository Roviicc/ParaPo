import { Button } from '../design-system/primitives/Button'
import { IconButton } from '../design-system/primitives/IconButton'
import { CloseIcon, JeepIcon } from './RouteIcons'

type Props = {
  /** Figma's Route Count: `2 Routes`, `1 Route`. */
  routeCount: string
  /** SWITCH: show the routes the other way round. */
  onSwitch: () => void
  /** False when the other way round has nothing drawn to show; SWITCH then rests disabled. */
  switchable: boolean
  /**
   * Whether the way back is what is showing: SWITCH is pressed then. Its
   * name stays the word on it, so "tap SWITCH" finds it by voice too.
   */
  back: boolean
  onClose: () => void
}

/**
 * The top of the route list — the owner's RouteCardHeader, Default (Figma
 * 3742:1049, 2026-09-28): the Jeep and the count in SN Pro Bold, then
 * SWITCH (Button, Special) and ✕ (IconButton) on the right, on
 * Background/surface. Its other variant, with ‹ in place of the count, is
 * the trip card's, and comes with it.
 *
 * ✕'s tooltip hangs below it: above, it would leave the card at the top of
 * the screen.
 */
export function RouteCardHeader({ routeCount, onSwitch, switchable, back, onClose }: Props) {
  return (
    <div className="flex w-full items-center gap-2 bg-surface p-3">
      <div className="flex min-w-0 flex-1 items-center gap-2 text-content-primary">
        <span aria-hidden className="size-6 shrink-0 *:size-full">
          <JeepIcon />
        </span>
        <p className="min-w-0 flex-1 truncate font-sn-pro text-xl/7 font-bold">{routeCount}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Button
          variant="special"
          label="SWITCH"
          data-testid="chooser-flip"
          aria-pressed={back}
          disabled={!switchable}
          onClick={onSwitch}
        />
        <IconButton icon={<CloseIcon />} label="Close" tooltip="top" onClick={onClose} />
      </div>
    </div>
  )
}
