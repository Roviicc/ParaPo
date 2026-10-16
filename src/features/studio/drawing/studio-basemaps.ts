import {
  BASEMAPS,
  COLOUR,
  MONOCHROME,
  type Basemap,
  type Elevation,
  type Imagery,
} from '@/features/routes/map/basemap';
import { BASEMAP_THUMBNAILS } from '@/features/routes/map/basemap-thumbnails';

import satellite from './basemap-thumbnails/satellite.webp';
import terrain from './basemap-thumbnails/terrain.webp';

/*
 * Satellite and Terrain are the studio's only (the owner, 2026-10-15): a
 * photo and the ground's shape help trace a route, and commuters keep the
 * drawn maps. Kept here so their hosts never reach the public page
 * (scripts/checks/check-build.mjs proves no studio module does).
 */

/*
 * Esri's World Imagery, sharp to z19 over Metro Manila, is the one
 * street-level photo with no key to ask for. Going live needs Esri's free
 * developer key (ArcGIS Location Platform: 2M tiles a month free, checked
 * 2026-10-15), which one editor stays far inside.
 */
const ESRI_WORLD_IMAGERY: Imagery = {
  tiles:
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  // Positron's street and place names over the photo: the one satellite
  // design the owner kept, the names telling one road from the next.
  isLabelled: true,
};

/*
 * AWS's open Terrain Tiles (Mapzen's Terrarium encoding): no key, global to
 * z15, SRTM's 30 m over the Philippines (checked 2026-10-15). OpenFreeMap has
 * no elevation.
 */
const AWS_TERRAIN_TILES: Elevation = {
  tiles: 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png',
  maxzoom: 15,
  attribution:
    '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noreferrer">Terrain Tiles</a>',
};

/** The public map's designs, then Terrain (Colour with the hills) and Satellite. */
export const STUDIO_BASEMAPS: readonly Basemap[] = [
  ...BASEMAPS,
  { ...COLOUR, id: 'terrain', label: 'Terrain', elevation: AWS_TERRAIN_TILES },
  { id: 'satellite', label: 'Satellite', url: MONOCHROME.url, imagery: ESRI_WORLD_IMAGERY },
];

/** The Map Style card's pictures: the public map's, then Terrain's and Satellite's, cropped as they are. */
export const STUDIO_BASEMAP_THUMBNAILS: Readonly<Record<string, string>> = {
  ...BASEMAP_THUMBNAILS,
  terrain,
  satellite,
};
