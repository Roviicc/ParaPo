// The cards that stand in for one another over the map, and what each does
// to the others (src/shared/cards/cardStack.ts): the list asking, a trip's ‹,
// the shared height, a trip behind a place's card, a row let go, and what
// the card on show frames as the sheet settles.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/card-stack-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { framedBy, isChoosing, letGoHolds, sharedSnap, tripBack, tripBehindHolds } from '../../src/shared/cards/cardStack.ts'

/** A direction of a route from `head` to `tail`, drawn unless `drawn` is false: sample data, not the map. */
const dir = (id, route, head, tail, reversed = false, drawn = true) => ({
  id,
  route_id: route,
  direction_name: id,
  reversed,
  confidence: 'drawn',
  shape: drawn ? { type: 'LineString', coordinates: [[121.0, 14.7], [121.0, 14.71]] } : null,
  route: { signboard: null, head_stop_id: head, tail_stop_id: tail, via: null },
})

// Tala → Novaliches and Tala → SM Fairview share their head (the owner's example).
const talaNova = dir('tn', 'r-nova', 'tala', 'nova')
const novaTala = dir('nt', 'r-nova', 'tala', 'nova', true)
const talaFv = dir('tf', 'r-fv', 'tala', 'fv')
const fvTalaSlot = dir('ft', 'r-fv', 'tala', 'fv', true, false)
const lagroBistek = dir('lb', 'r-lagro', 'lagro', 'bistek')

test('the list asks only when a tap lands on more than one thing', () => {
  assert.equal(isChoosing([], []), false)
  assert.equal(isChoosing([talaNova], []), false)
  assert.equal(isChoosing([], [{ id: 'h1' }]), false)
  assert.equal(isChoosing([talaNova], [{ id: 'h1' }]), true)
  assert.equal(isChoosing([talaNova, talaFv], []), true)
})

test("a trip's ‹ goes back to the card behind it first", () => {
  assert.equal(tripBack(talaNova, [talaNova, talaFv], true), 'behind')
  // Even with no route to fan out to.
  assert.equal(tripBack(lagroBistek, [lagroBistek], true), 'behind')
})

test("opened on its own, a trip's ‹ lists the routes sharing an end, its way round", () => {
  assert.equal(tripBack(talaNova, [talaNova, novaTala, talaFv, lagroBistek], false), 'fan')
})

test('no ‹ when no other route sharing an end is drawn that way round', () => {
  // The way back: Tala → SM Fairview's way back is only a slot, not drawn.
  assert.equal(tripBack(novaTala, [talaNova, novaTala, talaFv, fvTalaSlot], false), null)
  // A route sharing no end.
  assert.equal(tripBack(lagroBistek, [talaNova, lagroBistek], false), null)
  // No trip at all.
  assert.equal(tripBack(null, [talaNova, talaFv], false), null)
})

test('the shared height stays as left while a card is open, Middle once none is', () => {
  for (const snap of ['low', 'middle', 'max', 0.7]) assert.equal(sharedSnap(snap, true), snap)
  for (const snap of ['low', 'middle', 'max', 0.7]) assert.equal(sharedSnap(snap, false), 'middle')
})

test("a trip behind a place's card holds only while that card is open and no trip is", () => {
  assert.equal(tripBehindHolds(false, true), true)
  // A trip opened (‹, or another route picked on the card): let go.
  assert.equal(tripBehindHolds(true, true), false)
  // The card closed.
  assert.equal(tripBehindHolds(false, false), false)
})

test("a row let go holds only while the card is still on that box", () => {
  assert.equal(letGoHolds('h1', 'h1'), true)
  assert.equal(letGoHolds('h1', 'h2'), false)
  assert.equal(letGoHolds('h1', null), false)
  assert.equal(letGoHolds(null, 'h1'), false)
  assert.equal(letGoHolds(null, null), false)
})

// What the card on show frames: each direction along its own line, so the
// lines tell them apart.
const along = (id, line) => ({ ...dir(id, `r-${id}`, 'a', 'b'), shape: { type: 'LineString', coordinates: line } })
const trip = along('trip', [[121.0, 14.7], [121.01, 14.7]])
const card = along('card', [[121.02, 14.7], [121.03, 14.7]])
const lit = along('lit', [[121.04, 14.7], [121.05, 14.7]])
const place = [121.06, 14.7]

test('an open trip frames its route, whatever stands behind it', () => {
  assert.deepEqual(framedBy(trip, place, true, [card], [lit]), { lines: [trip.shape.coordinates] })
})

test("a place's card with a RouteCard picked frames that card's routes", () => {
  assert.deepEqual(framedBy(null, place, false, [card], [lit]), { lines: [card.shape.coordinates] })
})

test("a place's card with none picked frames the place", () => {
  assert.deepEqual(framedBy(null, place, false, null, [lit]), { at: place })
})

test("the route list with a RouteCard picked frames that card's routes", () => {
  assert.deepEqual(framedBy(null, null, true, [card], [lit]), { lines: [card.shape.coordinates] })
})

test('the route list with none picked frames what it lights', () => {
  assert.deepEqual(framedBy(null, null, true, null, [lit, card]), { lines: [lit.shape.coordinates, card.shape.coordinates] })
})

test('nothing open frames nothing', () => {
  assert.equal(framedBy(null, null, false, null, [lit]), null)
})
