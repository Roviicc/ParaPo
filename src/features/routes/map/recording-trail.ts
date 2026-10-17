import type { FilterSpecification, GeoJSONSource, MapLibreMap } from 'maplibre-gl';

import { MAP_COLOURS, MAP_PAINT } from '@/design-system/foundation/map-colours';
import type { LngLat } from '@/shared/utils/geo';

import type { Way } from '../model/ride-recording';

/** A run of the trail on one way: outbound is papunta, return is pabalik. */
export interface TrailLine {
  way: Way;
  path: readonly LngLat[];
}

/** A dot where the way switched, ringed in the colour of the way that began there. */
export interface TrailMarker {
  at: LngLat;
  way: Way;
}

/** What the contributor's recording has drawn so far. */
export interface RecordingTrail {
  lines: readonly TrailLine[];
  markers: readonly TrailMarker[];
  /** Where the contributor is now, or null before the first fix. */
  here: LngLat | null;
}

export const TRAIL_SRC = 'recording-trail';
const CASING = 'recording-trail-casing';
const LINE = 'recording-trail-line';
const MARKERS = 'recording-trail-markers';
const HERE = 'recording-trail-here';

/** The trail as its source takes it: a line per run, a point per switch, and the contributor. */
export function trailData(trail: RecordingTrail) {
  return {
    type: 'FeatureCollection' as const,
    features: [
      ...trail.lines
        .filter((line) => line.path.length >= 2)
        .map((line) => ({
          type: 'Feature' as const,
          properties: { way: line.way },
          geometry: { type: 'LineString' as const, coordinates: line.path.map((p) => [...p]) },
        })),
      ...trail.markers.map((marker) => ({
        type: 'Feature' as const,
        properties: { kind: 'switch', way: marker.way },
        geometry: { type: 'Point' as const, coordinates: [...marker.at] },
      })),
      ...(trail.here
        ? [
            {
              type: 'Feature' as const,
              properties: { kind: 'here' },
              geometry: { type: 'Point' as const, coordinates: [...trail.here] },
            },
          ]
        : []),
    ],
  };
}

/** Adds the trail's source and layers, empty. A basemap switch carries them across (basemap.ts). */
export function addRecordingTrail(map: MapLibreMap): void {
  if (map.getSource(TRAIL_SRC)) return;
  map.addSource(TRAIL_SRC, {
    type: 'geojson',
    data: trailData({ lines: [], markers: [], here: null }),
  });
  const isLine: FilterSpecification = ['==', ['geometry-type'], 'LineString'];
  map.addLayer({
    id: CASING,
    type: 'line',
    source: TRAIL_SRC,
    filter: isLine,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': MAP_PAINT['Paint/casing'], 'line-width': 9 },
  });
  map.addLayer({
    id: LINE,
    type: 'line',
    source: TRAIL_SRC,
    filter: isLine,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': [
        'match',
        ['get', 'way'],
        'return',
        MAP_COLOURS['Map/Trail/pabalik'],
        MAP_COLOURS['Map/Trail/papunta'],
      ],
      'line-width': 5,
    },
  });
  map.addLayer({
    id: MARKERS,
    type: 'circle',
    source: TRAIL_SRC,
    filter: ['==', ['get', 'kind'], 'switch'],
    paint: {
      'circle-radius': 6,
      'circle-color': MAP_PAINT['Paint/casing'],
      'circle-stroke-color': [
        'match',
        ['get', 'way'],
        'return',
        MAP_COLOURS['Map/Trail/pabalik'],
        MAP_COLOURS['Map/Trail/papunta'],
      ],
      'circle-stroke-width': 3,
    },
  });
  map.addLayer({
    id: HERE,
    type: 'circle',
    source: TRAIL_SRC,
    filter: ['==', ['get', 'kind'], 'here'],
    paint: {
      'circle-radius': 8,
      'circle-color': MAP_COLOURS['Map/LocatorIndicatorOverlay/border'],
      'circle-stroke-color': MAP_PAINT['Paint/casing'],
      'circle-stroke-width': 3,
    },
  });
}

/** Lays the trail out in its source. */
export function setRecordingTrail(map: MapLibreMap, trail: RecordingTrail): void {
  const source = map.getSource(TRAIL_SRC);
  if (source) (source as GeoJSONSource).setData(trailData(trail));
}
