import { useEffect, useMemo, useRef } from 'react'
import type { GeoJSONSource, LineLayerSpecification, MapLibreMap } from 'maplibre-gl'
import { servedBy, variantLine, type VariantSummary } from '../model/routes'
import { passBounds, passStretches } from './pass'
import { stopRing, type StopSummary } from '../model/stops'
import { bboxOf, bboxesOverlap } from './geo'
import { PASS_COLOUR, litWidth } from '../map/lineStyle'
import { litOpacity, useLighting } from '../map/savedRoutesLayers'
import { ROUTES_HIT_LAYER } from '../map/tap'
import { applyHidden, useLayerReady } from '../map/layers'

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
    // `promoteId`: every stretch of a direction carries its id, so one feature
    // state lights them all.
    map.addSource(SRC, { type: 'geojson', promoteId: 'id', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer(PASS_LAYER, ROUTES_HIT_LAYER)
  }, [map, hitReady])

  const features = useMemo(() => {
    const boxes = stops
      .filter((s) => s.kind === 'hintuan' && s.area)
      .map((s) => {
        const ring = stopRing(s)
        return { stop: s, ring, bounds: passBounds(ring) }
      })
    return variants.flatMap((v) => {
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
    })
  }, [variants, stops])

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
