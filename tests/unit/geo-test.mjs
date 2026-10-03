// One metres-per-degree and one point-to-segment (src/shared/geo/geo.ts,
// M_PER_DEG, nearestOnSegment, pointToSegmentM): the review's 6.5 found four
// figures and five copies; these hold the one left to haversine's sphere.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/geo-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { M_PER_DEG, bboxOf, haversine, joinSegments, nearestOnSegment, pointToSegmentM } from '../../src/shared/geo/geo.ts'

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

// Review of 2026-10-03, finding 7: a routed segment starts where the router
// put the click on the road, not on the click a freehand segment ends on.
test("a join keeps the road's first point when it is not the click before it", () => {
  const click = [121.04, 14.7]
  const onRoad = [121.04, 14.70015] // about 17 m north, where the router snapped the click
  const next = [121.041, 14.70015]
  const freehand = { snap: 'freehand', coordinates: [[121.039, 14.7], click] }
  const routed = { snap: 'snapped', coordinates: [onRoad, next] }
  assert.deepEqual(joinSegments([freehand, routed]), [[121.039, 14.7], click, onRoad, next])
})

test('a join that repeats the point before it, to the centimetre, is kept once', () => {
  const a = [121.04, 14.7]
  const b = [121.041, 14.7]
  const c = [121.042, 14.7]
  assert.deepEqual(joinSegments([{ coordinates: [a, b] }, { coordinates: [b, c] }]), [a, b, c])
  // The same point a few millimetres off, as two answers of the router may give it.
  assert.deepEqual(joinSegments([{ coordinates: [a, b] }, { coordinates: [[121.04100003, 14.7], c] }]), [a, b, c])
  // Empty segments are skipped, and an empty drawing is no line.
  assert.deepEqual(joinSegments([{ coordinates: [] }, { coordinates: [a, b] }, null]), [a, b])
  assert.deepEqual(joinSegments([]), [])
})

test('a spot on the line is measured along the line as it is joined, hop included', async () => {
  const { nearestSpot } = await import('../../src/studio/drawing/borrow.ts')
  const { lineLength } = await import('../../src/shared/geo/geo.ts')
  const click = [121.04, 14.7]
  const onRoad = [121.04, 14.70015]
  const segments = [
    { snap: 'freehand', coordinates: [[121.039, 14.7], click] },
    { snap: 'snapped', coordinates: [onRoad, [121.041, 14.70015]] },
  ]
  const spot = nearestSpot(segments, [121.0405, 14.70016])
  const along = lineLength([[121.039, 14.7], click, onRoad, spot.point])
  assert.ok(Math.abs(spot.metres - along) < 0.01, `${spot.metres} vs ${along}`)
})
