// The dot's gaze at what was just picked (src/commuter/dotGaze.ts, the
// owner's ask of 2026-10-01): which way it gazes, where its eyes go for it,
// and where on the routes it gazes.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/dot-gaze-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GAZE_PX, gazeOffset, gazeToward, nearestOnLines } from '../../src/commuter/dotGaze.ts'

const here = [121.05, 14.7]
const m = 1 / 111_320

test('it gazes the way on the ground, clockwise from north, as the beam heads', () => {
  assert.equal(gazeToward(here, [here[0], here[1] + 0.01]), 0)
  assert.equal(gazeToward(here, [here[0] + 0.01, here[1]]), 90)
  assert.equal(gazeToward(here, [here[0], here[1] - 0.01]), 180)
  assert.equal(gazeToward(here, [here[0] - 0.01, here[1]]), 270)
})

test('a metre of longitude is shorter than one of latitude: north-east is 45°', () => {
  const to = [here[0] + (100 * m) / Math.cos((here[1] * Math.PI) / 180), here[1] + 100 * m]
  assert.equal(gazeToward(here, to), 45)
})

test('nothing to gaze toward when it is already there', () => {
  assert.equal(gazeToward(here, [here[0] + 0.5 * m, here[1]]), null)
})

test('the eyes go GAZE_PX out, the dot lying north up: east right, north up', () => {
  assert.deepEqual(gazeOffset(90), { x: GAZE_PX, y: 0 })
  assert.deepEqual(gazeOffset(0), { x: 0, y: -GAZE_PX })
  assert.deepEqual(gazeOffset(180), { x: 0, y: GAZE_PX })
  assert.deepEqual(gazeOffset(270), { x: -GAZE_PX, y: 0 })
  for (let deg = 0; deg < 360; deg += 15) {
    const { x, y } = gazeOffset(deg)
    assert.ok(Math.abs(Math.hypot(x, y) - GAZE_PX) < 0.1, `${deg}°: ${x},${y}`)
  }
})

test('on the routes, the point nearest the dot, between their points too', () => {
  const across = [[here[0] - 0.01, here[1] + 0.001], [here[0] + 0.01, here[1] + 0.001]]
  const far = [[here[0] + 0.05, here[1]], [here[0] + 0.06, here[1]]]
  const p = nearestOnLines(here, [far, across])
  assert.ok(Math.abs(p[0] - here[0]) < 1e-9 && Math.abs(p[1] - (here[1] + 0.001)) < 1e-9, p.join())
  assert.equal(nearestOnLines(here, []), null)
  assert.deepEqual(nearestOnLines(here, [[[1, 2]]]), [1, 2])
})
