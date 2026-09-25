// The one rule for "this direction passes this hotspot" (src/shared/stops.ts
// passIndex, on geo.ts firstNearIndex and firstTouchIndex) with the bounds
// checks of 2026-09-25 (future-proofing stage 2), against the same walks
// without them.
//
//   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/pass-index-test.mjs
//
// Why this exists: saving one hotspot asks this of every direction, saving
// one direction asks it of every hotspot, and with 1,000 directions each
// answer cost a second of measuring every segment against every box edge.
// The walks now ask the cheap question first — does this line's box, this
// segment's box, reach this box at all — and this proves the answer is the
// same for every direction past every box in the committed map, where the
// line is stored, and for a line that touches, one that comes near, and
// one that stays away.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PASS_WITHIN_M, passIndex, stopRing } from '../src/shared/stops.ts'
import { entryDistance, firstTouchIndex, lineBounds, pointInRing, segmentsIntersect } from '../src/shared/geo.ts'

const file = JSON.parse(readFileSync(new URL('../public/data/map.json', import.meta.url), 'utf8'))
const lines = file.variants.filter((v) => v.shape).map((v) => ({ id: v.id, line: v.shape.coordinates }))
const rings = file.stops.filter((s) => s.area).map((s) => ({ id: s.id, ring: stopRing(s) }))

// ---------------------------------------------------- the walks as they were
function slowTouch(line, ring) {
  if (ring.length < 3 || line.length === 0) return -1
  const n = ring.length
  for (let i = 0; i < line.length; i++) {
    if (pointInRing(line[i], ring)) return i
    if (i === 0) continue
    for (let j = 0; j < n; j++) {
      if (segmentsIntersect(line[i - 1], line[i], ring[j], ring[(j + 1) % n])) return i - 1
    }
  }
  return -1
}
const toRad = (d) => (d * Math.PI) / 180
function pointToSegmentM(p, a, b) {
  const k = Math.cos(toRad(a[1]))
  const [px, py] = [(p[0] - a[0]) * k, p[1] - a[1]]
  const [bx, by] = [(b[0] - a[0]) * k, b[1] - a[1]]
  const l2 = bx * bx + by * by
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / l2))
  const [dx, dy] = [px - t * bx, py - t * by]
  return Math.sqrt(dx * dx + dy * dy) * 111_000
}
function slowNear(line, ring, withinM) {
  const touch = slowTouch(line, ring)
  const n = ring.length
  if (n < 3 || line.length === 0) return -1
  for (let i = 1; i < line.length; i++) {
    if (touch >= 0 && i - 1 >= touch) return touch
    const [a, b] = [line[i - 1], line[i]]
    for (let j = 0; j < n; j++) {
      const [c, d] = [ring[j], ring[(j + 1) % n]]
      if (Math.min(pointToSegmentM(a, c, d), pointToSegmentM(b, c, d), pointToSegmentM(c, a, b), pointToSegmentM(d, a, b)) <= withinM) return i - 1
    }
  }
  return touch
}

test('the committed map has lines and boxes to check against', () => {
  assert.ok(lines.length >= 2, `${lines.length} line(s)`)
  assert.ok(rings.length >= 10, `${rings.length} box(es)`)
})

test('every direction past every box: the same pass index with the bounds checks as without', () => {
  let passes = 0
  for (const { id, line } of lines) {
    for (const { id: box, ring } of rings) {
      const fast = passIndex(line, ring)
      assert.equal(fast, slowNear(line, ring, PASS_WITHIN_M), `direction ${id} past box ${box}`)
      assert.equal(firstTouchIndex(line, ring), slowTouch(line, ring), `direction ${id} into box ${box}`)
      if (fast >= 0) passes++
    }
  }
  assert.ok(passes > 0, 'no direction passes any box in the committed map')
  console.log(`  ${lines.length * rings.length} pairs, ${passes} pass(es), identical`)
})

test('a line through a box, one 3 m beside it, and one 100 m away', () => {
  // A 40 m box at Tala; lines west to east.
  const [x, y] = [121.06, 14.735]
  const d = 20 / 111_000
  const ring = [[x - d, y - d], [x + d, y - d], [x + d, y + d], [x - d, y + d]]
  const at = (offM) => [[x - 10 * d, y + offM / 111_000], [x - 5 * d, y + offM / 111_000], [x + 10 * d, y + offM / 111_000]]
  assert.equal(passIndex(at(0), ring), 1)
  assert.equal(firstTouchIndex(at(0), ring), 1)
  assert.equal(passIndex(at(23), ring), 1, '3 m outside the edge is a pass')
  assert.equal(firstTouchIndex(at(23), ring), -1, 'but not a touch')
  assert.equal(passIndex(at(100), ring), -1)
  assert.ok(entryDistance(at(0), ring) > 0)
  assert.equal(entryDistance(at(100), ring), -1)
})

test('a line keeps its box: asked twice, the same box comes back without a second walk', () => {
  const line = lines[0].line
  assert.equal(lineBounds(line), lineBounds(line))
  assert.notEqual(lineBounds(line), lineBounds([...line]))
})
