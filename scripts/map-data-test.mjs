// The map data check (scripts/check-map-data.mjs) against small maps with
// one thing wrong each, and against the committed map.
//
//   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/map-data-test.mjs
//
// Why this exists: the check stands between the nightly publish and the
// public map. It must stop a file the app cannot show honestly, and only
// that; a line that ends far from its terminal, or a link the line does not
// honour, is the owner's to look at, never a reason to leave the map stale.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { checkMapData, markdownReport, END_WITHIN_M } from './check-map-data.mjs'

// A flat patch of Tala: metres east and north of a corner, as lng/lat.
const [X0, Y0] = [121.05, 14.73]
const at = (eastM, northM) => [X0 + eastM / (111_320 * Math.cos((Y0 * Math.PI) / 180)), Y0 + northM / 110_574]
const box = (eastM, northM, halfM = 15) => ({
  type: 'Polygon',
  coordinates: [[at(eastM - halfM, northM - halfM), at(eastM + halfM, northM - halfM), at(eastM + halfM, northM + halfM), at(eastM - halfM, northM + halfM), at(eastM - halfM, northM - halfM)]],
})
const stop = (id, kind, eastM, northM, extra = {}) => ({
  id,
  name: id,
  informal: null,
  aliases: [],
  kind,
  point: { type: 'Point', coordinates: at(eastM, northM) },
  area: box(eastM, northM),
  note: null,
  created_at: '2026-09-25T00:00:00Z',
  ...extra,
})
// A terminal at the west end, a hintuan on the road 500 m along, a terminal at 1 km.
const route = { id: 'r', signboard: null, long_name: null, mode: 'jeepney', fare_note: null, head_stop_id: 'West', tail_stop_id: 'East', via: null, name: 'West – East' }
const direction = (line, extra = {}) => ({
  id: 'd',
  route_id: 'r',
  direction_name: 'West → East',
  origin_terminal: null,
  destination_terminal: null,
  shape: line ? { type: 'LineString', coordinates: line } : null,
  reversed: false,
  confidence: null,
  route,
  ...extra,
})
/** A straight line along the road, every 25 m from `fromM` to `toM`. */
const road = (fromM, toM) => Array.from({ length: Math.round((toM - fromM) / 25) + 1 }, (_, i) => at(fromM + i * 25, 0))
const good = () => ({
  schema: 1,
  published_at: '2026-09-25T00:00:00Z',
  variants: [direction(road(0, 1000))],
  stops: [stop('West', 'terminal', 0, 0), stop('Mid', 'hintuan', 500, 0), stop('East', 'terminal', 1000, 0)],
  links: [{ route_variant_id: 'd', stop_id: 'Mid', stop_sequence: 20 }],
})

test('a map whose links, line and ends agree has nothing to report', () => {
  const r = checkMapData(good())
  assert.deepEqual(r.problems, [])
  assert.deepEqual(r.warnings, [])
  assert.match(markdownReport(good(), r), /Nothing to report/)
})

test('a link to a hotspot that is not in the file is a problem, so the map is not published', () => {
  const m = good()
  m.links.push({ route_variant_id: 'd', stop_id: 'Gone', stop_sequence: 3 })
  const r = checkMapData(m)
  assert.equal(r.problems.length, 1)
  assert.match(r.problems[0], /hotspot Gone/)
  assert.match(markdownReport(m, r), /not published/)
})

test('a route whose end hotspot is missing is a problem', () => {
  const m = good()
  m.stops = m.stops.filter((s) => s.id !== 'East')
  const r = checkMapData(m)
  assert.ok(r.problems.some((p) => /tail hotspot East/.test(p)), r.problems.join(' | '))
})

test('an id twice, a hotspot without a point, a link to a missing direction: problems', () => {
  const m = good()
  m.stops.push(stop('Mid', 'hintuan', 700, 0))
  m.stops.push(stop('Nowhere', 'hintuan', 800, 0, { point: null }))
  m.links.push({ route_variant_id: 'x', stop_id: 'Mid', stop_sequence: 0 })
  const r = checkMapData(m)
  assert.ok(r.problems.some((p) => /Mid appears twice/.test(p)))
  assert.ok(r.problems.some((p) => /"Nowhere".*no point/.test(p)))
  assert.ok(r.problems.some((p) => /direction x/.test(p)))
})

test(`a line that ends more than ${END_WITHIN_M} m from its terminal is a warning, not a problem`, () => {
  const m = good()
  m.variants = [direction(road(0, 600))]
  const r = checkMapData(m)
  assert.deepEqual(r.problems, [])
  assert.equal(r.warnings.length, 1)
  assert.match(r.warnings[0], /the line ends 385 m from East/)
})

test('a line drawn from the far end is a note; the app turns it round', () => {
  const m = good()
  m.variants = [direction(road(0, 1000).reverse())]
  const r = checkMapData(m)
  assert.deepEqual(r.warnings, [])
  assert.ok(r.notes.some((n) => /drawn from the far end/.test(n)), r.notes.join(' | '))
})

test('a hintuan the line passes but is not linked to is a warning', () => {
  const m = good()
  m.links = []
  const r = checkMapData(m)
  assert.deepEqual(r.problems, [])
  assert.equal(r.warnings.length, 1)
  assert.match(r.warnings[0], /passes "Mid" but is not linked/)
})

test('a linked hintuan the line never reaches is a warning that says how near it comes', () => {
  const m = good()
  m.stops[1] = stop('Mid', 'hintuan', 500, 80)
  const r = checkMapData(m)
  assert.equal(r.warnings.length, 1)
  assert.match(r.warnings[0], /linked to "Mid" but the line never comes within 5 m of its box \(nearest 65 m\)/)
})

test('a box the published line passes at 5.2 m is neither: the drawn line may have been nearer', () => {
  const m = good()
  m.stops[1] = stop('Mid', 'hintuan', 500, 15 + 5.2)
  assert.deepEqual(checkMapData(m).warnings, [])
  m.links = []
  assert.deepEqual(checkMapData(m).warnings, [])
})

test('a hintuan without a box is a warning; a direction without a line is a note', () => {
  const m = good()
  m.stops.push(stop('Loose', 'hintuan', 300, 100, { area: null }))
  m.variants.push(direction(null, { id: 'back', direction_name: 'East → West', reversed: true }))
  const r = checkMapData(m)
  assert.deepEqual(r.problems, [])
  assert.ok(r.warnings.some((w) => /"Loose" has no box/.test(w)), r.warnings.join(' | '))
  assert.ok(r.notes.some((n) => /1 direction\(s\) not mapped yet/.test(n)))
})

test('something that is not a map is one problem', () => {
  assert.equal(checkMapData({ hello: 'world' }).problems.length, 1)
})

test('the committed map has no problem', () => {
  const file = JSON.parse(readFileSync(new URL('../public/data/map.json', import.meta.url), 'utf8'))
  const r = checkMapData(file)
  assert.deepEqual(r.problems, [])
  console.log(`  ${r.warnings.length} warning(s) on the committed map${r.warnings.length ? ':\n  ' + r.warnings.join('\n  ') : ''}`)
})
