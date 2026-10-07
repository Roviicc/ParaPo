// The route cards' colours (src/features/routes/model/liveries.ts): at random, kept for the
// visit, and never the same twice side by side — the owner's rule of
// 2026-09-28.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/liveries-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIVERIES, liveriesFor } from '../../src/features/routes/model/liveries.ts';

/** A stand-in for Math.random that plays back the given draws, then repeats the last. */
const draws = (...xs) => {
  let i = 0;
  return () => xs[Math.min(i++, xs.length - 1)];
};
const neighboursDiffer = (ls) => ls.every((l, i) => i === 0 || l !== ls[i - 1]);

test('the colour is a draw: different draws, different colours', () => {
  const first = liveriesFor(['Tala'], draws(0), new Map());
  const last = liveriesFor(['Tala'], draws(0.99), new Map());
  assert.notEqual(first[0], last[0]);
  assert.ok(LIVERIES.includes(first[0]) && LIVERIES.includes(last[0]));
});

test('a place keeps its colour for the visit, whatever is drawn after', () => {
  const visit = new Map();
  const [tala] = liveriesFor(['Tala'], draws(0.5), visit);
  for (const x of [0, 0.3, 0.7, 0.99]) {
    assert.equal(liveriesFor(['Tala'], draws(x), visit)[0], tala);
  }
});

test('two cards side by side are never alike, even when every draw is the same', () => {
  const places = [
    'Novaliches (Bayan)',
    'SM Fairview',
    'Tala',
    'Lagro',
    'Fatima',
    'Quiapo',
    'Cubao',
  ];
  for (const x of [0, 0.25, 0.5, 0.75, 0.99]) {
    assert.ok(neighboursDiffer(liveriesFor(places, draws(x), new Map())), `draw ${x}`);
  }
});

test('two places that met apart in the same colour, now side by side: one wears another for this list', () => {
  const visit = new Map([
    ['tala', 'red'],
    ['lagro', 'red'],
  ]);
  const shown = liveriesFor(['Tala', 'Lagro'], draws(0), visit);
  assert.equal(shown[0], 'red');
  assert.notEqual(shown[1], 'red');
  // …and keeps its own colour for the visit: apart again, it is red again.
  assert.equal(liveriesFor(['Lagro'], draws(0.99), visit)[0], 'red');
});

test('a new place avoids the colour of a kept neighbour on either side', () => {
  const visit = new Map([
    ['tala', 'red'],
    ['lagro', 'orange'],
  ]);
  for (const x of [0, 0.3, 0.6, 0.99]) {
    const [, middle] = liveriesFor(['Tala', 'Fatima', 'Lagro'], draws(x), new Map(visit));
    assert.ok(middle !== 'red' && middle !== 'orange', `draw ${x} gave ${middle}`);
  }
});

test('case and spaces do not make two places', () => {
  const visit = new Map();
  const [a] = liveriesFor(['SM Fairview'], draws(0.2), visit);
  assert.equal(liveriesFor(['sm fairview '], draws(0.9), visit)[0], a);
});

// The owner, 2026-09-30: "make the routecard not repeating the color, it must
// exhaust the existing colors before repeating it".
test('no colour twice in a list until every colour has come once', () => {
  const places = Array.from({ length: LIVERIES.length * 2 + 3 }, (_, i) => `Place ${i}`);
  for (const x of [0, 0.3, 0.6, 0.99]) {
    const ls = liveriesFor(places, draws(x), new Map());
    for (let start = 0; start < ls.length; start += LIVERIES.length) {
      const round = ls.slice(start, start + LIVERIES.length);
      assert.equal(new Set(round).size, round.length, `draw ${x}: ${round.join(', ')}`);
    }
    assert.ok(neighboursDiffer(ls), `draw ${x}`);
  }
});

test('two places kept in one colour, in one list: the second wears another', () => {
  const visit = new Map([
    ['tala', 'red'],
    ['lagro', 'red'],
  ]);
  const shown = liveriesFor(['Tala', 'Fatima', 'Lagro'], draws(0), visit);
  assert.equal(shown[0], 'red');
  assert.equal(new Set(shown).size, 3);
  assert.equal(liveriesFor(['Lagro'], draws(0.99), visit)[0], 'red');
});

test('a new place leaves the colours kept further down the list', () => {
  const visit = new Map([['lagro', 'orange']]);
  for (const x of [0, 0.3, 0.6, 0.99]) {
    const [, lagro] = liveriesFor(['Fatima', 'Lagro'], draws(x), new Map(visit));
    assert.equal(lagro, 'orange', `draw ${x}`);
  }
});
