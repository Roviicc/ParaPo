// The cheap-phone timer's plain parts (scripts/research/phoneSpeedParts.mjs).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/phone-speed-test.mjs
//
// The cheap-phone plan's Step 0 (2026-10-04): the timer finds a trip tap as
// well as a list tap, sends the basemap through one slowed link per page,
// counts tiles by zoom, tells the page's bytes from its workers' by the
// headers Chrome sends, and lists the GL programs a tap compiled. What the
// numbers mean rests on these. Its review the same day: "routes drawn" waits
// for a route in the routes' source, and a stamp out of order is said.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'
import {
  FINGER_REACH_PX,
  added,
  askedBy,
  distToRings,
  headerBytes,
  listSpots,
  mapGeometry,
  median,
  mPerDegLng,
  routesOnMap,
  serialLink,
  stampTrouble,
  stats,
  tileAt,
  tileMetrics,
  tileZoom,
  tilesAlong,
  tripSpots,
} from '../../scripts/research/phoneSpeedParts.mjs'
import { ROUTES_LINE } from '../../src/features/routes/map/saved-routes-layers.ts'

// A small map near Manila's latitude, in metres east and north: route A's
// two directions on one road running east for 2 km; route B 10 m north of
// it for its first 500 m, then turning north for 1.5 km; route C alone,
// 3 km south; one hotspot box on A's road near its end.
const LAT = 14.6
const M = 1 / 110_574 // a metre of latitude, in degrees
const E = 1 / mPerDegLng(LAT) // a metre of longitude there
const at = (east, north) => [121 + east * E, LAT + north * M]
/** Vertices every 100 m from one point to another, both ends in. */
const along = ([e0, n0], [e1, n1]) => {
  const steps = Math.round(Math.hypot(e1 - e0, n1 - n0) / 100)
  return Array.from({ length: steps + 1 }, (_, i) => at(e0 + ((e1 - e0) * i) / steps, n0 + ((n1 - n0) * i) / steps))
}
const index = {
  variants: [
    { id: 'a-out', route_id: 'A', route: { name: 'Alpha' }, overview: { coordinates: along([0, 0], [2000, 0]) } },
    { id: 'a-back', route_id: 'A', route: { name: 'Alpha' }, overview: { coordinates: along([2000, 0], [0, 0]) } },
    { id: 'b', route_id: 'B', route: { name: 'Bravo' }, overview: { coordinates: [...along([0, 10], [500, 10]), ...along([500, 10], [500, 1500]).slice(1)] } },
    { id: 'c', route_id: 'C', route: { name: 'Charlie' }, overview: { coordinates: along([0, -3000], [2000, -3000]) } },
    { id: 'dot', route_id: 'D', route: { name: 'Dot' }, overview: { coordinates: [at(9, 9)] } },
  ],
  stops: [
    { id: 'box', area: { type: 'Polygon', coordinates: [[at(1850, -20), at(1960, -20), at(1960, 20), at(1850, 20), at(1850, -20)]] } },
    { id: 'pin', area: null },
  ],
}
const geometry = mapGeometry(index, () => null)

test('the map: every direction with a line, and every hotspot box', () => {
  assert.deepEqual(geometry.lines.map((l) => l.id), ['a-out', 'a-back', 'b', 'c'])
  assert.equal(geometry.rings.length, 1)
  // A direction's full line, where it has one, over its overview.
  const full = mapGeometry(index, (id) => (id === 'c' ? [at(0, -3000), at(1000, -3100), at(2000, -3000)] : null))
  assert.equal(full.lines.find((l) => l.id === 'c').coords.length, 3)
  // No overview, no line file asked for.
  assert.equal(mapGeometry({ variants: [{ id: 'x', overview: null }], stops: [] }, () => assert.fail('asked')).lines.length, 0)
})

test('a point inside a hotspot box is 0 m from it, as a tap there is the box’s', () => {
  const k = mPerDegLng(LAT)
  assert.equal(distToRings(at(1900, 0), geometry.rings, k), 0)
  assert.ok(Math.abs(distToRings(at(1750, 0), geometry.rings, k) - 100) < 0.5)
  assert.equal(distToRings(at(0, 0), [], k), Infinity)
})

test('list spots: where another route runs within 15 m, and only there', () => {
  const spots = listSpots(geometry)
  // A's vertices on B's stretch, both ways, and B's own there: 6 + 6 + 6.
  assert.equal(spots.length, 18)
  for (const s of spots) assert.ok(s.p[0] <= at(500, 0)[0] + 1e-9 && s.p[1] <= at(0, 10)[1] + 1e-9, String(s.p))
  assert.deepEqual([...new Set(spots.map((s) => s.line))], ['a-out', 'a-back', 'b'])
  assert.ok(spots.every((s) => s.box > 1300))
})

test('trip spots: the clearest first, a route’s own other direction not counted against it', () => {
  const spots = tripSpots(geometry, 50)
  const room = (s) => Math.min(s.clear, s.box)
  for (let i = 1; i < spots.length; i++) assert.ok(room(spots[i - 1]) >= room(spots[i]))
  // C is alone, 3 km from everything: its spots lead.
  assert.equal(spots[0].line, 'c')
  assert.ok(Math.abs(spots[0].clear - 3000) < 1)
  // On A's road its way back runs on top of it, and yet a spot there has
  // room from B and the box: 1,200 m east, 700 m from B, 650 m from the box.
  const onA = spots.find((s) => s.line === 'a-out' && Math.abs(s.p[0] - at(1200, 0)[0]) < 1e-9)
  assert.ok(Math.abs(onA.clear - 700) < 1 && Math.abs(onA.box - 650) < 1, JSON.stringify(onA))
  // Inside the box: no room at all.
  const inBox = spots.find((s) => s.line === 'a-out' && Math.abs(s.p[0] - at(1900, 0)[0]) < 1e-9)
  assert.equal(inBox.box, 0)
  // A finger's reach, as phone-test's openAlone counts it.
  assert.ok(Math.abs(FINGER_REACH_PX - (20 * Math.SQRT2 + 9)) < 1e-12)
})

test('a tile’s zoom from its address; none for the style, TileJSON, sprite or glyphs', () => {
  assert.equal(tileZoom('https://tiles.openfreemap.org/planet/20260927_080001_pt/11/1712/939.pbf'), 11)
  assert.equal(tileZoom('https://tiles.openfreemap.org/planet/20260927_080001_pt/9/427/235.pbf'), 9)
  assert.equal(tileZoom('https://tiles.openfreemap.org/natural_earth/ne2sr/6/53/29.png'), 6)
  assert.equal(tileZoom('https://tiles.openfreemap.org/styles/positron'), null)
  assert.equal(tileZoom('https://tiles.openfreemap.org/planet'), null)
  assert.equal(tileZoom('https://tiles.openfreemap.org/sprites/ofm_f384/ofm@2x.png'), null)
  assert.equal(tileZoom('https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf'), null)
  assert.equal(tileZoom('not a url'), null)
})

test('a point’s tile, and every tile a camera move can ask for', () => {
  // The map's centre before its fit, in one of the four z9 tiles the opening asked for (427–428/234–235, 2026-10-04).
  const [x9, y9] = tileAt([121.0244, 14.5995], 9)
  assert.deepEqual([Math.floor(x9), Math.floor(y9)], [428, 235])
  assert.deepEqual(tileAt([0, 0], 1), [1, 1])
  assert.deepEqual(tileAt([-180, 0], 3).map(Math.floor), [0, 4])
  const opening = { center: [121.049455, 14.631108], zoom: 9.86 }
  const trip = { center: [121.07, 14.70], zoom: 11.4 }
  const tiles = tilesAlong(opening, trip, { width: 390, height: 844 })
  const key = (t) => t.join('/')
  const keys = new Set(tiles.map(key))
  assert.equal(keys.size, tiles.length)
  // Only the whole zooms the move passes: 9, 10 and 11.
  assert.deepEqual([...new Set(tiles.map((t) => t[0]))], [9, 10, 11])
  // Both ends' screens are in, a tile beyond each.
  for (const [view, z] of [[opening, 9], [trip, 11]]) {
    const [cx, cy] = tileAt(view.center, z)
    for (const [dx, dy] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) {
      const x = Math.floor(cx + dx * (390 / 2 / 512)) + Math.sign(dx)
      const y = Math.floor(cy + dy * (844 / 2 / 512)) + Math.sign(dy)
      assert.ok(keys.has(key([z, x, y])), `${z}/${x}/${y}`)
    }
  }
  // Nothing outside the grid, near its edge.
  const edge = tilesAlong({ center: [-179.99, 0], zoom: 1 }, { center: [-179.99, 0], zoom: 1 }, { width: 390, height: 844 })
  assert.ok(edge.every(([z, x, y]) => x >= 0 && y >= 0 && x < 2 ** z && y < 2 ** z))
  // No move, one zoom.
  assert.ok(tilesAlong(opening, opening, { width: 390, height: 844 }).every((t) => t[0] === 9))
})

test('the basemap’s link carries one file at a time: latency, then its bytes', async () => {
  const slept = []
  const fake = (ms) => {
    slept.push(ms)
    return Promise.resolve()
  }
  const link = serialLink({ latencyMs: 150, bytesPerSecond: 200 * 1024 }, fake)
  assert.equal(link.holdMs(0), 150)
  assert.equal(link.holdMs(200 * 1024), 1150)
  const done = []
  await Promise.all([link.carry(204800).then(() => done.push('big')), link.carry(0).then(() => done.push('small'))])
  // In the order asked, the small one waiting for the big one to be through.
  assert.deepEqual(done, ['big', 'small'])
  assert.deepEqual(slept, [1150, 150])
})

test('the link really waits, one after the other', async () => {
  const link = serialLink({ latencyMs: 30, bytesPerSecond: 1000 })
  const t0 = performance.now()
  const ends = []
  await Promise.all([10, 10, 10].map((b) => link.carry(b).then(() => ends.push(performance.now() - t0))))
  // 40 ms each, so the third ends no sooner than 120 ms in.
  assert.ok(ends[2] >= 115, `${ends}`)
  assert.ok(ends[0] < ends[1] && ends[1] < ends[2])
})

test('who asked: the page, MapLibre’s worker, or the service worker', () => {
  const page = 'http://localhost:4175/'
  const worker = 'http://localhost:4175/assets/maplibre-gl-worker-CREgtMWu.js'
  const sw = 'http://localhost:4175/sw.js'
  assert.equal(askedBy({ 'sec-fetch-dest': 'document' }), 'page')
  assert.equal(askedBy({ 'sec-fetch-dest': 'script', referer: page }), 'page')
  assert.equal(askedBy({ 'sec-fetch-dest': 'empty', referer: page }), 'page')
  assert.equal(askedBy({ 'sec-fetch-dest': 'font', referer: 'http://localhost:4175/assets/shared-SrOxzxBE.css' }), 'page')
  // The worker's script, and what the worker asks for.
  assert.equal(askedBy({ 'sec-fetch-dest': 'worker', referer: page }), 'worker')
  assert.equal(askedBy({ 'sec-fetch-dest': 'script', referer: worker }), 'worker')
  // The service worker's script, its importScripts and its precache.
  assert.equal(askedBy({ 'sec-fetch-dest': 'serviceworker', referer: page }), 'sw')
  assert.equal(askedBy({ 'sec-fetch-dest': 'script', referer: sw }), 'sw')
  assert.equal(askedBy({ 'sec-fetch-dest': 'empty', referer: sw }), 'sw')
  // No headers at all: the page's.
  assert.equal(askedBy({}), 'page')
})

test('an answer’s header bytes', () => {
  // "HTTP/1.1 200 \r\n" (15), "etag: x\r\n" (9), the closing "\r\n" (2).
  assert.equal(headerBytes(200, { etag: 'x' }), 26)
  assert.equal(headerBytes(304, {}), 17)
})

test('the GL programs a tap compiled: the keys after that were not there before, in order', () => {
  assert.deepEqual(added(['a', 'b'], ['a', 'c', 'b', 'd']), ['c', 'd'])
  assert.deepEqual(added(['a'], ['a']), [])
  assert.deepEqual(added([], ['x']), ['x'])
})

test('median, min and max of the numbers; none when there are none', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 3, 2]), 2.5)
  assert.deepEqual(stats([5, null, 1, undefined, 3, Infinity]), { median: 3, min: 1, max: 5 })
  assert.deepEqual(stats([null]), { median: null, min: null, max: null })
})

test('the zooms any run fetched tiles at, as metric names, lowest first', () => {
  const runs = [{ cold: { tiles: { 11: { n: 2 }, 9: { n: 4 } } } }, { cold: { tiles: { 10: { n: 2 } } } }, { cold: {} }]
  assert.deepEqual(tileMetrics(runs, 'cold'), ['tilesZ9', 'tilesZ10', 'tilesZ11'])
  assert.deepEqual(tileMetrics(runs, 'repeat'), [])
})

test('routes drawn: a route in the routes’ loaded source, not the empty source the map adds at its load', () => {
  // A stand-in map, saying what it was asked.
  const map = ({ source = true, layer = true, loaded = true, features = 0 } = {}) => {
    const asked = []
    return {
      asked,
      getSource: (id) => (asked.push(['getSource', id]), source ? {} : undefined),
      getLayer: (id) => (asked.push(['getLayer', id]), layer ? {} : undefined),
      isSourceLoaded: (id) => (asked.push(['isSourceLoaded', id]), loaded),
      querySourceFeatures: (id) => (asked.push(['querySourceFeatures', id]), Array.from({ length: features }, () => ({}))),
    }
  }
  const drawn = map({ features: 80 })
  assert.equal(routesOnMap(drawn), true)
  assert.deepEqual(drawn.asked, [
    ['getSource', 'saved-routes'],
    ['getLayer', ROUTES_LINE],
    ['isSourceLoaded', 'saved-routes'],
    ['querySourceFeatures', 'saved-routes'],
  ])
  // The source as the map adds it at 'load', before the map file is in:
  // loaded, and empty. The stamp the review found (2026-10-04).
  assert.equal(routesOnMap(map({ features: 0 })), false)
  assert.equal(routesOnMap(map({ source: false, features: 80 })), false)
  assert.equal(routesOnMap(map({ layer: false, features: 80 })), false)
  // The map file's routes still with the worker: not drawn, and its tiles
  // not read on such a frame.
  const loading = map({ loaded: false, features: 80 })
  assert.equal(routesOnMap(loading), false)
  assert.ok(!loading.asked.some(([k]) => k === 'querySourceFeatures'))
  // Its text alone, as the page is handed it, does the same: it uses
  // nothing but the map.
  const inPage = runInNewContext(`(${routesOnMap})`)
  assert.equal(inPage(map({ features: 3 })), true)
  assert.equal(inPage(map({ features: 0 })), false)
})

test('the load stamps’ order: routes drawn no sooner than data in, and stamped once it is in', () => {
  // Step 0's proof run, the repeat visit (2026-10-04): data in, 'load', routes drawn.
  assert.deepEqual(stampTrouble({ dataIn: 1351.3, mapLoad: 1509.1, routesDrawn: 2213.3 }), [])
  // The owner's Q1: the routes drawn after data in but before the map's 'load'.
  assert.deepEqual(stampTrouble({ dataIn: 1351, mapLoad: 3000, routesDrawn: 1800 }), [])
  // The empty source's stamp, 'load' before the map file (the review's repro).
  assert.deepEqual(stampTrouble({ dataIn: 4523, mapLoad: 821, routesDrawn: 1004 }), ['routes drawn stamped before the data was in'])
  // The data in and the map settled, and no stamp.
  assert.deepEqual(stampTrouble({ dataIn: 4523, mapLoad: 821, routesDrawn: null }), ['routes drawn never stamped, though the data was in'])
  assert.deepEqual(stampTrouble({ dataIn: null, routesDrawn: 1004 }), ['routes drawn stamped, though the data never came in'])
  // No data, no routes: nothing for this to say.
  assert.deepEqual(stampTrouble({ dataIn: null, routesDrawn: null }), [])
  assert.deepEqual(stampTrouble({}), [])
})
