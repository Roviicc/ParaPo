// What the map is handed of a recording (src/features/routes/map/recording-trail.ts):
// a line per leg that has somewhere to go, a dot per switch, and the contributor.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/recording-trail-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { trailData } from '../../src/features/routes/map/recording-trail.ts';

const OUT = [
  [121.0, 14.6],
  [121.001, 14.6],
];
const BACK = [
  [121.001, 14.6],
  [121.0005, 14.6],
];

test('a line per run, tagged with its way, and a dot per switch', () => {
  const data = trailData({
    lines: [
      { way: 'outbound', path: OUT },
      { way: 'return', path: BACK },
    ],
    markers: [{ at: [121.001, 14.6], way: 'return' }],
    here: [121.0005, 14.6],
  });
  const lines = data.features.filter((f) => f.geometry.type === 'LineString');
  assert.deepEqual(
    lines.map((f) => f.properties.way),
    ['outbound', 'return'],
  );
  assert.equal(data.features.filter((f) => f.properties.kind === 'switch').length, 1);
  assert.equal(data.features.filter((f) => f.properties.kind === 'here').length, 1);
});

test('a leg with a single point draws no line, and no fix yet draws no contributor', () => {
  const data = trailData({
    lines: [{ way: 'outbound', path: [[121.0, 14.6]] }],
    markers: [],
    here: null,
  });
  assert.equal(data.features.length, 0);
});

test('the lines join where one ends and the next begins', () => {
  const data = trailData({
    lines: [
      { way: 'outbound', path: OUT },
      { way: 'return', path: BACK },
    ],
    markers: [],
    here: null,
  });
  const [first, second] = data.features;
  assert.deepEqual(first.geometry.coordinates.at(-1), second.geometry.coordinates[0]);
});
