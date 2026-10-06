import { useEffect } from 'react'
import type { GeoJSONSource, MapLibreMap } from 'maplibre-gl'
import { MAP_PAINT } from '../../design-system/foundation/mapColours'
import { LAYERS, useLayerReady } from '../../shared/map/layers'
import { draftsData, type HintuanDraft } from './drafts'

const SRC = 'hintuan-drafts'
const FILL = 'hintuan-drafts-fill'
const EDGE = 'hintuan-drafts-edge'
const NAME = 'hintuan-drafts-name'
const COLOUR = MAP_PAINT['Paint/hotspot-draft']

/** The boxes show from here; their names from 16, where a 31 m box is some 30 px long. */
const BOXES_FROM = 14
const NAMES_FROM = 16

/**
 * The hintuan drafts still to look at (drafts.ts, draftsLeft) on the
 * studio's map: each a dashed box, tinted, its name in italics — a
 * suggestion, not a hotspot — until the owner opens and saves it. The look
 * is a stand-in until the owner draws one.
 *
 * The boxes go under the routes with the saved hotspots; the names under
 * the hotspots' own, which keep their places where the two would collide.
 * Off while a line or a box is being drawn: the draft being saved is the
 * outline then.
 */
export function useHotspotDrafts(map: MapLibreMap | null, drafts: readonly HintuanDraft[], drawing: boolean): void {
  const routesIn = useLayerReady(map, LAYERS.routesCasing)
  const namesIn = useLayerReady(map, LAYERS.stopsHintuanLabel)
  const ready = routesIn && namesIn

  useEffect(() => {
    if (!map || !ready || map.getSource(SRC)) return
    // Laid out by the effect below, with whatever drafts there are by then.
    map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer(
      {
        id: FILL,
        type: 'fill',
        source: SRC,
        minzoom: BOXES_FROM,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': COLOUR, 'fill-opacity': 0.08 },
      },
      LAYERS.routesCasing,
    )
    map.addLayer(
      {
        id: EDGE,
        type: 'line',
        source: SRC,
        minzoom: BOXES_FROM,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'line-color': COLOUR, 'line-width': 1.5, 'line-dasharray': [3, 2] },
      },
      LAYERS.routesCasing,
    )
    map.addLayer(
      {
        id: NAME,
        type: 'symbol',
        source: SRC,
        minzoom: NAMES_FROM,
        filter: ['==', ['geometry-type'], 'Point'],
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-font': ['Noto Sans Italic'],
          'text-anchor': 'center',
          'text-max-width': 8,
          'text-allow-overlap': false,
        },
        paint: { 'text-color': COLOUR, 'text-halo-color': MAP_PAINT['Paint/casing'], 'text-halo-width': 1.5 },
      },
      LAYERS.stopsHintuanLabel,
    )
  }, [map, ready])

  useEffect(() => {
    if (!map || !ready) return
    ;(map.getSource(SRC) as GeoJSONSource | undefined)?.setData(draftsData(drafts))
  }, [map, ready, drafts])

  useEffect(() => {
    if (!map || !ready || !map.getLayer(EDGE)) return
    for (const id of [FILL, EDGE, NAME]) map.setLayoutProperty(id, 'visibility', drawing ? 'none' : 'visible')
  }, [map, ready, drawing])
}
