import { useState } from 'react';

import { ChevronDownIcon, CircleArrowRightIcon } from '@/shared/ui/route-icons';

import {
  BLOB_PLACE,
  CARD_BLOB,
  CARD_SHADOW,
  CARD_SURFACE,
  CARD_TEXT,
  ROW_PRESSED,
  TIMELINE_PILL,
  TIMELINE_SURFACE,
} from './livery-card';
import type { Livery } from '../model/liveries';

export interface TripTimelineProps {
  livery: Livery;
  /** Figma's Route on TimelineTop: the place the trip leaves from. */
  routeOrigin: string;
  /** Figma's TimelineHintuan rows: every hintuan on the way, in the order the jeep reaches them. */
  hintuans: readonly { id: string; label: string }[];
  /** The hintuan picked, by its row's id — Figma's Timeline State=Selected — or null. */
  picked: string | null;
  /** A hintuan's row was tapped: pick it, or, picked, let it go. */
  onPick: (id: string) => void;
  /**
   * The pesos of the ride to the picked hintuan, for its pill: the fare the
   * tile under the card shows, Regular or Discounted (the owner, 2026-09-30:
   * "why it shows calculated fare instead of its real value?" — the pill
   * said "Calculated Fare" for the day before). Omitted when unpriced, and
   * no pill.
   */
  pickedPesos?: string;
  /** The origin's row (`from`) or the destination's (`to`) was tapped: the whole ride again, and that end shown. */
  onEnd: (end: 'from' | 'to') => void;
  /**
   * The origin (`from`) or the destination (`to`), picked from its row: its
   * dot the Selected one, as a picked hintuan's; or null. One pick at a
   * time: the caller keeps this and `picked` apart (useRideTo does), since
   * both at once would draw two picked dots.
   */
  endPicked: 'from' | 'to' | null;
  /** Figma's Route on TimelineBottomEndRoute: the place the trip goes to. */
  routeDirection: string;
}

/**
 * A trip's card, RouteTripDetail's (split from it, 2026-09-29): in the
 * livery of the place the trip leaves from, a rail from the origin
 * (TimelineTop) down to the place it goes to (TimelineBottomEndRoute).
 *
 * The hintuans between fold into one row, "10 more hintuans" (with an s
 * since this set); opened, every one of them shows alike — a
 * place other routes end at, SM Fairview on the way to Novaliches, is a
 * hintuan like the rest (his redrawing of the 28th's big mid-route row) —
 * and "View less" folds them again. It opens folded. A lone hintuan is shown
 * as it is: a row saying "1 more hintuan" would take its place only to hide
 * it (Claude's call, 2026-09-29, the owner's "go" standing on it).
 *
 * The fold moves on the Motion tokens (the owner's "try it", 2026-09-29: no
 * frames to animate it in first): the rows open over gentle, arriving
 * (ease-enter), and fold over base, leaving (ease-exit), each drawn from the
 * top as its height grows; the chevron turns over quick (ease-move). Folded,
 * the rows stay, invisible, so they can close in view — their insides drawn
 * only once the fold has been opened (2026-10-04) — and nothing moves for a
 * phone set to reduce motion. Height is layout, which the Motion note keeps
 * to opacity and transform: a fold is its one exception, since only the
 * height can push the destination down without measuring (the owner's
 * call, 2026-09-29).
 *
 * The rows are the owner's Timeline set (3716:1894) — TimelineStick for the
 * rail, TimelineDot for the stops — drawn in red there; each livery takes
 * its own Card/<livery>/Timeline/surface.
 *
 * A hintuan's row picks it (his Timeline State=Selected, 3769:2847,
 * 2026-09-29): its dot turns to a white ring round a centre in the card's
 * rail colour (green until 2026-09-30; TimelineDot), its name black-weight,
 * and a pill beside it holds the pesos from where the trip leaves to there,
 * the same the fare tile under the card shows, Regular or Discounted as it is
 * turned (it said "Calculated Fare" for part of 2026-09-30),
 * while a circle like its dot pops up on the map where it is, the route
 * left whole (his ask of 2026-09-30, "now I don't want to cut the route";
 * until then the map drew the ride dark only that far). Tapping it again
 * lets it go, the fare tile the whole ride's again; one at a time. Folded away, a picked
 * row stays picked (the default he kept). The origin's and the
 * destination's rows are buttons too: a tap on either lets a hintuan go,
 * the ride whole again, and the map glides to that end, so a rider can look
 * along the route from end to end (his ask, 2026-09-29). Either end is
 * picked by its tap, its dot the Selected one, and let go by a second (his
 * "green circle too" for the destination and "it should have!" for the
 * origin, the same day); its name and the pesos stay as they are, the whole ride's being
 * the tile's.
 */
export function TripTimeline({
  livery,
  routeOrigin,
  hintuans,
  picked,
  onPick,
  pickedPesos,
  onEnd,
  endPicked,
  routeDirection,
}: TripTimelineProps) {
  const [open, setOpen] = useState(false);
  // Whether the fold has ever been opened on this card: until then its rows
  // are their bare <li>s, the hidden insides left out (the cheap-phone
  // plan, step 11, 2026-10-04). A trip with 10 to 25 hintuans drew all of
  // them, invisible, as it opened, for a fold most riders never open.
  // Opened once, they stay drawn as long as the card is up, so they close
  // in view and open again as they always did. Set with `open` itself, in
  // the same render, so the first opening moves as every other.
  const [everOpened, setEverOpened] = useState(false);
  const folds = hintuans.length > 1;
  const drawn = !folds || open || everOpened;
  const rail = TIMELINE_SURFACE[livery];
  // Every row's Pressed: the rail's colour, while the finger is down.
  const pressed = ROW_PRESSED[livery];

  return (
    <div
      data-testid="trip"
      data-livery={livery}
      className={
        'relative isolate flex w-full flex-col overflow-clip rounded-2xl border-y-[0.6px] font-sn-pro ' +
        CARD_SURFACE[livery] +
        ' ' +
        CARD_TEXT[livery]
      }
    >
      <img
        src={CARD_BLOB[livery].src}
        alt=""
        aria-hidden
        className={BLOB_PLACE + ' ' + CARD_BLOB[livery].className}
      />
      {/* The fold row keeps its place among the children whether open or not,
          so a keyboard's focus stays on it while the hintuans come and go. */}
      <ol className="flex w-full flex-col">
        <TimelineTop
          rail={rail}
          pressed={pressed}
          routeOrigin={routeOrigin}
          selected={endPicked === 'from'}
          onTap={() => onEnd('from')}
        />
        {hintuans.map((h, i) => (
          <TimelineHintuan
            key={i + ':' + h.id}
            id={h.id}
            rail={rail}
            pressed={pressed}
            label={h.label}
            shown={!folds || open}
            drawn={drawn}
            selected={h.id === picked}
            pesos={h.id === picked ? pickedPesos : undefined}
            pill={TIMELINE_PILL[livery]}
            onPick={onPick}
          />
        ))}
        {folds && (
          <TimelineDisclosure
            rail={rail}
            pressed={pressed}
            open={open}
            count={hintuans.length}
            onToggle={() => {
              setOpen((o) => !o);
              // The first tap opens it (it starts folded): from then on, drawn.
              setEverOpened(true);
            }}
          />
        )}
        <TimelineBottomEndRoute
          rail={rail}
          pressed={pressed}
          routeDirection={routeDirection}
          selected={endPicked === 'to'}
          onTap={() => onEnd('to')}
        />
      </ol>
      {/* The rows' names are set in SN Pro Medium, a face nothing else on a
          card may use (no "Other routes", no signboards: 8 of the 20 drawn
          directions on 2026-10-04). Drawn hidden, the folded rows asked for
          it as the card opened; undrawn, they would ask only as they open,
          and show their names in a stand-in font until it came
          (font-display: swap). One hidden name asks for it as they did. */}
      {!drawn && (
        <span aria-hidden className="pointer-events-none invisible absolute font-medium">
          {hintuans[0]?.label}
        </span>
      )}
      <span
        aria-hidden
        className={'pointer-events-none absolute inset-0 rounded-[inherit] ' + CARD_SHADOW[livery]}
      />
    </div>
  );
}

/**
 * Figma's TimelineDot: Content/inverse ringed in the rail's colour. It sits
 * 2px into the rail after it, as the TimelineStick's -2px gap lays them.
 * Selected, the white grows and the ring thins to 2px round it, with a 12px
 * centre in the rail's colour again — the card's own, where it was
 * Content/success green until the owner's redrawing of 2026-09-30
 * (3778:3183: "the selected part is no longer green", the pick "based on
 * the surface"): 24 across either way, so nothing moves. The public map's
 * picked hintuan wears the Selected one too (HintuanPin).
 */
export function TimelineDot({ rail, selected = false }: { rail: string; selected?: boolean }) {
  return selected ? (
    <span className={'-mb-0.5 flex shrink-0 rounded-full p-0.5 ' + rail}>
      <span className="grid size-5 place-items-center rounded-full bg-content-inverse">
        <span className={'size-3 rounded-full ' + rail} />
      </span>
    </span>
  ) : (
    <span className={'-mb-0.5 flex shrink-0 rounded-full p-1.5 ' + rail}>
      <span className="size-3 rounded-full bg-content-inverse" />
    </span>
  );
}

/**
 * The rail's column, 24 wide, as tall as its row's content. The card has no
 * padding of its own: the 16 above the first row and below the last are
 * theirs (the owner's RouteTripDetail, 3778:3183, 2026-10-01), so a row
 * Pressed fills to the card's edge, the rail starting under that padding.
 */
const STICK = 'flex w-6 shrink-0 flex-col items-center self-stretch';

/**
 * Figma's TimelineTop: the dot the rail leaves from, and the origin in SN Pro
 * Black; the whole row is its button. Picked, its dot is TimelineDot's
 * Selected one.
 */
function TimelineTop({
  rail,
  pressed,
  routeOrigin,
  selected,
  onTap,
}: {
  rail: string;
  /** ROW_PRESSED's classes for the card's livery. */
  pressed: string;
  routeOrigin: string;
  selected: boolean;
  onTap: () => void;
}) {
  return (
    <li data-testid="trip-origin" data-state={selected ? 'selected' : 'rest'}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onTap}
        className={'flex w-full items-center pt-4 pl-4 text-left ' + pressed}
      >
        <span aria-hidden className={STICK}>
          <TimelineDot rail={rail} selected={selected} />
          <span className={'min-h-px w-2 flex-1 ' + rail} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-center pb-2.5 pl-3">
          {/* At a sheet's Low, one line of it (sheetGesture's LOW_PX); from Middle up, all of it. */}
          <span className="text-2xl/8 font-black sheet-low:line-clamp-1">{routeOrigin}</span>
        </span>
      </button>
    </li>
  );
}

/**
 * A hintuan row open, or folded away: its one grid row runs from nothing to
 * its height (1fr), and back. `visibility` flips at the end of the fold, so
 * the row stays in sight while it closes, then leaves the words and the
 * screen reader. Folded and never opened, the row is its <li> alone: with
 * nothing in it its 0fr row is as tall as with its clipped inside, nothing
 * (2026-10-04), and it keeps these classes, so the first opening runs the
 * same transition from the same 0fr.
 */
const ROW_SHOWN = 'visible grid-rows-[1fr] duration-gentle ease-enter';
const ROW_FOLDED = 'invisible grid-rows-[0fr] duration-base ease-exit';

/**
 * Figma's TimelineHintuan: a hintuan on the way, its dot on the rail; the
 * whole row is its button. Selected (State=Selected), its name is Black and
 * the pill of its pesos sits 8 after it, 16 in from the card's edge.
 */
function TimelineHintuan({
  id,
  rail,
  pressed,
  label,
  shown,
  drawn,
  selected,
  pesos,
  pill,
  onPick,
}: {
  id: string;
  rail: string;
  /** ROW_PRESSED's classes for the card's livery. */
  pressed: string;
  label: string;
  shown: boolean;
  /** Whether its inside is drawn: shown, or folded after it has been opened (TripTimeline's everOpened). */
  drawn: boolean;
  selected: boolean;
  /** The ride's pesos to here, for the pill; picked and priced only. */
  pesos?: string;
  /** TIMELINE_PILL's classes for the card's livery. */
  pill: string;
  onPick: (id: string) => void;
}) {
  return (
    <li
      data-testid="trip-hintuan"
      data-hintuan={id}
      data-state={selected ? 'selected' : 'rest'}
      className={
        'grid transition-[grid-template-rows,visibility] motion-reduce:transition-none ' +
        (shown ? ROW_SHOWN : ROW_FOLDED)
      }
    >
      {/* Clipped, not squeezed: the row keeps its height inside, and shows from the top. */}
      {drawn && (
        <div className="min-h-0 overflow-hidden">
          <button
            type="button"
            data-testid="trip-hintuan-pick"
            aria-pressed={selected}
            onClick={() => onPick(id)}
            className={'flex w-full items-start px-4 text-left ' + pressed}
          >
            <span aria-hidden className={STICK}>
              <span className={'-mb-0.5 min-h-px w-2 flex-1 ' + rail} />
              <TimelineDot rail={rail} selected={selected} />
              <span className={'min-h-px w-2 flex-1 ' + rail} />
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pl-3">
              <span
                className={
                  'min-w-0 flex-1 text-base/6 ' + (selected ? 'font-black' : 'font-medium')
                }
              >
                {label}
              </span>
              {pesos && (
                <span
                  data-testid="trip-hintuan-fare"
                  className={
                    'shrink-0 rounded-full px-1.5 py-0.5 text-sm/5 font-medium whitespace-nowrap ' +
                    pill
                  }
                >
                  {pesos}
                </span>
              )}
            </span>
          </button>
        </div>
      )}
    </li>
  );
}

/** Figma's TimelineDisclosure: the hintuans folded into one row, or, opened, the row that folds them. */
function TimelineDisclosure({
  rail,
  pressed,
  open,
  count,
  onToggle,
}: {
  rail: string;
  /** ROW_PRESSED's classes for the card's livery. */
  pressed: string;
  open: boolean;
  count: number;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        data-testid="trip-fold"
        aria-expanded={open}
        onClick={onToggle}
        className={'flex w-full items-start pl-4 text-left ' + pressed}
      >
        <span aria-hidden className={STICK}>
          <span className={'min-h-px w-2 flex-1 ' + rail} />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pl-3 text-sm/5 font-normal whitespace-nowrap">
          {/* One chevron, turned: Figma's chevron-down, and its chevron-up opened. */}
          <span
            aria-hidden
            className={
              'size-5 shrink-0 transition-transform duration-quick ease-move *:size-full motion-reduce:transition-none ' +
              (open ? 'rotate-180' : 'rotate-0')
            }
          >
            <ChevronDownIcon />
          </span>
          {open ? 'View less' : `${count} more hintuans`}
        </span>
      </button>
    </li>
  );
}

/**
 * Figma's TimelineBottomEndRoute: the rail's last dot, and where the trip
 * goes, behind the list's arrow; the whole row is its button. Picked, its
 * dot is TimelineDot's Selected one.
 */
function TimelineBottomEndRoute({
  rail,
  pressed,
  routeDirection,
  selected,
  onTap,
}: {
  rail: string;
  /** ROW_PRESSED's classes for the card's livery. */
  pressed: string;
  routeDirection: string;
  selected: boolean;
  onTap: () => void;
}) {
  return (
    <li data-testid="trip-destination" data-state={selected ? 'selected' : 'rest'}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onTap}
        className={'flex w-full items-center pb-4 pl-4 text-left ' + pressed}
      >
        <span aria-hidden className={STICK}>
          <span className={'-mb-0.5 h-5 w-2 shrink-0 ' + rail} />
          <TimelineDot rail={rail} selected={selected} />
        </span>
        <span className="flex min-w-0 flex-1 items-start gap-1 pt-4 pl-2">
          <span aria-hidden className="shrink-0 p-1 *:size-5">
            <CircleArrowRightIcon />
          </span>
          {/* Bold, Figma's text-xl/bold (the owner, 2026-09-30: "bold"). */}
          <span className="min-w-0 flex-1 text-xl/7 font-bold">{routeDirection}</span>
        </span>
      </button>
    </li>
  );
}
