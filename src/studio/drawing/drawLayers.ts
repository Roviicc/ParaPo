import { useEffect } from 'react'
import type { GeoJSONSource, MapLibreMap } from 'maplibre-gl'
import type { LngLat, Segment } from '../../shared/geo/geo'
import { HOTSPOT_COLOUR } from '../../shared/map/colours'
import { MAP_PAINT } from '../../design-system/foundation/mapColours'
import { LAYERS } from '../../shared/map/layers'
import { variantLine } from '../../shared/model/routes'
import type { UTurn } from './snap'
import type { AreaTarget, Picking } from './useDrawing'

/**
 * What the drawing paints on the map: its sources and layers, laid once, and
 * the data and colours they show as the drawing changes. The `draw-*` ids are
 * a contract — the suites read them — and never change.
 */

const EMPTY = { type: 'FeatureCollection', features: [] } as const

const LINE_SRC = 'draw-line'
const POINT_SRC = 'draw-points'
const AREA_SRC = 'draw-area'
const UTURN_SRC = 'draw-uturns'
const BORROW_SRC = 'draw-borrow'
/** The drawing's points, and the wide invisible line a click finds: the events' layers. */
export const POINT_LAYER = 'draw-point-dots'
export const HIT_LAYER = 'draw-line-hit'
const AREA_FILL_LAYER = 'draw-area-fill'

const ROUTE_COLOUR = MAP_PAINT['Paint/draw-line']
const UTURN_COLOUR = MAP_PAINT['Paint/draw-uturn']

const BORROW_COLOUR = MAP_PAINT['Paint/draw-borrow']

/** The closing edge of an area is a feature in the line source with this index. */
export const CLOSING = -1

/** The drawing's sources and layers, added once the map is there. */
export function useDrawLayers(map: MapLibreMap | null): void {
  useEffect(() => {
    if (!map || map.getSource(LINE_SRC)) return

    map.addSource(LINE_SRC, { type: 'geojson', data: EMPTY })
    map.addSource(POINT_SRC, { type: 'geojson', data: EMPTY })
    map.addSource(AREA_SRC, { type: 'geojson', data: EMPTY })
    map.addSource(UTURN_SRC, { type: 'geojson', data: EMPTY })
    map.addSource(BORROW_SRC, { type: 'geojson', data: EMPTY })

    // The hotspot fill sits under its own outline and under the route layers.
    map.addLayer({
      id: AREA_FILL_LAYER,
      type: 'fill',
      source: AREA_SRC,
      paint: { 'fill-color': ROUTE_COLOUR, 'fill-opacity': 0.18 },
    })
    // The direction being extended, while its spot is picked: wide and pale,
    // so the tap has something to land on, with the spot as a ringed dot.
    map.addLayer({
      id: 'draw-borrow-line',
      type: 'line',
      source: BORROW_SRC,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': BORROW_COLOUR, 'line-width': 10, 'line-opacity': 0.35 },
    })
    map.addLayer({
      id: 'draw-borrow-spot',
      type: 'circle',
      source: BORROW_SRC,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 8,
        'circle-color': MAP_PAINT['Paint/casing'],
        'circle-stroke-color': BORROW_COLOUR,
        'circle-stroke-width': 3,
      },
    })
    map.addLayer({
      id: LAYERS.drawCasing,
      type: 'line',
      source: LINE_SRC,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': MAP_PAINT['Paint/casing'], 'line-width': 8, 'line-opacity': 0.9 },
    })
    // Routed and freehand are separate layers because line-dasharray cannot be
    // driven by a feature property.
    map.addLayer({
      id: LAYERS.drawSnapped,
      type: 'line',
      source: LINE_SRC,
      filter: ['==', ['get', 'snap'], 'snapped'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ROUTE_COLOUR, 'line-width': 4 },
    })
    map.addLayer({
      id: LAYERS.drawFreehand,
      type: 'line',
      source: LINE_SRC,
      filter: ['==', ['get', 'snap'], 'freehand'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ROUTE_COLOUR,
        'line-width': 4,
        'line-dasharray': [2, 1.5],
      },
    })
    // Where the route turns back on itself, the doubled-back stretch overlaps
    // or runs beside the line and would be invisible. Paint it amber over it.
    map.addLayer({
      id: 'draw-uturn-stub',
      type: 'line',
      source: UTURN_SRC,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': UTURN_COLOUR, 'line-width': 5 },
    })
    // A 4px line is far too thin to hit reliably; this invisible one is not.
    map.addLayer({
      id: HIT_LAYER,
      type: 'line',
      source: LINE_SRC,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': MAP_PAINT['Paint/hit'], 'line-width': 22, 'line-opacity': 0 },
    })
    // …and ring the control point it turns at.
    map.addLayer({
      id: 'draw-uturn-ring',
      type: 'circle',
      source: UTURN_SRC,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 12,
        'circle-opacity': 0,
        'circle-stroke-color': UTURN_COLOUR,
        'circle-stroke-width': 3,
      },
    })
    map.addLayer({
      id: POINT_LAYER,
      type: 'circle',
      source: POINT_SRC,
      paint: {
        'circle-radius': 6,
        'circle-color': MAP_PAINT['Paint/casing'],
        'circle-stroke-color': ROUTE_COLOUR,
        'circle-stroke-width': 2.5,
      },
    })
  }, [map])
}

/**
 * The drawing on the map: its segments (routed and freehand), points, a
 * hotspot's fill and closing edge, the U-turns ringed, the line being picked
 * for Extend, and the colours of a route or a hotspot's kind.
 */
export function useDrawRendering(
  map: MapLibreMap | null,
  { segments, controlPoints, area, uTurns, picking }: {
    segments: Segment[]
    controlPoints: LngLat[]
    area: AreaTarget | null
    uTurns: UTurn[]
    picking: Picking | null
  },
): void {
  useEffect(() => {
    if (!map) return
    const lineSrc = map.getSource(LINE_SRC) as GeoJSONSource | undefined
    const pointSrc = map.getSource(POINT_SRC) as GeoJSONSource | undefined
    if (!lineSrc || !pointSrc) return

    // Index before filtering: the feature's `index` must stay the segment's
    // real position, or editing one segment would edit another.
    const lineFeatures = segments
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => (s?.coordinates?.length ?? 0) > 1)
      .map(({ s, i }) => ({
        type: 'Feature' as const,
        properties: { index: i, snap: s.snap },
        geometry: { type: 'LineString' as const, coordinates: s.coordinates },
      }))

    // A hotspot closes itself once it has three corners. The closing edge is a
    // real, clickable feature so a corner can be inserted on it; it carries a
    // sentinel index because no segment backs it.
    if (area && controlPoints.length >= 3) {
      lineFeatures.push({
        type: 'Feature' as const,
        properties: { index: CLOSING, snap: 'freehand' as const },
        geometry: {
          type: 'LineString' as const,
          coordinates: [controlPoints[controlPoints.length - 1], controlPoints[0]],
        },
      })
    }

    lineSrc.setData({ type: 'FeatureCollection', features: lineFeatures })

    pointSrc.setData({
      type: 'FeatureCollection',
      features: controlPoints.map((c, i) => ({
        type: 'Feature' as const,
        properties: { index: i },
        geometry: { type: 'Point' as const, coordinates: c },
      })),
    })

    const areaSrc = map.getSource(AREA_SRC) as GeoJSONSource | undefined
    areaSrc?.setData(
      area && controlPoints.length >= 3
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'Polygon',
                  coordinates: [[...controlPoints, controlPoints[0]]],
                },
              },
            ],
          }
        : EMPTY,
    )

    const uturnSrc = map.getSource(UTURN_SRC) as GeoJSONSource | undefined
    const stubs = uTurns.map((u) => ({
      type: 'Feature' as const,
      properties: { point: u.point, metres: Math.round(u.metres) },
      geometry: { type: 'LineString' as const, coordinates: u.stub },
    }))
    const rings = uTurns
      .filter((u) => controlPoints[u.point])
      .map((u) => ({
        type: 'Feature' as const,
        properties: { point: u.point, metres: Math.round(u.metres) },
        geometry: { type: 'Point' as const, coordinates: controlPoints[u.point] },
      }))
    uturnSrc?.setData({ type: 'FeatureCollection', features: [...stubs, ...rings] })
  }, [map, segments, controlPoints, area, uTurns])

  useEffect(() => {
    if (!map) return
    const src = map.getSource(BORROW_SRC) as GeoJSONSource | undefined
    if (!src) return
    if (!picking) {
      src.setData(EMPTY)
      return
    }
    const line = {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: variantLine(picking.variant) },
    }
    const spot = picking.spot && {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Point' as const, coordinates: picking.spot.point },
    }
    src.setData({ type: 'FeatureCollection', features: spot ? [line, spot] : [line] })
  }, [map, picking])

  // Route traces are rose; a hotspot trace takes its kind's colour, and its
  // straight edges are drawn solid rather than in the freehand dash.
  useEffect(() => {
    if (!map || !map.getLayer(AREA_FILL_LAYER)) return
    const colour = area ? HOTSPOT_COLOUR[area.kind] : ROUTE_COLOUR
    map.setPaintProperty(LAYERS.drawSnapped, 'line-color', colour)
    map.setPaintProperty(LAYERS.drawFreehand, 'line-color', colour)
    map.setPaintProperty(LAYERS.drawFreehand, 'line-dasharray', area ? [1, 0] : [2, 1.5])
    map.setPaintProperty(POINT_LAYER, 'circle-stroke-color', colour)
    map.setPaintProperty(AREA_FILL_LAYER, 'fill-color', colour)
  }, [map, area])
}
