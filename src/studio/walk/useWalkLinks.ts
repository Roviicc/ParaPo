import { useEffect } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { MAP_PAINT } from '../../design-system/foundation/mapColours'
import { LAYERS, firstLayerOfType, useLayerReady } from '../../shared/map/layers'
import { walkLinksData, type WalkLinksFile } from './walkLinks'
import trialFile from './walkLinks.trial.json'

/**
 * The trial's links: Caloocan's hotspots within 450 m of each other. Through
 * `unknown`, as TypeScript reads a JSON [lng, lat] as number[]; the file's
 * shape is held by tests/unit/walk-links-test.mjs instead.
 */
const TRIAL = trialFile as unknown as WalkLinksFile

const SRC = 'walk-links-trial'
const LINE = 'walk-links-trial-line'
const WORDS = 'walk-links-trial-words'
const COLOUR = MAP_PAINT['Paint/walk-link']

/** The links show from here: the longest is half a kilometre, a few pixels below it. */
const LINES_FROM = 14
/** Their words from here, once there is room for them between the hotspots' names. */
const WORDS_FROM = 15

/**
 * The walking-link trial on the studio's map (walkLinks.ts): each link a
 * dotted line, its walk and what it meets written halfway along. The look
 * is a stand-in until the owner draws one.
 *
 * The line goes over the routes and under the basemap's labels, where our
 * lines go (basemap.ts carries it there on a switch); the words go under the
 * hotspots' names, which keep their places where the two would collide.
 * Both are off while a line or a box is being drawn.
 */
export function useWalkLinks(map: MapLibreMap | null, drawing: boolean): void {
  const routesIn = useLayerReady(map, LAYERS.routesHit)
  const namesIn = useLayerReady(map, LAYERS.stopsHintuanLabel)
  const ready = routesIn && namesIn

  useEffect(() => {
    if (!map || !ready || map.getSource(SRC)) return
    map.addSource(SRC, { type: 'geojson', data: walkLinksData(TRIAL.links) })
    map.addLayer(
      {
        id: LINE,
        type: 'line',
        source: SRC,
        minzoom: LINES_FROM,
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': COLOUR,
          'line-width': ['interpolate', ['linear'], ['zoom'], LINES_FROM, 2, 18, 4],
          // Dots: dashes of no length, their round caps a line's width across.
          'line-dasharray': [0, 2],
        },
      },
      firstLayerOfType(map, 'symbol'),
    )
    map.addLayer(
      {
        id: WORDS,
        type: 'symbol',
        source: SRC,
        minzoom: WORDS_FROM,
        filter: ['==', ['geometry-type'], 'Point'],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-font': ['Noto Sans Bold'],
          'text-anchor': 'center',
          'text-justify': 'center',
          'text-allow-overlap': false,
        },
        paint: { 'text-color': COLOUR, 'text-halo-color': MAP_PAINT['Paint/casing'], 'text-halo-width': 1.5 },
      },
      LAYERS.stopsHintuanLabel,
    )
  }, [map, ready])

  useEffect(() => {
    if (!map || !ready || !map.getLayer(LINE)) return
    for (const id of [LINE, WORDS]) map.setLayoutProperty(id, 'visibility', drawing ? 'none' : 'visible')
  }, [map, ready, drawing])
}
