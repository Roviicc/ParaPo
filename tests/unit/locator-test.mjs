// The LocatorButton's rules (src/commuter/useLocator.ts, the owner's
// 3870:5408, 2026-10-01): the button's look for where the camera is, where a
// tap takes it, the zooms its "1000 ft" and "200 ft" come to, the phone's
// compass read; and the speed and heading worked out from the fixes when the
// browser gives neither.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/locator-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COMPASS_ACROSS_M,
  TRACKED_ACROSS_M,
  afterTap,
  apart,
  bearing,
  compassHeading,
  modeFor,
  motionFrom,
  zoomShowing,
} from '../../src/commuter/useLocator.ts'
import { M_PER_DEG, metresPerPixel } from '../../src/shared/geo/geo.ts'

/** A point `east` metres east and `north` metres north of 121.05, 14.70: sample geometry, not the map. */
const at = (east, north = 0) => [121.05 + east / (M_PER_DEG * Math.cos((14.7 * Math.PI) / 180)), 14.7 + north / M_PER_DEG]
const fix = (point, time, accuracy = 5) => ({ at: point, accuracy, time })

test('the button: LocationOff with no fix, TrackOwnLocation until the camera is on it', () => {
  assert.equal(modeFor('free', false), 'LocationOff')
  assert.equal(modeFor('tracked', false), 'LocationOff')
  assert.equal(modeFor('compass', false), 'LocationOff')
  assert.equal(modeFor('free', true), 'TrackOwnLocation')
  assert.equal(modeFor('tracked', true), 'TrackedLocation')
  assert.equal(modeFor('compass', true), 'TracksTheMapBasedOnCompassFacing')
})

test('a tap: to the visitor, then round tracked ⇄ compass on a phone', () => {
  assert.equal(afterTap('free', true), 'tracked')
  assert.equal(afterTap('tracked', true), 'compass')
  assert.equal(afterTap('compass', true), 'tracked')
})

test('a tap with no compass (a laptop) stays tracked: it only comes back to the visitor', () => {
  assert.equal(afterTap('free', false), 'tracked')
  assert.equal(afterTap('tracked', false), 'tracked')
})

test('zoom: 1000 ft across a phone is street level, 200 ft some 2.3 zooms closer', () => {
  const tracked = zoomShowing(TRACKED_ACROSS_M, 14.7, 390)
  const compass = zoomShowing(COMPASS_ACROSS_M, 14.7, 390)
  // Measured back with the map's own scale: the span comes out as asked.
  assert.ok(Math.abs(metresPerPixel(14.7, tracked) * 390 - TRACKED_ACROSS_M) < 0.01)
  assert.ok(Math.abs(compass - tracked - Math.log2(5)) < 1e-9)
  assert.ok(tracked > 16 && tracked < 17.5, `${tracked}`)
  assert.ok(compass < 22, `${compass}: within MapLibre's zoom`)
})

test("compass: Safari's own heading, else an absolute alpha turned round, and the screen's turn added", () => {
  assert.equal(compassHeading({ alpha: 10, absolute: false, webkitCompassHeading: 45 }, 0), 45)
  assert.equal(compassHeading({ alpha: 90, absolute: true }, 0), 270)
  assert.equal(compassHeading({ alpha: 0, absolute: true }, 0), 0)
  // Held sideways, its top turned right: the screen faces 90° further round.
  assert.equal(compassHeading({ alpha: 0, absolute: true }, 90), 90)
  assert.equal(compassHeading({ alpha: null, absolute: false, webkitCompassHeading: 300 }, 90), 30)
})

test('compass: an alpha relative to wherever the phone started is no heading', () => {
  assert.equal(compassHeading({ alpha: 120, absolute: false }, 0), null)
  assert.equal(compassHeading({ alpha: null, absolute: true }, 0), null)
})

test('apart: the short way round', () => {
  assert.equal(apart(350, 10), 20)
  assert.equal(apart(10, 350), 20)
  assert.equal(apart(0, 180), 180)
  assert.equal(apart(90, 90), 0)
})

test('bearing: degrees clockwise from north, always from 0 up to 360', () => {
  for (const [to, expected] of [
    [at(0, 100), 0],
    [at(100, 100), 45],
    [at(100, 0), 90],
    [at(0, -100), 180],
    [at(-100, 0), 270],
  ]) {
    const b = bearing(at(0), to)
    assert.ok(b >= 0 && b < 360, `${b}`)
    assert.ok(apart(b, expected) < 0.05, `${b}° for ${expected}°`)
  }
})

test('motion: nothing to go on is standing still, keeping the last heading', () => {
  assert.deepEqual(motionFrom([], 123), { speed: 0, heading: 123 })
  assert.deepEqual(motionFrom([fix(at(0), 0)], null), { speed: 0, heading: null })
})

test('motion: fixes under 2 s apart are not read as a sprint', () => {
  // 50 m in a second would be 180 km/h: GPS jitter, not the visitor.
  assert.deepEqual(motionFrom([fix(at(0), 0), fix(at(0, 50), 1000)], 90), { speed: 0, heading: 90 })
})

test('motion: a walk north gives its speed and faces north', () => {
  const { speed, heading } = motionFrom([fix(at(0), 0), fix(at(0, 14), 10_000)], null)
  assert.ok(Math.abs(speed - 1.4) < 0.01, `${speed} m/s`)
  assert.ok(apart(heading, 0) < 0.05, `${heading}°`)
})

test('motion: measured against the newest fix at least 2 s older, not the first', () => {
  // From the first fix it would be 104 m in 10 s; from the fix 2 s back it is 4 m in 2 s.
  const fixes = [fix(at(0), 0), fix(at(0, 100), 8_000), fix(at(0, 104), 10_000)]
  const { speed, heading } = motionFrom(fixes, null)
  assert.ok(Math.abs(speed - 2) < 0.01, `${speed} m/s`)
  assert.ok(apart(heading, 0) < 0.05, `${heading}°`)
})

test('motion: a move within the jitter keeps the last heading, whatever its speed', () => {
  // 40 m accuracy: a move under 10 m (a quarter of it) could be the fix wandering.
  const wander = [fix(at(0), 0, 40), fix(at(4), 4_000, 40)]
  const moved = motionFrom(wander, 200)
  assert.ok(Math.abs(moved.speed - 1) < 0.01, `${moved.speed} m/s`)
  assert.equal(moved.heading, 200)
  assert.equal(motionFrom(wander, null).heading, null)
  // Past it, the heading is the move's own: east.
  const east = motionFrom([fix(at(0), 0, 40), fix(at(12), 4_000, 40)], 200)
  assert.ok(apart(east.heading, 90) < 0.05, `${east.heading}°`)
})
