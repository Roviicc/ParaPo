// The dot looking at what was just picked (src/commuter/dotLook.ts, the
// owner's ask of 2026-10-01): which way its eyes go, and where on the routes
// it looks.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/dot-look-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LOOK_PX, lookToward, nearestOnLines } from '../../src/commuter/dotLook.ts'

const here = [121.05, 14.7]
const m = 1 / 111_320

test('the eyes go the way on the ground: east right, north up, as the dot lies on the map', () => {
  assert.deepEqual(lookToward(here, [here[0] + 0.01, here[1]]), { x: LOOK_PX, y: 0 })
  assert.deepEqual(lookToward(here, [here[0] - 0.01, here[1]]), { x: -LOOK_PX, y: 0 })
  assert.deepEqual(lookToward(here, [here[0], here[1] + 0.01]), { x: 0, y: -LOOK_PX })
  assert.deepEqual(lookToward(here, [here[0], here[1] - 0.01]), { x: 0, y: LOOK_PX })
})

test('always as far as LOOK_PX, near or far, on the screen or off it', () => {
  for (const to of [[here[0] + 30 * m, here[1] + 40 * m], [here[0] + 0.3, here[1] - 0.2]]) {
    const { x, y } = lookToward(here, to)
    assert.ok(Math.abs(Math.hypot(x, y) - LOOK_PX) < 0.1, `${x},${y}`)
  }
})

test('a metre of longitude is shorter than one of latitude: north-east looks north-east', () => {
  // As many metres east as north, at this latitude.
  const to = [here[0] + (100 * m) / Math.cos((here[1] * Math.PI) / 180), here[1] + 100 * m]
  const { x, y } = lookToward(here, to)
  assert.ok(Math.abs(x + y) < 0.1, `${x},${y}`)
})

test('nothing to look toward when it is already there', () => {
  assert.equal(lookToward(here, [here[0] + 0.5 * m, here[1]]), null)
})

test('on the routes, the point nearest the dot, between their points too', () => {
  const across = [[here[0] - 0.01, here[1] + 0.001], [here[0] + 0.01, here[1] + 0.001]]
  const far = [[here[0] + 0.05, here[1]], [here[0] + 0.06, here[1]]]
  const p = nearestOnLines(here, [far, across])
  assert.ok(Math.abs(p[0] - here[0]) < 1e-9 && Math.abs(p[1] - (here[1] + 0.001)) < 1e-9, p.join())
  assert.equal(nearestOnLines(here, []), null)
  assert.deepEqual(nearestOnLines(here, [[[1, 2]]]), [1, 2])
})
