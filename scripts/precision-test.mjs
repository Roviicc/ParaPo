// What a save keeps of a coordinate (src/shared/geo.ts, round6 and
// roundLngLat), and that a line joined from rounded segments is the rounded
// line: the studio rounds at save since 2026-09-25 (future-proofing stage 2),
// and the publish script's own rounding must then change nothing.
//
//   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/precision-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { haversine, joinSegments, round6, roundLngLat } from '../src/shared/geo.ts'

test('six decimals: within 0.08 m of the point, and the same number the publish script writes', () => {
  const p = [121.06012345678901, 14.735987654321098]
  const r = roundLngLat(p)
  assert.deepEqual(r, [121.060123, 14.735988])
  assert.ok(haversine(p, r) < 0.08, `${haversine(p, r).toFixed(3)} m`)
  assert.equal(round6(r[0]), r[0])
  assert.equal(JSON.stringify(r), JSON.stringify(r.map(round6)))
})

test('a line joined from rounded segments is the rounded line, join points shared', () => {
  const a = [121.060000000001, 14.735000000001]
  const b = [121.060500000009, 14.735500000009]
  const c = [121.061000000004, 14.736000000004]
  const segments = [
    { snap: 'snapped', coordinates: [a, b] },
    { snap: 'freehand', coordinates: [b, c] },
  ].map((s) => ({ ...s, coordinates: s.coordinates.map(roundLngLat) }))
  assert.deepEqual(joinSegments(segments), [a, b, c].map(roundLngLat))
  assert.equal(joinSegments(segments).length, 3)
})
