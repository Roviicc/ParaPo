// A hotspot's point, the centroid of its box (src/shared/geo/ring.ts,
// ringCentroid). Its shoelace sums were taken from 0°, and at Manila's
// longitude they cancelled the digits that mattered: a 10 m box's centroid
// landed some 60 m away, outside its own box (review of 2026-10-03).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/ring-centroid-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { haversine } from '../../src/shared/geo/geo.ts'
import { pointInRing, ringCentroid } from '../../src/shared/geo/ring.ts'

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
