/**
 * The Map/… semantics of tokens.css, in hex, for the map's paint: MapLibre
 * reads neither var() nor Tailwind's oklch, which is what the primitives
 * resolve to. Keyed by the Figma names, so the paint reads as the design is
 * named; each hex is the primitive its token aliases there.
 * tests/unit/map-colours-test.mjs fails when this and tokens.css part.
 */
export const MAP_COLOURS = {
  'Map/RouteLine/surface-default': '#8ec5ff', // blue/300
  'Map/RouteLine/surface-selected': '#1447e6', // blue/700
  'Map/RouteLine/Arrow/Rest': '#ffffff', // white
  'Map/RouteLine/Arrow/Inverse': '#171717', // neutral/900
  'Map/RouteLine/Hintuan/surface-default': '#05df72', // green/400
  'Map/OverlayCard/Hintuan/surface': '#00c951', // green/500, at 30%
  'Map/OverlayCard/Hintuan/surface-selected': '#00c951', // green/500, at 60%
  'Map/OverlayCard/Hintuan/content': '#016630', // green/800
  'Map/OverlayCard/Terminal/surface': '#00a6f4', // sky/500, at 25%
  'Map/OverlayCard/Terminal/border': '#00598a', // sky/800
  'Map/OverlayCard/Terminal/content': '#00598a', // sky/800
  'Map/HotspotsCard/Hintuan/surface': '#008236', // green/700
  'Map/HotspotsCard/Hintuan/border-primary': '#0d542b', // green/900
  'Map/HotspotsCard/Terminal/surface': '#0069a8', // sky/700
  'Map/HotspotsCard/Terminal/border-primary': '#024a70', // sky/900
  'Map/LocatorIndicatorOverlay/surface': '#8ec5ff', // blue/300, at 15%
  'Map/LocatorIndicatorOverlay/border': '#155dfc', // blue/600, at 75%
} as const satisfies Record<`Map/${string}`, `#${string}`>

/**
 * The opacity Figma gives a Map/… surface with its colour (the owner's
 * HotspotOverlayCard, 3837:11308): the map paints it as `fill-opacity`.
 */
export const MAP_OPACITY = {
  'Map/OverlayCard/Hintuan/surface': 0.3,
  'Map/OverlayCard/Hintuan/surface-selected': 0.6,
  'Map/OverlayCard/Terminal/surface': 0.25,
  'Map/LocatorIndicatorOverlay/surface': 0.15,
  'Map/LocatorIndicatorOverlay/border': 0.75,
} as const satisfies Partial<Record<keyof typeof MAP_COLOURS, number>>

/**
 * The RouteCards' Card/<livery>/surface, in hex, for the map: a picked
 * card's routes, and an open trip's line, wear their card's colour (the
 * owner's ask, 2026-09-29). Each hex is the primitive its token aliases,
 * held to tokens.css by tests/unit/map-colours-test.mjs as the Map/… ones are.
 */
export const CARD_COLOURS = {
  'Card/red/surface': '#9f0712', // red/800
  'Card/orange/surface': '#ca3500', // orange/700
  'Card/yellow/surface': '#ffdf20', // yellow/300
  'Card/violet/surface': '#7008e7', // violet/700
  'Card/rose/surface': '#c70036', // rose/700
  'Card/fuchsia/surface': '#a800b7', // fuchsia/700
} as const satisfies Record<`Card/${string}/surface`, `#${string}`>

/**
 * Everything else the map paints — the public map's and the editor's — in
 * the value it has always had: colours no Figma variable names yet. One file
 * for every colour the map's painters paint, so
 * tests/unit/map-colours-test.mjs can fail on a colour written in any other
 * of their .ts files (stage 9 of the clean-up, 2026-09-29). The map's
 * stylesheet (hintuanPin.css) is not read by it; its few raw
 * colours wait on the owner's list. Each is the owner's to name
 * in Figma; until then the key says what it paints, and moving one to a
 * Map/… token is changing only this file.
 */
export const MAP_PAINT = {
  'Paint/casing': '#ffffff', // white: the rim under every line, circles' fill, text halos
  'Paint/hit': '#000000', // the tap area, drawn at opacity 0
  'Paint/basemap-transit': '#3d5a73', // Gray, detailed: terminal and station names
  'Paint/basemap-landmark': '#6b6b6b', // Gray, detailed: the other landmarks' names
  'Paint/basemap-building': 'rgb(224, 224, 219)', // Gray, detailed: a building, a shade firmer than Positron's
  'Paint/basemap-building-edge': 'rgb(204, 204, 201)',
  'Paint/draw-line': '#e11d48', // rose/600: the line being drawn, its points' rims
  'Paint/draw-uturn': '#f59e0b', // amber/500: a join that turns back
  'Paint/draw-borrow': '#2563eb', // blue/600: the stretch an Extend borrows
  'Paint/walk-link': '#404040', // neutral/700: the studio's walking-link trial, dotted, and its words
} as const satisfies Record<`Paint/${string}`, string>

/**
 * No colour at all: a layer drawn and not seen. The end circles' twin wears
 * it, drawn once while the map is idle so that their GL program is compiled
 * before the first tap needs it (warmPrograms.ts, the cheap-phone plan,
 * step 3, 2026-10-04). Not one of MAP_PAINT's: no design names it, and its
 * alpha is the point (an opacity of 0 would have MapLibre skip the layer,
 * and compile nothing).
 */
export const MAP_CLEAR = 'rgba(0, 0, 0, 0)'
