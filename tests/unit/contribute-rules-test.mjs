// The page's one door to the rules for the way a ride is on
// (src/features/contribute/recording-rules.ts): what it adds to ride-recording.ts's own
// rules (tested in ride-recording-test.mjs) — the words the contributor
// reads, and the trail the map is handed — and the way the stats strip and the
// countdown say their figures.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/contribute-rules-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OTHER_WAY, WAY_LABEL, trailOf } from '../../src/features/contribute/recording-rules.ts';
import {
  countdownText,
  kilometresText,
  minutesText,
} from '../../src/features/contribute/format.ts';

const T0 = Date.UTC(2026, 9, 17, 6, 0, 0);
const M_PER_DEG_LNG = 107_600;
/** A fix `s` seconds in, `east` metres east of Tala. */
const fix = (s, east) => ({
  time: T0 + s * 1000,
  at: [121.0 + east / M_PER_DEG_LNG, 14.6],
  accuracyM: 5,
});

test('the leg button switches to the other way, and the ways read as papunta and pabalik', () => {
  assert.equal(OTHER_WAY.outbound, 'return');
  assert.equal(OTHER_WAY.return, 'outbound');
  assert.equal(WAY_LABEL.outbound, 'Papunta');
  assert.equal(WAY_LABEL.return, 'Pabalik');
});

test('the trail is a papunta line, a pabalik line joined to it at the switch, a dot there, and the contributor', () => {
  const kept = [fix(0, 0), fix(10, 100), fix(20, 200), fix(30, 100), fix(40, 0)];
  const trail = trailOf(kept, [{ time: T0 + 20_000, to: 'return' }]);
  assert.deepEqual(
    trail.lines.map((line) => line.way),
    ['outbound', 'return'],
  );
  assert.deepEqual(trail.lines[0].path.at(-1), trail.lines[1].path[0]);
  assert.deepEqual(trail.markers, [{ at: kept[2].at, way: 'return' }]);
  assert.deepEqual(trail.here, kept[4].at);
});

test('before a switch there is no dot, and before a fix no contributor', () => {
  assert.equal(trailOf([fix(0, 0), fix(10, 100)], []).markers.length, 0);
  assert.equal(trailOf([], []).here, null);
});

test('the stats strip and the countdown say their figures the way the design reads them', () => {
  assert.equal(minutesText(42 * 60 + 59), '42');
  assert.equal(kilometresText(4200), '4.2');
  assert.equal(kilometresText(4249), '4.2');
  assert.equal(countdownText(102), '1:42');
  assert.equal(countdownText(120), '2:00');
  assert.equal(countdownText(0.2), '0:01');
  assert.equal(countdownText(-3), '0:00');
});
