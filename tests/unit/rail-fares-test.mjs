// The train fares (src/shared/model/railFares.ts) against the operators' own
// tables, every cell: LRMC's two LRT-1 matrices, LRTA's LRT-2 matrices before
// and after the half fare, MRT-3's fare by stations travelled and its half.
// The fixture is the tables as transcribed from the published images; the
// module holds one matrix a line and the rules that make the rest, so a
// cell that does not follow is a wrong rule or a mistyped number.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/rail-fares-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { HALF_FARE_FROM, railFare, railFareText, railStations, stationIndex } from '../../src/shared/model/railFares.ts'

const official = JSON.parse(readFileSync(new URL('./fixtures/rail-fares-official.json', import.meta.url), 'utf8'))
const BEFORE_HALF = '2026-01-15'
const NOW = '2026-10-02'
const pesos = (f) => f && { card: f.card / 100, ticket: f.ticket / 100 }

/** Every ride between two different stations of a line, by the operator's own names. */
function* rides(line) {
  const names = official[line].stations
  for (let i = 0; i < names.length; i++) for (let j = 0; j < names.length; j++) if (i !== j) yield [i, j, names[i], names[j]]
}

test("every operator's name finds its station, in the operator's order", () => {
  for (const line of ['LRT-1', 'LRT-2', 'MRT-3']) {
    official[line].stations.forEach((name, i) => assert.equal(stationIndex(line, name), i, `${line} ${name}`))
  }
})

test('LRT-1: both of LRMC’s matrices, every cell', () => {
  let n = 0
  for (const [i, j, a, b] of rides('LRT-1')) {
    assert.deepEqual(pesos(railFare('LRT-1', a, b, NOW)), { card: official['LRT-1'].card[i][j], ticket: official['LRT-1'].ticket[i][j] }, `${a} → ${b}`)
    n++
  }
  assert.equal(n, 25 * 24)
})

test('LRT-2: LRTA’s base matrices before the half fare, its half fare matrices after, every cell', () => {
  for (const [i, j, a, b] of rides('LRT-2')) {
    const t = official['LRT-2']
    assert.deepEqual(pesos(railFare('LRT-2', a, b, BEFORE_HALF)), { card: t.card_base[i][j], ticket: t.ticket_base[i][j] }, `${a} → ${b}`)
    assert.deepEqual(pesos(railFare('LRT-2', a, b, NOW)), { card: t.card_half[i][j], ticket: t.ticket_half[i][j] }, `${a} → ${b}, half`)
  }
})

test('MRT-3: by stations travelled, then half, every cell', () => {
  for (const [i, j, a, b] of rides('MRT-3')) {
    const t = official['MRT-3']
    assert.deepEqual(pesos(railFare('MRT-3', a, b, BEFORE_HALF)), { card: t.base[i][j], ticket: t.base[i][j] }, `${a} → ${b}`)
    assert.deepEqual(pesos(railFare('MRT-3', a, b, NOW)), { card: t.half[i][j], ticket: t.half[i][j] }, `${a} → ${b}, half`)
  }
})

test('the end-to-end and shortest fares the news reported', () => {
  assert.deepEqual(pesos(railFare('LRT-1', 'Dr. Santos', 'Fernando Poe Jr.', NOW)), { card: 52, ticket: 55 })
  assert.deepEqual(pesos(railFare('LRT-1', 'Dr. Santos', 'Ninoy Aquino Avenue', NOW)), { card: 19, ticket: 20 })
  assert.deepEqual(pesos(railFare('LRT-2', 'Recto', 'Antipolo', NOW)), { card: 16.5, ticket: 18 })
  assert.deepEqual(pesos(railFare('LRT-2', 'Recto', 'Legarda', NOW)), { card: 7.5, ticket: 8 })
  assert.deepEqual(pesos(railFare('MRT-3', 'North Avenue', 'Taft Avenue', NOW)), { card: 14, ticket: 14 })
  assert.deepEqual(pesos(railFare('MRT-3', 'North Avenue', 'Quezon Avenue', BEFORE_HALF)), { card: 13, ticket: 13 })
})

test('discounted: half on LRT-1; on LRT-2 and MRT-3 the same as everyone, the halves not stacking', () => {
  assert.deepEqual(pesos(railFare('LRT-1', 'Dr. Santos', 'Fernando Poe Jr.', NOW, 'discounted')), { card: 26, ticket: 28 })
  assert.deepEqual(pesos(railFare('LRT-1', 'Dr. Santos', 'Ninoy Aquino Avenue', NOW, 'discounted')), { card: 9.5, ticket: 10 })
  for (const [, , a, b] of rides('LRT-2')) assert.deepEqual(railFare('LRT-2', a, b, NOW, 'discounted'), railFare('LRT-2', a, b, NOW))
  for (const [, , a, b] of rides('MRT-3')) assert.deepEqual(railFare('MRT-3', a, b, NOW, 'discounted'), railFare('MRT-3', a, b, NOW))
  // Before the everyone-half, a discounted LRT-2 rider paid half the base.
  assert.deepEqual(pesos(railFare('LRT-2', 'Recto', 'Antipolo', BEFORE_HALF, 'discounted')), { card: 16.5, ticket: 18 })
  assert.ok(HALF_FARE_FROM > BEFORE_HALF)
})

test('no fare for the same station, a station the table lacks, or before the table', () => {
  assert.equal(railFare('LRT-1', 'EDSA', 'EDSA', NOW), undefined)
  assert.equal(railFare('LRT-1', 'EDSA', 'Cubao', NOW), undefined)
  assert.equal(railFare('LRT-1', 'EDSA', 'Baclaran', '2025-01-01'), undefined)
  assert.equal(railFare('LRT-1', 'EDSA', 'Baclaran', '2025-06-01', 'discounted'), undefined)
})

test('the card writes card to ticket, in whole pesos', () => {
  assert.equal(railFareText(railFare('LRT-1', 'Dr. Santos', 'Fernando Poe Jr.', NOW)), '₱52–55')
  assert.equal(railFareText(railFare('LRT-2', 'Recto', 'Antipolo', NOW)), '₱16–18')
  assert.equal(railFareText(railFare('MRT-3', 'North Avenue', 'Taft Avenue', NOW)), '₱14')
})

test('the map’s stop names and their other names all find their station', () => {
  // As the OpenStreetMap import named them (scripts/import/rail-osm-build.mjs): the stop name, then the sign's.
  const named = {
    'LRT-1': ['Fernando Poe Jr.', 'Balintawak', 'Monumento', 'Yamaha Monumento', '5th Avenue', 'R. Papa', 'Abad Santos', 'Blumentritt', 'Tayuman', 'Bambang', 'Doroteo Jose', 'Carriedo', 'Central Terminal', 'United Nations', 'Pedro Gil', 'Quirino', 'Vito Cruz', 'Gil Puyat', 'Libertad', 'EDSA', 'Baclaran', 'Redemptorist-Aseana', 'MIA Road', 'PITX', 'Ninoy Aquino Avenue', 'Dr. Santos'],
    'LRT-2': ['Antipolo', 'Marikina-Pasig', 'Santolan', 'Katipunan', 'Anonas', 'Cubao', 'Araneta Center - Cubao', 'Betty Go - Belmonte', 'Gilmore', 'J. Ruiz', 'V. Mapa', 'Pureza', 'Legarda', 'Recto'],
    'MRT-3': ['North Avenue', 'Quezon Avenue', 'Kamuning', 'GMA Kamuning', 'Cubao', 'Santolan-Annapolis', 'Ortigas', 'Shaw Boulevard', 'Boni', 'Guadalupe', 'Buendia', 'Ayala', 'Magallanes', 'Taft Avenue'],
  }
  for (const [line, names] of Object.entries(named)) {
    for (const n of names) assert.ok(stationIndex(line, n) >= 0, `${line} ${n}`)
    assert.equal(railStations(line).length, official[line].stations.length)
  }
})
