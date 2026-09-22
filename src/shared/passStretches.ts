import { useEffect, useMemo } from 'react'
import type { GeoJSONSource, MapLibreMap } from 'maplibre-gl'
import { variantLine, type VariantSummary } from './routes'
import { passStretches, stopRing, type StopSummary } from './stops'
import { LIT_EXTRA, PASS_ORANGE, roadWidth } from './lineStyle'
import { LEVELS, SELECTED_CASING_LAYER } from './useSavedRoutes'
import { ROUTES_HIT_LAYER } from './tap'

/**
 * Where a direction passes a hintuan, the line turns orange for that stretch.
 *
 * The owner's design of 2026-09-23 (his Figma frame: blue, a band of colour,
 * blue). What is painted is decided by the one "passes" rule — inside the
 * box or within five metres of it — so a box is orange on a direction
 * exactly when the timeline lists it. Hintuans only: the ends are the ends.
 * The paint follows the line's three levels, rest, faded and lit, so a
 * resting route's stretches never shout over a lit one, and it fades out
 * below zoom 15, where a box is a couple of pixels and the line would only
 * look speckled.
 */

const SRC = 'saved-routes-pass'
const PASS = 'saved-routes-pass'
const SELECTED_PASS = 'saved-routes-selected-pass'

/** Gone at 14, full at 15.5: a stretch appears as the zoom makes it legible. */
function fadingIn(to: number) {
  return ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, to] as never
}

/** Draw the orange stretches of every direction; `lit` and `hiddenVariantId` as the line hook has them. */
export function usePassStretches(
  map: MapLibreMap | null,
  variants: readonly VariantSummary[],
  stops: readonly StopSummary[],
  lit: readonly string[],
  hiddenVariantId: string | null = null,
): void {
  // Between the resting line and the lit one, and the lit copy under the hit
  // area: the line hook's layers must be there first, and are, since it is
  // called before this one on both surfaces.
  useEffect(() => {
    if (!map || map.getSource(SRC) || !map.getLayer(SELECTED_CASING_LAYER)) return
    map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer(
      {
        id: PASS,
        type: 'line',
        source: SRC,
        // Square ends: the paint stops where the box does.
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: { 'line-color': PASS_ORANGE, 'line-width': roadWidth(0), 'line-opacity': fadingIn(LEVELS.REST.line) },
      },
      SELECTED_CASING_LAYER,
    )
    map.addLayer(
      {
        id: SELECTED_PASS,
        type: 'line',
        source: SRC,
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: { 'line-color': PASS_ORANGE, 'line-width': roadWidth(LIT_EXTRA), 'line-opacity': fadingIn(1) },
        filter: ['==', ['get', 'id'], ''] as never,
      },
      ROUTES_HIT_LAYER,
    )
  }, [map])

  const features = useMemo(() => {
    const boxes = stops.filter((s) => s.kind === 'hintuan' && s.area).map((s) => stopRing(s))
    return variants.flatMap((v) => {
      const line = variantLine(v)
      if (line.length < 2) return []
      return boxes.flatMap((ring) =>
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
  }, [map, features])

  useEffect(() => {
    if (!map || !map.getLayer(PASS)) return
    const hidden = ['!=', ['get', 'id'], hiddenVariantId ?? '']
    map.setFilter(PASS, hidden as never)
    map.setFilter(SELECTED_PASS, ['all', hidden, ['in', ['get', 'id'], ['literal', [...lit]]]] as never)
    map.setPaintProperty(PASS, 'line-opacity', fadingIn(lit.length > 0 ? LEVELS.FADED.line : LEVELS.REST.line))
  }, [map, lit, hiddenVariantId])
}
