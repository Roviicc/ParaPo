// The bottom sheet's three heights (Figma 3815:5637): where a tap on the
// handle, and where a drag let go, takes it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LOW_PX, follow, heightsFor, snapAfterTap, snapFor } from '../../src/shared/cards/sheetGesture.ts'

test('a tap goes round: Low, Middle, Max, Low; from a free height, on up to Max', () => {
  assert.equal(snapAfterTap('low'), 'middle')
  assert.equal(snapAfterTap('middle'), 'max')
  assert.equal(snapAfterTap('max'), 'low')
  assert.equal(snapAfterTap(0.7), 'max')
})

// A phone's map 800 tall: Low shows 80, Middle 440, Max 800.
const heights = { low: 80, middle: 440, max: 800 }

test('let go slowly below Middle, it settles on Middle or Low, the nearer', () => {
  assert.equal(snapFor(300, 0, heights), 'middle')
  assert.equal(snapFor(150, -0.1, heights), 'low')
})

// The owner, 2026-09-30: "the scrolling up for middle to max has no magnet,
// make it freely, but still magnet to middle and low, and when the scroll up
// go over, make it to max".
test('let go slowly between Middle and Max, it stays where it is', () => {
  assert.equal(snapFor(600, 0, heights), 0.75)
  assert.equal(snapFor(700, 0.1, heights), 0.875)
})

test('just over Middle it is drawn back to Middle; near the top, up to Max', () => {
  assert.equal(snapFor(470, 0, heights), 'middle')
  assert.equal(snapFor(750, 0, heights), 'max')
})

test('let go slowly below half of Low, it closes', () => {
  assert.equal(snapFor(30, 0, heights), 'close')
})

// The owner, 2026-09-30: "like google maps and apple maps" — a flick goes to
// the end in its direction, past Middle; a slow drag still settles near.
test('a flick up goes all the way to Max, from Low or Middle alike', () => {
  assert.equal(snapFor(460, 3, heights), 'max')
  assert.equal(snapFor(100, 3, heights), 'max')
  assert.equal(snapFor(800, 3, heights), 'max')
})

// 1.25 px/ms since the owner's 4/10 (2026-09-30, after "even if I scroll up
// gently it doesn't stay on the middle"): an unhurried swipe settles on the
// nearest height instead.
test('a swipe under 1.25 px/ms is no flick: it settles on the nearest height', () => {
  assert.equal(snapFor(460, 1, heights), 'middle')
  assert.equal(snapFor(780, -1, heights), 'max')
})

test('a flick down goes all the way to Low, from Max or Middle alike, and from Low it closes', () => {
  assert.equal(snapFor(800, -3, heights), 'low')
  assert.equal(snapFor(780, -3, heights), 'low')
  assert.equal(snapFor(420, -3, heights), 'low')
  assert.equal(snapFor(80, -3, heights), 'close')
  assert.equal(snapFor(70, -3, heights), 'close')
})

test('each height of a map 844 tall: Low 129, Middle 45%, Max all of it', () => {
  assert.deepEqual(heightsFor(844), { low: LOW_PX, middle: 380, max: 844 })
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
  // 20 over Middle, held: drawn back to it.
  const g = follow(400, 0, heightsFor(844).middle, 844)
  for (let i = 1; i <= 4; i++) g.move(400 - i * 5, i * 16)
  assert.equal(g.release(64 + 150), 'middle')
})

test('lifted while moving fast it is a flick: to the end, down from Low it closes', () => {
  const up = follow(400, 0, 464, 844)
  for (let i = 1; i <= 4; i++) up.move(400 - i * 50, i * 16)
  assert.equal(up.release(64 + 16), 'max')
  const fromMax = follow(100, 0, 844, 844)
  for (let i = 1; i <= 4; i++) fromMax.move(100 + i * 50, i * 16)
  assert.equal(fromMax.release(64 + 16), 'low')
  const down = follow(700, 0, LOW_PX, 844)
  for (let i = 1; i <= 4; i++) down.move(700 + i * 50, i * 16)
  assert.equal(down.release(64 + 16), 'close')
})

// A swipe up from Middle (380 of 844, 45%) that starts fast and slows to a
// crawl before the finger lifts: read over its last 100 ms, it is slow — no
// flick to Max — and it stays where it was let go, 550 of 844.
test('a swipe that slows before lifting is read as slow: it stays where it is let go', () => {
  const f = follow(400, 0, heightsFor(844).middle, 844)
  let y = 400
  let t = 0
  for (let i = 0; i < 3; i++) f.move((y -= 50), (t += 16))
  for (let i = 0; i < 10; i++) f.move((y -= 2), (t += 16))
  assert.equal(f.release(t + 16), 550 / 844)
})
