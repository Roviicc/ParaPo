// What the saved routes show and light (src/features/routes/map/routes-shown.ts), and
// what a tap marks on the saved hotspots (src/features/routes/map/stops-shown.ts).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/shown-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { litOf, shownOf, showingOf } from '../../src/features/routes/map/routes-shown.ts';
import { boxMarks, placeHull } from '../../src/features/routes/map/stops-shown.ts';

/** A direction of `route`, drawn unless `drawn` is false: sample data, shaped like the published file. */
const dir = (id, route, reversed = false, drawn = true) => ({
  id,
  route_id: route,
  direction_name: id,
  reversed,
  confidence: 'drawn',
  shape: drawn
    ? {
        type: 'LineString',
        coordinates: [
          [121.0, 14.7],
          [121.0, 14.71],
        ],
      }
    : null,
  route: null,
});
const out = dir('a-out', 'a');
const back = dir('a-back', 'a', true);
const bOut = dir('b-out', 'b');
const slot = dir('c-back', 'c', true, false);
const all = [out, back, bOut, slot];

test('a list shows its routes the way round it is showing, drawn ones only', () => {
  assert.deepEqual(
    showingOf(all, false, all, null).map((v) => v.id),
    ['a-out', 'b-out'],
  );
  assert.deepEqual(
    showingOf(all, true, all, null).map((v) => v.id),
    ['a-back'],
  );
});

test('with no list, what a hotspot card shows is shown', () => {
  assert.deepEqual(
    showingOf([], false, all, ['b-out', 'c-back']).map((v) => v.id),
    ['b-out'],
  );
  assert.deepEqual(showingOf([], false, all, null), []);
});

test('lit: the chosen direction alone, else the Selected card, else everything shown', () => {
  const showing = [out, bOut];
  assert.deepEqual(
    litOf('a-back', ['b-out'], all, showing).map((v) => v.id),
    ['a-back'],
  );
  assert.deepEqual(
    litOf(null, ['b-out'], all, showing).map((v) => v.id),
    ['b-out'],
  );
  assert.deepEqual(litOf(null, null, all, showing), showing);
  assert.deepEqual(litOf('c-back', null, all, showing), []);
});

test('a tap keeps to what is lit, or with a card picked to everything shown', () => {
  assert.deepEqual(shownOf('a-out', ['a-out'], [out, bOut]), ['a-out']);
  assert.deepEqual(shownOf(null, ['b-out'], [out, bOut]), ['a-out', 'b-out']);
  assert.deepEqual(shownOf(null, ['b-out'], []), ['b-out']);
});

/** A square box `size` degrees wide at [lng, 14.7]. */
const box = (id, name, lng, kind = 'hintuan', size = 0.0002) => ({
  id,
  kind,
  name,
  informal: null,
  aliases: [],
  point: { type: 'Point', coordinates: [lng, 14.7] },
  area: {
    type: 'Polygon',
    coordinates: [
      [
        [lng, 14.7],
        [lng + size, 14.7],
        [lng + size, 14.7 + size],
        [lng, 14.7 + size],
        [lng, 14.7],
      ],
    ],
  },
});
const t = box('t', 'SM Fairview', 121.0, 'terminal');
const h = box('h', 'SM Fairview', 121.001);
const x = box('x', 'Bestlink', 121.01);
const stops = [t, h, x];

test('the chosen box is chosen, its siblings marked, the rest untouched', () => {
  assert.deepEqual(Object.fromEntries(boxMarks(stops, 't', [], false)), {
    t: 'chosen',
    h: 'sibling',
  });
});

test('under a tap while the sheet asks, every candidate is lit', () => {
  assert.deepEqual(Object.fromEntries(boxMarks(stops, null, [h, x], false)), {
    h: 'lit',
    x: 'lit',
  });
});

test('muted marks nothing and washes nothing', () => {
  assert.equal(boxMarks(stops, 't', [], true).size, 0);
  assert.deepEqual(placeHull(stops, 't', true), []);
});

test('the wash is a hull over the chosen box and its siblings; none for a place of one box', () => {
  const hull = placeHull(stops, 't', false);
  assert.ok(hull.length >= 3);
  const lngs = hull.map(([lng]) => lng);
  assert.ok(Math.min(...lngs) <= 121.0 && Math.max(...lngs) >= 121.001);
  assert.deepEqual(placeHull(stops, 'x', false), []);
});

// Review of 2026-10-03, finding 12: a place opened over a trip from the list
// keeps the list behind both; the place's card, not the list, is shown.
test("with a hotspot card open over a kept list, the card's routes are shown", () => {
  assert.deepEqual(
    showingOf(all, false, all, ['a-back', 'c-back']).map((v) => v.id),
    ['a-back'],
  );
  assert.deepEqual(
    showingOf(all, false, all, null).map((v) => v.id),
    ['a-out', 'b-out'],
  );
  // An open card that shows no route lights none of the list's either.
  assert.deepEqual(showingOf(all, false, all, []), []);
});

// The cheap-phone plan, step 16 (c), 2026-10-04: what is lit kept one array
// while it holds the same directions (routes-shown.ts, steady), as
// useSavedRoutes keeps litVariants and lit.
import { steady } from '../../src/features/routes/map/routes-shown.ts';

test('step 16 (c): the same things in the same order keep the array; anything else is the new one', () => {
  const was = [out, bOut];
  assert.equal(steady(was, was), was);
  assert.equal(steady(was, [out, bOut]), was, 'the same directions, a new array: kept');
  const other = [bOut, out];
  assert.equal(steady(was, other), other, 'the same, in another order: new');
  const fewer = [out];
  assert.equal(steady(was, fewer), fewer);
  const more = [out, bOut, back];
  assert.equal(steady(was, more), more);
  const lineIn = [out, { ...bOut }];
  assert.equal(steady(was, lineIn), lineIn, 'a direction made anew, the same in every field: new');
  assert.equal(steady([], []).length, 0);
  const ids = ['a-out', 'b-out'];
  assert.equal(steady(ids, ['a-out', 'b-out']), ids, 'ids compare as values');
});

test("step 16 (c): a line arriving keeps what is lit unless it is a lit direction's own", () => {
  // A list keeps the directions as they were when tapped (useSavedRoutes'
  // candidates) and lights them all: any line arriving makes a new list of
  // directions, and litOf a new array of the same ones, which is kept.
  const candidates = [out, back, bOut];
  const listLit = (variants) =>
    litOf(null, null, variants, showingOf(candidates, false, variants, null));
  const before = listLit(all);
  const arrived = all.map((v) => (v === out ? { ...v, shape: { ...v.shape } } : v));
  const after = listLit(arrived);
  assert.notEqual(after, before, 'litOf makes a new array');
  assert.equal(steady(before, after), before, 'and it is kept: the chevrons flow on');
  // A trip lights the chosen direction as the list of directions has it now.
  const tripLit = (variants) => litOf('a-out', null, variants, []);
  const trip = tripLit(all);
  const elsewhere = all.map((v) => (v === bOut ? { ...v, shape: { ...v.shape } } : v));
  assert.equal(steady(trip, tripLit(elsewhere)), trip, "another direction's line: kept");
  // Its own line arriving makes it a new object (withLine): new, so its chevrons follow the new line…
  const own = tripLit(arrived);
  assert.equal(steady(trip, own), own);
  assert.notEqual(own, trip);
  // …while the ids lit stay one array.
  const ids = trip.map((v) => v.id);
  assert.equal(
    steady(
      ids,
      own.map((v) => v.id),
    ),
    ids,
  );
});
