// The phone-speed measurement's reckoning (scripts/research/phoneSpeedParts.mjs).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/phone-speed-test.mjs
//
// The cheap-phone plan, step 0 (2026-10-04): every later step is judged by
// these numbers, so the link the basemap and MapLibre's worker share, what a
// file weighs on it and where the trip tap lands are held here, not trusted.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { byZoom, loneSpot, median, slowLink, tileZoom, wireBytes } from '../../scripts/research/phoneSpeedParts.mjs'

test("a file on the link waits its latency, then its bytes at the link's speed", () => {
  const link = slowLink({ latency: 150, bytesPerSecond: 200_000 })
  assert.equal(link.hold(0, 200_000), 1150)
  // Long after, on an idle link: latency and bytes again, from then.
  assert.equal(link.hold(10_000, 20_000), 250)
  assert.equal(link.hold(20_000, 0), 150)
})

test('files asked for together share the link: each waits for the one before', () => {
  const link = slowLink({ latency: 150, bytesPerSecond: 200_000 })
  assert.equal(link.hold(0, 200_000), 1150)
  assert.equal(link.hold(0, 200_000), 2150)
  // A small file asked for while the link is busy arrives after the big ones.
  assert.equal(link.hold(500, 2_000), 2160 - 500)
  // Its latency overlaps the wait, not adds to it.
  assert.equal(link.hold(2000, 0), 2160 - 2000)
})

test('two links are two: one model per page, never shared between runs', () => {
  const a = slowLink()
  const b = slowLink()
  a.hold(0, 1_000_000)
  assert.equal(b.hold(0, 0), 150)
})

test('a file weighs its gzip on the wire, or itself where gzip gains nothing', () => {
  const text = Buffer.from('{"type":"FeatureCollection"}'.repeat(400))
  assert.equal(wireBytes(text), gzipSync(text).length)
  assert.ok(wireBytes(text) < text.length / 10)
  const noise = Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 2654435761) % 251))
  assert.ok(wireBytes(noise) <= noise.length)
  assert.equal(wireBytes(Buffer.alloc(0)), 0)
})

test("a basemap tile's zoom is read from its address; the style, glyphs and sprite have none", () => {
  assert.equal(tileZoom('https://tiles.openfreemap.org/planet/20260927_080001_pt/11/1712/939.pbf'), 11)
  assert.equal(tileZoom('https://tiles.openfreemap.org/planet/20260927_080001_pt/9/427/234.pbf'), 9)
  assert.equal(tileZoom('https://tiles.openfreemap.org/natural_earth/ne2sr/5/26/14.png'), 5)
  assert.equal(tileZoom('https://tiles.openfreemap.org/styles/positron'), null)
  assert.equal(tileZoom('https://tiles.openfreemap.org/planet'), null)
  assert.equal(tileZoom('https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf'), null)
  assert.equal(tileZoom('https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/8448-8703.pbf'), null)
  assert.equal(tileZoom('https://tiles.openfreemap.org/sprites/ofm_f384/ofm@2x.png'), null)
  assert.deepEqual(
    byZoom([
      'https://tiles.openfreemap.org/styles/positron',
      'https://tiles.openfreemap.org/planet/v/11/1712/939.pbf',
      'https://tiles.openfreemap.org/planet/v/11/1712/940.pbf',
      'https://tiles.openfreemap.org/planet/v/9/427/234.pbf',
    ]),
    { other: 1, z11: 2, z9: 1 },
  )
})

test('the median of the runs leaves out runs that did not get there', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 3, 2]), 3)
  assert.equal(median([null, 5, undefined, 1, 9]), 5)
  assert.equal(median([null, null]), null)
  assert.equal(median([]), null)
})

// Two routes crossing a 400 × 400 screen, a box on one of them.
const view = { left: 0, top: 0, right: 400, bottom: 400 }
const across = { route: 'a', pts: [[0, 200], [100, 200], [200, 200], [300, 200], [400, 200]] }
const down = { route: 'b', pts: [[200, 0], [200, 100], [200, 300], [200, 400]] }

test('the trip tap lands where one route runs alone, the furthest from the rest', () => {
  const spot = loneSpot({ lines: [across, down], rings: [], reach: 40, view })
  assert.ok(spot)
  // The ends of each line are the furthest from the other: 200 px.
  assert.equal(spot.room, 200)
  assert.ok([[0, 200], [400, 200], [200, 0], [200, 400]].some(([x, y]) => spot.at[0] === x && spot.at[1] === y))
})

test("a route's own way back does not count against its room; another route does", () => {
  const back = { route: 'a', pts: [[0, 205], [400, 205]] }
  const other = { route: 'c', pts: [[0, 205], [400, 205]] }
  assert.ok(loneSpot({ lines: [across, back], rings: [], reach: 40, view }))
  assert.equal(loneSpot({ lines: [across, other], rings: [], reach: 40, view }), null)
})

test('a vertex inside a box, or within reach of one, is passed over', () => {
  const lone = { route: 'a', pts: [[100, 100], [300, 100]] }
  const box = (x, y, half) => [[x - half, y - half], [x + half, y - half], [x + half, y + half], [x - half, y + half], [x - half, y - half]]
  assert.equal(loneSpot({ lines: [lone], rings: [box(100, 100, 10), box(300, 100, 10)], reach: 40, view }), null)
  assert.equal(loneSpot({ lines: [lone], rings: [box(100, 130, 5), box(300, 130, 5)], reach: 40, view }), null)
  const spot = loneSpot({ lines: [lone], rings: [box(100, 100, 10)], reach: 40, view })
  assert.deepEqual(spot.at, [300, 100])
  assert.ok(spot.room > 40)
})

test('only vertices on the screen, inside its margins, are tapped', () => {
  assert.equal(loneSpot({ lines: [across, down], rings: [], reach: 40, view: { left: 150, top: 150, right: 250, bottom: 250 } }), null)
  const spot = loneSpot({ lines: [across, down], rings: [], reach: 40, view: { left: 50, top: 150, right: 350, bottom: 250 } })
  assert.deepEqual(spot.at, [100, 200])
  assert.equal(spot.room, 100)
})
