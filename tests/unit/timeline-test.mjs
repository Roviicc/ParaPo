// A direction's timeline (src/shared/model/timeline.ts, timelineFor): a row is a
// hintuan, named by its stop name. The boxes of one place passed one after
// another are its mini stops and make one row — the owner's model of
// 2026-09-28.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/timeline-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SAME_HINTUAN_M, labelGroups, placeBoxes, placeSummary } from '../../src/shared/model/places.ts'
import { drawnFromTheEnd, timelineFor, hintuansAlong } from '../../src/shared/model/timeline.ts'
import { variantLine } from '../../src/shared/model/routes.ts'
import { rideCut, routeTimeline } from '../../src/shared/model/ride.ts'
import { otherRoutesFrom, sharingAnEnd } from '../../src/shared/model/departures.ts'
import { haversine, lineLength } from '../../src/shared/geo/geo.ts'
import { fileURLToPath } from 'node:url'
import { readPublished } from '../../scripts/checks/check-map-data.mjs'

/** The committed map, every line in full: the index and its lines/ (check-map-data.mjs). */
const published = () => readPublished(fileURLToPath(new URL('../../public/data/index.json', import.meta.url))).file

let n = 0
const box = (name, informal = null, kind = 'hintuan') => ({ id: `s${n++}`, kind, name, informal, aliases: [], point: { type: 'Point', coordinates: [0, 0] } })
const labels = (along, head = null, tail = null) => timelineFor(head, tail, false, along).between.map((r) => r.label)

test('both sides of the road, one after another: one row, the first box', () => {
  const a = box('Bestlink'), b = box('Bestlink'), c = box('Greenfields')
  const t = timelineFor(null, null, false, [a, b, c])
  assert.deepEqual(t.between.map((r) => r.label), ['Bestlink', 'Greenfields'])
  assert.equal(t.between[0].id, a.id)
})

test("a place's mini stops with names of their own are one row, by the stop name", () => {
  const along = [box('Metroplaza', 'Malaria'), box('Malaria'), box('Barracks')]
  assert.deepEqual(labels(along), ['Malaria', 'Barracks'])
})

test('the same place with something between stays twice: the jeep passes it twice', () => {
  assert.deepEqual(labels([box('Lagro'), box('Fatima'), box('Lagro')]), ['Lagro', 'Fatima', 'Lagro'])
})

test("the ends' places are not in the middle", () => {
  const end = box('SM City Fairview Jeepney Terminal', 'SM Fairview', 'terminal')
  const along = [box('Lagro'), box('Fairview Teraccess', 'SM Fairview'), box('SM Fairview Main', 'SM Fairview')]
  assert.deepEqual(labels(along, box('Tala'), end), ['Lagro'])
})

test('case does not make two names', () => {
  assert.deepEqual(labels([box('Amparo'), box('amparo')]), ['Amparo'])
})

test('what a place is made of: one hintuan, its boxes mini stops', () => {
  assert.equal(placeSummary([box('Bestlink'), box('Bestlink')]), 'hintuan · 2 mini stops')
  assert.equal(placeSummary([box('T', 'SM', 'terminal'), box('A', 'SM'), box('B', 'SM')]), 'terminal + hintuan · 2 mini stops')
  assert.equal(placeSummary([box('T', 'SM', 'terminal'), box('A', 'SM')]), 'terminal + hintuan')
})

test('the committed map: no direction lists the same hintuan twice in a row', () => {
  const m = published()
  for (const v of m.variants) {
    const rows = labels(hintuansAlong(variantLine(v), m.stops, v.route).map((a) => a.stop))
    rows.forEach((r, i) => assert.notEqual(r, rows[i - 1], `${v.direction_name}: ${r} twice`))
  }
})

// The map's labels (labelGroups): one per hintuan, not one per box.
const at = (name, lng, lat, kind = 'hintuan') => ({ ...box(name), kind, point: { type: 'Point', coordinates: [lng, lat] } })

test('two boxes of one name across the road: one label, halfway between', () => {
  const g = labelGroups([at('Bestlink', 121.0, 14.7), at('Bestlink', 121.0001, 14.7)])
  assert.equal(g.length, 1)
  assert.equal(g[0].ids.length, 2)
  assert.ok(Math.abs(g[0].point[0] - 121.00005) < 1e-9)
})

test('the same name far apart, or another kind: labels of their own', () => {
  assert.equal(labelGroups([at('Lagro', 121.0, 14.7), at('Lagro', 121.01, 14.7)]).length, 2)
  assert.equal(labelGroups([at('Tala', 121.0, 14.7), at('Tala', 121.0, 14.7, 'terminal')]).length, 2)
})

test('the committed map: every box named by exactly one label, same-name boxes a road apart sharing it', () => {
  // By the rule, not by a named stop: the owner edits the live map between
  // publishes, and a test naming Bestlink broke the day he deleted it.
  const m = published()
  const groups = labelGroups(m.stops)
  const labelled = groups.flatMap((g) => g.ids)
  assert.equal(labelled.length, m.stops.length)
  assert.equal(new Set(labelled).size, labelled.length)
  const groupOf = (id) => groups.findIndex((g) => g.ids.includes(id))
  for (const a of m.stops)
    for (const b of m.stops) {
      if (a.id >= b.id || a.kind !== 'hintuan' || b.kind !== 'hintuan') continue
      if (a.name.trim().toLowerCase() !== b.name.trim().toLowerCase()) continue
      if (haversine(a.point.coordinates, b.point.coordinates) <= SAME_HINTUAN_M)
        assert.equal(groupOf(a.id), groupOf(b.id), `${a.name}: one hintuan, two labels`)
    }
})

// The ride-to preview's cut (src/shared/model/ride.ts, rideCut).
const pt = (lng, lat = 0) => ({ type: 'Point', coordinates: [lng, lat] })
const ringAt = (lng, r = 0.0002) => ({ type: 'Polygon', coordinates: [[[lng - r, -r], [lng + r, -r], [lng + r, r], [lng - r, r], [lng - r, -r]]] })
const mini = (id, lng, name = 'Amparo') => ({ id, kind: 'hintuan', name, informal: null, aliases: [], point: pt(lng), area: ringAt(lng) })
const RIDE_STOPS = [
  { id: 'h', kind: 'terminal', name: 'Head', informal: null, aliases: [], point: pt(0) },
  { id: 't', kind: 'terminal', name: 'Tail', informal: null, aliases: [], point: pt(0.03) },
  mini('near', 0.015),
  mini('far', 0.02),
]
const LINE = [[0, 0], [0.01, 0], [0.02, 0], [0.03, 0]]
const vr = (coordinates, reversed = false) => ({
  id: 'v1', reversed, route: { head_stop_id: 'h', tail_stop_id: 't' },
  shape: { type: 'LineString', coordinates },
})
const KM = 3339.6 / 3 // one 0.01° step at the equator, in metres

test('a dot for each mini stop, and the ride ends at the last one', () => {
  const r = rideCut(vr(LINE), RIDE_STOPS, 'near')
  assert.deepEqual(r.dots.map((d) => d.stopId), ['near', 'far'])
  assert.equal(r.endStopId, 'far')
  assert.ok(Math.abs(r.metres - 2 * KM) < 30, `${r.metres}`)
  assert.ok(Math.abs(r.at[0] - 0.02) < 0.0003)
  assert.ok(Math.abs(lineLength(r.ridden) - r.metres) < 1)
  assert.deepEqual(r.rest[0], r.at)
})

test('tapping the other dot moves the get-off side, not the hintuan', () => {
  const r = rideCut(vr(LINE), RIDE_STOPS, 'near', 'near')
  assert.equal(r.endStopId, 'near')
  assert.ok(Math.abs(r.metres - 1.5 * KM) < 30, `${r.metres}`)
  assert.deepEqual(r.dots.map((d) => d.stopId), ['near', 'far'])
})

test('each dot sits at the middle of its own stretch', () => {
  const r = rideCut(vr(LINE), RIDE_STOPS, 'near')
  const near = r.dots.find((d) => d.stopId === 'near')
  assert.ok(Math.abs(near.at[0] - 0.015) < 0.0003, `${near.at[0]}`)
})

test('a line drawn from the far end is cut on the leaving side', () => {
  const r = rideCut(vr([...LINE].reverse()), RIDE_STOPS, 'near')
  assert.equal(r.endStopId, 'far')
  assert.ok(Math.abs(r.metres - 2 * KM) < 30, `${r.metres}`)
  assert.ok(Math.abs(r.at[0] - 0.02) < 0.0003)
})

test('a place the line never passes: null', () => {
  assert.equal(rideCut(vr(LINE), [...RIDE_STOPS.slice(0, 2), mini('off', 0.015, 'Elsewhere')], 'near'), null)
})

// The public map's trip card picks a hintuan by its row (the owner's
// Timeline State=Selected, 2026-09-29). Its rows come from the published
// links, the cut from the line's geometry: every row must cut, each further
// along than the one before it, and short of the whole ride — so a pill
// never prices more than the Expected fare tile.
test('the committed map: every trip-card row cuts, forward, short of the whole', () => {
  const m = published()
  let rows = 0
  for (const v of m.variants.filter((x) => x.shape?.coordinates?.length > 1)) {
    const along = m.links
      .filter((l) => l.route_variant_id === v.id)
      .sort((a, b) => a.stop_sequence - b.stop_sequence)
      .map((l) => m.stops.find((s) => s.id === l.stop_id))
      .filter(Boolean)
    const whole = lineLength(variantLine(v))
    let last = 0
    for (const row of routeTimeline(v, m.stops, along).between) {
      const cut = rideCut(v, m.stops, row.id)
      assert.ok(cut, `${v.direction_name}: ${row.label} does not cut`)
      assert.ok(cut.metres > last, `${v.direction_name}: ${row.label} at ${Math.round(cut.metres)} m, not past ${Math.round(last)} m`)
      assert.ok(cut.metres < whole, `${v.direction_name}: ${row.label} past the whole ride`)
      last = cut.metres
      rows++
    }
  }
  assert.ok(rows > 0, 'no rows on the committed map')
})

// The routes a trip's ‹ lists when it was opened on its own (src/shared/model/departures.ts, sharingAnEnd).
/** A route's two directions, head to tail and back: sample data, shaped like the published file. */
const both = (id, head, tail) =>
  [false, true].map((reversed) => ({ id: id + (reversed ? '-back' : ''), route_id: id, reversed, route: { head_stop_id: head, tail_stop_id: tail } }))
const idsOf = (vs) => vs.map((v) => v.id).sort()
const FAN = [
  ...both('talaNova', 'tala', 'nova'),
  ...both('talaSm', 'tala', 'sm'), // the same head
  ...both('bsNova', 'bs', 'nova'), // the same tail
  ...both('novaBs', 'nova', 'bs'), // starts where Tala – Novaliches ends: a change of jeep
  ...both('far', 'x', 'y'),
]

test('the fan: every route sharing its head or its tail, both ways round, its own included', () => {
  const want = idsOf([...both('talaNova', 'tala', 'nova'), ...both('talaSm', 'tala', 'sm'), ...both('bsNova', 'bs', 'nova')])
  assert.deepEqual(idsOf(sharingAnEnd(FAN, FAN[0])), want)
  assert.deepEqual(idsOf(sharingAnEnd(FAN, FAN[1])), want, 'the way back has the same fan')
})

test('a route sharing no end, or with none in an old file, fans out to itself', () => {
  assert.deepEqual(idsOf(sharingAnEnd(FAN, FAN.at(-1))), idsOf(both('far', 'x', 'y')))
  const old = [...both('a', undefined, undefined), ...both('b', undefined, undefined)]
  assert.deepEqual(idsOf(sharingAnEnd(old, old[0])), idsOf(both('a')))
})

// The one travel-order rule (the review's 6.5): the ends decide, not the drawing.
test('a line is drawn from the far end when it starts nearer where the ride goes; a tie reads as drawn forward', () => {
  const from = at('Tala', 0, 0, 'terminal')
  const to = at('Novaliches', 0.03, 0, 'terminal')
  assert.equal(drawnFromTheEnd([0.001, 0], from, to), false)
  assert.equal(drawnFromTheEnd([0.029, 0], from, to), true)
  assert.equal(drawnFromTheEnd([0.015, 0], from, to), false)
})

test("a place's boxes on its HintuanCard: terminals first, then hintuans, in drawing order; shared names numbered", () => {
  const at = (name, informal, kind, created_at) => ({ ...box(name, informal, kind), id: `${name}@${created_at}`, created_at })
  const t = at('SM City Fairview Jeepney Terminal', 'SM Fairview', 'terminal', '2026-09-03')
  const a = at('Fairview Teraccess', 'SM Fairview', 'hintuan', '2026-09-01')
  const b = at('SM Fairview Main', 'SM Fairview', 'hintuan', '2026-09-02')
  const c = at('Fairview Teraccess', 'SM Fairview', 'hintuan', '2026-09-04')
  const other = at('Bestlink', 'Bestlink', 'hintuan', '2026-09-01')
  assert.deepEqual(
    placeBoxes(b, [c, other, b, t, a]).map((r) => r.label),
    ['SM City Fairview Jeepney Terminal', 'Fairview Teraccess 1', 'SM Fairview Main', 'Fairview Teraccess 2'],
  )
  // A place of one box: its name alone.
  assert.deepEqual(placeBoxes(other, [other, a]).map((r) => r.label), ['Bestlink'])
})

// "Other routes" under a trip (src/shared/model/departures.ts, otherRoutesFrom).
/** As `both`, drawn: a line of two points each way. */
const drawn = (id, head, tail) => both(id, head, tail).map((v) => ({ ...v, shape: { coordinates: [[0, 0], [1, 1]] } }))
const OUT = [
  ...drawn('talaNova', 'tala', 'nova'),
  ...drawn('talaSm', 'tala', 'sm'), // out of Tala too
  ...drawn('talaNova2', 'tala', 'nova'), // the same trip, another route
  ...drawn('smTala', 'sm', 'tala'), // its way back starts at Tala
  ...both('talaX', 'tala', 'x'), // out of Tala, but not drawn
  ...drawn('novaBs', 'nova', 'bs'), // starts where the trip ends
]

test('other routes: one direction of each other drawn route leaving where the trip starts', () => {
  assert.deepEqual(idsOf(otherRoutesFrom(OUT, OUT[0])), ['smTala-back', 'talaNova2', 'talaSm'])
  assert.deepEqual(idsOf(otherRoutesFrom(OUT, OUT[1])), ['novaBs', 'talaNova2-back'], 'the way back starts at Novaliches')
})

test('other routes: none where none leave, or the file carries no ends', () => {
  const far = [...OUT, ...drawn('far', 'x', 'y')]
  assert.deepEqual(idsOf(otherRoutesFrom(far, far.at(-2))), [])
  const old = [...drawn('a', undefined, undefined), ...drawn('b', undefined, undefined)]
  assert.deepEqual(idsOf(otherRoutesFrom(old, old[0])), [])
})
