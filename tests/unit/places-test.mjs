// The save panel's places (src/features/studio/panels/places.ts): the hotspots a route
// can end at, grouped by the name people say, and the one box a picked place
// stands on.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/places-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boxFor,
  groupPlaces,
  nearestHotspot,
  terminalAlreadyAt,
} from '../../src/features/studio/panels/places.ts';

let n = 0;
/** A box at [lng, 14.7]: sample data, shaped like the stop rows. */
const box = (name, lng, kind = 'hintuan', informal = null) => ({
  id: `s${n++}`,
  kind,
  name,
  informal,
  aliases: [],
  point: { type: 'Point', coordinates: [lng, 14.7] },
});

test('boxes that share the name people say are one place; a terminal names it and comes first', () => {
  const a = box('SM Fairview Ilalim', 121.0, 'hintuan', 'SM Fairview');
  const b = box('SM Fairview Terminal B', 121.001, 'terminal', 'SM Fairview');
  const c = box('Bestlink', 121.01);
  const places = groupPlaces([c, a, b]);
  assert.deepEqual(
    places.map((p) => [p.label, p.boxes.length, p.terminal?.id ?? null]),
    [
      ['SM Fairview', 2, b.id],
      ['Bestlink', 1, null],
    ],
  );
});

test('a spelling typed in another case is the same place', () => {
  const places = groupPlaces([
    box('Tala', 121.0, 'hintuan', 'Tala'),
    box('tala', 121.002, 'hintuan', 'tala'),
  ]);
  assert.equal(places.length, 1);
});

test('a place stands on its terminal; with none, on the box nearest that end of the line', () => {
  const near = box('Bestlink', 121.0);
  const far = box('Bestlink', 121.05);
  const [place] = groupPlaces([far, near]);
  assert.equal(boxFor(place, [121.001, 14.7]), near.id);
  assert.equal(boxFor(place, [121.049, 14.7]), far.id);
  const term = box('Tala Terminal', 121.05, 'terminal', 'Bestlink');
  const [withTerminal] = groupPlaces([near, term]);
  assert.equal(boxFor(withTerminal, [121.0, 14.7]), term.id);
});

test('the nearest box to a point, and nothing without a point or boxes', () => {
  const a = box('A', 121.0),
    b = box('B', 121.1);
  assert.equal(nearestHotspot([a, b], [121.09, 14.7]), b.id);
  assert.equal(nearestHotspot([a, b], undefined), '');
  assert.equal(nearestHotspot([], [121.0, 14.7]), '');
});

test('a place has one terminal: a second is found by the name people say, or the ground name when that is blank', () => {
  const tala = box('Tala', 121.0, 'terminal');
  const fairview = box('SM Fairview Terminal A', 121.1, 'terminal', 'SM Fairview');
  const stops = [tala, fairview, box('Tala Ilalim', 121.0, 'hintuan', 'Tala')];
  // Two terminals both named "Tala", nothing informal: the gap the review of 2026-10-03 found.
  assert.equal(terminalAlreadyAt(stops, { id: null, name: 'Tala', informal: '' }), tala);
  assert.equal(
    terminalAlreadyAt(stops, { id: null, name: 'Tala Terminal B', informal: ' tala ' }),
    tala,
  );
  assert.equal(
    terminalAlreadyAt(stops, { id: null, name: 'sm  fairview', informal: '' }),
    fairview,
  );
  // The terminal itself, saved again, is no clash; a new place is none either.
  assert.equal(terminalAlreadyAt(stops, { id: tala.id, name: 'Tala', informal: '' }), null);
  assert.equal(terminalAlreadyAt(stops, { id: null, name: 'Novaliches', informal: '' }), null);
});
