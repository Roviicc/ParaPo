/**
 * The Map/… semantics of tokens.css, in hex, for the map's paint: MapLibre
 * reads neither var() nor Tailwind's oklch, which is what the primitives
 * resolve to. Keyed by the Figma names, so the paint reads as the design is
 * named; each hex is the primitive its token aliases there.
 * tests/unit/map-colours-test.mjs fails when this and tokens.css part.
 */
export const MAP_COLOURS = {
  'Map/Hintuan/surface': '#ffffff', // white (a raw #ffffff in Figma)
  'Map/RouteLine/surface-default': '#bedbff', // blue/200
  'Map/RouteLine/surface-selected': '#1447e6', // blue/700
  'Map/RouteLine/Arrow/Rest': '#ffffff', // white
  'Map/RouteLine/Arrow/Inverse': '#171717', // neutral/900
} as const satisfies Record<`Map/${string}`, `#${string}`>

/**
 * The RouteCards' Card/<livery>/surface, in hex, for the map: a picked
 * card's routes, and an open trip's line, wear their card's colour (the
 * owner's ask, 2026-09-29). Each hex is the primitive its token aliases,
 * held to tokens.css by tests/unit/map-colours-test.mjs as the Map/… ones are.
 */
export const CARD_COLOURS = {
  'Card/red/surface': '#9f0712', // red/800
  'Card/orange/surface': '#ca3500', // orange/700
  'Card/mist/surface': '#d0d6d8', // mist/300
  'Card/yellow/surface': '#ffdf20', // yellow/300
} as const satisfies Record<`Card/${string}/surface`, `#${string}`>

/**
 * Everything else the map paints — the public map's and the editor's — in
 * the value it has always had: colours no Figma variable names yet. One file
 * for every colour on the map, so tests/unit/map-colours-test.mjs can fail on
 * a colour written anywhere else in the map's code (stage 9 of the clean-up,
 * 2026-09-29). Each is the owner's to name in Figma; until then the key says
 * what it paints, and moving one to a Map/… token is changing only this file.
 */
export const MAP_PAINT = {
  'Paint/casing': '#ffffff', // white: the rim under every line, circles' fill, text halos
  'Paint/hit': '#000000', // the tap area, drawn at opacity 0
  'Paint/end-name': '#171717', // neutral/900: a lit ride's end, named
  'Paint/hintuan-stretch': '#FF9831', // the orange of a stretch through a hintuan (the owner's hex, 2026-09-23)
  'Paint/hotspot-terminal': '#0ea5e9', // sky/500: a terminal's box
  'Paint/hotspot-hintuan': '#f97316', // orange/500: a hintuan's box, its babaan side
  'Paint/basemap-transit': '#3d5a73', // Gray, detailed: terminal and station names
  'Paint/basemap-landmark': '#6b6b6b', // Gray, detailed: the other landmarks' names
  'Paint/basemap-building': 'rgb(224, 224, 219)', // Gray, detailed: a building, a shade firmer than Positron's
  'Paint/basemap-building-edge': 'rgb(204, 204, 201)',
  'Paint/draw-line': '#e11d48', // rose/600: the line being drawn, its points' rims
  'Paint/draw-uturn': '#f59e0b', // amber/500: a join that turns back
  'Paint/draw-borrow': '#2563eb', // blue/600: the stretch an Extend borrows
} as const satisfies Record<`Paint/${string}`, string>
