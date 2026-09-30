import { useEffect, useMemo } from 'react'
import type { GeoJSONSource, MapLibreMap } from 'maplibre-gl'
import { variantLine, type VariantSummary } from '../model/routes'
import { passBounds, passStretches } from './pass'
import { stopRing, type StopSummary } from '../model/stops'
import { bboxOf, bboxesOverlap } from './geo'
import { PASS_COLOUR, litWidth } from '../map/lineStyle'
import { litOpacity, useLighting } from '../map/savedRoutesLayers'
import { ROUTES_HIT_LAYER } from '../map/tap'
import { useLayerReady } from '../map/layers'

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
 */

const SRC = 'saved-routes-pass'
const SELECTED_PASS = 'saved-routes-selected-pass'

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
    map.addLayer(
      {
        id: SELECTED_PASS,
        type: 'line',
        source: SRC,
        // Square ends: the paint stops where the box does.
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: { 'line-color': PASS_COLOUR, 'line-width': litWidth(), 'line-opacity': ['step', ['zoom'], 0, 15, litOpacity()] as never },
      },
      ROUTES_HIT_LAYER,
    )
  }, [map, hitReady])

  const features = useMemo(() => {
    const boxes = stops
      .filter((s) => s.kind === 'hintuan' && s.area)
      .map((s) => {
        const ring = stopRing(s)
        return { ring, bounds: passBounds(ring) }
      })
    return variants.flatMap((v) => {
      const line = variantLine(v)
      if (line.length < 2) return []
      // Only the boxes the line's own bounds reach: on a big map, most
      // directions and most boxes are nowhere near each other.
      const reach = bboxOf(line)
      return boxes.filter((b) => bboxesOverlap(reach, b.bounds)).flatMap(({ ring }) =>
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

  useEffect(() => {
    if (!map || !map.getLayer(SELECTED_PASS)) return
    map.setFilter(SELECTED_PASS, ['!=', ['get', 'id'], hiddenVariantId ?? ''] as never)
  }, [map, hiddenVariantId, hitReady])

  // The stretches follow their direction: the same state, on this source,
  // once it is there.
  useLighting(map, SRC, lit, hitReady)
}
