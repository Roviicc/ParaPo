/**
 * The Map/… semantics of tokens.css, in hex, for the map's paint: MapLibre
 * reads neither var() nor Tailwind's oklch, which is what the primitives
 * resolve to. Keyed by the Figma names, so the paint reads as the design is
 * named; each hex is the primitive its token aliases there.
 * scripts/map-colours-test.mjs fails when this and tokens.css part.
 */
export const MAP_COLOURS = {
  'Map/Hintuan/surface': '#ffffff', // white (a raw #ffffff in Figma)
  'Map/RouteLine/surface-default': '#bedbff', // blue/200
  'Map/RouteLine/surface-selected': '#1447e6', // blue/700
  'Map/RouteLine/Arrow/Rest': '#ffffff', // white
  'Map/RouteLine/Arrow/Inverse': '#171717', // neutral/900
} as const satisfies Record<`Map/${string}`, `#${string}`>
