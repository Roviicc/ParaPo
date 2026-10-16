// Colour (src/features/routes/map/daylight.ts): Liberty in Apple Maps' light
// palette, the rest of it muted, and a style without OpenFreeMap's tiles given
// no layer of its own.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/daylight-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daylightStyle } from '../../src/features/routes/map/daylight.ts';
import { MAP_PAINT } from '../../src/design-system/foundation/map-colours.ts';

const tiles = { source: 'openmaptiles' };
const fill = (id, colour, extra = {}) => ({
  id,
  type: 'fill',
  ...tiles,
  'source-layer': 'landuse',
  paint: { 'fill-color': colour },
  ...extra,
});
const line = (id, colour) => ({
  id,
  type: 'line',
  ...tiles,
  'source-layer': 'transportation',
  paint: { 'line-color': colour, 'line-width': 2 },
});

/** Enough of Liberty for every group the palette paints, and some it leaves muted. */
const liberty = () => ({
  version: 8,
  sources: { openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#f8f4f0' } },
    fill('park', '#d8e8c8', { paint: { 'fill-color': '#d8e8c8', 'fill-opacity': 0.7 } }),
    fill('landuse_residential', 'hsla(35,57%,88%,0.49)'),
    fill('landuse_cemetery', 'hsl(75,37%,81%)'),
    fill('landcover_grass', 'rgba(176, 213, 154, 1)', {
      paint: { 'fill-color': 'rgba(176, 213, 154, 1)', 'fill-opacity': 0.45 },
    }),
    fill('landuse_hospital', '#fde'),
    fill('water', 'rgb(158,189,255)'),
    line('waterway_river', '#a0c8f0'),
    line('road_motorway_casing', '#e9ac77'),
    line('road_motorway', '#fc8'),
    line('bridge_motorway_link', '#fc8'),
    line('road_trunk_primary_casing', '#e9ac77'),
    line('tunnel_secondary_tertiary', '#fff4c6'),
    line('road_minor_casing', '#cfcdca'),
    line('road_minor', '#fff'),
    line('road_major_rail', '#bbb'),
    line('road_path_pedestrian', 'hsl(0,0%,100%)'),
    fill('building', 'hsl(35,8%,85%)'),
    {
      id: 'building-3d',
      type: 'fill-extrusion',
      ...tiles,
      'source-layer': 'building',
      paint: { 'fill-extrusion-color': 'hsl(35,8%,85%)' },
    },
    {
      id: 'highway-name-major',
      type: 'symbol',
      ...tiles,
      'source-layer': 'transportation_name',
      layout: { 'text-field': '{name}' },
      paint: { 'text-color': '#666' },
    },
    {
      id: 'highway-name-path',
      type: 'symbol',
      ...tiles,
      'source-layer': 'transportation_name',
      layout: { 'text-field': '{name}' },
      paint: { 'text-color': 'hsl(30,23%,62%)', 'text-halo-color': '#f8f4f0' },
    },
    {
      id: 'poi_r1',
      type: 'symbol',
      ...tiles,
      'source-layer': 'poi',
      layout: { 'icon-image': 'shop_11' },
      paint: { 'text-color': '#666' },
    },
  ],
});

const byId = (style) => new Map(style.layers.map((l) => [l.id, l]));
const colourOf = (l) => l.paint[`${l.type}-color`];

test("the big surfaces wear Apple's palette, the input untouched", () => {
  const input = liberty();
  const before = structuredClone(input);
  const layers = byId(daylightStyle(input));
  assert.deepEqual(input, before, 'the style handed in is left alone');
  const want = {
    background: 'Paint/daylight-land',
    landuse_residential: 'Paint/daylight-land',
    park: 'Paint/daylight-green',
    landuse_cemetery: 'Paint/daylight-green',
    water: 'Paint/daylight-water',
    waterway_river: 'Paint/daylight-water',
    building: 'Paint/daylight-building',
    'building-3d': 'Paint/daylight-building-3d',
    'daylight-commercial': 'Paint/daylight-commercial',
  };
  for (const [id, paint] of Object.entries(want)) {
    assert.equal(colourOf(layers.get(id)), MAP_PAINT[paint], id);
  }
  // The homes are the ground's colour and unseen, so nothing under them is covered below z12.
  assert.equal(layers.get('landuse_residential').paint['fill-opacity'], 0);
  // A park and grass are opaque, so its green is Apple's and not Liberty's thinned over the ground.
  assert.equal(layers.get('park').paint['fill-opacity'], 1);
  assert.equal(layers.get('landcover_grass').paint['fill-opacity'], 1);
});

test('roads by kind: highways, avenues and white streets, each with its edge', () => {
  const layers = byId(daylightStyle(liberty()));
  const want = {
    road_motorway_casing: 'Paint/daylight-highway-edge',
    road_motorway: 'Paint/daylight-highway',
    bridge_motorway_link: 'Paint/daylight-highway',
    road_trunk_primary_casing: 'Paint/daylight-avenue-edge',
    tunnel_secondary_tertiary: 'Paint/daylight-avenue',
    road_minor_casing: 'Paint/daylight-street-edge',
    road_minor: 'Paint/daylight-street',
  };
  for (const [id, paint] of Object.entries(want)) {
    assert.equal(colourOf(layers.get(id)), MAP_PAINT[paint], id);
  }
  // Only the colour changes: Liberty's widths stay.
  assert.equal(layers.get('road_minor').paint['line-width'], 2);
});

test('everything else is muted as before, the icons in full; road names on a white halo', () => {
  const layers = byId(daylightStyle(liberty()));
  for (const id of ['landuse_hospital', 'road_major_rail', 'road_path_pedestrian']) {
    assert.match(colourOf(layers.get(id)), /^hsla\(/, `${id} recoloured by the muting`);
  }
  // Liberty's pink hospital keeps its hue with less of its saturation.
  const [, saturation] = colourOf(layers.get('landuse_hospital'))
    .match(/[\d.]+/g)
    .map(Number);
  assert.ok(saturation < 50, `${saturation}`);
  // The place icons in full, as Apple's are (the owner, 2026-10-16).
  assert.equal(layers.get('poi_r1').paint['icon-opacity'], undefined);
  // A layer the palette names keeps the muting on what the palette leaves: a path's tan name.
  const path = layers.get('highway-name-path').paint;
  assert.match(path['text-color'], /^hsla\(/, 'the name muted');
  assert.equal(path['text-halo-color'], MAP_PAINT['Paint/daylight-land']);
  assert.equal(
    layers.get('highway-name-major').paint['text-halo-color'],
    MAP_PAINT['Paint/casing'],
  );
});

test('the commercial blocks go under the parks, so a park in a business district stays green', () => {
  const ids = daylightStyle(liberty()).layers.map((l) => l.id);
  assert.equal(ids.indexOf('daylight-commercial'), ids.indexOf('park') - 1);
});

test("the e2e suites' bare style, with no OpenFreeMap tiles, gets no layer of its own", () => {
  const bare = {
    version: 8,
    sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eeeeee' } }],
  };
  assert.deepEqual(
    daylightStyle(bare).layers.map((l) => l.id),
    ['bg'],
  );
});
