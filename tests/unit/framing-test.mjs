// The public map opens framed on the routes (the owner's Q1, 2026-10-04):
// src/features/routes/map/framing.ts. The box it frames is the one useSavedRoutes'
// fit framed after the map's 'load' until then; the fit itself now runs on
// the public map only if what came frames otherwise, and never once the
// visitor has moved the map. The studio's map is framed as it always was.
// And the map's 12 s to load, which on the public map counts again from its
// style, when its routes go on (review of Q1, 2026-10-05). And "Loading
// map…", which on the public map goes with the first frame that draws its
// routes, or at its 'load' if that comes first; on the studio's at 'load'
// (the owner's answer to question A of the cheap-phone report, 2026-10-06).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/framing-test.mjs
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OPENING_WAIT_MS,
  ROUTES_FRAMING,
  framesRoutes,
  loadClock,
  loadingLifts,
  openedOn,
  routesBounds,
  sameBounds,
  within,
} from '../../src/features/routes/map/framing.ts';
import { ROUTES_LINE, routesDrawn } from '../../src/features/routes/map/saved-routes-layers.ts';
import { directionLine } from '../../src/features/routes/model/routes.ts';
import { routesOnMap } from '../../scripts/research/phoneSpeedParts.mjs';

/** useSavedRoutes' fit as it was until 2026-10-04, verbatim but for the map: the box it handed fitBounds, or null where it fitted nothing. */
function oldBox(variants) {
  const coords = variants.flatMap(directionLine);
  if (coords.length < 2) return null;
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of coords) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [
    [w, s],
    [e, n],
  ];
}

/** The committed map's directions as the public map reads them: each overview as its line (map-file.ts, asMap). */
const committed = JSON.parse(
  readFileSync(new URL('../../public/data/index.v4.json', import.meta.url), 'utf8'),
).variants.map(({ overview, ...v }) => ({ ...v, shape: overview ?? null }));
const line = (...coordinates) => ({ type: 'LineString', coordinates });
const direction = (id, shape) => ({ id, route_id: id, shape });

test("routesBounds is the fit's own box: on the committed map, and on small ones", () => {
  assert.ok(committed.length > 0);
  assert.deepEqual(routesBounds(committed), oldBox(committed));
  const two = [
    direction('a', line([121, 14.6], [121.1, 14.7])),
    direction('b', line([120.9, 14.65], [121.05, 14.8])),
  ];
  assert.deepEqual(routesBounds(two), [
    [120.9, 14.6],
    [121.1, 14.8],
  ]);
  assert.deepEqual(routesBounds(two), oldBox(two));
  // A slot (a return not drawn yet) carries no line and adds nothing.
  assert.deepEqual(routesBounds([...two, direction('c', null)]), [
    [120.9, 14.6],
    [121.1, 14.8],
  ]);
});

test('fewer than two points frame nothing, as the fit did', () => {
  assert.equal(routesBounds([]), null);
  assert.equal(routesBounds([direction('a', null)]), null);
  assert.equal(routesBounds([direction('a', line([121, 14.6]))]), null);
  assert.equal(oldBox([direction('a', line([121, 14.6]))]), null);
});

test("the framing is the fit's: 100 px clear of the edges, zoom 13 at most", () => {
  assert.deepEqual({ ...ROUTES_FRAMING }, { padding: 100, maxZoom: 13 });
  // useSavedRoutes and MapView both read it, so neither can drift from the other.
  const hook = readFileSync(
    new URL('../../src/features/routes/map/use-saved-routes.ts', import.meta.url),
    'utf8',
  );
  const view = readFileSync(
    new URL('../../src/features/routes/map/map-view.tsx', import.meta.url),
    'utf8',
  );
  assert.match(hook, /map\.fitBounds\(bounds, \{ \.\.\.ROUTES_FRAMING, duration: 0 \}\)/);
  assert.match(view, /bounds: framing, fitBoundsOptions: ROUTES_FRAMING/);
});

test('sameBounds: corner for corner, and never with none', () => {
  const a = [
    [120.9, 14.6],
    [121.1, 14.8],
  ];
  assert.equal(
    sameBounds(a, [
      [120.9, 14.6],
      [121.1, 14.8],
    ]),
    true,
  );
  assert.equal(
    sameBounds(a, [
      [120.9, 14.6],
      [121.1, 14.80001],
    ]),
    false,
  );
  assert.equal(sameBounds(null, a), false);
  assert.equal(sameBounds(a, null), false);
  assert.equal(sameBounds(null, null), false);
});

/** As much of a MapLibre map as openedOn uses, firing events by hand. */
function eventedMap() {
  const listeners = new Map();
  return {
    on(type, f) {
      listeners.set(type, [...(listeners.get(type) ?? []), f]);
    },
    off(type, f) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((g) => g !== f),
      );
    },
    fire(type, e = {}) {
      for (const f of [...(listeners.get(type) ?? [])]) f(e);
    },
    count: () => [...listeners.values()].reduce((n, fs) => n + fs.length, 0),
  };
}
const box = [
  [120.97, 14.48],
  [121.12, 14.78],
];
const other = [
  [120.97, 14.48],
  [121.13, 14.78],
];

test("the studio's map, never opened through openedOn, is framed as it always was", () => {
  assert.equal(framesRoutes(eventedMap(), box), true);
});

test('the public map opened on the routes is not framed again on the same box; a different box is framed', () => {
  const map = eventedMap();
  openedOn(map, box);
  assert.equal(
    framesRoutes(map, [
      [120.97, 14.48],
      [121.12, 14.78],
    ]),
    false,
    'the same box: it is there already',
  );
  // The copy kept from an earlier visit framed it, and the network brought another.
  assert.equal(framesRoutes(map, other), true);
});

test('opened on nothing (the file still on its way, no copy kept), the routes are framed as they come', () => {
  const map = eventedMap();
  openedOn(map, null);
  assert.equal(framesRoutes(map, box), true);
});

test("a visitor's drag, zoom, turn or tilt before the routes come keeps the map where they took it", () => {
  for (const type of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart']) {
    const map = eventedMap();
    openedOn(map, null);
    assert.equal(map.count(), 6, 'six gestures listened for');
    map.fire(type, { originalEvent: { type: 'touchmove' } });
    assert.equal(framesRoutes(map, box), false, `after a ${type}`);
    assert.equal(map.count(), 0, 'and no longer listened for once one came');
    // Opened on a box and taken elsewhere: a different box is not framed either.
    const framed = eventedMap();
    openedOn(framed, box);
    framed.fire(type, { originalEvent: {} });
    assert.equal(framesRoutes(framed, other), false);
  }
});

// Two inputs that none of the four above carry (review of the owner's Q1,
// 2026-10-05), as MapLibre 6.7 fires them: an arrow key eases the map with
// its zoom, bearing and pitch kept, so only its 'movestart' carries the key
// (handler/keyboard.ts, camera.ts _prepareEase); a shift-drag's box fires
// 'boxzoomstart' with the mouse, then zooms with no input (box_zoom.ts,
// fitScreenCoordinates).
test("a visitor's pan by the arrow keys, or box drawn to zoom to, keeps the map where they took it", () => {
  const key = eventedMap();
  openedOn(key, null);
  key.fire('movestart', { originalEvent: { type: 'keydown', key: 'ArrowRight' } });
  key.fire('move', { originalEvent: { type: 'keydown' } });
  assert.equal(framesRoutes(key, box), false, 'after an arrow key');
  assert.equal(key.count(), 0, 'and no longer listened for');

  const shift = eventedMap();
  openedOn(shift, box);
  shift.fire('boxzoomstart', { originalEvent: { type: 'mousemove', shiftKey: true } });
  // The zoom to the box as MapLibre makes it: no input on its events.
  shift.fire('movestart', {});
  shift.fire('zoomstart', {});
  assert.equal(
    framesRoutes(shift, other),
    false,
    'after a box zoom, a different box is not framed either',
  );
  assert.equal(shift.count(), 0);
});

test("the app's own moves are no gesture: they carry no input (a fit, a glide, APP_MOVE, a resize)", () => {
  const map = eventedMap();
  openedOn(map, null);
  map.fire('zoomstart', {});
  map.fire('dragstart', { appMove: true });
  map.fire('movestart', {});
  map.fire('movestart', { appMove: true });
  // A resize hands MapLibre's ResizeObserver entries on as its event data.
  map.fire('movestart', { 0: { contentRect: {} } });
  map.fire('boxzoomstart', {});
  assert.equal(framesRoutes(map, box), true);
  assert.equal(map.count(), 6);
});

test('within: the value that comes in time; none for one that fails or comes late', async () => {
  assert.equal(OPENING_WAIT_MS, 1000);
  assert.equal(await within(Promise.resolve('framing'), 50, null), 'framing');
  assert.equal(await within(Promise.reject(new Error('no store')), 50, null), null);
  let late;
  const slow = new Promise((done) => {
    late = done;
  });
  const t0 = Date.now();
  assert.equal(await within(slow, 30, null), null);
  assert.ok(Date.now() - t0 >= 25, 'waited for the time given');
  late('too late');
  assert.equal(
    await within(new Promise(() => {}), 10, 'none'),
    'none',
    'a store that never answers',
  );
});

// MapView's "did not finish loading" clock (review of the owner's Q1,
// 2026-10-05). Since Q1 the public map's routes go on at its style's load,
// so its 'load' waits for them and for the view framed on them; its clock
// starts again from the style, the studio's does not.
/** A map whose events are fired by hand: `once` as MapLibre's, one call each. */
function styledMap() {
  const once = new Map();
  return {
    once(type, f) {
      once.set(type, [...(once.get(type) ?? []), f]);
    },
    fire(type) {
      const fs = once.get(type) ?? [];
      once.delete(type);
      for (const f of fs) f();
    },
  };
}

test("the map's load clock: 12 s from its making, and the public map's 12 s again from its style", (t) => {
  t.after(() => mock.timers.reset());
  mock.timers.enable({ apis: ['setTimeout'] });
  const view = readFileSync(
    new URL('../../src/features/routes/map/map-view.tsx', import.meta.url),
    'utf8',
  );
  assert.match(
    view,
    /stopClock = loadClock\(map, !!openOn, LOAD_TIMEOUT_MS, \(\) => \{/,
    'MapView runs it, from the style on the public map only',
  );
  assert.match(view, /\n\s*stopClock\(\);?\n/, 'and stops it as the map goes');

  /**
   * When the clock ran, in ms from the map's making, over 30 s by whole
   * seconds: its style in at each of `styles` (a basemap switch's after the
   * first), and stopped at `stopAt`.
   */
  const run = (fromStyle, styles, stopAt = null) => {
    const map = styledMap();
    let now = 0;
    const ran = [];
    const stop = loadClock(map, fromStyle, 12_000, () => ran.push(now));
    for (let ms = 1000; ms <= 30_000; ms += 1000) {
      now = ms;
      mock.timers.tick(1000);
      if (styles.includes(ms)) map.fire('style.load');
      if (ms === stopAt) stop();
    }
    return ran;
  };
  // The studio's: from the making, whenever its style comes.
  assert.deepEqual(run(false, [3000]), [12_000]);
  assert.deepEqual(run(false, []), [12_000]);
  // The public map's: a style that never comes is said so at 12 s, as before.
  assert.deepEqual(run(true, []), [12_000]);
  // Its style in at 3 s: 12 s from then, for its tiles and its routes.
  assert.deepEqual(run(true, [3000]), [15_000]);
  // A style later than the 12 s has been said already, and is not said again.
  assert.deepEqual(run(true, [13_000]), [12_000]);
  // Stopped (the map gone): never.
  assert.deepEqual(run(true, [3000], 10_000), []);
  assert.deepEqual(run(false, [], 11_000), []);
  // Only the first style starts it again: a basemap switch's is not the map's opening.
  assert.deepEqual(run(true, [2000, 9000]), [14_000]);
});

// "Loading map…" (the owner's answer to question A of the cheap-phone
// report, 2026-10-06): on the public map it goes at the first frame that
// draws the routes, or at the map's 'load' if that comes first; on the
// studio's at 'load', as always.

/**
 * A map whose events are fired by hand (eventedMap), with the routes'
 * source and layer as `state` has them, saying what it was asked. Like
 * MapLibre's, its isSourceLoaded fires an 'error' for a source it lacks.
 */
function renderedMap(state = {}) {
  const map = eventedMap();
  map.state = { source: false, layer: false, loaded: false, features: 0, ...state };
  map.asked = [];
  map.errors = 0;
  map.getSource = (id) => (map.asked.push(['getSource', id]), map.state.source ? {} : undefined);
  map.getLayer = (id) => (map.asked.push(['getLayer', id]), map.state.layer ? {} : undefined);
  map.isSourceLoaded = (id) => {
    map.asked.push(['isSourceLoaded', id]);
    if (!map.state.source) return void map.errors++;
    return map.state.loaded;
  };
  map.querySourceFeatures = (id) => (
    map.asked.push(['querySourceFeatures', id]),
    Array.from({ length: map.state.features }, () => ({}))
  );
  return map;
}
/** The routes on the map, in the source the map file filled, laid out and drawn. */
const ROUTES_IN = { source: true, layer: true, loaded: true, features: 80 };

test("routesDrawn: the routes' line layer, their loaded source and a route in its tiles, the cheap-phone timer's own test", () => {
  for (const source of [false, true])
    for (const layer of [false, true])
      for (const loaded of [false, true])
        for (const features of [0, 80]) {
          const state = { source, layer, loaded, features };
          const map = renderedMap(state);
          const yes = routesDrawn(map);
          assert.equal(yes, source && layer && loaded && features > 0, JSON.stringify(state));
          assert.equal(
            routesOnMap(renderedMap(state)),
            yes,
            `the timer's routesOnMap says the same: ${JSON.stringify(state)}`,
          );
          // Never a source the map lacks: MapLibre's isSourceLoaded fires
          // an 'error' for it, which MapView takes for "The map failed to load".
          assert.equal(map.errors, 0, JSON.stringify(state));
          // The tiles read only once they are all in.
          if (!(source && layer && loaded))
            assert.ok(!map.asked.some(([k]) => k === 'querySourceFeatures'), JSON.stringify(state));
        }
  const map = renderedMap(ROUTES_IN);
  routesDrawn(map);
  assert.deepEqual(map.asked, [
    ['getSource', 'saved-routes'],
    ['getLayer', ROUTES_LINE],
    ['isSourceLoaded', 'saved-routes'],
    ['querySourceFeatures', 'saved-routes'],
  ]);
});

test('the public map: "Loading map…" goes at the first frame with the routes drawn, before its \'load\'', () => {
  const map = renderedMap();
  const lifts = [];
  let frame = 0;
  loadingLifts(map, routesDrawn, () => lifts.push(frame));
  const render = (state) => {
    Object.assign(map.state, state);
    frame++;
    map.fire('render');
  };
  // The style in, the routes' source not added yet.
  render({});
  // Added empty, the map file still on its way: loaded, and nothing in it.
  render({ source: true, layer: true, loaded: true });
  render({});
  // The map file's routes with MapLibre's worker.
  render({ loaded: false, features: 80 });
  assert.deepEqual(lifts, []);
  // Laid out: the frame that draws them.
  render({ loaded: true });
  assert.deepEqual(lifts, [5]);
  // And once: not again at a later frame, nor at the map's 'load'.
  const asked = map.asked.length;
  render({});
  map.fire('load');
  assert.deepEqual(lifts, [5]);
  assert.equal(map.asked.length, asked, 'nothing asked of the map once it has gone');
  assert.equal(map.count(), 0, 'every listener gone with it');
});

test("the public map: its 'load' first, \"Loading map…\" goes at the 'load', and the routes drawn later lift nothing", () => {
  const map = renderedMap({ source: true, layer: true, loaded: true });
  const lifts = [];
  loadingLifts(map, routesDrawn, () => lifts.push('lift'));
  map.fire('render');
  map.fire('load');
  assert.deepEqual(lifts, ['lift']);
  Object.assign(map.state, ROUTES_IN);
  const asked = map.asked.length;
  map.fire('render');
  assert.deepEqual(lifts, ['lift']);
  assert.equal(map.asked.length, asked);
  assert.equal(map.count(), 0);
});

test("the public map with no routes to draw (a map file empty, failed or held up): at its 'load', as before", () => {
  const map = renderedMap({ source: true, layer: true, loaded: true, features: 0 });
  const lifts = [];
  loadingLifts(map, routesDrawn, () => lifts.push('lift'));
  for (let i = 0; i < 20; i++) map.fire('render');
  assert.deepEqual(lifts, []);
  map.fire('load');
  assert.deepEqual(lifts, ['lift']);
  // A test of the routes that throws inside MapLibre's frame counts as a
  // frame without them, and does not throw into it: 'load' still lifts it.
  const odd = renderedMap(ROUTES_IN);
  const oddLifts = [];
  loadingLifts(
    odd,
    () => {
      throw new Error('no tiles to read');
    },
    () => oddLifts.push('lift'),
  );
  assert.doesNotThrow(() => odd.fire('render'));
  assert.deepEqual(oddLifts, []);
  odd.fire('load');
  assert.deepEqual(oddLifts, ['lift']);
});

test("the studio's map: \"Loading map…\" goes at its 'load', routes drawn or not, as always; MapView asks so", () => {
  const map = renderedMap(ROUTES_IN);
  const lifts = [];
  loadingLifts(map, null, () => lifts.push('lift'));
  for (let i = 0; i < 5; i++) map.fire('render');
  assert.deepEqual(lifts, []);
  assert.deepEqual(map.asked, [], 'no frame of its is asked about the routes');
  map.fire('load');
  assert.deepEqual(lifts, ['lift']);
  assert.equal(map.count(), 0);

  // MapView: the routes' test on the public map only (`openOn`), the text
  // shown until it lifts or a failure is said, and stopped as the map goes.
  // The clock still reads the map's 'load', not the text.
  const view = readFileSync(
    new URL('../../src/features/routes/map/map-view.tsx', import.meta.url),
    'utf8',
  );
  assert.match(
    view,
    /stopLift = loadingLifts\(map, openOn \? routesDrawn : null, \(\) => setLifted\(true\)\)/,
  );
  assert.match(view, /\n\s*stopLift\(\);?\n/);
  assert.match(
    view,
    /\{!lifted && !error && \(\s*<div className="pointer-events-none absolute inset-0 grid place-items-center">\s*<p className="text-sm text-neutral-500">Loading map…<\/p>/,
  );
  assert.match(view, /map\.on\('load', \(\) => \{\s*isLoaded = true;?\s*setLoaded\(true\)/);
  assert.equal((view.match(/setLifted\(/g) ?? []).length, 1, 'lifted by loadingLifts alone');
  // The design button still comes with the map's 'load', never with the
  // text: pwa-test reads it as the basemap's tiles in on a production build.
  assert.match(view, /map\.on\('load', \(\) => \{\n(?:(?!\n {6}\}\)).)*\n\s*setReady\(map\);?\n/s);
  assert.equal(
    (view.match(/setReady\(/g) ?? []).length,
    2,
    "set at the 'load', and let go as the map goes",
  );
  assert.match(view, /\{ready && !error && \(\s*<BasemapControl/);
});

test('"Loading map…" stopped (the map gone): never lifted', () => {
  for (const drawn of [routesDrawn, null]) {
    const map = renderedMap(ROUTES_IN);
    const lifts = [];
    const stop = loadingLifts(map, drawn, () => lifts.push('lift'));
    stop();
    map.fire('render');
    map.fire('load');
    assert.deepEqual(lifts, []);
    assert.equal(map.count(), 0);
  }
});
