// The rules for a ride recorded on a phone (src/features/routes/model/ride-recording.ts):
// which fixes count, the distance, the hintos, the gaps and the moving and standing minutes.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/ride-recording-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { haversine } from '../../src/shared/utils/geo.ts';
import {
  AUTO_STOP_ARM_M,
  AUTO_STOP_RADIUS_M,
  BEARING_WINDOW_S,
  courseBearing,
  currentWay,
  distanceM,
  hintosOf,
  keptFixes,
  mergeGaps,
  pathLengthM,
  shouldAutoStop,
  silentGaps,
  summarize,
  waysOf,
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

// ---------------------------------------------------------------- ways, auto-stop, bearing

/** Metres east per `fix` unit, measured, so a distance below is the distance haversine gives. */
const PER_METRE = distanceM(fix(0).at, fix(0, 1000).at) / 1000;
/** A fix `s` seconds in, exactly `m` metres east (and `north` metres north) of the start by haversine. */
const at = (s, m, north = 0) => fix(s, m / PER_METRE, north);
/** Out along the road to `farM` and back to `backM`, a fix every 10 s and every 100 m. */
function loop(farM, backM = 0) {
  const fixes = [];
  let s = 0;
  for (let m = 0; m <= farM; m += 100, s += 10) fixes.push(at(s, m));
  for (let m = farM - 100; m >= backM; m -= 100, s += 10) fixes.push(at(s, m));
  return fixes;
}
const fromStart = (fixes, f) => Math.round(distanceM(fixes[0].at, f.at));
/** The contributor taps Pabalik 5 s after the fix at the far end of loop(farM). */
const returnAtFar = (farM) => ({ time: T0 + (farM / 100) * 10_000 + 5_000, to: 'return' });

test('a loop arms past 1 km with a switch to the return, and stops at the first fix within 300 m', () => {
  const fixes = loop(1500);
  const switches = [returnAtFar(1500)];
  const far = fixes.findIndex((f) => fromStart(fixes, f) === 1500);
  assert.equal(shouldAutoStop(fixes.slice(0, far + 1), switches), false);
  // On the way back: 400 m from the start has not stopped it.
  const at400 = fixes.findIndex((f, i) => i > far && fromStart(fixes, f) === 400);
  assert.equal(shouldAutoStop(fixes.slice(0, at400 + 1), switches), false);
  // The next fix, just inside 300 m of the start, stops it.
  const inside = at(fixes[at400].time / 1000 - T0 / 1000 + 10, 299.9);
  assert.equal(shouldAutoStop([...fixes.slice(0, at400 + 1), inside], switches), true);
  assert.equal(shouldAutoStop(fixes, switches), true);
});

test('a one-way ride never stops, and neither does a ride that returns without switching', () => {
  const oneWay = [];
  for (let i = 0; i <= 40; i++) oneWay.push(at(i * 10, i * 100));
  assert.equal(shouldAutoStop(oneWay, []), false);
  assert.equal(shouldAutoStop(loop(1500), []), false);
});

test('a switch to the return without ever being 1 km away never stops', () => {
  assert.equal(shouldAutoStop(loop(900), [returnAtFar(900)]), false);
  assert.equal(AUTO_STOP_ARM_M, 1000);
});

test('arming needs more than 1 km: 999.5 m is not enough, 1001 m is', () => {
  const near = [at(0, 0), at(10, 999.5), at(20, 100), at(30, 50)];
  const far = [at(0, 0), at(10, 1001), at(20, 100), at(30, 50)];
  const switches = [{ time: T0 + 15_000, to: 'return' }];
  assert.equal(shouldAutoStop(near, switches), false);
  assert.equal(shouldAutoStop(far, switches), true);
});

test('it arms when the switch comes after the 1 km, and not for a fix before the switch', () => {
  const fixes = [at(0, 0), at(10, 1200), at(20, 1100), at(30, 200)];
  // Switched only after the fix at 200 m: that fix came before the switch and must not stop it.
  assert.equal(shouldAutoStop(fixes, [{ time: T0 + 35_000, to: 'return' }]), false);
  assert.equal(shouldAutoStop(fixes, [{ time: T0 + 25_000, to: 'return' }]), true);
});

test('a late tap on the way back still stops, measured from the start and not from the tap', () => {
  const fixes = loop(1500);
  const far = fixes.findIndex((f) => fromStart(fixes, f) === 1500);
  const at600 = fixes.findIndex((f, i) => i > far && fromStart(fixes, f) === 600);
  const switches = [{ time: fixes[at600].time + 5_000, to: 'return' }];
  const at500 = fixes.findIndex((f, i) => i > far && fromStart(fixes, f) === 500);
  assert.equal(shouldAutoStop(fixes.slice(0, at500 + 1), switches), false);
  const inside = at(fixes[at500].time / 1000 - T0 / 1000 + 10, 299.9);
  assert.equal(shouldAutoStop([...fixes.slice(0, at500 + 1), inside], switches), true);
});

test('flipping back is an undo: a mistaken tap flipped back arms nothing and leaves no end point', () => {
  const fixes = loop(1500);
  const mistaken = [
    { time: T0 + 5_000, to: 'return' },
    { time: T0 + 6_000, to: 'outbound' },
  ];
  assert.equal(shouldAutoStop(fixes, mistaken), false);
  const ways = waysOf(fixes, mistaken);
  assert.equal(ways.endPoint, null);
  assert.deepEqual(
    ways.markers.map((m) => m.to),
    ['return', 'outbound'],
  );
  // Flipped back after the far end: the way is outbound again, so the return no longer counts.
  assert.equal(
    shouldAutoStop(fixes, [returnAtFar(1500), { time: T0 + 200_000, to: 'outbound' }]),
    false,
  );
});

test('switching to the return again arms it again, from the latest switch', () => {
  const fixes = loop(1500);
  const switches = [
    returnAtFar(1500),
    { time: T0 + 170_000, to: 'outbound' },
    { time: T0 + 175_000, to: 'return' },
  ];
  assert.equal(shouldAutoStop(fixes, switches), true);
  // The latest switch comes after every fix: nothing after it can stop the ride yet.
  assert.equal(
    shouldAutoStop(fixes, [
      ...switches,
      { time: T0 + 900_000, to: 'outbound' },
      { time: T0 + 901_000, to: 'return' },
    ]),
    false,
  );
});

test('switches given out of order are applied in time order', () => {
  const fixes = loop(1500);
  const backToOutbound = { time: T0 + 200_000, to: 'outbound' };
  assert.equal(shouldAutoStop(fixes, [backToOutbound, returnAtFar(1500)]), false);
  const six = [at(0, 0), at(10, 100), at(20, 200), at(30, 300), at(40, 400), at(50, 500)];
  const ways = waysOf(six, [
    { time: T0 + 35_000, to: 'outbound' },
    { time: T0 + 25_000, to: 'return' },
  ]);
  assert.deepEqual(
    ways.markers.map((m) => m.to),
    ['return', 'outbound'],
  );
  assert.equal(ways.endPoint, null);
});

test('a return tapped already inside 300 m stops on the next fix', () => {
  const out = [at(0, 0), at(10, 1200), at(20, 250)];
  const switches = [{ time: T0 + 25_000, to: 'return' }];
  assert.equal(shouldAutoStop(out, switches), false);
  assert.equal(shouldAutoStop([...out, at(30, 240)], switches), true);
});

test('the fix a switch is made on does not stop the ride, and neither do fixes before it is 1 km out', () => {
  const out = [at(0, 0), at(10, 1200), at(20, 250)];
  const atFix = [{ time: T0 + 20_000, to: 'return' }];
  assert.equal(shouldAutoStop(out, atFix), false);
  assert.equal(shouldAutoStop([...out, at(30, 240)], atFix), true);
  // Pabalik tapped at the start: the early fixes near it are not the way home.
  const early = [{ time: T0 + 5_000, to: 'return' }];
  const fixes = [at(0, 0), at(10, 100), at(20, 1200)];
  assert.equal(shouldAutoStop(fixes, early), false);
  assert.equal(shouldAutoStop([...fixes, at(30, 250)], early), true);
});

test('299 m stops, 301 m does not, and the edge sits at 300 m', () => {
  const out = [at(0, 0), at(10, 500), at(20, 1100)];
  const switches = [{ time: T0 + 25_000, to: 'return' }];
  const backTo = (m) => [...out, at(30, 700), at(40, m)];
  assert.equal(shouldAutoStop(backTo(299), switches), true);
  assert.equal(shouldAutoStop(backTo(AUTO_STOP_RADIUS_M - 0.01), switches), true);
  assert.equal(shouldAutoStop(backTo(AUTO_STOP_RADIUS_M + 0.01), switches), false);
  assert.equal(shouldAutoStop(backTo(301), switches), false);
});

test('ways: the outbound and return lines meet at the switch fix, which is the route end', () => {
  const fixes = [at(0, 0), at(10, 100), at(20, 200), at(30, 100), at(40, 0)];
  const ways = waysOf(fixes, [{ time: T0 + 24_000, to: 'return' }]);
  assert.equal(ways.outboundLines.length, 1);
  assert.equal(ways.returnLines.length, 1);
  assert.deepEqual(ways.outboundLines[0], [fixes[0].at, fixes[1].at, fixes[2].at]);
  assert.deepEqual(ways.returnLines[0], [fixes[2].at, fixes[3].at, fixes[4].at]);
  assert.deepEqual(ways.markers, [{ time: T0 + 24_000, at: fixes[2].at, to: 'return' }]);
  assert.deepEqual(ways.endPoint, fixes[2].at);
});

test('ways: no switch is all outbound with no marker and no end point', () => {
  const fixes = [at(0, 0), at(10, 100), at(20, 200)];
  assert.deepEqual(waysOf(fixes, []), {
    outboundLines: [[fixes[0].at, fixes[1].at, fixes[2].at]],
    returnLines: [],
    markers: [],
    endPoint: null,
  });
});

test('ways: switching back makes a second outbound line, and the end point is the latest switch to the return', () => {
  const fixes = [at(0, 0), at(10, 100), at(20, 200), at(30, 300), at(40, 400), at(50, 500)];
  const ways = waysOf(fixes, [
    { time: T0 + 20_000, to: 'return' },
    { time: T0 + 40_000, to: 'outbound' },
    { time: T0 + 45_000, to: 'outbound' }, // already outbound: no marker
  ]);
  assert.equal(ways.outboundLines.length, 2);
  assert.equal(ways.returnLines.length, 1);
  assert.deepEqual(ways.returnLines[0], [fixes[2].at, fixes[3].at, fixes[4].at]);
  assert.deepEqual(ways.outboundLines[1], [fixes[4].at, fixes[5].at]);
  assert.deepEqual(
    ways.markers.map((m) => m.to),
    ['return', 'outbound'],
  );
  // On the outbound way now, so there is no end point.
  assert.equal(ways.endPoint, null);
  const again = waysOf(fixes, [
    { time: T0 + 20_000, to: 'return' },
    { time: T0 + 30_000, to: 'outbound' },
    { time: T0 + 40_000, to: 'return' },
  ]);
  assert.deepEqual(again.endPoint, fixes[4].at);
});

test('ways: a switch between fixes sits on the last fix before it, and one before any sits on the first', () => {
  const fixes = [at(0, 0), at(10, 100), at(20, 200)];
  assert.deepEqual(waysOf(fixes, [{ time: T0 + 19_000, to: 'return' }]).endPoint, fixes[1].at);
  assert.deepEqual(waysOf(fixes, [{ time: T0 - 5_000, to: 'return' }]).endPoint, fixes[0].at);
  assert.equal(waysOf([], [{ time: T0, to: 'return' }]).endPoint, null);
  // A switch at the very time of a fix sits on that fix.
  assert.deepEqual(waysOf(fixes, [{ time: T0 + 10_000, to: 'return' }]).endPoint, fixes[1].at);
});

/** A repeatable stream of independent normal numbers (mulberry32 and Box-Muller). */
function gaussians(seed) {
  let state = seed;
  const uniform = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
}
/** The smallest angle between two bearings, in degrees. */
const angleBetween = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
/** Walk `bearingFn` along growing prefixes of the fixes, as the screen does, one call per fix. */
function headings(fixes, start = null) {
  const out = [];
  let heading = start;
  for (let i = 1; i <= fixes.length; i++) {
    heading = courseBearing(fixes.slice(0, i), heading);
    out.push(heading);
  }
  return out;
}

test('currentWay: outbound with no switch, the last real flip otherwise', () => {
  assert.equal(currentWay([]), 'outbound');
  assert.equal(currentWay([{ time: T0, to: 'return' }]), 'return');
  // A flip and a flip back is outbound again; a switch to the way already on changes nothing.
  assert.equal(
    currentWay([
      { time: T0, to: 'return' },
      { time: T0 + 1000, to: 'outbound' },
    ]),
    'outbound',
  );
  assert.equal(
    currentWay([
      { time: T0, to: 'return' },
      { time: T0 + 1000, to: 'return' },
    ]),
    'return',
  );
  // Out of order: sorted by time first.
  assert.equal(
    currentWay([
      { time: T0 + 2000, to: 'outbound' },
      { time: T0, to: 'return' },
    ]),
    'outbound',
  );
  assert.equal(
    currentWay([
      { time: T0 + 2000, to: 'return' },
      { time: T0, to: 'outbound' },
    ]),
    'return',
  );
  // It agrees with where the ride is armed to stop.
  assert.equal(currentWay([{ time: T0, to: 'outbound' }]), 'outbound');
});

test('bearing: straight at 15 km/h gives the true heading in every direction', () => {
  const metresPerSecond = 15 / 3.6;
  const ride = (dx, dy) => {
    const fixes = [];
    for (let s = 0; s <= 30; s++)
      fixes.push(at(s, dx * s * metresPerSecond, dy * s * metresPerSecond));
    return courseBearing(fixes, null);
  };
  assert.ok(Math.abs(ride(1, 0) - 90) < 0.5);
  assert.ok(Math.abs(ride(-1, 0) - 270) < 0.5);
  assert.ok(Math.abs(ride(0, 1) - 0) < 0.5 || Math.abs(ride(0, 1) - 360) < 0.5);
  assert.ok(Math.abs(ride(0, -1) - 180) < 0.5);
});

test('bearing: a 15 km/h ride with 2 m of noise stays within 10 degrees of the true heading', () => {
  // The first seed tried (6.8 degrees); over 200 seeds about 7% of 90 s rides stray past 10 once.
  const noise = gaussians(1);
  const metresPerSecond = 15 / 3.6;
  const fixes = [];
  for (let s = 0; s <= 90; s++) {
    fixes.push(at(s, s * metresPerSecond + 2 * noise(), 2 * noise()));
  }
  const all = headings(fixes);
  const worst = Math.max(...all.slice(11).map((h) => angleBetween(h, 90)));
  assert.ok(worst < 10, `worst error ${worst.toFixed(1)} degrees`);
});

test('bearing: a 90 degree corner at 20 km/h reaches the new direction within 10 s', () => {
  const metresPerSecond = 20 / 3.6;
  const fixes = [];
  for (let s = 0; s <= 30; s++) fixes.push(at(s, s * metresPerSecond));
  for (let s = 1; s <= 20; s++) fixes.push(at(30 + s, 30 * metresPerSecond, s * metresPerSecond));
  const all = headings(fixes);
  const bearingAt = (secondsPastCorner) => all[30 + secondsPastCorner];
  assert.ok(angleBetween(bearingAt(0), 90) < 1);
  assert.ok(angleBetween(bearingAt(10), 0) < 10, `${bearingAt(10)} 10 s after the corner`);
  assert.ok(angleBetween(bearingAt(20), 0) < 1);
});

test('bearing: standing still with 8 m of noise per axis keeps the heading it had', () => {
  // Two minutes at a fix a second, independent noise of 8 m per axis, and a creep of 0.1 m/s. The
  // seed is the first one tried; it is not picked.
  const noise = gaussians(1);
  const fixes = [];
  for (let s = 0; s <= 120; s++) fixes.push(at(s, 0.1 * s + 8 * noise(), 8 * noise()));
  const all = headings(fixes, 77);
  let turns = 0;
  let before = 77;
  for (const heading of all) {
    if (angleBetween(heading, before) > 10) turns++;
    before = heading;
  }
  assert.ok(turns <= 1, `${turns} turns over 10 degrees`);
});

test('bearing: with too few fixes in the window, or a half short of two, the heading is the previous', () => {
  // Three fixes in the window, however far apart they are.
  assert.equal(courseBearing([at(0, 0), at(5, 50), at(10, 100)], 7), 7);
  // Four fixes, but one in the older half.
  assert.equal(courseBearing([at(0, 0), at(8, 80), at(9, 90), at(10, 100)], 7), 7);
  // Two and two: a heading.
  assert.ok(Math.abs(courseBearing([at(0, 0), at(1, 0), at(9, 100), at(10, 100)], 7) - 90) < 0.5);
  assert.equal(courseBearing([], 45), 45);
  assert.equal(courseBearing([at(0, 0)], null), null);
});

test('bearing: the halves must sit 20 m apart, and only fixes from the last 10 s count', () => {
  const halves = (apartM) => [at(0, 0), at(1, 0), at(9, apartM), at(10, apartM)];
  assert.equal(BEARING_WINDOW_S, 10);
  assert.equal(courseBearing(halves(19), 7), 7);
  assert.ok(Math.abs(courseBearing(halves(20.5), 7) - 90) < 0.5);
  // A fix 14 s old is outside the window: the four recent ones are all standing.
  const stale = [at(0, 0), at(11, 100), at(12, 100), at(13, 100), at(14, 100)];
  assert.equal(courseBearing(stale, 7), 7);
  // A fix exactly 10 s old is inside it.
  const edge = [at(0, 0), at(1, 0), at(9, 30), at(10, 30)];
  assert.ok(Math.abs(courseBearing(edge, 7) - 90) < 0.5);
  assert.equal(courseBearing([at(0, 0), at(1, 0), at(11, 30), at(12, 30)], 7), 7);
});
