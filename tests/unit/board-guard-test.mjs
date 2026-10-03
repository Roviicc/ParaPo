// The publish's guard on signboards (scripts/publish/boardGuard.mjs).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/board-guard-test.mjs
//
// Review of 2026-10-03, finding 8: a bucket made private answers 400 for
// every board, which read as every board gone, and the publish deleted them
// all from the map. Now that, or a sudden shrink, stops it unless --force.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boardsRefusal } from '../../scripts/publish/boardGuard.mjs'

const maxShrink = 0.3

test('every board gone at once is refused', () => {
  assert.match(boardsRefusal({ named: 24, gone: 24, before: 24, after: 0, maxShrink }), /every one of the 24/)
  assert.match(boardsRefusal({ named: 1, gone: 1, before: 0, after: 0, maxShrink }), /still public/)
})

test('a sudden shrink of the published boards is refused', () => {
  assert.match(boardsRefusal({ named: 10, gone: 0, before: 24, after: 10, maxShrink }), /24 → 10 files/)
})

test('a board or two gone, or none named, publishes', () => {
  assert.equal(boardsRefusal({ named: 24, gone: 2, before: 24, after: 22, maxShrink }), null)
  assert.equal(boardsRefusal({ named: 0, gone: 0, before: 0, after: 0, maxShrink }), null)
  assert.equal(boardsRefusal({ named: 30, gone: 0, before: 24, after: 30, maxShrink }), null)
})
