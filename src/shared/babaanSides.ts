import { useEffect, useMemo } from 'react'
import type { GeoJSONSource, MapLibreMap } from 'maplibre-gl'
import { HOTSPOT_COLOUR } from './colours'
import { rightOfLine, ringToPolygon } from './geo'
import { travelLine, type VariantSummary } from './routes'
import { hintuansAlong, stopRing, type StopSummary } from './stops'

/**
 * The babaan side: on the chosen direction, each hintuan box it cuts across
 * is drawn again on the line's right only — the owner's rule of 2026-09-26,
 * the babaan is on the right of the road in the direction of travel, papunta
 * and balikan alike. A box beside the road is not cut (`rightOfLine` is null)
 * and stays as it is. The chosen direction only: with every route showing, a
 * box crossed by several lines would be cut into strips.
 *
 * A placeholder look until the owner designs it: the hintuan orange, stronger.
 */

const SRC = 'babaan-side'
const FILL = 'babaan-side-fill'
const EDGE = 'babaan-side-edge'
/** Under the route lines, over the boxes, as the boxes are (useSavedStops). */
const ROUTES_ABOVE = 'saved-routes-casing'

export function useBabaanSides(map: MapLibreMap | null, chosen: VariantSummary | null, stops: readonly StopSummary[]): void {
  useEffect(() => {
    if (!map || map.getSource(SRC) || !map.getLayer(ROUTES_ABOVE)) return
    map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
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
  }, [map])

  const features = useMemo(() => {
    if (!chosen) return []
    const line = travelLine(chosen, stops)
    return hintuansAlong(line, stops).flatMap(({ stop }) => {
      const side = rightOfLine(stopRing(stop), line)
      return side ? [{ type: 'Feature' as const, properties: { id: stop.id }, geometry: ringToPolygon(side) }] : []
    })
  }, [chosen, stops])

  useEffect(() => {
    const src = map?.getSource(SRC) as GeoJSONSource | undefined
    src?.setData({ type: 'FeatureCollection', features })
  }, [map, features])
}
