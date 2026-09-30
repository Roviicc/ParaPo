// The bottom sheet's three heights (Figma 3815:5637): where a tap on the
// handle, and where a drag let go, takes it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LOW_PX, follow, heightsFor, snapAfterTap, snapFor } from '../../src/shared/cards/sheetGesture.ts'

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

// The owner, 2026-09-30: "like google maps and apple maps" — a flick goes to
// the end in its direction, past Middle; a slow drag still settles near.
test('a flick up goes all the way to Max, from Low or Middle alike', () => {
  assert.equal(snapFor(460, 1.2, heights), 'max')
  assert.equal(snapFor(100, 1.2, heights), 'max')
  assert.equal(snapFor(800, 1.2, heights), 'max')
})

// 1 px/ms since the owner's "too sensitive" and 5/10 (2026-09-30): a quick
// but unhurried swipe settles on the nearest height instead.
test('a swipe under 1 px/ms is no flick: it settles on the nearest height', () => {
  assert.equal(snapFor(460, 0.9, heights), 'middle')
  assert.equal(snapFor(780, -0.9, heights), 'max')
})

test('a flick down goes all the way to Low, from Max or Middle alike, and from Low it closes', () => {
  assert.equal(snapFor(800, -1.2, heights), 'low')
  assert.equal(snapFor(780, -1.2, heights), 'low')
  assert.equal(snapFor(420, -1.2, heights), 'low')
  assert.equal(snapFor(80, -1.2, heights), 'close')
  assert.equal(snapFor(70, -1.2, heights), 'close')
})

test('each height of a map 844 tall: Low 137, Middle 55%, Max all of it', () => {
  assert.deepEqual(heightsFor(844), { low: LOW_PX, middle: 464, max: 844 })
})

// A finger taking hold of a sheet at Middle (464 of 844) at y 400.
test('a drag follows the finger, never above the map or below nothing', () => {
  const f = follow(400, 0, 464, 844)
  assert.equal(f.move(300, 16), 564)
  assert.equal(f.move(-500, 32), 844)
  assert.equal(f.move(1400, 48), 0)
})

test('held still before lifting it is a placement: the nearest height', () => {
  const f = follow(400, 0, 464, 844)
  for (let i = 1; i <= 8; i++) f.move(400 - i * 40, i * 16)
  // 784 shows, moving up fast — but held 150 ms, so Max is merely nearest.
  assert.equal(f.release(128 + 150), 'max')
  const g = follow(400, 0, 464, 844)
  for (let i = 1; i <= 4; i++) g.move(400 - i * 10, i * 16)
  assert.equal(g.release(64 + 150), 'middle')
})

test('lifted while moving fast it is a flick: to the end, down from Low it closes', () => {
  const up = follow(400, 0, 464, 844)
  for (let i = 1; i <= 4; i++) up.move(400 - i * 20, i * 16)
  assert.equal(up.release(64 + 16), 'max')
  const fromMax = follow(100, 0, 844, 844)
  for (let i = 1; i <= 4; i++) fromMax.move(100 + i * 20, i * 16)
  assert.equal(fromMax.release(64 + 16), 'low')
  const down = follow(700, 0, LOW_PX, 844)
  for (let i = 1; i <= 4; i++) down.move(700 + i * 20, i * 16)
  assert.equal(down.release(64 + 16), 'close')
})
