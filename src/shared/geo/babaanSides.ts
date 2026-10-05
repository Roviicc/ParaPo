import { useEffect, useMemo } from 'react'
import type { GeoJSONSource, MapLibreMap } from 'maplibre-gl'
import { HOTSPOT_COLOUR } from '../map/colours'
import { bboxOf, bboxesOverlap, lineBounds } from './geo'
import { rightOfLine } from './rightOfLine'
import { ringToPolygon, type Ring } from './ring'
import { travelLine } from '../model/ride'
import { isLineMode, type VariantSummary } from '../model/routes'
import { inPassingOrder, listedAlong, passedAt } from '../model/timeline'
import { stopRing, type StopSummary } from '../model/stops'
import { LAYERS, TILE_BUFFER, useLayerReady } from '../map/layers'

/**
 * The babaan side: on the chosen direction, each hintuan box it cuts across
 * is drawn again on the line's right only — the owner's rule of 2026-09-26,
 * the babaan is on the right of the road in the direction of travel, papunta
 * and balikan alike. A box beside the road is not cut (`rightOfLine` is null)
 * and stays as it is. The chosen direction only: with every route showing, a
 * box crossed by several lines would be cut into strips.
 *
 * A placeholder look until the owner designs it: the hintuan orange, stronger.
 * Not for a train or the ferry: a platform or a pier has no side of the road to get off on.
 */

const SRC = 'babaan-side'
const FILL = 'babaan-side-fill'
const EDGE = 'babaan-side-edge'
/** Under the route lines, over the boxes, as the boxes are (useSavedStops). */
const ROUTES_ABOVE = LAYERS.routesCasing

/**
 * The babaan sides' source and layers, added to `map` under the routes'
 * casing, which must be there: what useBabaanSides adds, apart so a unit
 * check can read it (map-sources-test).
 */
export function addBabaanSides(map: Pick<MapLibreMap, 'addSource' | 'addLayer'>): void {
  map.addSource(SRC, { type: 'geojson', buffer: TILE_BUFFER, data: { type: 'FeatureCollection', features: [] } })
  map.addLayer(
    { id: FILL, type: 'fill', source: SRC, paint: { 'fill-color': HOTSPOT_COLOUR.hintuan, 'fill-opacity': 0.55 } },
    ROUTES_ABOVE,
  )
  map.addLayer(
    {
      id: EDGE,
      type: 'line',
      source: SRC,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': HOTSPOT_COLOUR.hintuan, 'line-width': 2 },
    },
    ROUTES_ABOVE,
  )
}

export function useBabaanSides(map: MapLibreMap | null, chosen: VariantSummary | null, stops: readonly StopSummary[]): void {
  const casingReady = useLayerReady(map, ROUTES_ABOVE)
  useEffect(() => {
    if (!map || map.getSource(SRC) || !casingReady) return
    addBabaanSides(map)
  }, [map, casingReady])

  const features = useMemo(() => babaanSideFeatures(chosen, stops), [chosen, stops])

  useEffect(() => {
    const src = map?.getSource(SRC) as GeoJSONSource | undefined
    src?.setData({ type: 'FeatureCollection', features })
  }, [map, features, casingReady])
}

/**
 * The chosen direction's babaan sides, as the map draws them: each hintuan
 * box it passes and cuts across (hintuansAlong, rightOfLine), its half on
 * the line's right, in the order the line reaches them. None for a train or
 * the ferry, or with nothing chosen.
 *
 * The cut is asked first, and only of the boxes the line's own box reaches
 * (a metre wider, as rightOfLine pads its own); where along the line, of
 * only the boxes it cuts. It was every listed hintuan placed along the
 * whole line first, and then cut: worked out in the render of a trip tap,
 * before its card paints, and on the first trip of a visit about 27 ms of
 * Node at full speed (Bagong Silang Kanan 5 → Philcoa), 7 ms now (the
 * cheap-phone plan, step 8, 2026-10-04). In a browser at CPU 4x, on three
 * trips opened one after another (5 runs, medians [min-max], this function
 * and all it calls, measured 2026-10-04): 60 [46-70] -> 35 [28-41] ms on
 * the first, 26 -> 9 and 16 -> 9 ms on the next two. So a cheap phone's
 * first trip of a visit gains about 25 ms (review of step 8, 2026-10-05).
 * The same features in the same order: a box the line's box misses is
 * crossed by none of the line, nor by a carry, which starts at an end
 * inside the box; a box listed but not cut was dropped either way; and the
 * sort is stable, as hintuansAlong's is. babaan-side-test holds the two
 * against each other, word for word, on the committed map and on made-up
 * directions.
 */
export function babaanSideFeatures(chosen: VariantSummary | null, stops: readonly StopSummary[]) {
  if (!chosen || isLineMode(chosen.route?.mode)) return []
  const line = travelLine(chosen, stops)
  const reach = lineBounds(line)
  const cut: { stop: StopSummary; side: Ring; index: number; at: number }[] = []
  for (const stop of stops) {
    if (!listedAlong(stop, chosen.route)) continue
    const ring = stopRing(stop)
    if (!bboxesOverlap(reach, bboxOf(ring, 1))) continue
    const side = rightOfLine(ring, line)
    const where = side && passedAt(line, ring, stop)
    if (side && where) cut.push({ stop, side, ...where })
  }
  return cut
    .sort(inPassingOrder)
    .map(({ stop, side }) => ({ type: 'Feature' as const, properties: { id: stop.id }, geometry: ringToPolygon(side) }))
}
