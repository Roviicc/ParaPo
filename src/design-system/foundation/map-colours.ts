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
  'Map/Rail/LightRailWayOne/surface': '#1d7739', // light-rail-way-one/600
  'Map/Rail/LightRailWayOne/surface-pale': '#b7f5ca', // light-rail-way-one/200
  'Map/Rail/LightRailWayOne/border-primary': '#12612a', // light-rail-way-one/700
  'Map/Rail/LightRailWayOne/Timeline/surface': '#0c5924', // light-rail-way-one/800
  'Map/Rail/LightRailWayTwo/surface': '#4a3a6b', // light-rail-way-two/600
  'Map/Rail/LightRailWayTwo/surface-pale': '#d0b9ff', // light-rail-way-two/200
  'Map/Rail/LightRailWayTwo/border-primary': '#382859', // light-rail-way-two/700
  'Map/Rail/LightRailWayTwo/Timeline/surface': '#372b4f', // light-rail-way-two/800
  'Map/Rail/MetroRailWayThree/surface': '#edc319', // metro-rail-way-three/600
  'Map/Rail/MetroRailWayThree/surface-pale': '#fff1b8', // metro-rail-way-three/200
  'Map/Rail/MetroRailWayThree/border-primary': '#ac8b0b', // metro-rail-way-three/700
  'Map/Rail/MetroRailWayThree/Timeline/surface': '#967906', // metro-rail-way-three/800
} as const satisfies Record<`Map/${string}`, `#${string}`>;

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
} as const satisfies Partial<Record<keyof typeof MAP_COLOURS, number>>;

/**
 * The RouteCards' Card/<livery>/surface, in hex, for the map: a picked
 * card's routes, and an open trip's line, wear their card's colour (the
 * owner's ask, 2026-09-29). Each hex is the primitive its token aliases,
 * held to tokens.css by tests/unit/map-colours-test.mjs as the Map/… ones are.
 */
export const CARD_COLOURS = {
  'Card/red/surface': '#9f0712', // red/800
  'Card/orange/surface': '#ca3500', // orange/700
  'Card/violet/surface': '#7008e7', // violet/700
  'Card/rose/surface': '#c70036', // rose/700
  'Card/fuchsia/surface': '#a800b7', // fuchsia/700
  'Card/pink/surface': '#c6005c', // pink/700
} as const satisfies Record<`Card/${string}/surface`, `#${string}`>;

/**
 * The RouteCards' Card/<livery>/surface-pale, in hex, for the map: the rest
 * of an open trip's line past a picked hintuan, from there to where the trip
 * goes, in the card's own hue paled (the owner's ask, 2026-10-12: the
 * remaining line should be surface-pale of the selected colour). Each hex is
 * the primitive its token aliases, each hue's 200, held to tokens.css by
 * tests/unit/map-colours-test.mjs as CARD_COLOURS is.
 */
export const CARD_PALE_COLOURS = {
  'Card/red/surface-pale': '#ffc9c9', // red/200
  'Card/orange/surface-pale': '#ffd6a8', // orange/200
  'Card/violet/surface-pale': '#ddd6ff', // violet/200
  'Card/rose/surface-pale': '#ffccd3', // rose/200
  'Card/fuchsia/surface-pale': '#f6cfff', // fuchsia/200
  'Card/pink/surface-pale': '#fccee8', // pink/200
} as const satisfies Record<`Card/${string}/surface-pale`, `#${string}`>;

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
  'Paint/basemap-transit': '#3d5a73', // Monochrome: rail station names
  'Paint/basemap-landmark': '#6b6b6b', // Monochrome: the other landmarks' names
  'Paint/basemap-building': 'rgb(224, 224, 219)', // Monochrome: a building, a shade firmer than Positron's
  'Paint/basemap-building-edge': 'rgb(204, 204, 201)',
  'Paint/basemap-street': '#ffffff', // Monochrome: a street from z14, and a bridge's deck
  'Paint/basemap-street-far': 'rgb(224, 224, 224)', // Positron's own street colour, below z14
  'Paint/basemap-street-edge': 'rgb(218, 218, 214)', // a street's edge, a shade under the buildings'
  'Paint/basemap-bridge-edge': 'rgb(176, 176, 172)', // a bridge's or flyover's edge, firmer so it reads as above
  'Paint/basemap-skyway-edge': 'rgb(150, 150, 146)', // three levels up and more: the Skyway's edge, firmer still
  'Paint/basemap-tunnel': 'rgb(234, 234, 231)', // an underpass, paler than a street, under a dashed edge
  'Paint/basemap-path': 'rgb(196, 196, 192)', // a path or footbridge, dashed
  'Paint/basemap-house-number': '#9a9a96', // Monochrome: house numbers from z17
  'Paint/terrain-shadow': 'rgb(96, 90, 80)', // Terrain: a slope away from the light, a warm gray
  'Paint/terrain-highlight': '#ffffff', // a slope toward it
  'Paint/terrain-accent': 'rgb(122, 116, 104)', // the steepest ground
  'Paint/basemap-photo-label': '#ffffff', // Satellite, labelled: street and place names over the photo
  'Paint/basemap-photo-halo': '#1a1a1a', // near-black, so a name reads over a bright roof
  // Colour: Apple Maps' light palette, read off the owner's screenshot (2026-10-16).
  'Paint/daylight-land': '#f7f3eb', // the ground, a warm cream; homes the same
  'Paint/daylight-water': '#8edbf6', // rivers, the bay, lakes
  'Paint/daylight-green': '#d5efbe', // parks, cemeteries, grass and woods
  'Paint/daylight-commercial': '#fef5e4', // shops, offices and malls, a pale warm yellow
  'Paint/daylight-building': '#efe9df', // a touch darker than the ground
  'Paint/daylight-building-edge': '#e4ddd1',
  'Paint/daylight-building-3d': '#fdfbf8', // a building standing up from z14: near white, so its walls stay soft
  'Paint/daylight-highway': '#dde1e1', // motorways and their ramps: EDSA, the Skyway
  'Paint/daylight-highway-edge': '#cdd2d2',
  'Paint/daylight-avenue': '#e1e3e7', // the avenues: trunk, primary to tertiary, and links
  'Paint/daylight-avenue-edge': '#ced2d9', // a shade darker
  'Paint/daylight-street': '#ffffff', // streets and service roads, white
  'Paint/daylight-street-edge': '#ebe5da', // a whisper on the ground, no strong casing
  'Paint/draw-line': '#e11d48', // rose/600: the line being drawn, its points' rims
  'Paint/draw-uturn': '#f59e0b', // amber/500: a join that turns back
  'Paint/draw-borrow': '#2563eb', // blue/600: the stretch an Extend borrows
} as const satisfies Record<`Paint/${string}`, string>;
