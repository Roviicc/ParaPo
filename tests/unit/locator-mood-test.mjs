// The visitor's dot's moods (src/commuter/locatorMood.ts, the owner's ask of
// 2026-10-01): cross at a run of taps, glad as the location comes or the
// camera arrives and on the move, low when the fix is stale or rough, and
// otherwise neutral; and the faces each wears.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/locator-mood-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ANGRY_FOR_MS,
  HAPPY_FOR_MS,
  POOR_OVER_M,
  SLEEPY_AFTER_MS,
  STALE_AFTER_MS,
  faceFor,
  moodAt,
} from '../../src/commuter/locatorMood.ts'

const T = 1_000_000
/** A good, fresh fix, standing still. */
const good = { accuracy: 20, speed: 0, time: T }
const at = (now, more = {}) => moodAt({ now, fix: good, arrivedAt: null, taps: [], ...more })

test('neutral with a good, fresh fix and nothing going on', () => {
  assert.equal(at(T + 1000), 'neutral')
  assert.equal(moodAt({ now: T, fix: null, arrivedAt: null, taps: [] }), 'neutral')
})

test('happy for a while as the location comes or the camera arrives, then not', () => {
  assert.equal(at(T + 500, { arrivedAt: T }), 'happy')
  assert.equal(at(T + HAPPY_FOR_MS + 1, { arrivedAt: T }), 'neutral')
})

test('happy on the move, from walking pace', () => {
  assert.equal(at(T, { fix: { ...good, speed: 1.2 } }), 'happy')
  assert.equal(at(T, { fix: { ...good, speed: 0.6 } }), 'neutral')
})

test('sad when the fix goes stale or rough, over being on the move', () => {
  assert.equal(at(T + STALE_AFTER_MS + 1), 'sad')
  assert.equal(at(T, { fix: { ...good, accuracy: POOR_OVER_M + 1 } }), 'sad')
  assert.equal(at(T, { fix: { ...good, accuracy: POOR_OVER_M + 1, speed: 2 } }), 'sad')
})

test('cross at three taps within two seconds, for three seconds, over everything else', () => {
  const run = [T, T + 600, T + 1200]
  assert.equal(at(T + 1300, { taps: run, arrivedAt: T }), 'angry')
  assert.equal(at(T + 1200 + ANGRY_FOR_MS + 1, { taps: run }), 'neutral')
  // Spread out, they are only taps.
  assert.equal(at(T + 5000, { taps: [T, T + 2000, T + 4000] }), 'neutral')
  // Two are not a run.
  assert.equal(at(T + 700, { taps: [T, T + 600] }), 'neutral')
})

test('the faces: cross glares, low droops, glad and neutral take turns, neutral dozes when long still', () => {
  assert.equal(faceFor('angry', T, 0), 'glare')
  assert.equal(faceFor('sad', T, 0), 'droop')
  const happy = new Set(Array.from({ length: 40 }, (_, i) => faceFor('happy', i * 2500, 0)))
  assert.ok(happy.size >= 3, `happy wears ${[...happy]}`)
  for (const f of happy) assert.ok(['smile', 'hop', 'squee', 'wink-smile'].includes(f), f)
  const neutral = Array.from({ length: 60 }, (_, i) => faceFor('neutral', i * 7000, 0))
  assert.ok(new Set(neutral).size >= 3, `neutral wears ${[...new Set(neutral)]}`)
  assert.ok(neutral.filter((f) => f === 'glance').length > neutral.length / 3, 'mostly the wandering glance')
  assert.equal(faceFor('neutral', T, SLEEPY_AFTER_MS), 'sleepy')
  // The same moment, the same face: no flicker between renders.
  assert.equal(faceFor('happy', T + 100, 0), faceFor('happy', T + 200, 0))
})
