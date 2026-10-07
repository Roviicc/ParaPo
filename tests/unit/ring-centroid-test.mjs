// A hotspot's point, the centroid of its box (src/features/routes/geo/ring.ts,
// ringCentroid). Its shoelace sums were taken from 0°, and at Manila's
// longitude they cancelled the digits that mattered: a 10 m box's centroid
// landed some 60 m away, outside its own box (review of 2026-10-03).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/ring-centroid-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { haversine } from '../../src/shared/utils/geo.ts'
import { pointInRing, ringCentroid } from '../../src/features/routes/geo/ring.ts'

// About 10 m by 8 m on Quirino Highway, 6-decimal corners as saved.
const box = [
  [121.040123, 14.700456],
  [121.040215, 14.700456],
  [121.040215, 14.700528],
  [121.040123, 14.700528],
]

test('a hotspot-sized box at Manila has its centroid in its middle', () => {
  const c = ringCentroid(box)
  assert.ok(haversine(c, [121.040169, 14.700492]) < 0.01, `${c}`)
  assert.ok(pointInRing(c, box))
})

test('a skewed hotspot-sized ring keeps its centroid inside, either winding', () => {
  const ring = [
    [121.0301, 14.6502],
    [121.03024, 14.65021],
    [121.03027, 14.65033],
    [121.03012, 14.6504],
    [121.03005, 14.65028],
  ]
  const a = ringCentroid(ring)
  const b = ringCentroid([...ring].reverse())
  assert.ok(pointInRing(a, ring), `${a}`)
  assert.ok(haversine(a, b) < 0.001)
})

test('a zero-area trace gets the average of its corners', () => {
  const line = [
    [121.04, 14.7],
    [121.0401, 14.7],
    [121.0402, 14.7],
  ]
  const c = ringCentroid(line)
  assert.ok(haversine(c, [121.0401, 14.7]) < 0.001, `${c}`)
  assert.deepEqual(ringCentroid([]), [0, 0])
})

// Review of 2026-10-03, finding 15: a bow-tie was saved as a hotspot.
test('an outline whose sides cross is found; a plain one, convex or not, is not', async () => {
  const { ringCrossesItself } = await import('../../src/features/routes/geo/ring.ts')
  assert.equal(ringCrossesItself(box), false)
  // Corners 2 and 3 swapped: the sides cross in the middle.
  assert.equal(ringCrossesItself([box[0], box[1], box[3], box[2]]), true)
  // An L-shaped outline, not convex, does not cross itself.
  const L = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]]
  assert.equal(ringCrossesItself(L), false)
  // A corner dragged past the far side.
  assert.equal(ringCrossesItself([[0, 0], [2, 0], [2, 2], [-1, -1], [0, 2]]), true)
  assert.equal(ringCrossesItself([[0, 0], [1, 0], [0, 1]]), false)
})

test('a corner repeated where it stands is not a crossing', async () => {
  const { ringCrossesItself } = await import('../../src/features/routes/geo/ring.ts')
  assert.equal(ringCrossesItself([...box, box[0]]), false)
  assert.equal(ringCrossesItself([box[0], box[1], box[1], box[2], box[3]]), false)
})
