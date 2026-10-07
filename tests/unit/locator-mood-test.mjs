// The visitor's dot's moods (src/features/locator/locator-mood.ts, the owner's ask of
// 2026-10-01): cross at a run of taps, glad as the location comes or the
// camera arrives and on the move, and
// otherwise neutral; and the faces each wears.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/locator-mood-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANGRY_FOR_MS,
  ANGRY_ODDS,
  MOOD_OF,
  REACT_FOR_MS,
  HAPPY_FOR_MS,
  SLEEPY_AFTER_MS,
  faceFor,
  moodAt,
  reactionTo,
} from '../../src/features/locator/locator-mood.ts';

const T = 1_000_000;
/** A good, fresh fix, standing still. */
const good = { accuracy: 20, speed: 0, time: T };
const at = (now, more = {}) => moodAt({ now, fix: good, arrivedAt: null, taps: [], ...more });

test('neutral with a good, fresh fix and nothing going on', () => {
  assert.equal(at(T + 1000), 'neutral');
  assert.equal(moodAt({ now: T, fix: null, arrivedAt: null, taps: [] }), 'neutral');
});

test('happy for a while as the location comes or the camera arrives, then not', () => {
  assert.equal(at(T + 500, { arrivedAt: T }), 'happy');
  assert.equal(at(T + HAPPY_FOR_MS + 1, { arrivedAt: T }), 'neutral');
});

test('happy on the move, from walking pace', () => {
  assert.equal(at(T, { fix: { ...good, speed: 1.2 } }), 'happy');
  assert.equal(at(T, { fix: { ...good, speed: 0.6 } }), 'neutral');
});

test('never sad for the location itself: not for an old fix, nor a rough one', () => {
  assert.equal(at(T + 10 * 60_000), 'neutral');
  assert.equal(at(T, { fix: { ...good, accuracy: 500 } }), 'neutral');
  assert.equal(at(T, { fix: { ...good, accuracy: 500, speed: 2 } }), 'happy');
});

test('cross at three taps within two seconds, for three seconds, over everything else', () => {
  const run = [T, T + 600, T + 1200];
  assert.equal(at(T + 1300, { taps: run, arrivedAt: T }), 'angry');
  assert.equal(at(T + 1200 + ANGRY_FOR_MS + 1, { taps: run }), 'neutral');
  // Spread out, they are only taps.
  assert.equal(at(T + 5000, { taps: [T, T + 2000, T + 4000] }), 'neutral');
  // Two are not a run.
  assert.equal(at(T + 700, { taps: [T, T + 600] }), 'neutral');
});

test('the faces: cross glares, glad takes turns, left to itself its mood swings, and it dozes when long still', () => {
  assert.equal(faceFor('angry', T, 0), 'glare');
  const happy = new Set(Array.from({ length: 40 }, (_, i) => faceFor('happy', i * 2500, 0)));
  assert.ok(happy.size >= 3, `happy wears ${[...happy]}`);
  for (const f of happy) assert.ok(['smile', 'hop', 'squee', 'wink-smile'].includes(f), f);
  // Left to itself, its mood swings: about half neutral, nearly all the rest happy, now and then cross; never sad.
  const swings = Array.from({ length: 2000 }, (_, i) => MOOD_OF[faceFor('neutral', i * 5000, 0)]);
  const share = (m) => swings.filter((x) => x === m).length / swings.length;
  assert.ok(share('neutral') > 0.4 && share('neutral') < 0.6, `neutral ${share('neutral')}`);
  assert.ok(share('happy') > 0.38 && share('happy') < 0.55, `happy ${share('happy')}`);
  assert.ok(share('angry') > 0.005 && share('angry') < 0.05, `angry ${share('angry')}`);
  assert.equal(share('sad'), 0);
  assert.ok(
    new Set(Array.from({ length: 200 }, (_, i) => faceFor('neutral', i * 5000, 0))).size >= 8,
    'many faces',
  );
  assert.equal(faceFor('neutral', T, SLEEPY_AFTER_MS), 'sleepy');
  // The same moment, the same face: no flicker between renders.
  assert.equal(faceFor('happy', T + 100, 0), faceFor('happy', T + 200, 0));
});

test('a tap gets a reaction: glad, now and then cross, never cross at the first', () => {
  assert.equal(reactionTo(1, 0), 'happy');
  assert.equal(reactionTo(2, 0), 'angry');
  assert.equal(reactionTo(2, 1 / ANGRY_ODDS), 'happy');
  assert.equal(reactionTo(5, 0.99), 'happy');
});

test("a tap's reaction shows for a while, over arriving, under a run of taps; its faces a boing and a huff", () => {
  const glad = { at: T, mood: 'happy' };
  const cross = { at: T, mood: 'angry' };
  assert.equal(at(T + 100, { reaction: cross, arrivedAt: T }), 'angry');
  assert.equal(at(T + 100, { reaction: glad, fix: { ...good, speed: 0 } }), 'happy');
  assert.equal(at(T + REACT_FOR_MS + 1, { reaction: cross }), 'neutral');
  assert.equal(faceFor('happy', T, 0, true), 'boing');
  assert.equal(faceFor('angry', T, 0, true), 'huff');
  assert.equal(faceFor('angry', T, 0), 'glare');
});

test('a tap rolls its mood swings afresh: after the reaction, often another face', () => {
  const now = T + 123_456;
  const after = new Set(
    Array.from({ length: 30 }, (_, taps) => faceFor('neutral', now, 0, false, taps)),
  );
  assert.ok(after.size >= 5, `${after.size} faces over 30 taps at one moment`);
  // Untapped, a moment's face holds still between renders.
  assert.equal(faceFor('neutral', now, 0, false, 3), faceFor('neutral', now + 10, 0, false, 3));
});
