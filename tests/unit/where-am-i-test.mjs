// "Where am I"'s reading of the fixes (src/commuter/useWhereAmI.ts): the
// walking figure's pose from the speed, the sheet it faces from the heading,
// and the speed and heading worked out when the browser gives neither.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/where-am-i-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FLYING_FROM_MPS,
  STANDING_BELOW_MPS,
  bearing,
  facingFor,
  motionFrom,
  poseFor,
} from '../../src/commuter/useWhereAmI.ts'
import { M_PER_DEG } from '../../src/shared/geo/geo.ts'

/** A point `east` metres east and `north` metres north of 121.05, 14.70: sample geometry, not the map. */
const at = (east, north = 0) => [121.05 + east / (M_PER_DEG * Math.cos((14.7 * Math.PI) / 180)), 14.7 + north / M_PER_DEG]
const fix = (point, time, accuracy = 5) => ({ at: point, accuracy, time })
/** Degrees between two headings, the short way round. */
const apart = (a, b) => Math.abs(((((a - b) % 360) + 540) % 360) - 180)

test('pose: standing below a slow shuffle, walking at a walk, flying from 15 km/h', () => {
  assert.equal(poseFor(0), 'standing')
  assert.equal(poseFor(STANDING_BELOW_MPS - 0.01), 'standing')
  assert.equal(poseFor(STANDING_BELOW_MPS), 'walking')
  assert.equal(poseFor(1.4), 'walking')
  assert.equal(poseFor(FLYING_FROM_MPS - 0.01), 'walking')
  assert.equal(poseFor(FLYING_FROM_MPS), 'flying')
  assert.equal(poseFor(12), 'flying')
  assert.ok(Math.abs(FLYING_FROM_MPS * 3.6 - 15) < 1e-9, `${FLYING_FROM_MPS * 3.6} km/h`)
})

test('facing: a quarter of the compass each, north its back and east its right side', () => {
  for (const [heading, facing] of [
    [0, 'up'],
    [44.9, 'up'],
    [45, 'right'],
    [90, 'right'],
    [134.9, 'right'],
    [135, 'down'],
    [180, 'down'],
    [224.9, 'down'],
    [225, 'left'],
    [270, 'left'],
    [314.9, 'left'],
    [315, 'up'],
    [359.9, 'up'],
  ]) {
    assert.equal(facingFor(heading), facing, `${heading}°`)
  }
})

test('facing: a heading past a full turn, or below zero, wraps round', () => {
  assert.equal(facingFor(360), 'up')
  assert.equal(facingFor(450), 'right')
  assert.equal(facingFor(900), 'down')
  assert.equal(facingFor(-90), 'left')
  assert.equal(facingFor(-180), 'down')
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
  assert.equal(poseFor(speed), 'walking')
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
