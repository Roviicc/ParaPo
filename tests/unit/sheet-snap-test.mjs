// The bottom sheet's three heights (Figma 3815:5637): where a pull or a tap on
// the handle takes it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { snapAfter } from '../../src/shared/cards/sheetGesture.ts'

test('a pull up climbs one height at a time and stops at Max', () => {
  assert.equal(snapAfter('low', 'up'), 'middle')
  assert.equal(snapAfter('middle', 'up'), 'max')
  assert.equal(snapAfter('max', 'up'), 'max')
})

test('a pull down drops one height at a time, and at Low it closes', () => {
  assert.equal(snapAfter('max', 'down'), 'middle')
  assert.equal(snapAfter('middle', 'down'), 'low')
  assert.equal(snapAfter('low', 'down'), 'close')
})

test('a tap goes round: Low, Middle, Max, Low', () => {
  assert.equal(snapAfter('low', 'tap'), 'middle')
  assert.equal(snapAfter('middle', 'tap'), 'max')
  assert.equal(snapAfter('max', 'tap'), 'low')
})
