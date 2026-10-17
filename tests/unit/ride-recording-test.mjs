// The rules for a ride recorded on a phone (src/features/routes/model/ride-recording.ts):
// which fixes count, the distance, the hintos, the gaps and the moving and standing minutes.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/ride-recording-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { haversine } from '../../src/shared/utils/geo.ts';
import {
  distanceM,
  hintosOf,
  keptFixes,
  mergeGaps,
  pathLengthM,
  silentGaps,
  summarize,
} from '../../src/features/routes/model/ride-recording.ts';

const T0 = Date.UTC(2026, 9, 17, 6, 0, 0);
/** A fix `s` seconds after the start, `east` metres east of Tala and `north` metres north. */
const fix = (s, east = 0, north = 0, accuracyM = 5) => ({
  time: T0 + s * 1000,
  at: [121.04 + east / 107_500, 14.7 + north / 111_195],
  accuracyM,
});

test('a fix worse than 50 m is ignored, one at 50 m counts', () => {
  const kept = keptFixes([fix(0), fix(1, 5, 0, 51), fix(2, 10, 0, 50)]);
  assert.deepEqual(
    kept.map((f) => f.time - T0),
    [0, 2000],
  );
});

test('a fix implying over 120 km/h is dropped, and the next is measured from the last that counted', () => {
  // 1 km in 10 s is 360 km/h; the fix after it, 100 m from the start in 20 s, is 18 km/h.
  const kept = keptFixes([fix(0), fix(10, 1000, 0), fix(20, 100, 0)]);
  assert.deepEqual(
    kept.map((f) => f.time - T0),
    [0, 20000],
  );
  // 150 km/h is over the limit by a small margin and is dropped too.
  const fast = keptFixes([fix(0), fix(1, 150 / 3.6, 0), fix(2, 5, 0)]);
  assert.deepEqual(
    fast.map((f) => f.time - T0),
    [0, 2000],
  );
});

test('under 120 km/h counts; a fix with no time passing is dropped', () => {
  const metresPerSecond = 120 / 3.6;
  const kept = keptFixes([fix(0), fix(1, metresPerSecond * 0.99, 0), fix(1, 0, 0), fix(1)]);
  assert.equal(kept.length, 2);
});

test('fixes that arrive out of order are used in the order they were taken', () => {
  const kept = keptFixes([fix(0), fix(10, 100, 0), fix(5, 50, 0), fix(15, 150, 0)]);
  assert.deepEqual(
    kept.map((f) => f.time - T0),
    [0, 5000, 10000, 15000],
  );
  const summary = summarize([fix(0), fix(10), fix(5), fix(15)], [], T0, T0 + 15_000);
  assert.deepEqual(summary.gaps, []);
});

test('three fast fixes that agree with each other start a new anchor, dropping the wild first ones', () => {
  // The first fix is 5 km out; everything after it is tight, so the first is the wrong one.
  const kept = keptFixes([fix(0, 5000, 0), fix(1), fix(2, 10, 0), fix(3, 20, 0), fix(4, 30, 0)]);
  assert.deepEqual(
    kept.map((f) => f.time - T0),
    [1000, 2000, 3000, 4000],
  );
});

test('after a good start, a lasting jump is taken as the true position, and what came before stays', () => {
  const good = [fix(0), fix(1, 10, 0), fix(2, 20, 0), fix(3, 30, 0)];
  const jumped = [fix(4, 5000, 0), fix(5, 5010, 0), fix(6, 5020, 0)];
  assert.equal(keptFixes([...good, ...jumped]).length, 7);
});

test('one or two wild fixes in the middle of a ride do not move the anchor', () => {
  const kept = keptFixes([fix(0), fix(1, 10, 0), fix(2, 5000, 0), fix(3, 5010, 0), fix(4, 30, 0)]);
  assert.deepEqual(
    kept.map((f) => f.time - T0),
    [0, 1000, 4000],
  );
});

test('the length of a path is the sum of its legs', () => {
  const fixes = [fix(0), fix(10, 0, 100), fix(20, 100, 100)];
  assert.ok(Math.abs(pathLengthM(fixes) - 200) < 1);
  assert.equal(pathLengthM([fix(0)]), 0);
  assert.equal(pathLengthM([]), 0);
});

test('standing in a hinto adds no distance, but the leg that leaves it does', () => {
  // 20 s standing with a wobble of 10 m, then 100 m on.
  const fixes = [
    fix(0),
    fix(4, 10, 0),
    fix(8, 0, 10),
    fix(12, 10, 10),
    fix(20, 0, 0),
    fix(30, 100, 0),
  ];
  const hintos = hintosOf(fixes);
  assert.equal(hintos.length, 1);
  assert.ok(pathLengthM(fixes) > 130);
  assert.ok(Math.abs(pathLengthM(fixes, hintos) - 100) < 1);
});

test('a hinto is 8 s or more within 25 m of where it began', () => {
  const fixes = [fix(0), fix(4, 10, 0), fix(8, 20, 0), fix(9, 200, 0), fix(10, 400, 0)];
  const hintos = hintosOf(fixes);
  assert.equal(hintos.length, 1);
  assert.equal(hintos[0].from, T0);
  assert.equal(hintos[0].to, T0 + 8000);
});

test('7 s is no hinto, and 26 m away ends one', () => {
  assert.equal(hintosOf([fix(0), fix(7, 1, 0)]).length, 0);
  const fixes = [fix(0), fix(9, 5, 0), fix(20, 26, 0), fix(31, 27, 0)];
  const hintos = hintosOf(fixes);
  assert.deepEqual(
    hintos.map((h) => [h.from - T0, h.to - T0]),
    [
      [0, 9000],
      [20000, 31000],
    ],
  );
});

test('24.9 m is still within the hinto, and 25.1 m is not', () => {
  assert.equal(hintosOf([fix(0), fix(4, 24.9, 0), fix(8, 0, 0)]).length, 1);
  const out = hintosOf([fix(0), fix(4, 25.1, 0), fix(8, 25.1, 0), fix(12, 25.1, 0)]);
  assert.deepEqual(
    out.map((h) => [h.from - T0, h.to - T0]),
    [[4000, 12000]],
  );
});

test('a ride that never stops has no hintos', () => {
  const fixes = Array.from({ length: 30 }, (_, i) => fix(i, i * 30, 0));
  assert.deepEqual(hintosOf(fixes), []);
});

test('a crawl of short stops a few seconds apart is one hinto', () => {
  const fixes = [fix(0), fix(4), fix(8), fix(12, 30, 0), fix(16, 30, 0), fix(20, 30, 0)];
  const hintos = hintosOf(fixes);
  assert.deepEqual(
    hintos.map((h) => [h.from - T0, h.to - T0]),
    [[0, 20000]],
  );
});

test('a 30 m spike in a long stand does not split it in two', () => {
  const fixes = [fix(0), fix(4), fix(8), fix(12), fix(13, 30, 0), fix(16), fix(20), fix(24)];
  const hintos = hintosOf(fixes);
  assert.deepEqual(
    hintos.map((h) => [h.from - T0, h.to - T0]),
    [[0, 24000]],
  );
});

test('a gap is more than 5 s between fixes, or since the last fix', () => {
  const fixes = [fix(0), fix(5), fix(11), fix(12)];
  const gaps = silentGaps(fixes, T0, T0 + 20_000);
  assert.deepEqual(
    gaps.map((g) => [g.from - T0, g.to - T0]),
    [
      [5000, 11000],
      [12000, 20000],
    ],
  );
  assert.deepEqual(silentGaps(fixes, T0, T0 + 17_000), [
    { from: T0 + 5000, to: T0 + 11000, reasons: ['silent'] },
  ]);
});

test('the wait for the first fix is a gap, and so is a phone that never answers', () => {
  const late = silentGaps([fix(10), fix(11)], T0, T0 + 11_000);
  assert.deepEqual(late, [{ from: T0, to: T0 + 10_000, reasons: ['silent'] }]);
  const never = silentGaps([], T0, T0 + 60_000);
  assert.deepEqual(never, [{ from: T0, to: T0 + 60_000, reasons: ['silent'] }]);
  assert.deepEqual(silentGaps([], T0, T0 + 5_000), []);
});

test('the silence clock starts again when a pause ends', () => {
  const pause = { from: T0 + 10_000, to: T0 + 40_000, reasons: ['paused'] };
  const fixes = [fix(0), fix(4), fix(8), fix(10), fix(40), fix(44)];
  assert.deepEqual(silentGaps(fixes, T0, T0 + 44_000, [pause]), []);
  // The phone never answers after the Resume: that wait counts from the Resume.
  const after = silentGaps([fix(0), fix(4), fix(8)], T0, T0 + 60_000, [pause]);
  assert.deepEqual(after, [{ from: T0 + 40_000, to: T0 + 60_000, reasons: ['silent'] }]);
});

test('every fix the phone reported keeps it answering, even one that is ignored', () => {
  const summary = summarize([fix(0), fix(4, 0, 0, 90), fix(8)], [], T0, T0 + 8000);
  assert.equal(summary.gaps.length, 0);
  assert.equal(summary.fixCount, 3);
  assert.equal(summary.keptCount, 2);
});

test('overlapping or touching gaps merge, with both reasons', () => {
  const merged = mergeGaps([
    { from: T0 + 30_000, to: T0 + 40_000, reasons: ['silent'] },
    { from: T0 + 5_000, to: T0 + 32_000, reasons: ['hidden'] },
    { from: T0 + 100_000, to: T0 + 110_000, reasons: ['resumed'] },
    { from: T0 + 110_000, to: T0 + 120_000, reasons: ['silent'] },
  ]);
  assert.deepEqual(merged, [
    { from: T0 + 5_000, to: T0 + 40_000, reasons: ['hidden', 'silent'] },
    { from: T0 + 100_000, to: T0 + 120_000, reasons: ['resumed', 'silent'] },
  ]);
});

test('moving and standing minutes, with the lost time taken out of both', () => {
  // 0–60 s standing (10 m about), 60–120 s moving at 10 m/s, 120–180 s the screen is off.
  const fixes = [];
  for (let s = 0; s <= 60; s += 2) fixes.push(fix(s, 0, s % 4));
  for (let s = 64; s <= 120; s += 2) fixes.push(fix(s, (s - 60) * 10, 0));
  const hidden = { from: T0 + 120_000, to: T0 + 180_000, reasons: ['hidden'] };
  const summary = summarize(fixes, [hidden], T0, T0 + 180_000);
  assert.equal(summary.hintos.length, 1);
  assert.equal(Math.round(summary.standingSeconds), 60);
  assert.equal(Math.round(summary.lostSeconds), 60);
  assert.equal(Math.round(summary.movingSeconds), 60);
  // 56 s at 10 m/s, plus the wobble while standing.
  assert.ok(summary.distanceM > 560 && summary.distanceM < 700, String(summary.distanceM));
  assert.equal(summary.gaps.length, 1);
});

test('a hinto that spans a gap counts only the time the phone was recording', () => {
  const fixes = [0, 4, 8, 10, 70, 74, 78, 80].map((s) => fix(s));
  const hidden = { from: T0 + 10_000, to: T0 + 70_000, reasons: ['hidden'] };
  const summary = summarize(fixes, [hidden], T0, T0 + 80_000);
  assert.equal(summary.hintos.length, 1);
  assert.equal(Math.round(summary.standingSeconds), 20);
  assert.equal(Math.round(summary.lostSeconds), 60);
  assert.equal(Math.round(summary.movingSeconds), 0);
});

test('a Stop and Resume is a pause, left out of the lost time and of moving', () => {
  const fixes = [fix(0), fix(4), fix(8), fix(10), fix(40), fix(44), fix(48), fix(50)];
  const pause = { from: T0 + 10_000, to: T0 + 40_000, reasons: ['paused'] };
  const summary = summarize(fixes, [pause], T0, T0 + 50_000);
  assert.equal(Math.round(summary.pausedSeconds), 30);
  assert.equal(Math.round(summary.lostSeconds), 0);
  assert.deepEqual(summary.gaps, []);
  assert.equal(Math.round(summary.standingSeconds), 20);
  assert.equal(Math.round(summary.movingSeconds), 0);
});

test('the distance counts only the fixes that count', () => {
  const summary = summarize(
    [fix(0), fix(1, 10, 0), fix(2, 5000, 0), fix(3, 20, 0)],
    [],
    T0,
    T0 + 3000,
  );
  assert.equal(summary.fixCount, 4);
  assert.equal(summary.keptCount, 3);
  assert.ok(Math.abs(summary.distanceM - 20) < 0.5);
});

test('a gap logged before the start or after the end is clipped to the recording', () => {
  const early = { from: T0 - 30_000, to: T0 + 10_000, reasons: ['resumed'] };
  const summary = summarize([fix(0), fix(5)], [early], T0, T0 + 5000);
  assert.equal(Math.round(summary.lostSeconds), 5);
  const late = { from: T0 + 100_000, to: T0 + 110_000, reasons: ['hidden'] };
  const outside = summarize([fix(0), fix(5)], [late], T0, T0 + 5000);
  assert.equal(outside.lostSeconds, 0);
  assert.deepEqual(outside.gaps, []);
});

test('nothing recorded is zero everywhere', () => {
  const summary = summarize([], [], T0, T0);
  assert.equal(summary.distanceM, 0);
  assert.equal(summary.movingSeconds, 0);
  assert.equal(summary.standingSeconds, 0);
  assert.equal(summary.lostSeconds, 0);
  assert.equal(summary.pausedSeconds, 0);
  assert.deepEqual(summary.hintos, []);
  assert.deepEqual(summary.gaps, []);
});

test('the distance agrees with shared/utils/geo, whose haversine it repeats', () => {
  const pairs = [
    [
      [121.04, 14.7],
      [121.05, 14.71],
    ],
    [
      [121.04, 14.7],
      [121.04, 14.7],
    ],
    [
      [120.9, 14.4],
      [121.2, 14.8],
    ],
    [
      [121.0, 14.6],
      [-122.4, 37.8],
    ],
  ];
  for (const [a, b] of pairs) assert.equal(distanceM(a, b), haversine(a, b));
});
