// The chevrons' geometry (src/shared/map/chevrons.ts): where along a lit line
// they sit, the stretches an earlier lit line already flows on, and each
// one's polygon.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/chevrons-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chevronAt, chevronsAt, markCovered, measure, spacingPx } from '../../src/shared/map/chevrons.ts'
import { haversine } from '../../src/shared/geo/geo.ts'

/** A straight line north from [121.04, 14.70], `km` long, in `n` segments: sample data. */
const north = (km, n = 10, lng = 121.04) =>
  Array.from({ length: n + 1 }, (_, i) => [lng, 14.7 + (km / 111.2) * (i / n)])
const whole = { west: 120, east: 122, south: 14, north: 15.5, zoom: 15 }

test('a line is measured along its length, each segment with its bearing', () => {
  const line = north(1)
  const m = measure(line)
  assert.equal(m.at.length, line.length)
  assert.ok(Math.abs(m.length - haversine(line[0], line[line.length - 1])) < 0.5, `${m.length}`)
  assert.ok(m.bearing.every((b) => Math.abs(b) < 0.001), 'due north is 0°')
  const south = measure([...line].reverse())
  assert.ok(south.bearing.every((b) => Math.abs(Math.abs(b) - 180) < 0.001), 'due south is ±180°')
  assert.deepEqual(m.covered, m.bearing.map(() => false))
})

test('a second line on the same road, the same way, is covered; the other way, or a street over, is not', () => {
  const first = measure(north(1))
  const same = measure(north(1))
  markCovered(same, [first])
  assert.ok(same.covered.every(Boolean))
  const opposite = measure([...north(1)].reverse())
  markCovered(opposite, [first])
  assert.ok(opposite.covered.every((c) => !c))
  // 30 m east: another road.
  const over = measure(north(1, 10, 121.04 + 30 / 107_600))
  markCovered(over, [first])
  assert.ok(over.covered.every((c) => !c))
})

test('the spacing steps: more chevrons zoomed out, fewer zoomed in', () => {
  assert.ok(spacingPx(13) < spacingPx(15))
  assert.ok(spacingPx(16) > spacingPx(15))
  assert.equal(spacingPx(14), spacingPx(15.9))
})

test('a chevron is a closed V, as wide across as asked, pointing along its bearing', () => {
  const at = [121.04, 14.7]
  const c = chevronAt(at, 0, 10, 16)
  const ring = c.geometry.coordinates[0]
  assert.equal(ring.length, 7)
  assert.deepEqual(ring[0], ring[6])
  const px = 360 / (512 * 2 ** 16)
  const lngs = ring.map(([x]) => x)
  assert.ok(Math.abs((Math.max(...lngs) - Math.min(...lngs)) / px - 10) < 1e-6, 'arms reach the band edges')
  // The tip is the northernmost point for a chevron pointing north.
  assert.equal(Math.max(...ring.map(([, y]) => y)), ring[0][1])
})

test('chevrons sit every `spacing` metres from `offset`, none on a covered stretch or off screen', () => {
  const m = measure(north(1))
  const features = []
  chevronsAt(m, 50, 100, 8, whole, features)
  assert.equal(features.length, Math.floor((m.length - 50) / 100) + 1)
  const covered = measure(north(1))
  markCovered(covered, [m])
  const none = []
  chevronsAt(covered, 50, 100, 8, whole, none)
  assert.equal(none.length, 0)
  const elsewhere = []
  chevronsAt(m, 50, 100, 8, { west: 120, east: 120.5, south: 14, north: 14.5, zoom: 15 }, elsewhere)
  assert.equal(elsewhere.length, 0)
})
