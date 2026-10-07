import type { MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import { useEffect, type RefObject } from 'react';

import { ROUTES_HIT_LAYER, bindHover, resolveTap, tapTargets } from './tap';
import type { Highlight } from './use-saved-routes';
import { directionToOpen } from '../model/departures';
import type { VariantSummary } from '../model/routes';

/*
 * A tap on the saved directions: what it opens, lists or lets go. Split from
 * useSavedRoutes.ts, 2026-09-29.
 */

const HIT = ROUTES_HIT_LAYER;

/**
 * Binds the map's click once, and the pointer over a line where a pointer
 * can hover, from when one can (bindHover). The handler reads today's
 * directions, what is shown and whether the editor is drawing through
 * `read`, and answers through the hook's setters (`set`), which never
 * change.
 */
export function useRouteTaps<T extends VariantSummary>(
  map: MapLibreMap | null,
  read: {
    drawing: RefObject<boolean>;
    byId: RefObject<Map<string, T>>;
    shown: RefObject<readonly string[]>;
  },
  set: {
    highlight: (h: Highlight | null) => void;
    selectedId: (id: string | null) => void;
    candidates: (c: T[]) => void;
    back: (b: boolean) => void;
  },
) {
  useEffect(() => {
    if (!map || !map.getLayer(HIT)) return;
    const canvas = map.getCanvas();

    // One handler, one box. A finger is wider than a pixel, so we ask what is
    // near the tap: nothing deselects, one route opens its card, several
    // sharing a road go to the list, lit the way round it shows them. Inside
    // a hotspot's box the tap is the hotspot's alone (tapTargets). The candidates are whole routes, slots
    // included, so the studio's rows can say "return not mapped yet".
    // The hotspots hook reads the same tap and keeps its own half.
    const onMapClick = (e: MapMouseEvent) => {
      if (read.drawing.current) return;
      // Whatever the tap opens, the card picked before it is let go.
      set.highlight(null);
      const out = resolveTap(tapTargets(map, e.point, e.originalEvent));
      const all = [...read.byId.current.values()];
      if (out.kind === 'route') {
        // The line under the finger wins: where a route's two directions run
        // on different roads, tapping the other one must open it (the owner's
        // check, 2026-09-22). Where both overlap, the one already shown stays
        // (the owner's ask of 2026-09-25: a tap on the lit Novaliches → Tala
        // opened Tala → Novaliches); with neither shown, the outbound rule
        // decides.
        const under = out.routeIds.map((id) => read.byId.current.get(id)).filter((v) => !!v);
        const routeId = under[0]?.route_id;
        const open =
          under.length === 1
            ? under[0]!
            : (under.find((v) => read.shown.current.includes(v.id)) ??
              directionToOpen(all.filter((v) => v.route_id === routeId)));
        set.selectedId(open?.id ?? null);
        set.candidates([]);
      } else if (out.kind === 'several') {
        const keys = new Set(out.routeKeys);
        set.selectedId(null);
        set.candidates(all.filter((v) => keys.has(v.route_id)));
        // The way round under the finger, as for one route: outbound where an
        // outbound line was hit, the way back where only ways back were — so
        // a tap on the light-blue way back switches to it (the owner's
        // report, 2026-09-25) — and, where a line shown was hit, the way
        // round already shown.
        const hit = out.routeIds.map((id) => read.byId.current.get(id)).filter((v) => !!v);
        const shownHit = hit.find((v) => read.shown.current.includes(v.id));
        set.back(shownHit ? shownHit.reversed : hit.length > 0 && hit.every((v) => v.reversed));
      } else {
        set.selectedId(null);
        set.candidates([]);
      }
    };
    const enter = () => {
      if (!read.drawing.current) canvas.style.cursor = 'pointer';
    };
    const leave = () => {
      if (!read.drawing.current) canvas.style.cursor = '';
    };

    map.on('click', onMapClick);
    // The hand over a line only where a pointer can hover, and from when one
    // can: on a phone each pair cost a query of the map on every mousemove,
    // a tap's among them (bindHover, 2026-10-04; a mouse paired later gets
    // it too, 2026-10-05).
    const unhover = bindHover(map, HIT, enter, leave);
    return () => {
      map.off('click', onMapClick);
      unhover();
    };
  }, [map]);
}
