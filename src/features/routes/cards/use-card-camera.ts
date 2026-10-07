import type { MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef, useState, type RefObject } from 'react';

import { clearOfSheet, type SheetHeight } from '@/shared/ui/bottom-sheet';
import type { Snap } from '@/shared/ui/sheet-gesture';

import { framedBy, type Framed } from './card-stack';
import type { PickedPlace } from './route-card-stack';
import {
  useCameraBefore,
  useCardOverview,
  useHeightOverview,
  useListOverview,
  useSwitchOverview,
  useTripOverview,
} from './use-overviews';
import { useRideTo } from '../map/ride-to';
import type { Highlight } from '../map/use-saved-routes';
import type { Livery } from '../model/liveries';
import type { VariantSummary } from '../model/routes';
import type { StopSummary } from '../model/stops';

type Routes<V extends VariantSummary> = {
  variants: readonly V[];
  selected: V | null;
  /** What the route list lists, if it is up. */
  candidates: readonly V[];
  highlight: Highlight | null;
  litVariants: readonly V[];
  select: (id: string | null, opts?: { keepList?: boolean }) => void;
  flip: () => void;
  highlightCard: (h: Highlight | null) => void;
};

type Stops<S extends StopSummary> = {
  stops: readonly S[];
  selected: S | null;
};

type Cards = {
  snap: Snap;
  backFromTrip: (() => void) | null;
  height: SheetHeight;
  choosing: boolean;
  clearOf: (dock: RefObject<HTMLElement | null>) => () => [number, number];
  openPlace: (stopId: string, dock: RefObject<HTMLElement | null>) => void;
  openTrip: (v: { id: string }, livery?: Livery) => void;
};

/**
 * The camera with the cards, for both apps: a hintuan picked on a trip, the
 * map gliding there; the overviews of useOverviews.ts — a trip opened, a
 * RouteCard picked, SWITCH, the sheet settled at another height — and the
 * camera from before a RouteCard was picked on a hotspot's card, back as it
 * is let go; and the card buttons that move it. `root` goes on the page,
 * `tripDock` on the trip card, `hotspotDock` on a hotspot's. Split from
 * CommuterApp, which held it inline (2026-10-01).
 *
 * `camera: false` turns those off: the overviews and the camera kept from
 * before get no map and do nothing, while a picked hintuan still glides. It is fixed for the page's life, not a switch for while
 * drawing: turned on later, the trip's and the card's overviews would fire
 * at once for whatever is open.
 */
export function useCardCamera<V extends VariantSummary, S extends StopSummary>(
  map: MapLibreMap | null,
  saved: Routes<V>,
  stops: Stops<S>,
  cards: Cards,
  opts: { camera?: boolean } = {},
) {
  // The map the overviews and the camera kept from before move: none with
  // the camera off (see above).
  const cam = opts.camera === false ? null : map;

  // A hintuan picked on the trip card (the owner's Timeline State=Selected,
  // 2026-09-29): the camera gliding there clear of the card, and a circle
  // popping up on it — the route left whole, no get-off circles (the
  // owner's ask of 2026-09-30: "now I don't want to cut the route"). The
  // card stays at its height (clearOfSheet).
  const tripDock = useRef<HTMLDivElement>(null);
  // The HintuanCard's, for a picked box to land clear of it.
  const hotspotDock = useRef<HTMLDivElement>(null);
  const ride = useRideTo(map, saved.selected, stops.stops, { onGlide: cards.clearOf(tripDock) });
  useTripOverview(cam, saved.selected, tripDock, cards.snap);
  // The page, and the card's sheet on show in it, for what the camera keeps clear of.
  const root = useRef<HTMLDivElement>(null);
  const openSheet = () =>
    root.current?.querySelector<HTMLElement>('[data-floats]:not([hidden])') ?? null;
  // The route list opened: every route it lights, whole.
  useListOverview(cam, saved.candidates, saved.litVariants, openSheet, cards.snap);
  // A RouteCard picked, in the list or a hotspot's card: its routes whole.
  useCardOverview(cam, saved.highlight, saved.variants, openSheet, cards.snap);
  // …and on a hotspot's card, let go, the camera the visitor had before it.
  const before = useCameraBefore(cam);
  // A trip opened from a card — a list's, a hotspot's, a tail's name — and
  // its ‹: the camera the visitor had as they tapped, back with the card
  // (the owner's ask, 2026-10-02: a hintuan's card, zoomed in, a RouteCard's
  // row, ‹, and in again where they were). A hotspot's card picked first
  // comes back at rest, so the camera from before that pick. One trip
  // opening another ("Other routes") keeps the first one's.
  const beforeTrip = useCameraBefore(cam);
  const keepForTrip = () => {
    if (saved.selected) return;
    beforeTrip.keep(saved.highlight?.where === 'hotspot' ? before.held() : null);
  };
  // Closed any other way — ✕, a place's card in front — it is let go, so a
  // trip opened later by a tap on its line has no camera of another's to go back to.
  const tripOpen = !!saved.selected;
  useEffect(() => {
    if (!tripOpen) beforeTrip.forget();
  }, [tripOpen, beforeTrip]);
  // SWITCH, on any card: the routes the other way round, whole.
  const [switches, setSwitches] = useState(0);
  const switched = () => setSwitches((n) => n + 1);
  useSwitchOverview(cam, saved.litVariants, switches, openSheet, cards.snap);
  // The sheet settled at another height: what the card on show frames, again,
  // in the map it leaves — a trip's route, a picked card's routes or what the
  // list lights, a hotspot's place (framedBy).
  const framed = (): Framed => {
    const ids = saved.highlight && new Set(saved.highlight.ids);
    const picked = ids && saved.variants.filter((v) => ids.has(v.id));
    return framedBy(
      saved.selected,
      stops.selected?.point.coordinates ?? null,
      cards.choosing,
      picked,
      saved.litVariants,
    );
  };
  useHeightOverview(cam, cards.snap, framed, openSheet);

  return {
    root,
    tripDock,
    hotspotDock,
    ride,
    openSheet,
    switched,

    /** Where the visitor's own position sits as the camera follows it: clear of the card on show. */
    clearOfOpen: (): [number, number] =>
      map ? clearOfSheet(map.getContainer(), openSheet(), cards.snap) : [0, 0],

    /** A route picked on a card: its trip, the camera as it was kept for the trip's ‹. */
    openTrip: (v: { id: string }, livery?: Livery) => {
      keepForTrip();
      cards.openTrip(v, livery);
    },

    /** The trip's ‹ (useCardStack's), and the camera from before the trip back with the card. Null: no ‹. */
    backFromTrip: cards.backFromTrip
      ? () => {
          cards.backFromTrip?.();
          beforeTrip.back();
        }
      : null,

    /** SWITCH on a trip: the other way round, and the camera with it. */
    switchTrip: (v: { id: string }) => {
      saved.select(v.id, { keepList: true });
      switched();
    },

    /** SWITCH on the route list. */
    flipList: () => {
      saved.flip();
      switched();
    },

    /**
     * A trip's "Other routes": the sheet to Middle from wherever it is, so
     * the map shows the route the camera takes in (the owner, 2026-10-01),
     * and that route's trip in this one's place.
     */
    otherRoute: (v: { id: string }) => {
      if (cards.height.snap !== 'middle') cards.height.onSnap('middle');
      saved.select(v.id, { keepList: true });
    },

    /**
     * A RouteCard on a hotspot's card picked, or let go: the camera from
     * before the first pick kept, and back as the last is let go.
     */
    pickOnPlaceCard: (p: PickedPlace | null) => {
      const pickedHere = saved.highlight?.where === 'hotspot';
      if (!p && pickedHere) before.back();
      else if (p && !pickedHere) before.keep();
      saved.highlightCard(p && { where: 'hotspot', ...p });
    },

    /**
     * A place's name on the map: its card opens at the height the trip's is
     * at, or a hotspot card's.
     */
    openPlace: (stopId: string) =>
      cards.openPlace(stopId, tripDock.current ? tripDock : hotspotDock),

    /** A tail's name with no trip open: its ride's trip, in the colour of the card picked, if one is. */
    openRide: (id: string) => {
      const v = saved.variants.find((x) => x.id === id);
      if (!v) return;
      keepForTrip();
      cards.openTrip(v, saved.highlight?.livery);
    },
  };
}
