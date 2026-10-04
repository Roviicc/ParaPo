import { useEffect, useState } from 'react'
import type { MapLibreMap } from 'maplibre-gl'

/**
 * The layer ids one file paints and another places its own layers against.
 * The map's layer order is a contract between hooks — the orange stretches
 * go under the routes' hit area, the babaan sides and the hotspots under the
 * routes' casing, the ride-to preview under the ends' circles — and these
 * names are its terms; the headless suites read the same strings, so they
 * never change. A layer only its own file uses stays named there.
 */
export const LAYERS = {
  /** The routes' tap area, top of their stack: what paints on the lines goes under it. */
  routesHit: 'saved-routes-hit',
  /** The routes' white rim, bottom of their stack: what paints under the lines goes under it. */
  routesCasing: 'saved-routes-casing',
  /** The hotspots' fill: a tap asks it for boxes. */
  stopsFill: 'saved-stops-fill',
  /** A hintuan's name. */
  stopsHintuanLabel: 'saved-stops-label-hintuan',
  /** A lit ride's end circles. */
  endCircles: 'direction-end-circles',
  /** The line being drawn: its rim, and its snapped and freehand stretches. */
  drawCasing: 'draw-line-casing',
  drawSnapped: 'draw-line-snapped',
  drawFreehand: 'draw-line-freehand',
} as const

/**
 * How far past its edges each tile of our GeoJSON sources carries their
 * features, in pixels of the 512 px tile: 32, where MapLibre's default is
 * 128 (the cheap-phone plan, step 10 (d), 2026-10-04). A tile is drawn
 * clipped to its own square, so what it carries past its edge shows only as
 * far as a line's half width and antialiasing reach back in, and our widest
 * is the routes' hit area, 24 px at most: 12.5 px. Circles and names need
 * none of it, being drawn whole from the one tile their point is in. Less
 * carried is fewer vertices laid out, sent and drawn per tile: the chevrons
 * fifteen times a second, the lines at every line read. Not the place
 * wash's: its dashes start counting where its ring was cut, so a tile cut
 * nearer would move them. map-sources-test holds every layer drawn from
 * these sources to it, at every zoom.
 */
export const TILE_BUFFER = 32

/**
 * The id of the first layer of `type` in the map's drawing order, or
 * undefined. The same answer as `getStyle().layers.find(…)`, without the copy
 * of the whole style getStyle makes for it, every layer serialized and
 * cloned: the three a public map's load made (the routes', the hotspots' and
 * the status bar's) came to 6-15 ms at 4x CPU (the cheap-phone plan, step 5,
 * 2026-10-04). getStyle leaves out custom layers; their type is 'custom',
 * which no caller asks for.
 */
export function firstLayerOfType(
  map: Pick<MapLibreMap, 'getLayersOrder' | 'getLayer'>,
  type: string,
): string | undefined {
  return map.getLayersOrder().find((id) => map.getLayer(id)?.type === type)
}

/**
 * Hides one saved thing from a hook's layers — the direction or hotspot the
 * studio is editing, which the editor draws itself — by `apply`, handed the
 * id to leave out ('' for none), and keeps in `applied` the id it last hid
 * (null for none, as the layers start). It applies an id whenever asked, and
 * none only when one was hidden before, to show it again. So the public map,
 * which never hides anything, sets no filter: each setFilter that changes a
 * filter has MapLibre check it against a copy of the whole style, and the
 * public map's eleven came to 13-18 ms at 4x CPU on every load, and split the
 * hotspots' fills into two buckets for the worker to lay out (the cheap-phone
 * plan, step 5, 2026-10-04).
 */
export function applyHidden(
  applied: { current: string | null },
  hidden: string | null | undefined,
  apply: (id: string) => void,
): void {
  const next = hidden ?? null
  if (applied.current === null && next === null) return
  applied.current = next
  apply(next ?? '')
}

/**
 * True once `id` is a layer on `map`, and checked again whenever the style
 * changes. An effect that places a layer against another hook's used to look
 * once and give up for good when that one was not there yet — so the order
 * the hooks were called in was a silent contract (the review's 6.5). With
 * this in its dependencies it waits for the layer and runs when it arrives.
 */
export function useLayerReady(map: MapLibreMap | null, id: string): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!map) return
    const check = () => setReady(!!map.getLayer(id))
    check()
    map.on('styledata', check)
    return () => {
      map.off('styledata', check)
    }
  }, [map, id])
  return ready
}
