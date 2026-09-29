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
