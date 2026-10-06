// The walking-link trial's plain parts (scripts/walk/walkParts.mjs) and what
// the studio makes of its file (src/studio/walk/walkLinks.ts).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/walk-links-test.mjs
//
// Written 2026-10-06 with the trial: which hotspots are in an area, which
// pairs are near enough to walk, Valhalla's shape and edges read right, a
// road bridge never counted as a footbridge.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decodePolyline6, groundOf, inArea, linkRecord, pairsWithin, walkedOn } from '../../scripts/walk/walkParts.mjs'
import { halfway, walkLabel, walkLinksData, walkMeets } from '../../src/studio/walk/walkLinks.ts'

const square = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]
const hotspot = (id, name, lng, lat) => ({ id, name, point: { type: 'Point', coordinates: [lng, lat] } })

test('inArea: inside an outer ring and outside its holes, in any part of a MultiPolygon', () => {
  const polygon = { type: 'Polygon', coordinates: [square(0, 0, 10, 10), square(4, 4, 6, 6)] }
  assert.equal(inArea([1, 1], polygon), true)
  assert.equal(inArea([5, 5], polygon), false, 'in the hole')
  assert.equal(inArea([11, 1], polygon), false)
  // Caloocan is two parts, south and north, with Quezon City between.
  const two = { type: 'MultiPolygon', coordinates: [[square(0, 0, 1, 1)], [square(5, 5, 6, 6)]] }
  assert.equal(inArea([0.5, 0.5], two), true)
  assert.equal(inArea([5.5, 5.5], two), true)
  assert.equal(inArea([3, 3], two), false, 'between the parts')
  assert.equal(inArea([0.5, 0.5], { type: 'Point', coordinates: [0, 0] }), false, 'no area, nothing in it')
})

test('pairsWithin: each near pair once, nearest first, the lower id first', () => {
  // About 111 m a thousandth of a degree of latitude, here at 14.77° N.
  const spots = [
    hotspot('c', 'Simbahan', 121.0, 14.77),
    hotspot('a', 'Simbahan', 121.0, 14.771), // 111 m north of c
    hotspot('b', 'Kanlaon', 121.0, 14.7735), // 278 m north of a
    hotspot('d', 'Malaria', 121.1, 14.77), // kilometres away
  ]
  const pairs = pairsWithin(spots, 300)
  assert.deepEqual(
    pairs.map((p) => `${p.a.id}-${p.b.id}`),
    ['a-c', 'a-b'],
  )
  assert.ok(Math.abs(pairs[0].straightM - 111.2) < 1, `${pairs[0].straightM}`)
  assert.equal(pairsWithin(spots, 100).length, 0)
  assert.equal(pairsWithin(spots, 400).length, 3, 'b-c at 389 m joins at 400')
})

test("decodePolyline6: Valhalla's six-decimal polyline as [lng, lat]", () => {
  // The polyline format's own example, read at six decimals instead of five.
  const line = decodePolyline6('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
  assert.deepEqual(line, [
    [-12.02, 3.85],
    [-12.095, 4.07],
    [-12.6453, 4.3252],
  ])
  assert.deepEqual(decodePolyline6(''), [])
})

test('groundOf: road, footpath, crossing, stairs, lift, other', () => {
  assert.equal(groundOf('road'), 'road')
  assert.equal(groundOf('driveway'), 'road')
  assert.equal(groundOf('alley'), 'road')
  assert.equal(groundOf('footway'), 'footpath')
  assert.equal(groundOf('sidewalk'), 'footpath')
  assert.equal(groundOf('pedestrian_crossing'), 'crossing')
  assert.equal(groundOf('steps'), 'stairs')
  assert.equal(groundOf('elevator'), 'lift')
  assert.equal(groundOf('ferry'), 'other')
  assert.equal(groundOf(undefined), 'other')
})

test('walkedOn: metres by ground; a footbridge is a bridge walked on foot, never a road bridge', () => {
  const on = walkedOn([
    { use: 'road', length: 0.0204 },
    { use: 'road', bridge: true, length: 0.03 }, // along a road bridge over a creek
    { use: 'steps', bridge: true, length: 0.008 }, // up to the footbridge
    { use: 'footway', bridge: true, length: 0.0316 }, // its deck
    { use: 'steps', length: 0.006 },
    { use: 'pedestrian_crossing', length: 0.012 },
    { use: 'footway', tunnel: true, length: 0.04 },
    { use: 'ferry', length: 0.1 },
  ])
  assert.deepEqual(on, {
    road: 50,
    footpath: 72,
    crossing: 12,
    stairs: 14,
    lift: 0,
    other: 100,
    footbridge: 40,
    underpass: 40,
  })
  assert.deepEqual(walkedOn([]), { road: 0, footpath: 0, crossing: 0, stairs: 0, lift: 0, other: 0, footbridge: 0, underpass: 0 })
})

test('linkRecord: the pair, its metres and seconds, and its line thinned and rounded', () => {
  const a = hotspot('a', 'Malaria', 121.0796, 14.7694)
  const b = hotspot('b', 'Malaria', 121.0798, 14.7695)
  // Three points in a straight line: the middle one goes at a metre.
  const encode = (points) => {
    let out = ''
    let prev = [0, 0]
    const one = (v) => {
      let n = v < 0 ? ~(v << 1) : v << 1
      while (n >= 0x20) {
        out += String.fromCharCode((0x20 | (n & 0x1f)) + 63)
        n >>= 5
      }
      out += String.fromCharCode(n + 63)
    }
    for (const [lng, lat] of points) {
      const [la, ln] = [Math.round(lat * 1e6), Math.round(lng * 1e6)]
      one(la - prev[0])
      one(ln - prev[1])
      prev = [la, ln]
    }
    return out
  }
  const shape = encode([
    [121.0796, 14.7694],
    [121.0797, 14.7694],
    [121.0798, 14.7694],
    [121.0798, 14.7695],
  ])
  const link = linkRecord({ a, b, straightM: 24.6 }, { shape, lengthKm: 0.0873, timeS: 61.4 }, [{ use: 'road', length: 0.0873 }])
  assert.deepEqual(link, {
    from: 'a',
    to: 'b',
    from_name: 'Malaria',
    to_name: 'Malaria',
    straight_m: 25,
    walk_m: 87,
    walk_s: 61,
    on: { road: 87, footpath: 0, crossing: 0, stairs: 0, lift: 0, other: 0, footbridge: 0, underpass: 0 },
    line: [
      [121.0796, 14.7694],
      [121.0798, 14.7694],
      [121.0798, 14.7695],
    ],
  })
})

const NONE = { road: 0, footpath: 0, crossing: 0, stairs: 0, lift: 0, other: 0, footbridge: 0, underpass: 0 }

test('walkMeets: what a walker would want told, past a few metres', () => {
  assert.deepEqual(walkMeets(NONE), [])
  assert.deepEqual(walkMeets({ ...NONE, road: 300 }), [])
  assert.deepEqual(walkMeets({ ...NONE, footbridge: 52, stairs: 14, crossing: 2 }), ['footbridge', 'stairs'], 'a 2 m crossing is the router at an edge\'s end')
  assert.deepEqual(walkMeets({ ...NONE, underpass: 40, lift: 5, crossing: 12 }), ['underpass', 'lift', 'crossing'])
})

test("walkLabel: the walk and its minutes over how far apart, and what it meets", () => {
  assert.equal(walkLabel({ walk_m: 319, walk_s: 225, straight_m: 117, on: { ...NONE, road: 319 } }), '319 m walk · 4 min\n117 m apart')
  assert.equal(
    walkLabel({ walk_m: 69, walk_s: 20, straight_m: 60, on: { ...NONE, footbridge: 52, stairs: 14 } }),
    '69 m walk · 1 min\n60 m apart · footbridge · stairs',
    'never "0 min"',
  )
})

test('halfway: the middle by length, not by points', () => {
  // 0.001° of latitude a leg: the first leg 1, the second 3, so the middle is half a leg into the second.
  const mid = halfway([
    [121, 14.77],
    [121, 14.771],
    [121, 14.774],
  ])
  assert.equal(mid[0], 121)
  assert.ok(Math.abs(mid[1] - 14.772) < 1e-9, `${mid[1]}`)
  assert.deepEqual(halfway([[121, 14.77]]), [121, 14.77])
  assert.deepEqual(halfway([[121, 14.77], [121, 14.77]]), [121, 14.77], 'no length: its end')
  assert.throws(() => halfway([]))
})

test("walkLinksData: each link's line, and its words at a point halfway along", () => {
  const link = { from: 'a', to: 'b', from_name: 'A', to_name: 'B', straight_m: 25, walk_m: 87, walk_s: 61, on: { ...NONE, road: 87 }, line: [[121, 14.77], [121, 14.772]] }
  const data = walkLinksData([link])
  assert.deepEqual(data.features.map((f) => f.geometry.type), ['LineString', 'Point'])
  assert.deepEqual(data.features[0].geometry.coordinates, link.line)
  assert.deepEqual(data.features[1].properties, { from: 'a', to: 'b', label: '87 m walk · 1 min\n25 m apart' })
  assert.ok(Math.abs(data.features[1].geometry.coordinates[1] - 14.771) < 1e-9)
})

// Not against today's published file: it is rebuilt every night, and a
// hotspot deleted since the trial was made must not fail the build. The
// studio draws a link from its own line, whatever became of its ends.
test("the trial's file: every link between two hotspots, a line to draw, metres that add up", () => {
  const trial = JSON.parse(readFileSync(new URL('../../src/studio/walk/walkLinks.trial.json', import.meta.url), 'utf8'))
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  assert.equal(trial.area, 'Caloocan')
  assert.match(trial.licence, /OpenStreetMap/)
  assert.ok(trial.links.length > 0)
  for (const l of trial.links) {
    const what = `${l.from_name} – ${l.to_name}`
    assert.ok(UUID.test(l.from) && UUID.test(l.to), `${what}: two hotspots' ids`)
    assert.notEqual(l.from, l.to, what)
    assert.ok(l.straight_m <= trial.within_m, `${what}: within ${trial.within_m} m`)
    assert.ok(l.walk_m >= l.straight_m * 0.9, `${what}: no walk shorter than the straight line, give or take the snap to the road`)
    assert.ok(l.line.length >= 2 && l.line.every((p) => p.length === 2 && p.every(Number.isFinite)), `${what}: a line`)
    assert.deepEqual(Object.keys(l.on).sort(), Object.keys(NONE).sort(), what)
  }
  const pairs = trial.links.map((l) => `${l.from}|${l.to}`)
  assert.equal(new Set(pairs).size, pairs.length, 'each pair once')
})
