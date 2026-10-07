import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { BottomSheet, SheetHeader, type SheetHeight } from '@/shared/ui/bottom-sheet';

import { Departures } from './departures';
import { RouteCardStack, type PickedPlace } from './route-card-stack';
import { SwitchIcon } from './switch-icon';
import { departures, drawnDepartures } from '../model/departures';
import { hotspotLabel, type Hotspot } from '../model/hotspots';
import type { Livery } from '../model/liveries';
import { placeSummary, siblingsOf } from '../model/places';
import type { Direction } from '../model/routes';

interface Props {
  hotspot: Hotspot;
  /** Directions linked to this hotspot, in stop_sequence order. */
  linkedDirectionIds: string[];
  directions: Direction[];
  /** Called with the direction picked, and, from a RouteCard, the colour its card wore: its trip wears the same. */
  onSelectDirection: (v: Direction, livery?: Livery) => void;
  /**
   * The routes through here as the owner's RouteCards, as the route list
   * shows them — the public map's, 2026-09-29 — with the place whose card is
   * Selected, what to do when one is picked or let go, and where to say
   * which directions the cards show, for the map to light (nothing once the
   * card closes). Without it, the rows the studio keeps: their "Not mapped
   * yet" is its list of returns still to draw.
   */
  routeCards?: {
    selected: string | null;
    onSelect: (place: PickedPlace | null) => void;
    /** What the RouteCards show while the card is open; null once it closes. */
    onShown: (ids: readonly string[] | null) => void;
  };
  /** Every hotspot, so the card can name the place this box belongs to and list its siblings. */
  hotspots?: readonly Hotspot[];
  /** Show a sibling box on the map: select it and go there. */
  onPickSibling?: (id: string) => void;
  /** Buttons along the bottom. The editor passes Edit and Delete; the public map passes nothing. */
  actions?: ReactNode;
  onClose: () => void;
  /** Kept but not shown, while a trip picked from it is on top: ‹ comes back to it as it was left, every card at rest. */
  hidden?: boolean;
  /** Its height, shared with the trip opened from it (BottomSheet). */
  height?: SheetHeight;
}

/**
 * What anyone sees when they tap a hotspot. The card does not know who is
 * looking: whoever renders it decides which actions to offer.
 *
 * `BottomSheet` decides the shape, the same as every card's. Its header is
 * the name and what kind of place it is; under it, the routes through it.
 */
export function HotspotCard({
  hotspot,
  linkedDirectionIds,
  directions,
  onSelectDirection,
  routeCards,
  hotspots = [],
  onPickSibling,
  actions,
  onClose,
  hidden,
  height,
}: Props) {
  const isTerminal = hotspot.kind === 'terminal';
  const label = hotspotLabel(hotspot);
  const siblings = siblingsOf(hotspot, hotspots);
  const byId = new Map(directions.map((v) => [v.id, v]));
  const linked = linkedDirectionIds.map((id) => byId.get(id)).filter((v): v is Direction => !!v);
  // The routes through here, one way round, by the place each leaves from,
  // ⇄ for the way back: the owner's RouteCards on the public map, the rows
  // in the studio. Both directions of a route are linked to a box on a
  // two-way road, so each route shows once either way round; a route linked
  // one way only is a slot the other way, which the studio's rows show as
  // "not mapped yet" and the RouteCards leave out.
  // A box on a one-way street, or beside one carriageway, is passed one way
  // only: then that way is the one shown, and there is nothing to flip to.
  // The RouteCards list drawn directions only (the owner dropped "not mapped
  // yet" from them, 2026-09-28), so for them a way round with nothing drawn
  // is no way round at all.
  const listed = routeCards ? drawnDepartures : departures;
  const [flipped, setFlipped] = useState(false);
  const there = listed(linked, false).length > 0;
  const backToo = listed(linked, true).length > 0;
  const back = there && backToo ? flipped : backToo;
  const flipLabel = back ? 'Show the way there' : 'Show the way back';
  const none = routeCards ? !there && !backToo : linked.length === 0;

  // What the RouteCards show, for the map to light (the owner, 2026-09-29:
  // "on hintuan it should light its routes"); nothing once the card closes.
  // Told only when that changes: the caller's function is read from a ref,
  // so one made afresh each render cannot set the lights going in a loop.
  const showsKey = routeCards
    ? drawnDepartures(linked, back)
        .flatMap((p) => p.directions.map((d) => d.v.id))
        .join('\n')
    : '';
  const onShown = useRef(routeCards?.onShown);
  onShown.current = routeCards?.onShown;
  // Before the first paint, and null once closed, as HintuanCard's (2026-10-03).
  useLayoutEffect(() => {
    const tell = onShown.current;
    if (!tell) return;
    tell(showsKey ? showsKey.split('\n') : []);
    return () => tell(null);
  }, [showsKey]);

  return (
    <BottomSheet
      testId="card"
      floats="card"
      label={label}
      onClose={onClose}
      hidden={hidden}
      height={height}
      header={
        <SheetHeader onClose={onClose}>
          <>
            <p className="truncate text-base font-semibold text-content-primary">{label}</p>
            {label !== hotspot.name && (
              <p className="truncate text-xs text-neutral-500">{hotspot.name}</p>
            )}
            <span
              className={
                'mt-1 inline-block rounded-full px-2 py-0.5 text-xs ' +
                (isTerminal ? 'bg-sky-50 text-sky-700' : 'bg-orange-50 text-orange-700')
              }
            >
              {isTerminal ? 'Terminal · routes start here' : 'Hintuan · wait and board here'}
            </span>
          </>
        </SheetHeader>
      }
    >
      <div className="px-4 pb-4">
        {hotspot.note && <p className="mt-3 text-sm text-content-tertiary">{hotspot.note}</p>}

        {/* The place this box belongs to, when it has company: the map shows
            *that* they belong together, this says *what* the place has, and each
            sibling is one tap away — a rider at a hintuan looking for the
            terminal. Decided with the owner 2026-09-22. */}
        {siblings.length > 0 && (
          <div data-testid="card-place" className="mt-3 rounded-lg bg-neutral-50 px-3 py-2">
            <p className="text-xs font-medium text-content-quaternary">
              Part of {label} · {placeSummary([hotspot, ...siblings])}
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {siblings.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    data-testid="card-sibling"
                    onClick={() => onPickSibling?.(s.id)}
                    disabled={!onPickSibling}
                    title="Show this box on the map"
                    className={
                      'rounded-full px-2.5 py-1 text-xs ' +
                      (s.kind === 'terminal'
                        ? 'bg-sky-50 text-sky-800'
                        : 'bg-orange-50 text-orange-800') +
                      (onPickSibling ? ' hover:bg-neutral-900 hover:text-content-inverse' : '')
                    }
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <p className="min-w-0 flex-1 text-xs font-medium text-neutral-500">
            {isTerminal ? 'Routes that stage here' : 'Routes that pass through'}
          </p>
          {there && backToo && (
            <button
              type="button"
              data-testid="card-flip"
              aria-pressed={back}
              onClick={() => {
                setFlipped((b) => !b);
                routeCards?.onSelect(null);
              }}
              aria-label={flipLabel}
              title={flipLabel}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-content-tertiary hover:bg-surface-secondary"
            >
              <SwitchIcon />
            </button>
          )}
        </div>
        {none ? (
          <p className="mt-1 text-sm text-neutral-500">
            {isTerminal ? 'None recorded yet.' : 'No saved route passes through here yet.'}
          </p>
        ) : routeCards ? (
          // Edge to edge, as the route list stacks them (the owner, 2026-09-29);
          // the rest of this card waits for his hintuan design. ⇄ lets the
          // Selected card go, as SWITCH does over the list.
          <div className="-mx-4 mt-1">
            <RouteCardStack
              routes={linked}
              back={back}
              selected={routeCards.selected}
              onSelect={routeCards.onSelect}
              onRoute={onSelectDirection}
              testId="card"
            />
          </div>
        ) : (
          <ul className="-mx-4 mt-1 border-t border-border-primary">
            <Departures routes={linked} back={back} onRoute={onSelectDirection} testId="card" />
          </ul>
        )}

        {actions && <div className="mt-4 flex gap-2">{actions}</div>}
      </div>
    </BottomSheet>
  );
}
