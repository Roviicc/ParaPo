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
 * How far past its edges each tile of the chevrons' and the end circles'
 * sources carries their features, in pixels of the 512 px tile: 32, where
 * MapLibre's default is 128 (the cheap-phone plan, step 10 (d), 2026-10-04).
 * A tile is drawn clipped to its own square, so what it carries past its
 * edge shows only as far as a shape reaches back in. A chevron is at most
 * 23 px from corner to corner (13 px across and 22 along, at zoom 20), so
 * none reaches from inside a tile to where it is cut; an end circle is laid
 * out only in the tile its point is in (MapLibre's circle_bucket.ts). The
 * same pixels either way, then, and fewer chevrons laid out fifteen times a
 * second: a trip framed, 48 vertices in the tiles on screen -> 36; at zoom
 * 16, 156 -> 65; at zoom 19, 404 -> 215 (exposed builds, 2026-10-05).
 *
 * Not the lines and boxes (the routes, the orange stretches, the hotspots,
 * the babaan sides), which carried it from 2026-10-04 until the review of
 * step 10 (d), 2026-10-05. Where a tile cuts a line or a box's edge, the
 * stretch inside runs to the cut point, which geojson-vt rounds to the
 * tile's grid (transform.ts) and keeps where it simplifies the line's other
 * points away below the source's top zoom (clip.ts, tile.ts); a nearer cut
 * turns that stretch a little. On a phone-sized screenshot at DPR 2 the
 * lines' edges changed by up to 41 levels of 255 (a trip at zoom 16, 1,815
 * device pixels above its card), and a hotspot's at zoom 18.3 by up to 25, and nothing
 * else may change what a visitor sees (the owner's handoff, 2026-10-04).
 * What it saved there, in vertices in the tiles on screen: at the opening
 * view, the routes 8,592 -> 2,723 (32%) and the hotspots 3,640 -> 1,598
 * (44%); a trip framed, 3,407 -> 2,959 (87%) and 4,013 -> 2,964 (74%).
 * Not the place wash's either: its dashes start counting where its ring
 * was cut. map-sources-test holds each source to its buffer, and every
 * layer drawn from these two to it, at every zoom.
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
 * Lays a source out from `next` by `layOut`, unless it already is from that
 * very array: `laidOut` keeps the last. A hook's source is added with what
 * is loaded by then (the cheap-phone plan, step 10 (c), 2026-10-04), and
 * the hook's effect for what is loaded runs straight after with the same,
 * which no longer lays it all out a second time. Anything loaded since is a
 * new array, and laid out as before.
 */
export function layOutOnce<T>(laidOut: { current: T | null }, next: T, layOut: (next: T) => void): void {
  if (laidOut.current === next) return
  laidOut.current = next
  layOut(next)
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
