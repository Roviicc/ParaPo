import { useEffect, useMemo, useRef } from 'react'
import type { GeoJSONSource, LineLayerSpecification, MapLibreMap } from 'maplibre-gl'
import { servedBy, variantLine, type VariantSummary } from '../model/routes'
import { passBounds, passStretches } from './pass'
import { stopRing, type StopSummary } from '../model/stops'
import { bboxOf, bboxesOverlap, type BBox, type LngLat } from './geo'
import type { Ring } from './ring'
import { PASS_COLOUR, litWidth } from '../map/lineStyle'
import { litOpacity, useLighting } from '../map/savedRoutesLayers'
import { ROUTES_HIT_LAYER } from '../map/tap'
import { TILE_BUFFER, applyHidden, useLayerReady } from '../map/layers'

/**
 * Where a lit direction passes a hintuan, the line turns orange for that
 * stretch.
 *
 * The owner's design of 2026-09-23 (his Figma frame: blue, a band of colour,
 * blue). What is painted is decided by the one "passes" rule — inside the
 * box or within five metres of it — so a box is orange on a direction
 * exactly when the timeline lists it. Hintuans only: the ends are the ends.
 * On the lit directions only, since the map's two looks of 2026-09-29: a
 * resting line is one light blue end to end, and no route line is
 * see-through (the owner's call). Shown from zoom 15, where a box is more
 * than a couple of pixels and the stretch no longer looks speckled — at
 * once, not faded in: a fade is a see-through line on its way.
 *
 * "From zoom 15" is the layer's own `minzoom`, and the stretches switch on
 * and off with the lit line's own `litOpacity`, since 2026-10-04 (the
 * cheap-phone plan, step 2). It was one opacity, a step at zoom 15 around
 * the switch: an expression of the zoom and of each stretch's state, a GL
 * program of its own that the map compiled at the first tap that lit a
 * route, wherever the camera was (its key ended `z_line-opacity`; up to a
 * second of a cheap phone's main thread in the harness, 5–50 ms on a
 * phone). Now the stretches are drawn with the program the lit line and its
 * casing compiled at load, the same pixels from 15 up, and none below it:
 * the step drew nothing there either. Two things differ, neither on a
 * screen held still: zooming out across 15, the stretches go at 15 rather
 * than staying on the zoom-15 tiles shown while the map's zoom-14 ones load;
 * and a map tilted by hand at 14-15 no longer shows them on its nearer
 * zoom-15 tiles. Below 15 no tile carries them, and a query of the layer
 * finds none there.
 */

const SRC = 'saved-routes-pass'
const SELECTED_PASS = 'saved-routes-selected-pass'

/**
 * The stretches' layer: from zoom 15, painted as the lit line is but for
 * its colour, so the lit line's GL program draws it (see above).
 */
export const PASS_LAYER = {
  id: SELECTED_PASS,
  type: 'line',
  source: SRC,
  minzoom: 15,
  // Square ends: the paint stops where the box does.
  layout: { 'line-cap': 'butt', 'line-join': 'round' },
  paint: { 'line-color': PASS_COLOUR, 'line-width': litWidth(), 'line-opacity': litOpacity() },
} as const satisfies LineLayerSpecification

/**
 * The stretches' source and layer, added to `map` under the routes' hit
 * area, which must be there: what usePassStretches adds, apart so a unit
 * check can read it (map-sources-test).
 */
export function addPassStretches(map: Pick<MapLibreMap, 'addSource' | 'addLayer'>): void {
  // `promoteId`: every stretch of a direction carries its id, so one feature
  // state lights them all.
  map.addSource(SRC, { type: 'geojson', promoteId: 'id', buffer: TILE_BUFFER, data: { type: 'FeatureCollection', features: [] } })
  map.addLayer(PASS_LAYER, ROUTES_HIT_LAYER)
}

/** Draw the orange stretches of the lit directions; `lit` and `hiddenVariantId` as the line hook has them. */
export function usePassStretches(
  map: MapLibreMap | null,
  variants: readonly VariantSummary[],
  stops: readonly StopSummary[],
  lit: readonly string[],
  hiddenVariantId: string | null = null,
): void {
  // Over the lit copy and under the hit area: this waits for the line hook's
  // layers (useLayerReady), whichever hook the page calls first.
  const hitReady = useLayerReady(map, ROUTES_HIT_LAYER)
  useEffect(() => {
    if (!map || map.getSource(SRC) || !hitReady) return
    addPassStretches(map)
  }, [map, hitReady])

  // The boxes once per list of stops, and each direction's stretches once
  // per direction against them (stretchesOf): a line arriving for one
  // direction works out that direction's alone, not every lit one's again.
  const boxes = useMemo(() => passBoxes(stops), [stops])
  const features = useMemo(() => variants.flatMap((v) => stretchesOf(v, boxes)), [variants, boxes])

  useEffect(() => {
    const src = map?.getSource(SRC) as GeoJSONSource | undefined
    if (!src) return
    src.setData({ type: 'FeatureCollection', features })
  }, [map, features, hitReady])

  // None over the direction being redrawn: set only once there is one, and
  // once more to show it again (applyHidden); the public map sets none.
  const hiddenNow = useRef<string | null>(null)
  useEffect(() => {
    if (!map || !map.getLayer(SELECTED_PASS)) return
    applyHidden(hiddenNow, hiddenVariantId, (hidden) => {
      map.setFilter(SELECTED_PASS, ['!=', ['get', 'id'], hidden] as never)
    })
  }, [map, hiddenVariantId, hitReady])

  // The stretches follow their direction: the same state, on this source,
  // once it is there.
  useLighting(map, SRC, lit, hitReady)
}

/** A hintuan's box as the stretches are worked out against it: its ring, and the ground a line must reach (passBounds). */
export type PassBox = { stop: StopSummary; ring: Ring; bounds: BBox }

/** One orange stretch, as the map's source takes it: its direction's id on it, for the lighting. */
export type PassFeature = {
  type: 'Feature'
  properties: { id: string; route_id: string }
  geometry: { type: 'LineString'; coordinates: LngLat[] }
}

/** Every hintuan with a box: what the stretches are worked out against. */
export function passBoxes(stops: readonly StopSummary[]): readonly PassBox[] {
  return stops
    .filter((s) => s.kind === 'hintuan' && s.area)
    .map((s) => {
      const ring = stopRing(s)
      return { stop: s, ring, bounds: passBounds(ring) }
    })
}

const stretchesKept = new WeakMap<readonly PassBox[], WeakMap<VariantSummary, readonly PassFeature[]>>()

/**
 * One direction's orange stretches past these boxes, worked out once and
 * kept. They were worked out for every lit direction each time any line
 * arrived — a list of six lit routes, six times over as their lines came in
 * (the cheap-phone plan, step 16 (a), 2026-10-04).
 *
 * Kept by the boxes, then by the direction, both the very objects passed,
 * which is safe because neither is ever changed in place:
 * - `boxes` is made from a list of stops (passBoxes, the hook's memo of
 *   `stops`), and any other list of stops — a reload, a save — makes new
 *   boxes, with nothing kept yet;
 * - `v` is everything a stretch reads (its id, route_id, route and line),
 *   and a direction whose row or line changes is a new object (the line
 *   hook's `withLine`, a reload's new rows).
 * What is kept goes to the map's source as it is; MapLibre copies a feature
 * before it changes one (geojson_source_diff.ts), and nothing here does.
 */
export function stretchesOf(v: VariantSummary, boxes: readonly PassBox[]): readonly PassFeature[] {
  let byDirection = stretchesKept.get(boxes)
  if (!byDirection) {
    byDirection = new WeakMap()
    stretchesKept.set(boxes, byDirection)
  }
  let features = byDirection.get(v)
  if (!features) {
    features = stretchesPast(v, boxes)
    byDirection.set(v, features)
  }
  return features
}

/** stretchesOf without the keeping: worked out afresh. */
export function stretchesPast(v: VariantSummary, boxes: readonly PassBox[]): PassFeature[] {
  const line = variantLine(v)
  if (line.length < 2) return []
  // Only the boxes the line's own bounds reach: on a big map, most
  // directions and most boxes are nowhere near each other.
  const reach = bboxOf(line)
  // And only the hintuans it stops at: a train's track over a jeep
  // hintuan is not a stretch of its ride (servedBy).
  return boxes.filter((b) => bboxesOverlap(reach, b.bounds) && servedBy(b.stop, v.route)).flatMap(({ ring }) =>
    passStretches(line, ring).map((coordinates) => ({
      type: 'Feature' as const,
      properties: { id: v.id, route_id: v.route_id },
      geometry: { type: 'LineString' as const, coordinates },
    })),
  )
}
