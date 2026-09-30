import { useState, type ReactNode, type Ref } from "react";
import { kmLabel } from "../geo/geo";
import { RouteCardHeader } from "./RouteCardHeader";
import { BottomSheet, type SheetHeight } from "./BottomSheet";
import { ReloadIcon } from "./RouteIcons";
import { TripTimeline, type TripTimelineProps } from "./TripTimeline";

/** A ride's pesos both ways: `₱13–24` regular, and its student (discounted) price. */
export type Fares = { regular: string; student: string };

type Props = Omit<TripTimelineProps, "pickedPriced"> & {
  /** Figma's Kilometer tile: the whole ride's length, in metres; written `12.8km`. */
  metres: number;
  /** …and the ride to the picked hintuan, which the tile shows while it is picked, as the fare tile does. */
  pickedMetres?: number;
  /** The fare tile's pesos for the whole ride. Omitted when unpriced, and the tile with it. */
  fare?: Fares;
  /** …and for the ride to the picked hintuan, which the tile shows while it is picked. */
  pickedFare?: Fares;
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
 * and under them ↻ and which fare they are, Regular or Student; a tap turns
 * it to the other. With a hintuan picked it prices the ride from where the
 * trip leaves to there — the pick's pill says "Calculated Fare" — and let go,
 * the whole ride again (his ask: "change the value of it based on the
 * hintuan they select"). It opens on Regular, and keeps which it shows
 * through a pick, SWITCH and back. The Kilometer tile follows the pick the
 * same way, from where the trip leaves to there (the owner, 2026-09-30: "it
 * should follow the picked hintuan").
 * The pesos moved off the rail into their tile with this set; a route no
 * fare rule prices has no Expected fare tile, and Kilometer takes the row
 * (the owner kept that default, 2026-09-29: nothing is drawn for it).
 *
 * The card and its rail are TripTimeline's.
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
  onSwitch,
  switchable,
  back,
  onBackToList,
  onClose,
  dockRef,
  height,
  children,
}: Props) {
  const [student, setStudent] = useState(false);
  // Each tap turns ↻ round once more (the owner's "simple rotation only if
  // selected", 2026-09-30): counted, so the next tap turns it again rather
  // than back.
  const [turns, setTurns] = useState(0);
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
      {/* On a phone the card sits right under the header (the owner's 3817:6007, 2026-09-30); floating, 12 below it. */}
      <div className="w-full px-3 @float:pt-3">
        <TripTimeline
          livery={livery}
          routeOrigin={routeOrigin}
          hintuans={hintuans}
          picked={picked}
          onPick={onPick}
          pickedPriced={!!pickedFare}
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
        {shown && (
          <button
            type="button"
            data-testid="trip-fare-turn"
            aria-label={`${student ? "Student" : "Regular"} fare ${student ? shown.student : shown.regular}. Show the ${student ? "regular" : "student"} fare`}
            onClick={() => {
              setStudent((s) => !s);
              setTurns((t) => t + 1);
            }}
            className={
              TILE +
              " transition-colors duration-quick ease-move hover:bg-surface-tertiary active:bg-surface-quaternary"
            }
          >
            <span data-testid="trip-fare" className={FIGURE}>
              {student ? shown.student : shown.regular}
            </span>
            <span className={NAME + " flex items-center gap-1.5"}>
              <span
                aria-hidden
                style={{ rotate: `${turns * 360}deg` }}
                className="size-4 shrink-0 text-content-quaternary transition-[rotate] duration-gentle ease-move motion-reduce:transition-none *:size-full"
              >
                <ReloadIcon />
              </span>
              {student ? "Student fare" : "Regular fare"}
            </span>
          </button>
        )}
      </div>
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
  "flex min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-2 rounded-2xl bg-surface-secondary p-4";
const FIGURE = "block text-2xl/8 font-bold text-content-primary";
const NAME = "block text-sm/5 font-normal text-content-tertiary";
