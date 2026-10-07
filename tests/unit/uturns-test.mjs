// Where a routed line turns back on itself (src/features/studio/drawing/uturns.ts):
// the U-turns the studio rings in amber, from the router's segments alone.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/uturns-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findUTurns } from '../../src/features/studio/drawing/uturns.ts'

/** A point `m` metres east (and `n` north) of 121.05, 14.70: sample geometry, not the map. */
const at = (m, n = 0) => [121.05 + m / 107_700, 14.7 + n / 110_600]
const routed = (...coords) => ({ snap: 'snapped', coordinates: coords })

test('straight on through a point: no U-turn', () => {
  assert.deepEqual(findUTurns([routed(at(0), at(100)), routed(at(100), at(200))]), [])
})

test('back over the nodes it came in on: a U-turn at that point, its stub the doubled stretch', () => {
  const found = findUTurns([routed(at(0), at(50), at(100)), routed(at(100), at(50), at(0))])
  assert.equal(found.length, 1)
  assert.equal(found[0].point, 1)
  assert.ok(Math.abs(found[0].metres - 100) < 1, `${found[0].metres} m`)
  // The stub is what the studio paints amber: the stretch ridden twice.
  assert.deepEqual(found[0].stub, [at(0), at(50), at(100)])
})

test('opposite edges with no node between, the shorter along the longer: a U-turn', () => {
  const found = findUTurns([routed(at(0), at(100)), routed(at(100), at(40))])
  assert.equal(found.length, 1)
  assert.ok(Math.abs(found[0].metres - 60) < 1, `${found[0].metres} m`)
})

test('a sharp turn onto another road is not one', () => {
  // In along the east–west road, out at 160° up a side road: nearly opposite, not along it.
  assert.deepEqual(findUTurns([routed(at(0), at(100)), routed(at(100), at(40, 22))]), [])
})

test('round the block and back beside the point: a U-turn', () => {
  const found = findUTurns([routed(at(0), at(100)), routed(at(100), at(160), at(160, 40), at(110, 40), at(100, 10))])
  assert.equal(found.length, 1)
  assert.equal(found[0].point, 1)
})

test('a turn back shorter than a few metres is a click past a junction, not shown', () => {
  assert.deepEqual(findUTurns([routed(at(0), at(100)), routed(at(100), at(97))]), [])
})

test('freehand segments, stand-ins and malformed ones are skipped', () => {
  const back = routed(at(100), at(50), at(0))
  assert.deepEqual(findUTurns([{ snap: 'freehand', coordinates: [at(0), at(100)] }, back]), [])
  assert.deepEqual(findUTurns([routed(at(0), at(50), at(100)), back], (s) => s === back), [])
  assert.deepEqual(findUTurns([routed(at(0), at(100)), { snap: 'snapped', coordinates: 'nope' }]), [])
})
