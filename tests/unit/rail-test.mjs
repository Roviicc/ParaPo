// The train lines' one rule (src/shared/model/routes.ts, servedBy): a train
// stops only at its own line's stations, a jeep at every hintuan but a
// station — the owner's default of 2026-10-02. Every question of which
// hintuans a line passes asks it: the timeline, the ride-to cut, the links.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/rail-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MODES, RAIL_LINES, isRail, servedBy } from '../../src/shared/model/routes.ts'
import { hintuansAlong } from '../../src/shared/model/timeline.ts'
import { rideCut } from '../../src/shared/model/ride.ts'
import { linksThrough } from '../../src/studio/data/stopsGeometry.ts'

const JEEP = { mode: 'jeepney', route_code: null }
const LRT1 = { mode: 'lrt', route_code: 'LRT-1' }
const MRT3 = { mode: 'mrt', route_code: 'MRT-3' }

test('only lrt and mrt are trains', () => {
  assert.deepEqual(MODES.filter((m) => isRail(m.value)).map((m) => m.value), ['lrt', 'mrt'])
  assert.equal(isRail(undefined), false)
  assert.deepEqual([...RAIL_LINES], ['LRT-1', 'LRT-2', 'MRT-3'])
})

test('a jeep stops at a hintuan, not at a station', () => {
  assert.equal(servedBy({ line: null }, JEEP), true)
  assert.equal(servedBy({}, JEEP), true, 'a hotspot from a file before 0011')
  assert.equal(servedBy({ line: 'LRT-1' }, JEEP), false)
})

test("a train stops at its own line's stations only", () => {
  assert.equal(servedBy({ line: 'LRT-1' }, LRT1), true)
  assert.equal(servedBy({ line: 'MRT-3' }, LRT1), false)
  assert.equal(servedBy({ line: null }, LRT1), false)
  assert.equal(servedBy({ line: 'MRT-3' }, MRT3), true)
})

test('a train with no line named stops nowhere, not at the jeep hintuans under it', () => {
  for (const route of [{ mode: 'lrt', route_code: null }, { mode: 'mrt' }]) {
    assert.equal(servedBy({ line: null }, route), false)
    assert.equal(servedBy({ line: 'LRT-1' }, route), false)
  }
})

// Taft Avenue, flat: a jeep hintuan and an LRT-1 station on the same stretch
// of road, the track right over it.
const pt = (lng) => ({ type: 'Point', coordinates: [lng, 0] })
const ringAt = (lng, r = 0.0002) => ({ type: 'Polygon', coordinates: [[[lng - r, -r], [lng + r, -r], [lng + r, r], [lng - r, r], [lng - r, -r]]] })
const hintuan = (id, lng, name, line = null) => ({ id, kind: 'hintuan', name, informal: null, aliases: [], point: pt(lng), area: ringAt(lng), line })
const STOPS = [
  { id: 'h', kind: 'terminal', name: 'Head', informal: null, aliases: [], point: pt(0) },
  { id: 't', kind: 'terminal', name: 'Tail', informal: null, aliases: [], point: pt(0.03) },
  hintuan('jeep-buendia', 0.01, 'Buendia'),
  hintuan('lrt-buendia', 0.0101, 'Buendia', 'LRT-1'),
  hintuan('jeep-libertad', 0.02, 'Libertad'),
  hintuan('mrt-taft', 0.025, 'Taft Avenue', 'MRT-3'),
]
const LINE = [[0, 0], [0.01, 0], [0.02, 0], [0.03, 0]]
const ids = (route) => hintuansAlong(LINE, STOPS, route).map((a) => a.stop.id)

test('along the same road, each line lists only what it stops at', () => {
  assert.deepEqual(ids(JEEP), ['jeep-buendia', 'jeep-libertad'])
  assert.deepEqual(ids(LRT1), ['lrt-buendia'])
  assert.deepEqual(ids(MRT3), ['mrt-taft'])
})

test("the ride-to cut of a place shared by a jeep hintuan and a station keeps to the line's own", () => {
  const v = (route) => ({ id: 'v', reversed: false, route: { ...route, head_stop_id: 'h', tail_stop_id: 't' }, shape: { type: 'LineString', coordinates: LINE } })
  assert.deepEqual(rideCut(v(JEEP), STOPS, 'jeep-buendia').dots.map((d) => d.stopId), ['jeep-buendia'])
  assert.deepEqual(rideCut(v(LRT1), STOPS, 'lrt-buendia').dots.map((d) => d.stopId), ['lrt-buendia'])
})

// The studio's links when a hintuan is saved (stopsGeometry.ts, linksThrough):
// the one place that writes a box's route list, by the same rule.
test('a saved box is linked only to the directions that stop at it', () => {
  const dir = (id, route) => ({ id, route, shape: { type: 'LineString', coordinates: LINE } })
  const variants = [dir('jeep', JEEP), dir('lrt', LRT1), dir('mrt', MRT3)]
  const ring = ringAt(0.01).coordinates[0]
  assert.deepEqual(linksThrough(ring, variants, null).map((l) => l.variantId), ['jeep'])
  assert.deepEqual(linksThrough(ring, variants, 'LRT-1').map((l) => l.variantId), ['lrt'])
})

// The publish while the file is on its old shape (scripts/publish/withoutTrains.mjs):
// the trains, their stations and every link to either left out, the rest as it was.
test('the old-shape publish leaves out the trains, their stations and their links', async () => {
  const { withoutTrains } = await import('../../scripts/publish/withoutTrains.mjs')
  const variants = [{ id: 'jeep', route: JEEP }, { id: 'lrt', route: LRT1 }, { id: 'mrt', route: MRT3 }]
  const stops = [{ id: 'h', line: null }, { id: 'st', line: 'LRT-1' }, { id: 'old' }]
  const links = [
    { route_variant_id: 'jeep', stop_id: 'h' },
    { route_variant_id: 'lrt', stop_id: 'st' },
    { route_variant_id: 'jeep', stop_id: 'st' },
  ]
  const out = withoutTrains({ variants, stops, links })
  assert.deepEqual(out.variants.map((v) => v.id), ['jeep'])
  assert.deepEqual(out.stops.map((s) => s.id), ['h', 'old'])
  assert.deepEqual(out.links, [{ route_variant_id: 'jeep', stop_id: 'h' }])
  assert.deepEqual([...out.ids.variants], ['lrt', 'mrt'])
  assert.deepEqual([...out.ids.stops], ['st'])
})
