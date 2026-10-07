import type { MapLibreMap } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { LngLat } from '@/shared/utils/geo';

import { useHotspotTaps } from './hotspot-taps';
import { boxMarks, placeHull } from './hotspots-shown';
import { loadOnce } from './load-once';
import { APP_MOVE } from './map-view';
import { useSavedHotspotsLayers } from './saved-hotspots-layers';
import { letGoHolds } from '../cards/card-stack';
import type { HotspotLink, Hotspot } from '../model/hotspots';
import { orderLinked } from '../model/timeline';

/**
 * Every saved hotspot, drawn for everyone as a shaded outline in its kind's
 * colour, with its route links alongside so the tap card can list them.
 *
 * `load` decides where the hotspots come from: the public map reads the
 * published file, the editor the live tables. Pass a function defined once at
 * module level, not a new one per render, or it reloads every render.
 *
 * The editor also passes `drawing` and `hiddenHotspotId`; the public map passes
 * neither, and both default to off. Both pass `muted` while a trip is open: the hotspot card or route list it was picked from waits
 * hidden behind it, and the hotspots that lit go dark until ‹ brings it back
 * (the owner, 2026-09-29: the map lights only the trip).
 */
export function useSavedHotspots<S extends Hotspot>(
  map: MapLibreMap | null,
  load: () => Promise<{ hotspots: S[]; links: HotspotLink[] }>,
  opts: { drawing?: boolean; hiddenHotspotId?: string | null; muted?: boolean } = {},
) {
  const muted = opts.muted ?? false;
  const [hotspots, setHotspots] = useState<S[]>([]);
  const [links, setLinks] = useState<HotspotLink[]>([]);
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
    byId.current = new Map(hotspots.map((s) => [s.id, s]));
  }, [hotspots]);

  const reload = useCallback(async () => {
    try {
      const loaded = await load();
      setHotspots(loaded.hotspots);
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

  // What a tap marks, and the place wash (hotspots-shown.ts).
  // The chosen box let go on its card (HintuanCard's `deselected`): its place's boxes all alike.
  // Another box — a row, a tap on the map — or the card closed: the next
  // one opens with its box Selected.
  if (letGoId !== null && !letGoHolds(letGoId, selectedId)) setLetGoId(null);
  const letGone = letGoHolds(letGoId, selectedId);
  const letGo = useCallback(() => setLetGoId(selectedId), [selectedId]);
  const marks = useMemo(
    () => boxMarks(hotspots, selectedId, candidates, muted, letGone),
    [hotspots, selectedId, candidates, muted, letGone],
  );
  const hull = useMemo(() => placeHull(hotspots, selectedId, muted), [hotspots, selectedId, muted]);

  // ----------------------------------------------------------------- layers

  useSavedHotspotsLayers(map, hotspots, opts.hiddenHotspotId, marks, hull);

  // ----------------------------------------------------------------- events

  useHotspotTaps(
    map,
    { drawing: drawingRef, byId },
    { selectedId: setSelectedId, candidates: setCandidates },
  );

  const selected = hotspots.find((s) => s.id === selectedId) ?? null;

  /** Direction ids linked to a hotspot, in sequence order. */
  const linkedDirectionIds = useCallback(
    (hotspotId: string) =>
      links
        .filter((l) => l.hotspotId === hotspotId)
        .sort((a, b) => a.sequence - b.sequence)
        .map((l) => l.directionId),
    [links],
  );

  /**
   * The hotspots one direction passes, in the order its line reaches them —
   * the card's timeline. Given the line, two on one segment are put in the
   * order it reaches them (orderLinked); without it, as the links are read.
   */
  const hotspotsAlong = useCallback(
    (directionId: string, line: readonly LngLat[] = []): S[] =>
      orderLinked(
        links
          .filter((l) => l.directionId === directionId)
          .map((l) => ({
            hotspot: hotspots.find((s) => s.id === l.hotspotId),
            sequence: l.sequence,
          }))
          .filter((l): l is { hotspot: S; sequence: number } => !!l.hotspot),
        line,
      ),
    [links, hotspots],
  );

  /** Select a box and bring the map to it — what tapping a timeline row does, in both apps. */
  const show = useCallback(
    // `offset`, asked as the flight starts: where the box should land from
    // the map's centre, clear of a card over the map (the HintuanCard's rows).
    (id: string, offset?: () => [number, number], opts?: { keepList?: boolean }) => {
      const s = hotspots.find((x) => x.id === id);
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
    [hotspots, select, map],
  );

  return {
    hotspots,
    links,
    error,
    reload,
    selected,
    select,
    show,
    candidates,
    linkedDirectionIds,
    hotspotsAlong,
    /** The selected box let go on its card: no row Selected until one is picked. */
    letGone,
    letGo,
  };
}
