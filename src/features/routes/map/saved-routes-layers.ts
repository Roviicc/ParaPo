import type { GeoJSONSource, MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';

import { MAP_COLOURS, MAP_PAINT } from '@/design-system/foundation/map-colours';

import { useLayerSwitch, type LayerSwitch } from './layer-switch';
import { LAYERS, applyHidden, firstLayerOfType, layOutOnce } from './layers';
import { CASING_EXTRA, litWidth, roadWidth } from './line-style';
import { ROUTES_HIT_LAYER } from './tap';
import { variantLine, type LineStringGeoJSON, type VariantSummary } from '../model/routes';

/*
 * The saved directions on the map: their source, their five layers, and
 * what lights them. Split from useSavedRoutes.ts, 2026-09-29.
 */

const SRC = 'saved-routes';
const CASING = LAYERS.routesCasing;
/** The resting lines, every direction: what the map shows of a direction on screen. */
export const ROUTES_LINE = 'saved-routes-line';
const LINE = ROUTES_LINE;
/** The lit directions, drawn again on top: thick, in the selected blue, or on the public map in a picked card's or an open trip's colour. */
const SELECTED_CASING = 'saved-routes-selected-casing';
const SELECTED = 'saved-routes-selected';
/** The two that draw the lit directions only, switched off while none is (layerSwitch.ts). */
const LIT_LAYERS = [SELECTED_CASING, SELECTED] as const;
const HIT = ROUTES_HIT_LAYER;

/**
 * Two looks, the owner's of 2026-09-29, and no opacity: every direction
 * rests in Map/RouteLine/surface-default, opaque, in its white casing; the
 * lit ones — the trip open, the Selected card's directions, or else every
 * direction a list or a hotspot's card shows — are drawn again on top in
 * Map/RouteLine/surface-selected, thicker; on the public map a picked
 * card's, or an open trip's, wear that card's Card/<livery>/surface instead
 * (useLitLineColour, his ask of 2026-09-29). See-through lines
 * stacked on a shared road and read as one muddle (his words: "it can stack
 * and confuse the user"), so nothing fades any more: the three levels of
 * 2026-09-22 (rest, faded, lit) and the resting way back of 2026-09-25 went
 * with them.
 *
 * What a tap lights is kept as MapLibre feature state (`setFeatureState`)
 * rather than as a filter or a paint expression naming ids. The paint
 * expressions below read it and never change, and a change of feature state
 * repaints only the features whose state changed, on the main thread;
 * whereas a new filter, or a new expression in a data-driven paint
 * property, has MapLibre lay out every tile of the source again in its
 * worker — for 1,000 directions, a second and a half of stall a tap
 * (measured 2026-09-25, future-proofing step 5).
 */
const isLit = ['boolean', ['feature-state', 'lit'], false];

/**
 * The opacity of a layer that draws the lit directions only: 1 for them, 0
 * for the rest — a switch, never a shade.
 */
export function litOpacity() {
  return ['case', isLit, 1, 0] as never;
}

/**
 * Lights exactly `lit` on `source` and nothing else, changing only what
 * changed since the last call. Never `removeFeatureState`: a removal and a
 * set of the same id in one frame leave the removal in charge. `ready` is
 * for a source added once another hook's layer is there (useLayerReady):
 * the lighting is applied when it arrives, not only when `lit` changes.
 * `switched`, the layers that draw only what is lit, are switched on with
 * anything lit and off with nothing, here with the feature state, so the
 * two reach the screen in one frame (layerSwitch.ts).
 */
export function useLighting(
  map: MapLibreMap | null,
  source: string,
  lit: readonly string[],
  ready = true,
  switched?: LayerSwitch,
) {
  const was = useRef(new Set<string>());
  useEffect(() => {
    if (!map || !ready || !map.getSource(source)) return;
    const now = new Set(lit);
    for (const id of was.current)
      if (!now.has(id)) map.setFeatureState({ source, id }, { lit: false });
    for (const id of now)
      if (!was.current.has(id)) map.setFeatureState({ source, id }, { lit: true });
    was.current = now;
    switched?.set(map, now.size > 0);
  }, [map, source, lit, ready, switched]);
}

/**
 * The colour the lit directions are drawn in, over the rest: the selected
 * blue unless the public map says otherwise — a picked card's, an open
 * trip's (liveryLine.ts). A paint property, set once per change: every lit
 * line wears the same colour at a time.
 */
export function useLitLineColour(map: MapLibreMap | null, colour: string) {
  useEffect(() => {
    if (!map || !map.getLayer(SELECTED)) return;
    map.setPaintProperty(SELECTED, 'line-color', colour);
  }, [map, colour]);
}

/**
 * The saved directions as their source takes them: one feature for each
 * that has a line to draw, its id promoted for the lighting.
 */
export function routesData(rows: readonly VariantSummary[]) {
  return {
    type: 'FeatureCollection' as const,
    features: rows
      .map((v) => ({ v, line: variantLine(v) }))
      .filter(({ line }) => line.length > 1)
      .map(({ v, line }) => ({
        type: 'Feature' as const,
        properties: {
          id: v.id,
          route_id: v.route_id,
          name: v.route?.name ?? '',
          mode: v.route?.mode ?? 'jeepney',
        },
        geometry: { type: 'LineString' as const, coordinates: line },
      })),
  };
}

/**
 * The full lines of `lines` not patched into the source yet, as updateData
 * takes them, each noted in `sent` as it goes: by id, and again for an id
 * whose line is another object. Each arrival used to send every line read
 * so far (the cheap-phone plan, step 10 (e), 2026-10-04).
 */
export function unpatched(
  sent: Map<string, LineStringGeoJSON>,
  lines: ReadonlyMap<string, LineStringGeoJSON>,
): { id: string; newGeometry: LineStringGeoJSON }[] {
  const update: { id: string; newGeometry: LineStringGeoJSON }[] = [];
  for (const [id, line] of lines) {
    if (sent.get(id) === line) continue;
    sent.set(id, line);
    update.push({ id, newGeometry: line });
  }
  return update;
}

/**
 * The saved directions' source, laid out from `rows`, and its five layers,
 * added to `map` under the basemap's first label: what useSavedRoutesLayers
 * adds once a map is there, apart so a unit check can read it
 * (map-sources-test).
 */
export function addSavedRoutes(
  map: Pick<MapLibreMap, 'addSource' | 'addLayer' | 'getLayersOrder' | 'getLayer'>,
  rows: readonly VariantSummary[] = [],
): void {
  // Under the basemap's labels, so a road painted blue still shows its
  // name. The draft's layers, when there are any, sit above the labels and
  // so above these too.
  const before = firstLayerOfType(map, 'symbol');

  // `promoteId`: the feature state a tap sets is keyed on the direction's id.
  map.addSource(SRC, {
    type: 'geojson',
    promoteId: 'id',
    data: routesData(rows),
  });
  map.addLayer(
    {
      id: CASING,
      type: 'line',
      source: SRC,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': MAP_PAINT['Paint/casing'], 'line-width': roadWidth(CASING_EXTRA) },
    },
    before,
  );
  map.addLayer(
    {
      id: LINE,
      type: 'line',
      source: SRC,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': MAP_COLOURS['Map/RouteLine/surface-default'],
        'line-width': roadWidth(0),
      },
    },
    before,
  );
  // The lit directions — the one chosen, the Selected card's, or else
  // everything a list or a hotspot's card shows — drawn once more above the
  // rest, in the selected blue (or a card's, useLitLineColour): over a
  // shared road, they are the line that shows. Every direction is in these
  // layers, the unlit ones switched off: a filter naming the lit ones would
  // lay the whole source out again at every tap (see `useLighting`).
  map.addLayer(
    {
      id: SELECTED_CASING,
      type: 'line',
      source: SRC,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': MAP_PAINT['Paint/casing'],
        'line-width': litWidth(CASING_EXTRA),
        'line-opacity': litOpacity(),
        // Switched off while nothing is lit, and from the start (layerSwitch.ts): at once, never between.
        'line-layer-opacity': 0,
        'line-layer-opacity-transition': { duration: 0, delay: 0 },
      },
    },
    before,
  );
  map.addLayer(
    {
      id: SELECTED,
      type: 'line',
      source: SRC,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': MAP_COLOURS['Map/RouteLine/surface-selected'],
        // A new colour shows with the lighting it goes with, in the same
        // frame: MapLibre's default 300 ms fade would draw the next card's
        // routes in the last card's colour for a moment.
        'line-color-transition': { duration: 0, delay: 0 },
        'line-width': litWidth(),
        'line-opacity': litOpacity(),
        'line-layer-opacity': 0,
        'line-layer-opacity-transition': { duration: 0, delay: 0 },
      },
    },
    before,
  );
  map.addLayer(
    {
      id: HIT,
      type: 'line',
      source: SRC,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': MAP_PAINT['Paint/hit'],
        'line-width': roadWidth(14),
        'line-opacity': 0,
      },
    },
    before,
  );
}

/**
 * Whether the frame `map` has just rendered drew the routes: their resting
 * line layer is in, their source is loaded, and the tiles the map drew of it
 * hold a route. Asked at each 'render', it is true from the first frame that
 * draws them: MapLibre lays a source's tiles out between frames and fires
 * 'render' after drawing what it has (map.ts, _render). The same test as the
 * cheap-phone timer's "routes drawn" (phoneSpeedParts.mjs, routesOnMap), for
 * the same reason as its last part: the public map's source is added empty
 * when the style is in before the map file, and an empty GeoJSON source
 * loads like any other. In this order, each part only once the one before
 * holds: isSourceLoaded fires an 'error' on the map for a source it does not
 * have, and MapView says "The map failed to load" for an 'error' before the
 * map's 'load'; and the tiles are read only once they are all in, under 1 ms
 * on an empty source's and 1.6-6.6 ms at 4x CPU, once, for the opening
 * view's 80 routes (measured for the timer, 2026-10-04). For MapView's
 * "Loading map…" (framing.ts, loadingLifts; the owner's answer to question
 * A of the cheap-phone report, 2026-10-06).
 */
export function routesDrawn(
  map: Pick<MapLibreMap, 'getSource' | 'getLayer' | 'isSourceLoaded' | 'querySourceFeatures'>,
): boolean {
  return !!(
    map.getSource(SRC) &&
    map.getLayer(LINE) &&
    map.isSourceLoaded(SRC) &&
    map.querySourceFeatures(SRC).length > 0
  );
}

/**
 * The saved directions' source and layers on `map`: laid out from `rows` as
 * loaded, the full `lines` read since patched in, the one being edited
 * hidden, and exactly `lit` lit.
 */
export function useSavedRoutesLayers(
  map: MapLibreMap | null,
  rows: readonly VariantSummary[],
  lines: ReadonlyMap<string, LineStringGeoJSON>,
  hiddenVariantId: string | null | undefined,
  lit: readonly string[],
) {
  // The rows the source was last laid out from, and the full lines patched
  // in since, each by the very array or object handed on: what was sent
  // is not sent again (the cheap-phone plan, step 10 (c) and (e),
  // 2026-10-04).
  const laidOut = useRef<readonly VariantSummary[] | null>(null);
  const patched = useRef(new Map<string, LineStringGeoJSON>());

  // Added with the rows already in, when they are (the public map's file
  // usually comes in before the basemap's style): laid out in the one
  // worker round trip that adds the source, not an empty one and then
  // the rows. Later rows are the next effect's.
  useEffect(() => {
    if (!map || map.getSource(SRC)) return;
    addSavedRoutes(map, rows);
    laidOut.current = rows;
    patched.current = new Map();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // The source is laid out from the rows as loaded — on the public map, the
  // overviews — and a full line read later is patched into it alone
  // (updateData), not the whole source laid out again. New rows lay it all
  // out again, the full lines with it: those are patched in afresh.
  useEffect(() => {
    if (!map) return;
    const src = map.getSource(SRC) as GeoJSONSource | undefined;
    if (!src) return;
    layOutOnce(laidOut, rows, (next) => {
      patched.current = new Map();
      src.setData(routesData(next));
    });
  }, [map, rows]);

  // Only the lines not patched in yet: each arrival sent every line read so
  // far again, and MapLibre laid out again each tile within any of their
  // bounds (GeoJSONSource.shouldReloadTile).
  //
  // And all of them again whenever the map makes its style afresh: a lost GL
  // context given back, or a basemap switch. MapLibre then builds the source
  // anew from a copy of its data taken at the loss or at setStyle (map.ts),
  // and a patch reaches that data only once the worker has answered it
  // (geojson_source.ts): a line still on its way then, or patched in after,
  // is not in the new source. So the record starts again at 'style.load',
  // and every line read so far goes to the new source. Before step 10 (e)
  // the next line read sent them all and put such a line right; since,
  // nothing did, and it stayed drawn as its overview (review of step 10 (e),
  // 2026-10-05).
  useEffect(() => {
    if (!map) return;
    const send = () => {
      const src = map.getSource(SRC) as GeoJSONSource | undefined;
      if (!src || lines.size === 0) return;
      const update = unpatched(patched.current, lines);
      if (update.length > 0) void src.updateData({ update });
    };
    const afresh = () => {
      patched.current = new Map();
      send();
    };
    send();
    map.on('style.load', afresh);
    return () => {
      map.off('style.load', afresh);
    };
  }, [map, rows, lines]);

  // The direction being edited is drawn by the editor; hide the saved copy.
  // Set only once there is one, and once more to show it again
  // (applyHidden): the public map never hides one, and sets no filter.
  const hiddenNow = useRef<string | null>(null);
  useEffect(() => {
    if (!map || !map.getLayer(LINE)) return;
    applyHidden(hiddenNow, hiddenVariantId, (hidden) => {
      const filter = ['!=', ['get', 'id'], hidden] as const;
      for (const id of [CASING, LINE, SELECTED_CASING, SELECTED, HIT])
        map.setFilter(id, filter as never);
    });
  }, [map, hiddenVariantId]);

  // The lit copy and its casing, off while nothing is lit, from the start;
  // their GL program compiled by a twin while the map is idle (layerSwitch.ts).
  const litSwitch = useLayerSwitch(map, LIT_LAYERS, map !== null);
  useLighting(map, SRC, lit, true, litSwitch);
}
