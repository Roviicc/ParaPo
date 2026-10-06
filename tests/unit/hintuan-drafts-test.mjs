// The hintuan drafts: their plain parts (scripts/drafts/draftParts.mjs), what
// the studio makes of them (src/studio/drafts/drafts.ts), and the file the
// studio offers (src/studio/drafts/hintuanDrafts.trial.json).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/hintuan-drafts-test.mjs
//
// Written 2026-10-06 with the drafts: a box the size of the owner's, on the
// stop's side of the road and near enough the line to be passed; a stop
// already under a hotspot, off the jeepney lines or not a stop at all never
// drafted; a draft gone from the list once a hotspot takes its place.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  BOX,
  INNER_MAX_M,
  candidates,
  draftId,
  draftRecord,
  isStop,
  meetLine,
  mergeNear,
  roadsideBox,
} from '../../scripts/drafts/draftParts.mjs'
import { draftDetail, draftMiddle, draftNote, draftsData, draftsLeft, TAKEN_M } from '../../src/studio/drafts/drafts.ts'

// A street running east at 14.77° N, about 108 m long.
const LAT = 14.77
const KX = 111_320 * Math.cos((LAT * Math.PI) / 180)
const KY = 110_574
const at = (eastM, northM) => [121 + eastM / KX, LAT + northM / KY]
const metres = (p) => [(p[0] - 121) * KX, (p[1] - LAT) * KY]
const LINE = [at(0, 0), at(108, 0)]
const near = (a, b, tol = 0.2) => Math.abs(a - b) <= tol

/** Twice the signed area: positive when the ring runs counterclockwise. */
const turn = (ring) => ring.reduce((s, p, i) => {
  const [x1, y1] = metres(p)
  const [x2, y2] = metres(ring[(i + 1) % ring.length])
  return s + x1 * y2 - x2 * y1
}, 0)

const box = (eastM0, northM0, eastM1, northM1) => ({
  type: 'Polygon',
  coordinates: [[at(eastM0, northM0), at(eastM1, northM0), at(eastM1, northM1), at(eastM0, northM1), at(eastM0, northM0)]],
})
const hotspot = (name, area) => ({
  id: name,
  name,
  informal: null,
  kind: 'hintuan',
  area,
  point: { type: 'Point', coordinates: at((metres(area.coordinates[0][0])[0] + metres(area.coordinates[0][2])[0]) / 2, (metres(area.coordinates[0][0])[1] + metres(area.coordinates[0][2])[1]) / 2) },
})

test('meetLine: the nearest point, how far, the way the line runs, and the side', () => {
  const north = meetLine(at(50, 6), LINE)
  assert.ok(near(north.metres, 6), `${north.metres}`)
  assert.ok(near(metres(north.point)[0], 50) && near(metres(north.point)[1], 0))
  assert.ok(near(north.dir[0], 1, 1e-6) && near(north.dir[1], 0, 1e-6))
  assert.equal(north.side, 1, 'north of a line running east is its left')
  assert.equal(meetLine(at(50, -12), LINE).side, -1)
  assert.equal(meetLine(at(50, 1.5), LINE).side, 0, 'within 2 m: on the road')
})

test("roadsideBox: the owner's size, on the stop's side, its near edge within reach of the line", () => {
  const dir = [1, 0]
  const sideOf = (ring) => ring.map(metres)
  // A stop 6 m north: the box from 2.5 m out to 9.5 m, 31 m long, centred on the stop's place along the road.
  const left = sideOf(roadsideBox(at(50, 0), dir, 1, 6))
  assert.ok(near(Math.min(...left.map(([, y]) => y)), 2.5) && near(Math.max(...left.map(([, y]) => y)), 2.5 + BOX.depthM), JSON.stringify(left))
  assert.ok(near(Math.min(...left.map(([x]) => x)), 50 - BOX.lengthM / 2) && near(Math.max(...left.map(([x]) => x)), 50 + BOX.lengthM / 2))
  // 12 m south: never further than INNER_MAX_M from the line, so the routes pass it.
  const right = sideOf(roadsideBox(at(50, 0), dir, -1, 12))
  assert.ok(near(Math.max(...right.map(([, y]) => y)), -INNER_MAX_M) && near(Math.min(...right.map(([, y]) => y)), -INNER_MAX_M - BOX.depthM), JSON.stringify(right))
  // On the road: straddling it.
  const road = sideOf(roadsideBox(at(50, 0), dir, 0, 1))
  assert.ok(near(Math.min(...road.map(([, y]) => y)), -BOX.depthM / 2) && near(Math.max(...road.map(([, y]) => y)), BOX.depthM / 2))
  // Four corners, not closed, counterclockwise whichever the side.
  for (const side of [1, -1, 0]) {
    const ring = roadsideBox(at(50, 0), dir, side, 6)
    assert.equal(ring.length, 4)
    assert.ok(turn(ring) > 0, `side ${side} runs counterclockwise`)
  }
  // Along a road running north-east too: its length along the road.
  const diag = roadsideBox(at(50, 0), [Math.SQRT1_2, Math.SQRT1_2], 1, 6).map(metres)
  assert.ok(near(Math.hypot(diag[1][0] - diag[0][0], diag[1][1] - diag[0][1]), BOX.lengthM))
  assert.ok(near(Math.hypot(diag[2][0] - diag[1][0], diag[2][1] - diag[1][1]), BOX.depthM))
})

test('isStop: a bus stop, or a shelter or station called a jeepney one', () => {
  assert.equal(isStop({ class: 'bus', subclass: 'bus_stop', name: 'Zabarte' }), true)
  assert.equal(isStop({ class: 'shelter', subclass: 'shelter', name: 'Jeepney Waiting Area' }), true)
  assert.equal(isStop({ class: 'bus', subclass: 'bus_station', name: 'Tala-Novaliches Jeep Terminal' }), true)
  assert.equal(isStop({ class: 'bus', subclass: 'bus_station', name: 'Vicas UV Terminal' }), false, 'a UV Express terminal')
  assert.equal(isStop({ class: 'shelter', subclass: 'shelter', name: 'Waiting shed' }), false)
  assert.equal(isStop({ class: 'office', subclass: 'taxi', name: 'ZACATODA Tricycle Terminal' }), false)
  assert.equal(isStop({ class: 'fuel', subclass: 'fuel', name: 'Petron' }), false)
})

test('candidates: named stops on a jeepney line, clear of every saved hotspot', () => {
  const saved = [hotspot('Station 12', box(80, 3, 104, 10))]
  const pois = [
    { class: 'bus', subclass: 'bus_stop', name: 'Petunia', at: at(20, 6) },
    { class: 'bus', subclass: 'bus_stop', name: 'Far', at: at(20, 30) }, // 30 m off the line
    { class: 'bus', subclass: 'bus_stop', name: 'Camarin', at: at(70, 6) }, // 10 m from Station 12's box
    { class: 'bus', subclass: 'bus_stop', name: '', at: at(40, 6) },
    { class: 'fuel', subclass: 'fuel', name: 'Flying V', at: at(45, 6) },
  ]
  const found = candidates(pois, { lines: [LINE], hotspots: saved })
  assert.deepEqual(found.map((c) => c.name), ['Petunia'])
  assert.ok(near(found[0].nearest.metres, 60, 0.5), `${found[0].nearest.metres}`)
  assert.equal(found[0].nearest.name, 'Station 12')
  assert.equal(candidates(pois, { lines: [LINE], hotspots: saved, clearM: 5 }).length, 2, 'Camarin joins when 10 m is clear enough')
  assert.deepEqual(candidates(pois, { lines: [], hotspots: saved }), [], 'no line, no stop on one')
})

test('mergeNear: a stop and its shelter on one side are one draft; facing stops are two', () => {
  const found = candidates(
    [
      { class: 'bus', subclass: 'bus_stop', name: 'Deparo Road', at: at(30, 5) },
      { class: 'shelter', subclass: 'shelter', name: 'Jeepney Waiting Area', at: at(42, 5) },
      { class: 'bus', subclass: 'bus_stop', name: 'Deparo Road', at: at(30, -5) },
    ],
    { lines: [LINE], hotspots: [] },
  )
  const merged = mergeNear(found)
  assert.deepEqual(merged.map((m) => m.names), [['Deparo Road', 'Jeepney Waiting Area'], ['Deparo Road']])
})

test('draftId: the same stop the same id; another stop another', () => {
  assert.equal(draftId('Zabarte', [121.043764, 14.754901]), draftId('Zabarte', [121.0437641, 14.7549012]))
  assert.notEqual(draftId('Zabarte', [121.043764, 14.754901]), draftId('Zabarte', [121.043764, 14.757075]))
  assert.notEqual(draftId('Zabarte', [121.043764, 14.754901]), draftId('Petunia', [121.043764, 14.754901]))
  assert.match(draftId('Zabarte', [121.043764, 14.754901]), /^draft-[0-9a-z]+$/)
})

test('draftRecord: what the studio reads', () => {
  const [c] = mergeNear(candidates([{ class: 'bus', subclass: 'bus_stop', name: 'Petunia', at: at(20, 6) }], { lines: [LINE], hotspots: [] }))
  const d = draftRecord(c)
  assert.equal(d.name, 'Petunia')
  assert.equal(d.kind, 'hintuan')
  assert.equal(d.on_road, false)
  assert.equal(d.ring.length, 4)
  assert.equal(d.route_m, 6)
  assert.deepEqual(d.osm_names, ['Petunia'])
  assert.equal(d.nearest, null)
  assert.equal(d.id, draftId('Petunia', c.at))
})

const DRAFT = { id: 'draft-x', name: 'Petunia', kind: 'hintuan', on_road: false, ring: [at(10, 2.5), at(41, 2.5), at(41, 9.5), at(10, 9.5)], at: at(25, 6), osm_names: ['Petunia'], route_m: 6, nearest: { name: 'Station 12', metres: 60 } }

test("draftMiddle and draftsLeft: a draft goes once a saved hotspot takes its place", () => {
  const middle = metres(draftMiddle(DRAFT))
  assert.ok(near(middle[0], 25.5) && near(middle[1], 6))
  assert.equal(draftsLeft([DRAFT], []).length, 1)
  assert.equal(draftsLeft([DRAFT], [hotspot('Petunia', box(12, 1, 40, 9))]).length, 0, 'a box over its middle')
  // A box beside it, its middle within TAKEN_M of the draft's.
  const beside = hotspot('Petunia', box(20, -9, 32, -1))
  assert.ok(Math.hypot(...metres(beside.point.coordinates).map((v, i) => v - middle[i])) <= TAKEN_M)
  assert.equal(draftsLeft([DRAFT], [beside]).length, 0)
  assert.equal(draftsLeft([DRAFT], [hotspot('Elsewhere', box(80, 3, 104, 10))]).length, 1)
})

test('draftNote and draftDetail: where it came from, and what is near it', () => {
  assert.equal(draftNote(DRAFT, { made_at: '2026-10-06T17:00:00Z' }), 'OpenStreetMap stop "Petunia", drafted 2026-10-06')
  assert.equal(draftNote({ osm_names: ['Deparo Road', 'Jeepney Waiting Area'] }, { made_at: '2026-10-06T17:00:00Z' }), 'OpenStreetMap stop "Deparo Road" / "Jeepney Waiting Area", drafted 2026-10-06')
  assert.equal(draftDetail(DRAFT), '60 m from Station 12')
  assert.equal(draftDetail({ nearest: null, on_road: true }), 'no hotspot near · on the road, side unknown')
})

test("draftsData: each draft's box closed, and its name at its middle", () => {
  const data = draftsData([DRAFT])
  assert.deepEqual(data.features.map((f) => f.geometry.type), ['Polygon', 'Point'])
  const ring = data.features[0].geometry.coordinates[0]
  assert.equal(ring.length, 5)
  assert.deepEqual(ring[4], ring[0])
  assert.deepEqual(data.features[1].properties, { id: 'draft-x', name: 'Petunia' })
})

// Not against today's published file: it is rebuilt every night, and a
// hotspot saved since must not fail the build (draftsLeft takes care of it).
test("the drafts' file: Caloocan's, each a named box of the owner's size near a line, ids once each", () => {
  const file = JSON.parse(readFileSync(new URL('../../src/studio/drafts/hintuanDrafts.trial.json', import.meta.url), 'utf8'))
  assert.equal(file.area, 'Caloocan')
  assert.match(file.licence, /OpenStreetMap/)
  assert.ok(file.drafts.length > 0)
  const ids = file.drafts.map((d) => d.id)
  assert.equal(new Set(ids).size, ids.length, 'each id once')
  for (const d of file.drafts) {
    assert.match(d.id, /^draft-[0-9a-z]+$/)
    assert.ok(d.name.trim().length > 0)
    assert.equal(d.kind, 'hintuan')
    assert.equal(d.ring.length, 4, `${d.name}: four corners`)
    assert.ok(d.ring.every((p) => p.length === 2 && p.every(Number.isFinite)))
    assert.ok(d.route_m <= 25, `${d.name}: on a jeepney line`)
    const k = 111_320 * Math.cos((d.ring[0][1] * Math.PI) / 180)
    const side = (a, b) => Math.hypot((b[0] - a[0]) * k, (b[1] - a[1]) * 110_574)
    assert.ok(near(side(d.ring[0], d.ring[1]), BOX.lengthM, 0.5), `${d.name}: ${side(d.ring[0], d.ring[1])} m long`)
    assert.ok(near(side(d.ring[1], d.ring[2]), BOX.depthM, 0.5), `${d.name}: ${side(d.ring[1], d.ring[2])} m deep`)
  }
})
