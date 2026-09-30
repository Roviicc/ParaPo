// One metres-per-degree and one point-to-segment (src/shared/geo/geo.ts,
// M_PER_DEG, nearestOnSegment, pointToSegmentM): the review's 6.5 found four
// figures and five copies; these hold the one left to haversine's sphere.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/geo-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { M_PER_DEG, bboxOf, haversine, nearestOnSegment, pointToSegmentM } from '../../src/shared/geo/geo.ts'

test('a degree of latitude is what haversine measures it', () => {
  assert.ok(Math.abs(haversine([121, 14], [121, 15]) - M_PER_DEG) < 0.001)
})

test('the nearest point of a segment: inside it, or its nearer end', () => {
  const a = [121.04, 14.7]
  const b = [121.05, 14.7]
  assert.deepEqual(nearestOnSegment([121.045, 14.701], a, b), { point: [121.045, 14.7], t: 0.5 })
  assert.deepEqual(nearestOnSegment([121.03, 14.7005], a, b).t, 0)
  assert.deepEqual(nearestOnSegment([121.06, 14.6995], a, b).t, 1)
  assert.deepEqual(nearestOnSegment([121.03, 14.7], a, a), { point: a, t: 0 })
})

test('metres to a segment agree with haversine to its nearest point, at street scale', () => {
  const a = [121.04, 14.7]
  const b = [121.043, 14.702]
  for (const p of [[121.0415, 14.7012], [121.041, 14.7003], [121.039, 14.6995], [121.044, 14.7025]]) {
    const flat = pointToSegmentM(p, a, b)
    const round = haversine(p, nearestOnSegment(p, a, b).point)
    assert.ok(Math.abs(flat - round) < 0.001 * round + 0.01, `${flat} vs ${round}`)
  }
})

test('a box padded by d metres holds every point within d metres of its corners', () => {
  const [w, s, e, n] = bboxOf([[121.04, 14.7], [121.041, 14.701]], 10)
  assert.ok(Math.abs(haversine([121.04, s], [121.04, 14.7]) - 10) < 0.01)
  assert.ok(Math.abs(haversine([w, 14.7005], [121.04, 14.7005]) - 10) < 0.05)
  assert.ok(e > 121.041 && n > 14.701)
})
