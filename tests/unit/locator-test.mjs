// The LocatorButton's rules (src/features/locator/use-locator.ts, the owner's
// 3870:5408, 2026-10-01): the button's look for where the camera is, where a
// tap takes it, the zooms its "1000 ft" and "200 ft" come to, the phone's
// compass read; and the speed and heading worked out from the fixes when the
// browser gives neither.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/locator-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCURACY_MAX_M,
  ACCURACY_MIN_M,
  COMPASS_SCALE_M,
  TRACKED_SCALE_M,
  circleRadius,
  afterTap,
  apart,
  bearing,
  compassHeading,
  modeFor,
  motionFrom,
  indicatorScale,
  trackedZoom,
} from '../../src/features/locator/use-locator.ts';
import { M_PER_DEG, SCALE_PX, metresPerPixel, zoomForScale } from '../../src/shared/utils/geo.ts';

/** A point `east` metres east and `north` metres north of 121.05, 14.70: sample geometry, not the map. */
const at = (east, north = 0) => [
  121.05 + east / (M_PER_DEG * Math.cos((14.7 * Math.PI) / 180)),
  14.7 + north / M_PER_DEG,
];
const fix = (point, time, accuracy = 5) => ({ at: point, accuracy, time });

test('the button: LocationOff with no fix, TrackOwnLocation until the camera is on it', () => {
  assert.equal(modeFor('free', false), 'LocationOff');
  assert.equal(modeFor('tracked', false), 'LocationOff');
  assert.equal(modeFor('compass', false), 'LocationOff');
  assert.equal(modeFor('free', true), 'TrackOwnLocation');
  assert.equal(modeFor('tracked', true), 'TrackedLocation');
  assert.equal(modeFor('compass', true), 'TracksTheMapBasedOnCompassFacing');
});

test('a tap: to the visitor, then round tracked ⇄ compass on a phone', () => {
  assert.equal(afterTap('free', true), 'tracked');
  assert.equal(afterTap('tracked', true), 'compass');
  assert.equal(afterTap('compass', true), 'tracked');
});

test('a tap with no compass (a laptop) stays tracked: it only comes back to the visitor', () => {
  assert.equal(afterTap('free', false), 'tracked');
  assert.equal(afterTap('tracked', false), 'tracked');
});

test('zoom: the scale bar reads 200 m per 100 px tracked and in the compass view; the circle 40 to 80 m', () => {
  const tracked = zoomForScale(TRACKED_SCALE_M, 14.7);
  // Measured back with the map's own scale: 100 px come out as asked.
  assert.ok(Math.abs(metresPerPixel(14.7, tracked) * SCALE_PX - TRACKED_SCALE_M) < 0.01);
  assert.equal(zoomForScale(COMPASS_SCALE_M, 14.7), tracked);
  assert.ok(tracked > 15 && tracked < 15.5, `${tracked}`);
  assert.equal(circleRadius(3), ACCURACY_MIN_M);
  assert.equal(circleRadius(60), 60);
  assert.equal(circleRadius(1000), ACCURACY_MAX_M);
});

test("compass: Safari's own heading, else an absolute alpha turned round, and the screen's turn added", () => {
  assert.equal(compassHeading({ alpha: 10, absolute: false, webkitCompassHeading: 45 }, 0), 45);
  assert.equal(compassHeading({ alpha: 90, absolute: true }, 0), 270);
  assert.equal(compassHeading({ alpha: 0, absolute: true }, 0), 0);
  // Held sideways, its top turned right: the screen faces 90° further round.
  assert.equal(compassHeading({ alpha: 0, absolute: true }, 90), 90);
  assert.equal(compassHeading({ alpha: null, absolute: false, webkitCompassHeading: 300 }, 90), 30);
});

test('compass: an alpha relative to wherever the phone started is no heading', () => {
  assert.equal(compassHeading({ alpha: 120, absolute: false }, 0), null);
  assert.equal(compassHeading({ alpha: null, absolute: true }, 0), null);
});

test('apart: the short way round', () => {
  assert.equal(apart(350, 10), 20);
  assert.equal(apart(10, 350), 20);
  assert.equal(apart(0, 180), 180);
  assert.equal(apart(90, 90), 0);
});

test('bearing: degrees clockwise from north, always from 0 up to 360', () => {
  for (const [to, expected] of [
    [at(0, 100), 0],
    [at(100, 100), 45],
    [at(100, 0), 90],
    [at(0, -100), 180],
    [at(-100, 0), 270],
  ]) {
    const b = bearing(at(0), to);
    assert.ok(b >= 0 && b < 360, `${b}`);
    assert.ok(apart(b, expected) < 0.05, `${b}° for ${expected}°`);
  }
});

test('motion: nothing to go on is standing still, keeping the last heading', () => {
  assert.deepEqual(motionFrom([], 123), { speed: 0, heading: 123 });
  assert.deepEqual(motionFrom([fix(at(0), 0)], null), { speed: 0, heading: null });
});

test('motion: fixes under 2 s apart are not read as a sprint', () => {
  // 50 m in a second would be 180 km/h: GPS jitter, not the visitor.
  assert.deepEqual(motionFrom([fix(at(0), 0), fix(at(0, 50), 1000)], 90), {
    speed: 0,
    heading: 90,
  });
});

test('motion: a walk north gives its speed and faces north', () => {
  const { speed, heading } = motionFrom([fix(at(0), 0), fix(at(0, 14), 10_000)], null);
  assert.ok(Math.abs(speed - 1.4) < 0.01, `${speed} m/s`);
  assert.ok(apart(heading, 0) < 0.05, `${heading}°`);
});

test('motion: measured against the newest fix at least 2 s older, not the first', () => {
  // From the first fix it would be 104 m in 10 s; from the fix 2 s back it is 4 m in 2 s.
  const fixes = [fix(at(0), 0), fix(at(0, 100), 8_000), fix(at(0, 104), 10_000)];
  const { speed, heading } = motionFrom(fixes, null);
  assert.ok(Math.abs(speed - 2) < 0.01, `${speed} m/s`);
  assert.ok(apart(heading, 0) < 0.05, `${heading}°`);
});

test('motion: a move within the jitter keeps the last heading, whatever its speed', () => {
  // 40 m accuracy: a move under 10 m (a quarter of it) could be the fix wandering.
  const wander = [fix(at(0), 0, 40), fix(at(4), 4_000, 40)];
  const moved = motionFrom(wander, 200);
  assert.ok(Math.abs(moved.speed - 1) < 0.01, `${moved.speed} m/s`);
  assert.equal(moved.heading, 200);
  assert.equal(motionFrom(wander, null).heading, null);
  // Past it, the heading is the move's own: east.
  const east = motionFrom([fix(at(0), 0, 40), fix(at(12), 4_000, 40)], 200);
  assert.ok(apart(east.heading, 90) < 0.05, `${east.heading}°`);
});

test('the dot and cone: full size from street level, smaller zoomed out, never under 54 %', () => {
  assert.equal(indicatorScale(18), 1);
  assert.equal(indicatorScale(16), 1);
  assert.ok(Math.abs(indicatorScale(14) - 0.77) < 1e-9, `${indicatorScale(14)}`);
  assert.equal(indicatorScale(12), 0.54);
  assert.equal(indicatorScale(8), 0.54);
  for (let z = 8; z < 18; z += 0.5)
    assert.ok(indicatorScale(z) <= indicatorScale(z + 0.5), `grows with zoom at ${z}`);
});

test("a tap to the visitor keeps the map's zoom, unless it is further out than 2 km", () => {
  const far = zoomForScale(2000, 14.7);
  const street = zoomForScale(200, 14.7);
  // The scale bar at 2 km or under: the visitor's height stays.
  assert.equal(trackedZoom(16, 14.7), 16);
  assert.equal(trackedZoom(far, 14.7), far);
  assert.equal(trackedZoom(19, 14.7), 19);
  // Further out (the city at 11): in to 200 m.
  assert.equal(trackedZoom(far - 0.01, 14.7), street);
  assert.equal(trackedZoom(11, 14.7), street);
});
