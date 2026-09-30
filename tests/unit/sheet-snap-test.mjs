// The bottom sheet's three heights (Figma 3815:5637): where a tap on the
// handle, and where a drag let go, takes it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { snapAfterTap, snapFor } from '../../src/shared/cards/sheetGesture.ts'

test('a tap goes round: Low, Middle, Max, Low', () => {
  assert.equal(snapAfterTap('low'), 'middle')
  assert.equal(snapAfterTap('middle'), 'max')
  assert.equal(snapAfterTap('max'), 'low')
})

// A phone's map 800 tall: Low shows 80, Middle 440, Max 800.
const heights = { low: 80, middle: 440, max: 800 }

test('let go slowly, it settles on the nearest height', () => {
  assert.equal(snapFor(470, 0, heights), 'middle')
  assert.equal(snapFor(700, 0.1, heights), 'max')
  assert.equal(snapFor(150, -0.1, heights), 'low')
})

test('let go slowly below half of Low, it closes', () => {
  assert.equal(snapFor(30, 0, heights), 'close')
})

test('a flick up goes to the next height above: a swipe up at Middle reaches Max', () => {
  assert.equal(snapFor(460, 0.8, heights), 'max')
  assert.equal(snapFor(100, 0.8, heights), 'middle')
  assert.equal(snapFor(800, 0.8, heights), 'max')
})

test('a flick down goes to the next height below, and past Low it closes', () => {
  assert.equal(snapFor(780, -0.8, heights), 'middle')
  assert.equal(snapFor(420, -0.8, heights), 'low')
  assert.equal(snapFor(70, -0.8, heights), 'close')
})
