import { useEffect } from 'react'
import type { GeoJSONSource, MapLibreMap } from 'maplibre-gl'
import { MAP_PAINT } from '../../design-system/foundation/mapColours'
import { stopLabel, type StopSummary } from '../model/stops'
import { LAYERS, useLayerReady } from './layers'

/*
 * A train line's stations as a metro map draws them: a dot on the line at
 * each station, its name beside it — the owner's ask of 2026-10-02. Far out,
 * where a station's box is a speck and its name not yet shown; from the zoom
 * the boxes' own names show (NAMES_FROM, savedStopsLayers.ts), the box and
 * its name take over. Not a thing to tap: the box is. Neutral until the
 * owner designs it — white with the basemap's own station grey.
 */

const SRC = 'station-dots'
const DOT = 'station-dots-circle'
const NAME = 'station-dots-name'
/** As far out as a line's stations are told apart: Metro Manila fits the screen. */
const DOTS_FROM = 11
/** Where the boxes' names take over (savedStopsLayers.ts NAMES_FROM, 16.5 less 1.2 times the ground). */
const DOTS_UNTIL = 16.5 - Math.log2(1.2)
const INK = MAP_PAINT['Paint/basemap-transit']

export function useStationDots(map: MapLibreMap | null, stops: readonly StopSummary[], hiddenStopId: string | null | undefined): void {
  // Over the lines, under their tap area, as the arrows are.
  const hitReady = useLayerReady(map, LAYERS.routesHit)
  useEffect(() => {
    if (!map || map.getSource(SRC) || !hitReady) return
    map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer(
      {
        id: DOT,
        type: 'circle',
        source: SRC,
        minzoom: DOTS_FROM,
        maxzoom: DOTS_UNTIL,
        paint: {
          'circle-color': MAP_PAINT['Paint/casing'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], DOTS_FROM, 3, 15, 5] as never,
          'circle-stroke-color': INK,
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], DOTS_FROM, 1.5, 15, 2] as never,
        },
      },
      LAYERS.routesHit,
    )
    // The name beside its dot, on whichever side has room; a name with none is
    // left out at this zoom rather than laid over another.
    map.addLayer({
      id: NAME,
      type: 'symbol',
      source: SRC,
      minzoom: 12,
      maxzoom: DOTS_UNTIL,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 11,
        'text-font': ['Noto Sans Bold'],
        'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
        'text-radial-offset': 0.7,
        'text-justify': 'auto',
        'text-max-width': 8,
        'text-allow-overlap': false,
      },
      paint: { 'text-color': INK, 'text-halo-color': MAP_PAINT['Paint/casing'], 'text-halo-width': 1.5 },
    })
  }, [map, hitReady])

  useEffect(() => {
    const src = map?.getSource(SRC) as GeoJSONSource | undefined
    if (!src) return
    src.setData({
      type: 'FeatureCollection',
      features: stops
        .filter((s) => s.line && s.id !== hiddenStopId)
        .map((s) => ({
          type: 'Feature' as const,
          properties: { id: s.id, name: stopLabel(s) },
          geometry: s.point,
        })),
    })
  }, [map, stops, hiddenStopId, hitReady])
}
