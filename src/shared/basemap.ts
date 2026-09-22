import type {
  ExpressionSpecification,
  LayerSpecification,
  MapLibreMap,
  StyleSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl'

/**
 * The basemap designs a viewer can choose between. All of them are OpenFreeMap
 * styles over the same `/planet` tiles, sprite and glyph endpoint, so a switch
 * fetches one small style file and nothing a phone has cached is wasted.
 *
 * Positron is the default: gray, so the routes and hotspots painted on top
 * carry all the colour. "Gray, detailed" is Positron plus a few layers drawn
 * from data the tiles already carry (see `detailStyle`). Liberty is the
 * colourful OSM look; Dark is for night.
 */
export type BasemapId = 'positron' | 'positron-detailed' | 'liberty' | 'dark'
export type Basemap = { id: BasemapId; label: string; url: string; detailed?: true }

const POSITRON = 'https://tiles.openfreemap.org/styles/positron'

export const BASEMAPS: readonly Basemap[] = [
  { id: 'positron', label: 'Gray', url: POSITRON },
  { id: 'positron-detailed', label: 'Gray, detailed', url: POSITRON, detailed: true },
  { id: 'liberty', label: 'Colour', url: 'https://tiles.openfreemap.org/styles/liberty' },
  { id: 'dark', label: 'Dark', url: 'https://tiles.openfreemap.org/styles/dark' },
]

export const DEFAULT_BASEMAP = BASEMAPS[0]

/**
 * Remembered on the device only, and only once a viewer has chosen: a visitor
 * who never touches the control leaves the browser's storage empty, which the
 * visitor test asserts and the no-tracking promise relies on.
 */
const STORAGE_KEY = 'parapo.basemap.v1'

export function readBasemap(): Basemap {
  try {
    const id = localStorage.getItem(STORAGE_KEY)
    return BASEMAPS.find((b) => b.id === id) ?? DEFAULT_BASEMAP
  } catch {
    return DEFAULT_BASEMAP
  }
}

export function rememberBasemap(b: Basemap): void {
  try {
    if (b.id === DEFAULT_BASEMAP.id) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, b.id)
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}

// ---------------------------------------------------------------- the detail

/*
 * "Gray, detailed" — decided 2026-09-22.
 *
 * The z14 tile over SM Fairview is 253 kB and already holds the `poi`,
 * `building` and `housenumber` layers: 19 of 22 names read off the owner's
 * openstreetmap.org screenshot were in it, "Novaliches Public Terminal" and
 * "Nova Stop" among them. Positron draws none of the POIs and paints
 * buildings almost invisibly. These layers draw what is already downloaded —
 * no new request, no bigger cache — and stay gray so the routes and hotspots
 * keep the colour. Italic is the basemap's voice; our own labels are bold.
 *
 * Only what helps someone place themselves while tracing: transit first,
 * then the landmarks a driver would name. Convenience stores, eateries and
 * gates (2,594 of them under one viewport) stay hidden. Taps are unaffected:
 * `tapTargets` queries our two hit layers by name and nothing else.
 */

const SOURCE = 'openmaptiles'
const FONT = ['Noto Sans Italic']
const NAME: ExpressionSpecification = ['get', 'name']
/** The 11 px icons in OpenFreeMap's sprite are named `<class>_11`: small and quiet. */
const ICON: ExpressionSpecification = ['concat', ['get', 'class'], '_11']

const TRANSIT_COLOUR = '#3d5a73'
const LANDMARK_COLOUR = '#6b6b6b'

const label = (
  id: string,
  minzoom: number,
  filter: ExpressionSpecification,
  colour: string,
): SymbolLayerSpecification => ({
  id,
  type: 'symbol',
  source: SOURCE,
  'source-layer': 'poi',
  minzoom,
  filter: ['all', ['==', ['geometry-type'], 'Point'], filter],
  layout: {
    'icon-image': ICON,
    'icon-allow-overlap': false,
    'text-field': NAME,
    'text-font': FONT,
    'text-size': 11,
    'text-anchor': 'top',
    'text-offset': [0, 0.7],
    'text-max-width': 8,
    'text-optional': true,
  },
  paint: {
    'icon-opacity': 0.75,
    'text-color': colour,
    'text-halo-color': '#ffffff',
    'text-halo-width': 1.2,
    'text-halo-blur': 0.4,
  },
})

const DETAIL_LAYERS: readonly LayerSpecification[] = [
  // Terminals and rail stations from z13: few, and the thing this map is for.
  label(
    'detail-stations',
    13,
    ['any', ['==', ['get', 'subclass'], 'bus_station'], ['==', ['get', 'class'], 'railway']],
    TRANSIT_COLOUR,
  ),
  // Bus stops from z15, once there is room between them.
  label('detail-stops', 15, ['==', ['get', 'subclass'], 'bus_stop'], TRANSIT_COLOUR),
  // The big anchors people give directions by, from z15: the mall, the
  // market, the hospital, the college, the hall, the police station.
  label(
    'detail-landmarks',
    15,
    [
      'any',
      ['match', ['get', 'class'], ['grocery', 'college', 'town_hall', 'police'], true, false],
      ['all', ['==', ['get', 'class'], 'hospital'], ['==', ['get', 'subclass'], 'hospital']],
      [
        'all',
        ['==', ['get', 'class'], 'shop'],
        ['match', ['get', 'subclass'], ['mall', 'department_store'], true, false],
      ],
    ],
    LANDMARK_COLOUR,
  ),
  // The smaller ones from z16: schools, churches, gas stations and parks are
  // real landmarks but there are hundreds under one z15 view, and at z15 they
  // crowded the anchors out (measured over SM Fairview, 2026-09-22).
  label(
    'detail-landmarks-minor',
    16,
    ['match', ['get', 'class'], ['school', 'place_of_worship', 'fuel', 'park'], true, false],
    LANDMARK_COLOUR,
  ),
]

/** Positron paints buildings rgb(234,234,229) on a rgb(245,245,241) ground — a whisper. A shade darker reads as a block. */
const BUILDING_PAINT = { 'fill-color': 'rgb(224, 224, 219)', 'fill-outline-color': 'rgb(204, 204, 201)' }

/** Positron plus the detail layers and firmer buildings. Pure: the input is left alone. */
export function detailStyle(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: [
      ...style.layers.map((l) =>
        l.id === 'building' && l.type === 'fill' ? { ...l, paint: { ...l.paint, ...BUILDING_PAINT } } : l,
      ),
      ...DETAIL_LAYERS,
    ],
  }
}

/**
 * What to build a map with. `Map` takes a style URL or a style object and has
 * no transform hook, so a detailed design fetches its style here and adds the
 * detail before the map exists — one request, the same one MapLibre would
 * have made, and no plain-gray flash first. If the fetch fails the plain URL
 * goes in instead, and MapLibre's own error path reports what it can.
 */
export async function initialStyle(b: Basemap): Promise<StyleSpecification | string> {
  if (!b.detailed) return b.url
  try {
    const r = await fetch(b.url)
    if (!r.ok) return b.url
    return detailStyle((await r.json()) as StyleSpecification)
  } catch {
    return b.url
  }
}

// -------------------------------------------------------------- the switch

/**
 * The hook MapLibre runs once a style has arrived and before it is committed.
 *
 * Two jobs. First, if the design asks for detail, add it. Second, carry our
 * own drawing across: `setStyle` replaces the whole style, sources and layers
 * included, which would silently drop the routes, the hotspots and a
 * half-drawn line. Ours are exactly the GeoJSON sources (the basemaps use
 * vector and raster only) and the layers drawn from them. They go on top, in
 * the order they had, so casing-under-line and draw-above-saved still hold.
 * The route and hotspot hooks never notice.
 */
export function styleTransform(b: Basemap) {
  return (previous: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification => {
    const styled = b.detailed ? detailStyle(next) : next
    if (!previous) return styled
    const ours = Object.fromEntries(
      Object.entries(previous.sources).filter(([, s]) => s.type === 'geojson'),
    )
    const ourLayers = previous.layers.filter((l) => 'source' in l && l.source in ours)
    // Our lines and fills go under the new style's labels — a road painted
    // blue still shows its name — and our own symbols (labels, arrows) on top.
    const firstLabel = styled.layers.findIndex((l) => l.type === 'symbol')
    const cut = firstLabel < 0 ? styled.layers.length : firstLabel
    const ourMarks = ourLayers.filter((l) => l.type !== 'symbol')
    const ourSymbols = ourLayers.filter((l) => l.type === 'symbol')
    return {
      ...styled,
      sources: { ...styled.sources, ...ours },
      layers: [...styled.layers.slice(0, cut), ...ourMarks, ...styled.layers.slice(cut), ...ourSymbols],
    }
  }
}

/** Swap the basemap under everything drawn on it. */
export function applyBasemap(map: MapLibreMap, b: Basemap): void {
  map.setStyle(b.url, { transformStyle: styleTransform(b) })
}
