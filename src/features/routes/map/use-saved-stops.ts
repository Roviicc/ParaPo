import type { MapLibreMap } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { LngLat } from '@/shared/utils/geo';

import { loadOnce } from './load-once';
import { APP_MOVE } from './map-view';
import { useSavedStopsLayers } from './saved-stops-layers';
import { useStopTaps } from './stop-taps';
import { boxMarks, placeHull } from './stops-shown';
import { letGoHolds } from '../cards/card-stack';
import type { StopLink, StopSummary } from '../model/stops';
import { orderLinked } from '../model/timeline';

/**
 * Every saved hotspot, drawn for everyone as a shaded outline in its kind's
 * colour, with its route links alongside so the tap card can list them.
 *
 * `load` decides where the hotspots come from: the public map reads the
 * published file, the editor the live tables. Pass a function defined once at
 * module level, not a new one per render, or it reloads every render.
 *
 * The editor also passes `drawing` and `hiddenStopId`; the public map passes
 * neither, and both default to off. Both pass `muted` while a trip is open: the hotspot card or route list it was picked from waits
 * hidden behind it, and the hotspots that lit go dark until ‹ brings it back
 * (the owner, 2026-09-29: the map lights only the trip).
 */
export function useSavedStops<S extends StopSummary>(
  map: MapLibreMap | null,
  load: () => Promise<{ stops: S[]; links: StopLink[] }>,
  opts: { drawing?: boolean; hiddenStopId?: string | null; muted?: boolean } = {},
) {
  const muted = opts.muted ?? false;
  const [stops, setStops] = useState<S[]>([]);
  const [links, setLinks] = useState<StopLink[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /**
   * The hotspots under a tap that landed on several things (hotspots, routes
   * or both), for a chooser. Empty otherwise. The routes hook keeps the route
   * half of the same tap.
   */
  const [candidates, setCandidates] = useState<S[]>([]);
  /**
   * The box whose Selected row its card let go (the owner's ask, 2026-10-01):
   * no box is the one until a row is picked again (letGoHolds).
   */
  const [letGoId, setLetGoId] = useState<string | null>(null);

  /**
   * Choosing one hotspot answers the question the chooser was asking — unless
   * `keepList`: a place opened over a trip keeps the list behind the trip,
   * for its ‹ to find whole.
   */
  const select = useCallback((id: string | null, opts: { keepList?: boolean } = {}) => {
    setSelectedId(id);
    setLetGoId(null);
    if (!opts.keepList) setCandidates([]);
  }, []);

  const drawingRef = useRef(opts.drawing ?? false);
  drawingRef.current = opts.drawing ?? false;
  // A chooser left open when drawing starts would come back, stale, after it.
  useEffect(() => {
    if (opts.drawing) setCandidates([]);
  }, [opts.drawing]);

  // The click handler is bound once; this is how it reads today's hotspots.
  const byId = useRef(new Map<string, S>());
  useEffect(() => {
    byId.current = new Map(stops.map((s) => [s.id, s]));
  }, [stops]);

  const reload = useCallback(async () => {
    try {
      const loaded = await load();
      setStops(loaded.stops);
      setLinks(loaded.links);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [load]);

  // Once for each loader, however many times React runs the effect: twice
  // as a page mounts in development (loadOnce.ts).
  const loadedBy = useRef<typeof load | null>(null);
  useEffect(() => {
    loadOnce(loadedBy, load, () => void reload());
  }, [load, reload]);

  // What a tap marks, and the place wash (stopsShown.ts).
  // The chosen box let go on its card (HintuanCard's `deselected`): its place's boxes all alike.
  // Another box — a row, a tap on the map — or the card closed: the next
  // one opens with its box Selected.
  if (letGoId !== null && !letGoHolds(letGoId, selectedId)) setLetGoId(null);
  const letGone = letGoHolds(letGoId, selectedId);
  const letGo = useCallback(() => setLetGoId(selectedId), [selectedId]);
  const marks = useMemo(
    () => boxMarks(stops, selectedId, candidates, muted, letGone),
    [stops, selectedId, candidates, muted, letGone],
  );
  const hull = useMemo(() => placeHull(stops, selectedId, muted), [stops, selectedId, muted]);

  // ----------------------------------------------------------------- layers

  useSavedStopsLayers(map, stops, opts.hiddenStopId, marks, hull);

  // ----------------------------------------------------------------- events

  useStopTaps(
    map,
    { drawing: drawingRef, byId },
    { selectedId: setSelectedId, candidates: setCandidates },
  );

  const selected = stops.find((s) => s.id === selectedId) ?? null;

  /** Direction ids linked to a hotspot, in stop_sequence order. */
  const linkedVariantIds = useCallback(
    (stopId: string) =>
      links
        .filter((l) => l.stop_id === stopId)
        .sort((a, b) => a.stop_sequence - b.stop_sequence)
        .map((l) => l.route_variant_id),
    [links],
  );

  /**
   * The hotspots one direction passes, in the order its line reaches them —
   * the card's timeline. Given the line, two on one segment are put in the
   * order it reaches them (orderLinked); without it, as the links are read.
   */
  const stopsAlong = useCallback(
    (variantId: string, line: readonly LngLat[] = []): S[] =>
      orderLinked(
        links
          .filter((l) => l.route_variant_id === variantId)
          .map((l) => ({ stop: stops.find((s) => s.id === l.stop_id), sequence: l.stop_sequence }))
          .filter((l): l is { stop: S; sequence: number } => !!l.stop),
        line,
      ),
    [links, stops],
  );

  /** Select a box and bring the map to it — what tapping a timeline row does, in both apps. */
  const show = useCallback(
    // `offset`, asked as the flight starts: where the box should land from
    // the map's centre, clear of a card over the map (the HintuanCard's rows).
    (id: string, offset?: () => [number, number], opts?: { keepList?: boolean }) => {
      const s = stops.find((x) => x.id === id);
      select(id, opts);
      if (s && map)
        map.flyTo(
          {
            center: s.point.coordinates,
            zoom: Math.max(map.getZoom(), 16),
            offset: offset?.() ?? [0, 0],
          },
          APP_MOVE,
        );
    },
    [stops, select, map],
  );

  return {
    stops,
    links,
    error,
    reload,
    selected,
    select,
    show,
    candidates,
    linkedVariantIds,
    stopsAlong,
    /** The selected box let go on its card: no row Selected until one is picked. */
    letGone,
    letGo,
  };
}
