// The publish's guard on signboards (scripts/publish/boardGuard.mjs).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/board-guard-test.mjs
//
// Review of 2026-10-03, finding 8: a bucket made private answers 400 for
// every board, which read as every board gone, and the publish deleted them
// all from the map. Now that, or many gone at once, stops it unless --force;
// a board the owner unlisted is not named and never counts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardsRefusal } from '../../scripts/publish/boardGuard.mjs';

const maxShrink = 0.3;

test('every board named gone at once, with the map holding them, is refused', () => {
  assert.match(
    boardsRefusal({ named: 24, gone: 24, published: 24, maxShrink }),
    /every one of the 24/,
  );
  assert.match(boardsRefusal({ named: 2, gone: 2, published: 1, maxShrink }), /still public/);
});

test('many of them gone at once is refused', () => {
  assert.match(boardsRefusal({ named: 24, gone: 10, published: 10, maxShrink }), /10 of the 24/);
});

test('one gone, a few gone, or none the map holds yet, publishes', () => {
  assert.equal(boardsRefusal({ named: 1, gone: 1, published: 1, maxShrink }), null);
  assert.equal(boardsRefusal({ named: 24, gone: 2, published: 2, maxShrink }), null);
  assert.equal(boardsRefusal({ named: 5, gone: 5, published: 0, maxShrink }), null);
  assert.equal(boardsRefusal({ named: 0, gone: 0, published: 0, maxShrink }), null);
});
