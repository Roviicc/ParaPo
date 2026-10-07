// The layers that draw only what is lit or marked, switched off as a whole
// while nothing is (the cheap-phone plan, step 18, 2026-10-04): the lit
// routes' casing and copy, their orange stretches, the hotspots' siblings and
// stripes. src/features/routes/map/layer-switch.ts.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/layer-switch-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LayerSwitch, twinsOf } from '../../src/features/routes/map/layer-switch.ts';
import { addSavedRoutes } from '../../src/features/routes/map/saved-routes-layers.ts';
import { addSavedStops, boxState } from '../../src/features/routes/map/saved-stops-layers.ts';
import { PASS_LAYER } from '../../src/features/routes/geo/pass-stretches.ts';

/** A map of layers with paint, counting each paint set, as MapLibre's: unset is undefined. */
function paintedMap(layers) {
  const sets = [];
  return {
    layers,
    sets,
    getLayer: (id) => layers.find((l) => l.id === id),
    getPaintProperty: (id, name) => layers.find((l) => l.id === id).paint?.[name],
    setPaintProperty: (id, name, value) => {
      sets.push([id, name, value]);
      const l = layers.find((x) => x.id === id);
      l.paint = { ...l.paint, [name]: value };
    },
  };
}
// As the hooks add them: off from the start, their paint says so.
const twoLayers = () =>
  paintedMap([
    { id: 'lit-line', type: 'line', paint: { 'line-layer-opacity': 0 } },
    { id: 'stripes', type: 'fill', paint: { 'fill-layer-opacity': 0 } },
  ]);
const opacity = (m) => m.layers.map((l) => l.paint?.[`${l.type}-layer-opacity`] ?? 1);

test('off from the start: nothing lit leaves them off and sets nothing; their programs are their twins’ (warm-programs.ts)', () => {
  const m = twoLayers();
  const sw = new LayerSwitch(['lit-line', 'stripes']);
  assert.equal(sw.value(), 0);
  // The lighting's effect run with nothing lit, as when the hotspots load: nothing.
  sw.set(m, false);
  sw.apply(m);
  assert.deepEqual(m.sets, [], 'nothing set: they are at 0, as added');
  assert.deepEqual(opacity(m), [0, 0]);
});

test('they switch with what is lit, at once, each by its own type, and are set only when that changes', () => {
  const m = twoLayers();
  const sw = new LayerSwitch(['lit-line', 'stripes']);
  sw.set(m, true);
  assert.deepEqual(m.sets, [
    ['lit-line', 'line-layer-opacity', 1],
    ['stripes', 'fill-layer-opacity', 1],
  ]);
  sw.set(m, true);
  sw.apply(m);
  assert.equal(m.sets.length, 2, 'lit again, or applied again while lit: nothing more');
  // The lighting goes: off with it, in the frame its feature state draws.
  sw.set(m, false);
  assert.deepEqual(opacity(m), [0, 0]);
  assert.equal(m.sets.length, 4);
});

test('a style made afresh after a lost GL context gets the value at its load, lit or not', () => {
  const m = twoLayers();
  const sw = new LayerSwitch(['lit-line', 'stripes']);
  sw.set(m, true);
  // MapLibre's copy as it was at the loss: one at 0 still, one at 1.
  m.layers[0].paint['line-layer-opacity'] = 0;
  m.sets.length = 0;
  sw.apply(m);
  assert.deepEqual(m.sets, [['lit-line', 'line-layer-opacity', 1]]);
  sw.set(m, false);
  delete m.layers[1].paint['fill-layer-opacity'];
  m.sets.length = 0;
  sw.apply(m);
  assert.deepEqual(m.sets, [['stripes', 'fill-layer-opacity', 0]], 'unset is 1: put back to 0');
});

test('one switch, any map: a layer not there is passed over', () => {
  const a = twoLayers();
  const b = twoLayers();
  const sw = new LayerSwitch(['lit-line', 'stripes', 'not-added-yet']);
  sw.set(a, true);
  sw.apply(b);
  assert.deepEqual(opacity(a), [1, 1]);
  assert.deepEqual(opacity(b), [1, 1]);
});

test('the value is read off the map: layers carried across a basemap switch keep theirs; one at 1 again is put back', () => {
  const m = twoLayers();
  const sw = new LayerSwitch(['lit-line', 'stripes']);
  // A switch carries each layer across with its paint (basemap.ts): nothing to set.
  sw.apply(m);
  assert.deepEqual(m.sets, []);
  // Were one made again without it, unset is 1: the next apply puts it right.
  delete m.layers[0].paint['line-layer-opacity'];
  sw.apply(m);
  assert.deepEqual(m.sets, [['lit-line', 'line-layer-opacity', 0]]);
});

test('the five layers change at once, never between: a 0 ms transition, and off as added', () => {
  const sources = new Map();
  const layers = [
    { id: 'background', type: 'background' },
    { id: 'road-label', type: 'symbol' },
  ];
  const map = {
    addSource: (id, spec) => sources.set(id, spec),
    addLayer: (spec, before) =>
      layers.splice(before ? layers.findIndex((l) => l.id === before) : layers.length, 0, spec),
    getLayer: (id) => layers.find((l) => l.id === id),
    getLayersOrder: () => layers.map((l) => l.id),
    hasImage: () => false,
    addImage: () => {},
  };
  addSavedRoutes(map);
  addSavedStops(map);
  layers.push(PASS_LAYER);
  const switched = [
    'saved-routes-selected-casing',
    'saved-routes-selected',
    'saved-routes-selected-pass',
    'saved-stops-siblings',
    'saved-stops-hatch',
  ];
  for (const id of switched) {
    const l = layers.find((x) => x.id === id);
    assert.ok(l, id);
    assert.deepEqual(l.paint[`${l.type}-layer-opacity-transition`], { duration: 0, delay: 0 }, id);
    assert.equal(l.paint[`${l.type}-layer-opacity`], 0, `${id} starts at 0`);
  }
  // And no other layer has one.
  for (const l of layers.filter((x) => !switched.includes(x.id))) {
    assert.ok(!Object.keys(l.paint ?? {}).some((k) => k.includes('layer-opacity')), l.id);
  }
});

test('twinsOf: each layer on the map, its type and its paint as it is, but the switch and its transition', () => {
  const m = paintedMap([
    {
      id: 'lit-line',
      type: 'line',
      paint: {
        'line-color': '#123456',
        'line-opacity': ['case', ['boolean', ['feature-state', 'lit'], false], 1, 0],
        'line-layer-opacity': 1,
        'line-layer-opacity-transition': { duration: 0, delay: 0 },
      },
    },
  ]);
  assert.deepEqual(twinsOf(m, ['lit-line', 'not-added-yet']), [
    {
      type: 'line',
      paint: {
        'line-color': '#123456',
        'line-opacity': ['case', ['boolean', ['feature-state', 'lit'], false], 1, 0],
      },
    },
  ]);
});

test("a box's feature state for its mark is what the effect set before", () => {
  // Before 2026-10-04, word for word: the mark, or 'none'.
  const before = (state) => ({
    lit: state === 'lit' || state === 'lit+sibling' || state === 'chosen',
    sibling: state.includes('sibling'),
    chosen: state === 'chosen',
  });
  for (const mark of ['lit', 'sibling', 'lit+sibling', 'chosen'])
    assert.deepEqual(boxState(mark), before(mark), mark);
  assert.deepEqual(boxState(undefined), before('none'));
});

test('MapLibre 6.7 draws nothing of a layer at 0, and at 1 as without it: the texture pass is for the values between', () => {
  // Its own drawing code, as the app's bundle carries it: a guard for an upgrade.
  const gl = readFileSync(
    new URL('../../node_modules/maplibre-gl/dist/maplibre-gl-dev.mjs', import.meta.url),
    'utf8',
  );
  for (const type of ['line', 'fill']) {
    const draw = gl.match(
      new RegExp(
        `const layerOpacity = layer\\.paint\\.get\\("${type}-layer-opacity"\\);\\s*if \\([^\\n]*\\|\\| layerOpacity === 0\\) return;\\s*(const [^\\n]*\\s*)?if \\(layerOpacity < 1\\) \\{`,
      ),
    );
    assert.ok(
      draw,
      `draw ${type}: returns before any drawing at 0, and goes through a texture only below 1`,
    );
  }
  // A transition of 0 ms keeps no value to fade from: the new one is drawn at once.
  const shared = readFileSync(
    new URL('../../node_modules/maplibre-gl/dist/maplibre-gl-shared-dev.mjs', import.meta.url),
    'utf8',
  );
  assert.match(
    shared,
    /if \(property\.specification\.transition && \(transition\.delay \|\| transition\.duration\)\) this\.prior = prior;/,
  );
});
