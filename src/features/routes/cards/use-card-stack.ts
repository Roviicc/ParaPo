import type { MapLibreMap } from 'maplibre-gl';
import { useMemo, useState, type RefObject } from 'react';

import { clearOfSheet, type SheetHeight } from '@/shared/ui/bottom-sheet';
import type { Snap } from '@/shared/ui/sheet-gesture';

import { isChoosing, sharedSnap, tripBack, tripBehindHolds } from './card-stack';
import { useTripLivery } from './trip-card';
import { useRideColours } from '../map/direction-arrows';
import { LIT_LINE, LIVERY_LINE, type LineLook } from '../map/livery-line';
import { useLitLineColour } from '../map/saved-routes-layers';
import type { Highlight } from '../map/use-saved-routes';
import { drawnDepartures, sharingAnEnd } from '../model/departures';
import { liveriesFor, type Livery } from '../model/liveries';
import type { VariantSummary } from '../model/routes';

type Routes<V extends VariantSummary> = {
  variants: readonly V[];
  selected: V | null;
  candidates: readonly V[];
  /** Which way round the list shows them. */
  back: boolean;
  highlight: Highlight | null;
  select: (id: string | null, opts?: { keepList?: boolean }) => void;
  openList: (directions: readonly V[], way: boolean) => void;
  highlightCard: (h: Highlight | null) => void;
};

type Stops<S extends { id: string }> = {
  selected: S | null;
  candidates: readonly S[];
  select: (id: string | null, opts?: { keepList?: boolean }) => void;
  show: (id: string, offset?: () => [number, number], opts?: { keepList?: boolean }) => void;
};

/**
 * The cards that stand in for one another over the map — the route list, a
 * hotspot's card, the trip opened from either — as one piece, for both apps:
 * which is up, what stands behind what, the height they share, the colour a
 * trip opens in and what is lit wearing it, and what each card's buttons do
 * to the others. The rules themselves are cardStack.ts's, tested; this keeps
 * their state. Split from CommuterApp and StudioApp, which each held it
 * inline (2026-10-01).
 */
export function useCardStack<V extends VariantSummary, S extends { id: string }>(
  map: MapLibreMap | null,
  saved: Routes<V>,
  stops: Stops<S>,
) {
  // One tap, several things: routes, hotspots or both, in the owner's route
  // list — the hotspots first, then the routes as his RouteCards. It stays
  // behind a trip picked from it, hidden, for the trip's ‹ — and so does a
  // hotspot's card (the owner, 2026-09-29).
  const choice = [...saved.candidates, ...stops.candidates];
  const choosing = isChoosing(saved.candidates, stops.candidates);

  // One height for the sheets that stand in for one another: a pick and ‹
  // keep it; with nothing open it goes back to Middle (sharedSnap).
  const [snap, setSnap] = useState<Snap>('middle');
  const anyOpen = !!saved.selected || !!stops.selected || choosing;
  const resting = sharedSnap(snap, anyOpen);
  if (resting !== snap) setSnap(resting);
  const height: SheetHeight = { snap, onSnap: setSnap };
  /** Where a point the camera glides to should sit, clear of a card at the shared height. */
  const clearOf = (dock: RefObject<HTMLElement | null>) => (): [number, number] =>
    map ? clearOfSheet(map.getContainer(), dock.current, snap) : [0, 0];

  // The colour a card wore — in the list, or in a hotspot's card — for the
  // trip picked from it. Read only as the trip opens, and only while that
  // card stands behind it: a clash colour is "for this list only"
  // (liveries.ts), so the same trip opened again any other way wears its
  // place's kept colour. Once open, the trip keeps what it opened in until
  // it closes — through SWITCH, and even when a tap on its own line closes
  // the list behind it: a card never changes colour while it is open (the
  // owner, 2026-09-29).
  const [worn, setWorn] = useState<{ id: string; livery: Livery } | null>(null);
  const tripLivery = useTripLivery(saved.selected, worn, choosing || !!stops.selected);
  // A list of one RouteCard: its routes wear that card's colour, picked or
  // not, a pick only bringing the camera to them (the owner's ask,
  // 2026-10-02). The colour is the one the card is drawn in (liveriesFor
  // keeps a place's colour for the visit, so the card reads the same).
  // Only while the list is what is up: behind a place's card it decides nothing (showingOf).
  const onlyPlace =
    choosing && !stops.selected ? drawnDepartures(saved.candidates, saved.back) : [];
  const onlyFrom = onlyPlace.length === 1 ? onlyPlace[0].from : null;
  const onlyLivery = useMemo(() => (onlyFrom ? liveriesFor([onlyFrom])[0] : null), [onlyFrom]);
  // What is lit wears the colour of the card it answers: the open trip's,
  // the picked RouteCard's, or a list's only card's; a list of several with
  // none picked lights its routes in the selected blue (the owner's ask,
  // 2026-09-29).
  const look: LineLook = tripLivery
    ? LIVERY_LINE[tripLivery]
    : saved.highlight
      ? LIVERY_LINE[saved.highlight.livery]
      : onlyLivery
        ? LIVERY_LINE[onlyLivery]
        : LIT_LINE;
  useLitLineColour(map, look.line);
  useRideColours(map, look);

  // A place's name on the map tapped — an end of what is lit, or the picked
  // hintuan's — opens its card, the map flying in to it and lighting the
  // routes through it (the owner's ask, 2026-10-01). An open trip steps
  // behind it, with whatever stood behind the trip, and the card's ‹ brings
  // it back as it was; anything else that opens or closes lets that go
  // (tripBehindHolds).
  const [tripBehind, setTripBehind] = useState<{ id: string; stopId: string | null } | null>(null);
  if (tripBehind && !tripBehindHolds(!!saved.selected, !!stops.selected)) setTripBehind(null);

  const trip = saved.selected;
  const back = tripBack(trip, saved.variants, !!stops.selected || choosing);

  return {
    /** What the route list lists, and whether it is up. */
    choice,
    choosing,
    /** Any card up: the list, a trip or a hotspot's. */
    open: anyOpen,
    height,
    snap,
    clearOf,
    tripLivery,
    look,
    /** What is lit wears a card's colour — the open trip's or the picked card's — not the list's blue. */
    inCardColour: look !== LIT_LINE,
    /** A trip stepped behind a place's card: the list behind it stays hidden. */
    tripBehind: !!tripBehind,

    /** ✕ on the list or a trip: everything the tap opened closes. */
    closeAll: () => {
      saved.select(null);
      stops.select(null);
    },

    /**
     * A route picked on a card — the list's or a hotspot's — opens its trip
     * in the colour the card wore, the card kept behind it. Over a trip a
     * place's card stood in front of, it lets that trip and what stood
     * behind it go: this card is what the new trip's ‹ comes back to.
     */
    openTrip: (v: { id: string }, livery?: Livery) => {
      setWorn(livery ? { id: v.id, livery } : null);
      if (tripBehind) stops.select(stops.selected?.id ?? null);
      saved.select(v.id, { keepList: !tripBehind });
    },

    /** A hotspot's row in the list: its card in the list's place. */
    openStop: (id: string) => {
      saved.select(null);
      stops.select(id);
    },

    /** ✕ on a hotspot's card: it closes, and with it a trip it stood in front of. */
    closeStop: () => {
      saved.highlightCard(null);
      if (tripBehind) {
        saved.select(null);
        stops.select(null);
      } else stops.select(null);
    },

    /**
     * The trip's ‹: back to what it was picked from, kept behind it as it was
     * left, every card at rest; or, opened on its own, its route listed with
     * those sharing an end, the way it goes (tripBack). Null: no ‹.
     */
    backFromTrip:
      back === 'behind'
        ? () => saved.select(null, { keepList: true })
        : back === 'fan' && trip
          ? () => {
              stops.select(null);
              saved.openList(sharingAnEnd(saved.variants, trip), trip.reversed);
            }
          : null,

    /** A place's name on the map tapped: its card, over the trip if one is open. */
    openPlace: (stopId: string, dock: RefObject<HTMLElement | null>) => {
      saved.highlightCard(null);
      if (trip) {
        setTripBehind({ id: trip.id, stopId: stops.selected?.id ?? null });
        saved.select(null, { keepList: true });
        stops.show(stopId, clearOf(dock), { keepList: true });
      } else {
        saved.select(null);
        stops.show(stopId, clearOf(dock));
      }
    },

    /** The place's card's ‹: the trip it stood in front of, as it was. Null: no ‹. */
    backToTrip: tripBehind
      ? () => {
          stops.select(tripBehind.stopId, { keepList: true });
          saved.select(tripBehind.id, { keepList: true });
        }
      : null,
  };
}
