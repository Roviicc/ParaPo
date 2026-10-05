// The map data check (scripts/checks/check-map-data.mjs) against small maps with
// one thing wrong each, and against the committed map.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/map-data-test.mjs
//
// Why this exists: the check stands between the nightly publish and the
// public map. It must stop a file the app cannot show honestly, and only
// that; a line that ends far from its terminal, or a link the line does not
// honour, is the owner's to look at, never a reason to leave the map stale.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkMapData, markdownReport, END_WITHIN_M, readPublished } from '../../scripts/checks/check-map-data.mjs'
import { fileURLToPath } from 'node:url'

/**
 * The committed map, every line in full: the index and its lines/
 * (check-map-data.mjs). A line file missing, not its direction's, or of
 * another length than the index says fails here, not quietly further on.
 */
const published = () => {
  const { file, problems } = readPublished(fileURLToPath(new URL('../../public/data/index.v4.json', import.meta.url)))
  assert.deepEqual(problems, [])
  return file
}

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
  const file = published()
  const r = checkMapData(file)
  assert.deepEqual(r.problems, [])
  console.log(`  ${r.warnings.length} warning(s) on the committed map${r.warnings.length ? ':\n  ' + r.warnings.join('\n  ') : ''}`)
})

// The train lines (0011): the link rule asks servedBy, and the file must say
// which line a train or a station is.

const train = (line) => ({ ...route, mode: 'lrt', route_code: line })
/** The good map's two terminals named as LRT-1 stations, so a train's ends are priced. */
const stationEnds = (m) => {
  m.stops = m.stops.map((s) => (s.id === 'West' ? { ...s, informal: 'Baclaran' } : s.id === 'East' ? { ...s, informal: 'Libertad' } : s))
  return m
}

test('a train under a jeep hintuan is owed no link, and one it has is a warning', () => {
  const m = stationEnds(good())
  m.variants = [direction(road(0, 1000), { route: train('LRT-1') })]
  m.links = []
  assert.deepEqual(checkMapData(m).warnings, [])
  m.links = [{ route_variant_id: 'd', stop_id: 'Mid', stop_sequence: 20 }]
  const r = checkMapData(m)
  assert.deepEqual(r.problems, [])
  assert.equal(r.warnings.length, 1)
  assert.match(r.warnings[0], /does not stop at/)
})

test('a jeep under a station is owed no link; the train over it is', () => {
  const m = stationEnds(good())
  m.stops.push(stop('EDSA', 'hintuan', 700, 0, { line: 'LRT-1' }))
  assert.deepEqual(checkMapData(m).warnings, [])
  m.variants.push({ ...direction(road(0, 1000)), id: 'rail', route: train('LRT-1') })
  const r = checkMapData(m)
  assert.equal(r.warnings.length, 1)
  assert.match(r.warnings[0], /passes "EDSA" but is not linked/)
})

test('a train route with no line, or a station of no line, is a problem', () => {
  const m = good()
  m.variants = [direction(road(0, 1000), { route: train(null) })]
  m.links = []
  assert.match(checkMapData(m).problems.join('\n'), /is not a train line/)
  const s = good()
  s.stops.push(stop('Odd', 'hintuan', 700, 0, { line: 'LRT-9' }))
  assert.match(checkMapData(s).problems.join('\n'), /"LRT-9", which is not a line/)
  const t = good()
  t.stops[0] = { ...t.stops[0], line: 'LRT-1' }
  assert.match(checkMapData(t).problems.join('\n'), /a station is a hintuan/)
})

test('a station whose name the fare table does not know is a warning', () => {
  const m = good()
  m.stops.push(stop('EDSA', 'hintuan', 700, 0, { line: 'LRT-1' }))
  assert.deepEqual(checkMapData(m).warnings, [])
  m.stops.push(stop('Nowhere Station', 'hintuan', 800, 0, { line: 'LRT-1' }))
  const r = checkMapData(m)
  assert.deepEqual(r.problems, [])
  assert.match(r.warnings.join('\n'), /"Nowhere Station" is not in the LRT-1 fare table/)
})

test('a station is priced by the name the card shows, not by its other names', () => {
  const m = good()
  m.stops.push(stop('Yamaha', 'hintuan', 700, 0, { line: 'LRT-1', aliases: ['Monumento'] }))
  assert.match(checkMapData(m).warnings.join('\n'), /"Yamaha" is not in the LRT-1 fare table/)
})

test('a station of no line is a problem and owes no fare warning', () => {
  const m = good()
  m.stops.push(stop('Somewhere', 'hintuan', 700, 0, { line: 'PNR' }))
  const r = checkMapData(m)
  assert.equal(r.problems.filter((p) => /"PNR", which is not a line/.test(p)).length, 1)
  assert.doesNotMatch(r.warnings.join('\n'), /fare table/)
})

test('a train whose end the fare table does not know is a warning: its card shows no fare', () => {
  const m = good()
  m.variants = [direction(road(0, 1000), { route: train('LRT-1') })]
  m.links = []
  const r = checkMapData(m)
  assert.deepEqual(r.problems, [])
  assert.match(r.warnings.join('\n'), /ends at "West", which is not in the LRT-1 fare table/)
  assert.deepEqual(checkMapData(stationEnds(m)).warnings, [])
})

// The ferry (0012): a line as a train is, free, so its stations need no fare table.
const ferry = (line) => ({ ...route, mode: 'ferry', route_code: line })

test('a ferry under a jeep hintuan is owed no link; its stations are, with no fare-table warning', () => {
  const m = good()
  m.stops.push(stop('Pier', 'hintuan', 700, 0, { line: 'PRFS' }))
  m.variants = [direction(road(0, 1000), { route: ferry('PRFS') })]
  m.links = [{ route_variant_id: 'd', stop_id: 'Pier', stop_sequence: 20 }]
  const r = checkMapData(m)
  assert.deepEqual(r.problems, [])
  assert.deepEqual(r.warnings, [])
})

test('a ferry route with no line, or a train line, is a problem', () => {
  for (const code of [null, 'LRT-1']) {
    const m = good()
    m.variants = [direction(road(0, 1000), { route: ferry(code) })]
    m.links = []
    assert.match(checkMapData(m).problems.join('\n'), /is not a ferry line/)
  }
})

// The cheap-phone plan, step 13, 2026-10-05: a line file may carry its
// direction's orange stretches (`pass`) and their key (`passKey`), which the
// app paints as they are when the key is the index's own. The check works
// them out again against the file's hintuans: where the key is the file's,
// stretches that differ are a problem; a key that is another's is a note,
// since the app works those out itself.
import { linePass, passBoxes } from '../../src/shared/geo/linePass.ts'
import { PASS_TOLERANCE, sameStretches } from '../../scripts/checks/check-map-data.mjs'

/** good(), its direction carrying the stretches the publish writes, or `change` of them. */
const withPass = (change = (p) => p) => {
  const m = good()
  const { pass, passKey } = linePass(m.variants[0], passBoxes(m.stops))
  assert.ok(pass.length > 0)
  m.variants[0] = { ...m.variants[0], ...change({ pass, passKey }) }
  return m
}
const passNote = (r) => r.notes.filter((n) => /orange stretches/.test(n))

test('step 13: stretches a line file carries that its line and hintuans make: nothing to report', () => {
  const r = checkMapData(withPass())
  assert.deepEqual(r.problems, [])
  assert.deepEqual(r.warnings, [])
  assert.deepEqual(passNote(r), [])
})

test('step 13: stretches within a unit of the sixth decimal are the same; further off, under the file\'s own key, a problem', () => {
  const round6 = (n) => Math.round(n * 1e6) / 1e6
  const rounded = checkMapData(withPass(({ pass, passKey }) => ({ pass: pass.map((s) => s.map(([x, y]) => [round6(x), round6(y)])), passKey })))
  assert.deepEqual(rounded.problems, [])
  const nudge = (by) => ({ pass, passKey }) => ({ pass: pass.map((s, i) => s.map(([x, y], j) => (i === 0 && j === 0 ? [x + by, y] : [x, y]))), passKey })
  assert.deepEqual(checkMapData(withPass(nudge(PASS_TOLERANCE * 0.9))).problems, [])
  const off = checkMapData(withPass(nudge(PASS_TOLERANCE * 3)))
  assert.equal(off.problems.length, 1)
  assert.match(off.problems[0], /orange stretches in lines\/d\.json are not the ones its line and this file's hintuans make/)
  // One stretch fewer, or one point fewer, is not the same either: the
  // stretch past Mid is its two ends and the vertex at 500 m between them.
  assert.equal(linePass(good().variants[0], passBoxes(good().stops)).pass[0].length, 3)
  assert.equal(checkMapData(withPass(({ pass, passKey }) => ({ pass: pass.slice(1), passKey }))).problems.length, 1)
  assert.equal(checkMapData(withPass(({ pass, passKey }) => ({ pass: [[pass[0][0], pass[0][2]], ...pass.slice(1)], passKey }))).problems.length, 1)
  assert.equal(sameStretches([[[0, 0], [1, 1]]], [[[0, 0], [1, 1]]]), true)
  assert.equal(sameStretches([[[0, 0], [1, 1]]], [[[0, 0]], [[1, 1]]]), false)
})

test('step 13: stretches worked out against other hintuans, or unreadable, are a note: the app works them out itself', () => {
  for (const [what, change] of [
    ['another key', ({ pass }) => ({ pass, passKey: 'other' })],
    ['no key', ({ pass }) => ({ pass })],
    ['unreadable', ({ passKey }) => ({ pass: [[[1, 2, 3]]], passKey })],
  ]) {
    const r = checkMapData(withPass(change))
    assert.deepEqual(r.problems, [], what)
    assert.deepEqual(r.warnings, [], what)
    assert.equal(passNote(r).length, 1, what)
    assert.match(passNote(r)[0], /^1 line file\(s\) carry orange stretches worked out against other hintuans than this file's, or unreadable/)
  }
  // The hintuan moved since: the key is another's, so the stale stretches are no problem.
  const m = withPass()
  m.stops = m.stops.map((s) => (s.id === 'Mid' ? stop('Mid', 'hintuan', 510, 0) : s))
  const r = checkMapData(m)
  assert.deepEqual(r.problems, [])
  assert.equal(passNote(r).length, 1)
})

test('step 13: a line file without stretches is checked as before', () => {
  const r = checkMapData(good())
  assert.deepEqual(r.problems, [])
  assert.deepEqual(passNote(r), [])
  assert.equal('pass' in published().variants.find((v) => v.shape), false, 'the committed line files carry none yet')
})
