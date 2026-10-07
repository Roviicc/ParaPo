import { useId, useState, type ReactNode, type Ref } from 'react';

import { BottomSheet, type SheetHeight } from '@/shared/ui/bottom-sheet';
import { ReloadIcon } from '@/shared/ui/route-icons';
import { kmLabel } from '@/shared/utils/geo';

import { RouteCardHeader } from './route-card-header';
import { RouteEndPointBar } from './route-end-point-bar';
import { TripTimeline, type TripTimelineProps } from './trip-timeline';

/** A ride's pesos both ways: `₱26` regular, and its discounted price — students, seniors, PWDs. */
export interface Fares {
  regular: string;
  discounted: string;
}
/** A ride nobody pays for, the ferry's (the owner's pick, 2026-10-03): the tile says Free, with no Regular or Discounted to turn. */
export const FREE = 'free';
export type Fare = Fares | typeof FREE;

type Props = Omit<TripTimelineProps, 'pickedPesos'> & {
  /** Figma's Kilometer tile: the whole ride's length, in metres; written `12.8km`. */
  metres: number;
  /** …and the ride to the picked hintuan, which the tile shows while it is picked, as the fare tile does. */
  pickedMetres?: number;
  /** The fare tile's pesos for the whole ride, or FREE. Omitted when unpriced, and the tile with it. */
  fare?: Fare;
  /** …and for the ride to the picked hintuan, which the tile shows while it is picked. */
  pickedFare?: Fare;
  /**
   * Whether the tile shows the Discounted fare, and where a tap says so: the
   * app keeps one for every trip (useFareKind). Without them, the card keeps
   * its own, opening on Regular, as a story does.
   */
  discounted?: boolean;
  onDiscounted?: (discounted: boolean) => void;
  /** SWITCH: the same route the other way. */
  onSwitch: () => void;
  /** False when the route has no other way drawn; SWITCH then rests disabled. */
  switchable: boolean;
  /** Whether this trip is the route's way back: SWITCH is pressed then, as over the list. */
  back: boolean;
  /** ‹: back to what the trip was picked from — the list, a hotspot's card — or to its route with those sharing an end; null when there is none. */
  onBackToList: (() => void) | null;
  onClose: () => void;
  /** The dock the card sits in, for the map to glide clear of it. */
  dockRef?: Ref<HTMLDivElement>;
  /** Its height, shared with the list or card it was opened from (BottomSheet). */
  height?: SheetHeight;
  /**
   * Figma's "Other routes" under the tiles: the other routes out of where
   * this trip starts, each by where it goes. Empty or omitted, none is shown.
   */
  otherRoutes?: readonly { id: string; to: string }[];
  /** A row tapped: that route's trip in this one's place. */
  onOtherRoute?: (id: string) => void;
  /**
   * Figma's "Signboard" (3919:11355, 2026-10-01): the boards this direction's
   * jeeps show, as pictures, in their order — addresses of SVG files the
   * studio uploaded. Empty or omitted, none is shown.
   */
  signboards?: readonly string[];
  /** Under the tiles, a line's own fixed words (LINE_NOTES): the ferry's days and where to check for a suspension. */
  note?: string;
  /** Under the tiles: what only the studio shows — its facts and its Edit, Extend and Delete. */
  children?: ReactNode;
};

/**
 * One direction as a trip — the owner's RouteTripDetail (Figma 3778:3183,
 * 2026-09-29): RouteCardHeader's Variant2; a card in the livery of the place
 * the trip leaves from, inset from the sides and rounded, where a rail runs
 * from the origin (TimelineTop) down to the place it goes to
 * (TimelineBottomEndRoute); then two tiles under it, the ride's Kilometer and
 * its fare (moved under the card in his redrawing the same day).
 *
 * The fare tile (his 3778:3183, redrawn 2026-09-30) is a button: the pesos,
 * and under them ↻ and which fare they are, Regular or Discounted; a tap turns
 * it to the other. With a hintuan picked it prices the ride from where the
 * trip leaves to there — the pick's pill the same pesos — and let go,
 * the whole ride again (his ask: "change the value of it based on the
 * hintuan they select"). The fare picked is kept for every trip after, and the
 * next visit (useFareKind; his "I don't want the user to keep tapping",
 * 2026-09-30). Its second fare was "Student fare" until he named it
 * "Discounted fare" (2026-09-30). A first visit opens on Regular. The Kilometer tile follows the pick the
 * same way, from where the trip leaves to there (the owner, 2026-09-30: "it
 * should follow the picked hintuan").
 * The pesos moved off the rail into their tile with this set; a route no
 * fare rule prices has no Expected fare tile, and Kilometer takes the row
 * (the owner kept that default, 2026-09-29: nothing is drawn for it).
 *
 * Under the tiles, "Other routes" (his of 2026-10-01): a row per other
 * route out of where the trip starts, each by where it goes, as a
 * RouteCard's rows are; a tap opens that route's trip in this one's place.
 * With none, there is no heading either.
 *
 * The card and its rail are TripTimeline's.
 *
 * Under the tiles, the direction's signboards as pictures (the owner's
 * Signboard, 3919:11355, 2026-10-01), uploaded in the studio, then "Other
 * routes".
 */
export function RouteTripDetail({
  livery,
  metres,
  pickedMetres,
  fare,
  routeOrigin,
  hintuans,
  picked,
  onPick,
  pickedFare,
  onEnd,
  endPicked,
  routeDirection,
  discounted: kept,
  onDiscounted,
  onSwitch,
  switchable,
  back,
  onBackToList,
  onClose,
  dockRef,
  height,
  otherRoutes = [],
  onOtherRoute,
  signboards = [],
  note,
  children,
}: Props) {
  const [own, setOwn] = useState(false);
  const discounted = kept ?? own;
  const setDiscounted = (d: boolean) => (onDiscounted ? onDiscounted(d) : setOwn(d));
  // Each tap turns ↻ round once more (the owner's "simple rotation only if
  // selected", 2026-09-30): counted, so the next tap turns it again rather
  // than back. It turns over `turn`, gentle at 6/10 as fast (his "it's fast",
  // the same day).
  const [turns, setTurns] = useState(0);
  const othersHeading = useId();
  const boardsHeading = useId();
  const shown = picked && pickedFare ? pickedFare : fare;
  const shownMetres = picked && pickedMetres !== undefined ? pickedMetres : metres;
  return (
    <BottomSheet
      ref={dockRef}
      height={height}
      label={`${routeOrigin} → ${routeDirection}`}
      testId="card"
      onClose={onClose}
      header={
        <RouteCardHeader
          onBackToList={onBackToList}
          onSwitch={onSwitch}
          switchable={switchable}
          back={back}
          onClose={onClose}
        />
      }
    >
      {/* Right under the header, whose 12 below is the gap (the owner's RouteTripDetail, 3778:3183, 2026-10-01). */}
      <div className="w-full px-3">
        <TripTimeline
          livery={livery}
          routeOrigin={routeOrigin}
          hintuans={hintuans}
          picked={picked}
          onPick={onPick}
          pickedPesos={
            pickedFare &&
            (pickedFare === FREE ? 'Free' : discounted ? pickedFare.discounted : pickedFare.regular)
          }
          onEnd={onEnd}
          endPicked={endPicked}
          routeDirection={routeDirection}
        />
      </div>
      <div
        data-testid="trip-tiles"
        className="flex w-full gap-3 bg-surface px-3 pt-3 pb-4 text-center font-sn-pro"
      >
        <div className={TILE}>
          <span data-testid="trip-km" className={FIGURE}>
            {kmLabel(shownMetres)}
          </span>
          <span className={NAME}>Kilometer</span>
        </div>
        {shown === FREE ? (
          <div className={TILE}>
            <span data-testid="trip-fare" className={FIGURE}>
              Free
            </span>
            <span className={NAME}>Fare</span>
          </div>
        ) : (
          shown && (
            <button
              type="button"
              data-testid="trip-fare-turn"
              aria-label={`${discounted ? 'Discounted' : 'Regular'} fare ${discounted ? shown.discounted : shown.regular}. Show the ${discounted ? 'regular' : 'discounted'} fare`}
              onClick={() => {
                setDiscounted(!discounted);
                setTurns((t) => t + 1);
              }}
              className={
                TILE +
                ' transition-colors duration-quick ease-move hover:bg-surface-tertiary active:bg-surface-quaternary'
              }
            >
              <span data-testid="trip-fare" className={FIGURE}>
                {discounted ? shown.discounted : shown.regular}
              </span>
              <span className={NAME + ' flex items-center gap-1.5'}>
                <span
                  aria-hidden
                  style={{ rotate: `${turns * 360}deg` }}
                  className="size-4 shrink-0 text-content-quaternary transition-[rotate] duration-turn ease-move *:size-full motion-reduce:transition-none"
                >
                  <ReloadIcon />
                </span>
                {discounted ? 'Discounted fare' : 'Regular fare'}
              </span>
            </button>
          )
        )}
      </div>
      {note && (
        <p
          data-testid="trip-note"
          className="w-full px-3 pb-4 font-sn-pro text-sm/5 text-content-tertiary"
        >
          {note}
        </p>
      )}
      {signboards.length > 0 && (
        // Each board 40 tall at its own width, 8 apart, wrapping on a narrow
        // phone (3919:11447). Pictures, so nothing in a file can run.
        <section
          data-testid="trip-signboards"
          aria-labelledby={boardsHeading}
          className="flex w-full flex-col gap-2 px-3 pt-2 pb-4 font-sn-pro"
        >
          <h3 id={boardsHeading} className="text-sm/5 font-medium text-content-tertiary">
            Signboard
          </h3>
          <ul className="flex flex-wrap gap-2">
            {signboards.map((src, i) => (
              <li key={src}>
                <img
                  data-testid="trip-signboard"
                  src={src}
                  alt={
                    signboards.length > 1
                      ? `Signboard ${i + 1} of ${signboards.length}`
                      : 'Signboard'
                  }
                  className="block h-10 w-auto max-w-full"
                  decoding="async"
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {otherRoutes.length > 0 && (
        <section
          data-testid="trip-other-routes"
          aria-labelledby={othersHeading}
          className="flex w-full flex-col gap-2 px-3 pt-2 pb-4 font-sn-pro"
        >
          <h3 id={othersHeading} className="text-sm/5 font-medium text-content-tertiary">
            Other routes
          </h3>
          <ul>
            {otherRoutes.map((r) => (
              <li key={r.id}>
                <RouteEndPointBar
                  routeDirection={r.to}
                  on="surface"
                  data-testid="trip-other-route"
                  data-direction={r.id}
                  onClick={() => onOtherRoute?.(r.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {children}
    </BottomSheet>
  );
}

/**
 * One of the two tiles under the card, in Figma's row of them (3771:3055):
 * its figure over its name (the figure on top since 3778:3183's redrawing),
 * on Background/surface-secondary. Figma writes the figure in a raw black;
 * Content/primary is the token nearest it.
 */
const TILE =
  'flex min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-2 rounded-2xl bg-surface-secondary p-4';
const FIGURE = 'block text-2xl/8 font-bold text-content-primary';
const NAME = 'block text-sm/5 font-normal text-content-tertiary';
