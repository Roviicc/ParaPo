// The fare rule (src/features/routes/model/fares.ts) against the rows of LTFRB's fare guide
// of 8 Oct 2023 quoted in docs/research/ltfrb-jeepney-fares.md.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/fares-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TRADITIONAL, fareFor, fareForKm, manilaDate, peso, pesoRange, rideFare, ruleOn } from '../../src/features/routes/model/fares.ts'
import { kmLabel } from '../../src/shared/utils/geo.ts'

const [y2023, y2026] = TRADITIONAL

test('the 2023 guide: first 4 km, and 7 km', () => {
  assert.deepEqual(fareForKm(4, y2023), { regular: 1300, discounted: 1050 })
  assert.deepEqual(fareForKm(1, y2023), { regular: 1300, discounted: 1050 })
  // 13 + 1.80 × 3 = 18.40 → 18.50; 10.40 + 1.44 × 3 = 14.72 → 14.75
  assert.deepEqual(fareForKm(7, y2023), { regular: 1850, discounted: 1475 })
})

test('nearest 25 centavos can round down', () => {
  // 13 + 1.80 × 1 = 14.80 → 14.75
  assert.equal(fareForKm(5, y2023).regular, 1475)
})

test('from 28 Sep 2026: ₱14, then ₱2 a km; the discount by the same method', () => {
  assert.deepEqual(fareForKm(4, y2026), { regular: 1400, discounted: 1125 })
  assert.deepEqual(fareForKm(10, y2026), { regular: 2600, discounted: 2075 })
})

test('a part km gives both sides; under the minimum it is one number', () => {
  const r = fareFor(9_400, y2026)
  assert.equal(r.low.regular, 2400)
  assert.equal(r.high.regular, 2600)
  const short = fareFor(3_200, y2026)
  assert.equal(short.low.regular, short.high.regular)
})

test('the rule switches on its date, and the old one is named for a while', () => {
  assert.equal(ruleOn('2026-09-27').rule, y2023)
  assert.equal(ruleOn('2026-09-28').rule, y2026)
  assert.equal(ruleOn('2026-09-28').previous, y2023)
  assert.equal(ruleOn('2026-11-15').previous, null)
  assert.equal(ruleOn('2020-01-01'), null)
})

test('Manila date turns at Manila midnight', () => {
  assert.equal(manilaDate(new Date('2026-09-27T15:59:00Z')), '2026-09-27')
  assert.equal(manilaDate(new Date('2026-09-27T16:00:00Z')), '2026-09-28')
})

test('pesos as the card writes them', () => {
  assert.equal(peso(1400), '₱14')
  assert.equal(peso(1850), '₱18.50')
  assert.equal(pesoRange(2400, 2600), '₱24–26')
  assert.equal(pesoRange(1400, 1400), '₱14')
  // Whole pesos only: the low end down, the high end up.
  assert.equal(pesoRange(1925, 2075), '₱19–21')
  assert.equal(pesoRange(1125, 1125), '₱11–12')
  assert.equal(pesoRange(1200, 1200), '₱12')
})

test("the official guide of 28 Sep 2026: all 50 printed rows reproduce", () => {
  // Transcribed from LTFRB's PUJ General Fare Guide effective 28 Sep 2026
  // (the owner's copy). The regular column is exactly 14 + 2 x (km - 4);
  // the discount column is where the round-to-P0.25 rule shows its work.
  const DISC = [
    1275, 1450, 1600, 1750, 1925, 2075, 2250, 2400, 2550, 2725, 2875, 3050,
    3200, 3350, 3525, 3675, 3850, 4000, 4150, 4325, 4475, 4650, 4800, 4950,
    5125, 5275, 5450, 5600, 5750, 5925, 6075, 6250, 6400, 6550, 6725, 6875,
    7050, 7200, 7350, 7525, 7675, 7850, 8000, 8150, 8325, 8475,
  ]
  for (let k = 1; k <= 50; k++) {
    const want = { regular: k <= 4 ? 1400 : 1400 + 200 * (k - 4), discounted: k <= 4 ? 1125 : DISC[k - 5] }
    assert.deepEqual(fareForKm(k, y2026), want, `km ${k}`)
  }
})

test("one ride's pesos: the trip's Expected fare", () => {
  // Up to the minimum's 4 km it is one number, part km or not.
  assert.equal(rideFare('jeepney', 3_100, '2026-09-29'), '₱14')
  assert.equal(rideFare('jeepney', 4_000, '2026-09-29'), '₱14')
  // A range, the part km counted down and up: 12.8 km is 12 or 13 km.
  assert.equal(rideFare('jeepney', 12_800, '2026-09-29'), '₱30–32')
  assert.equal(rideFare('jeepney', 9_400, '2026-09-29'), '₱24–26')
  // The discounted fare, in whole pesos: ₱19.25–20.75 is ₱19–21; ₱11.25 is ₱11–12.
  assert.equal(rideFare('jeepney', 9_400, '2026-09-29', 'discounted'), '₱19–21')
  assert.equal(rideFare('jeepney', 3_100, '2026-09-29', 'discounted'), '₱11–12')
  // The old rule, before 28 Sep 2026: ₱13 + ₱1.80 × 5.
  assert.equal(rideFare('jeepney', 9_000, '2026-09-27'), '₱22')
  assert.equal(rideFare('uv_express', 5_000, '2026-09-29'), undefined)
  assert.equal(rideFare(undefined, 5_000, '2026-09-29'), undefined)
  assert.equal(rideFare('jeepney', 5_000, '2020-01-01'), undefined)
})

test("a ride's pesos never fall as it grows: a picked hintuan's pill stays within the whole ride's", () => {
  // Compared by their dearer end, 0 to 30 km in 100 m steps.
  const dearest = (f) => Number(f.replace('₱', '').split('–').at(-1))
  let last = 0
  for (let m = 0; m <= 30_000; m += 100) {
    const now = dearest(rideFare('jeepney', m, '2026-09-29'))
    assert.ok(now >= last, `${m} m: ₱${now} after ₱${last}`)
    last = now
  }
})

test('the Kilometer tile: to a tenth, no space', () => {
  assert.equal(kmLabel(12_800), '12.8km')
  assert.equal(kmLabel(12_849), '12.8km')
  assert.equal(kmLabel(940), '0.9km')
  assert.equal(kmLabel(960), '1.0km')
  assert.equal(kmLabel(3_000), '3.0km')
})
