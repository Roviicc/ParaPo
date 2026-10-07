import { Button } from '@/design-system/primitives/button';
import { IconButton } from '@/design-system/primitives/icon-button';
import { ChevronLeftIcon, CloseIcon, JeepIcon } from '@/shared/ui/route-icons';

/**
 * The word on SWITCH: the way that is showing — Papunta, there; Pabalik, the
 * way back (the owner's ask, 2026-10-01: "instead of switch on the word").
 * A tap turns it round, and the word with it.
 */
export const wayWord = (back: boolean) => (back ? 'Pabalik' : 'Papunta');

type Props = {
  /** SWITCH: the other way round — every route in the list, or the trip's own. */
  onSwitch: () => void;
  /** False when the other way round has nothing drawn to show; SWITCH then rests disabled. */
  switchable: boolean;
  /**
   * Whether the way back is what is showing: SWITCH reads Pabalik and is
   * pressed then (wayWord). Its name is the word on it, so "tap Papunta"
   * finds it by voice too.
   */
  back: boolean;
  onClose: () => void;
} & (
  | {
      /**
       * Figma's Default, over the route list: the Jeep and its count, `2
       * Routes`, `1 Route` — or, with no route under the tap, its hotspots',
       * `2 Hotspots` (the owner, 2026-09-29).
       */
      routeCount: string;
      onBackToList?: never;
    }
  | {
      /**
       * Figma's Variant2, over a trip: ‹ back to what the trip was picked
       * from — the list, a hotspot's card — or, opened on its
       * own, to its route with those sharing an end; null when there is none
       * (no other route sharing an end has a direction drawn the trip's way
       * round) — then nothing stands in its place.
       */
      onBackToList: (() => void) | null;
      routeCount?: never;
    }
);

/**
 * The top of the route list and of a trip — the owner's RouteCardHeader
 * (Figma 3742:1049, 2026-09-28): on the left the Jeep and the count in SN Pro
 * Bold (Default) or ‹ (Variant2, the trip's, 2026-09-29); on the right
 * SWITCH (Button, Special) and ✕ (IconButton), on Background/surface. SWITCH
 * answers to `chooser-flip` over the list and `card-switch` over a trip, as
 * the suites have known each since before the redesign.
 *
 * On a phone it sits flush under the dock's HandleNotch (the owner's
 * BottomSheetConfiguration, 3815:5637, 2026-09-30); from `@float:` the notch
 * is gone and 12 stand above it, as before.
 *
 * The tooltips hang below their buttons: above, they would leave the card
 * at the top of the screen.
 */
export function RouteCardHeader({
  routeCount,
  onBackToList,
  onSwitch,
  switchable,
  back,
  onClose,
}: Props) {
  // 12 below, over the list and over a trip alike: the card follows it
  // straight away (3742:1049 and 3778:3183, the owner's of 2026-10-01; 16
  // over the list and 8 over a trip before).
  return (
    <div className="flex w-full items-center gap-2 bg-surface px-3 pt-0 pb-3 @float:pt-3">
      {routeCount !== undefined ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 text-content-primary">
          <span aria-hidden className="size-6 shrink-0 *:size-full">
            <JeepIcon />
          </span>
          <p className="min-w-0 flex-1 truncate font-sn-pro text-xl/7 font-bold">{routeCount}</p>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center">
          {onBackToList && (
            <IconButton
              icon={<ChevronLeftIcon />}
              label="Back"
              tooltip="top"
              onClick={onBackToList}
            />
          )}
        </div>
      )}
      <div className="flex shrink-0 items-center gap-3">
        <Button
          variant="special"
          label={wayWord(back)}
          data-testid={routeCount !== undefined ? 'chooser-flip' : 'card-switch'}
          aria-pressed={back}
          disabled={!switchable}
          onClick={onSwitch}
        />
        <IconButton icon={<CloseIcon />} label="Close" tooltip="top" onClick={onClose} />
      </div>
    </div>
  );
}
