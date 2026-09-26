// The babaan side (src/shared/geo.ts, rightOfLine): a hintuan box drawn
// across the road, cut along a direction's line, keeps the half on the
// line's right — the owner's rule of 2026-09-26, papunta and balikan alike.
//
//   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/babaan-side-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { rightOfLine } from '../src/shared/geo.ts'
import { hintuansAlong, stopRing } from '../src/shared/stops.ts'

const square = [[0, 0], [1, 0], [1, 1], [0, 1]]
// Measured from the first corner, or a small box at 121°E is lost in the rounding.
const area = (r) => {
  const [ox, oy] = r[0]
  return Math.abs(r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + (p[0] - ox) * (q[1] - oy) - (q[0] - ox) * (p[1] - oy) }, 0)) / 2
}
const close = (x, y) => assert.ok(Math.abs(x - y) < 1e-9, `${x} is not ${y}`)
const ys = (r) => r.map((p) => p[1])

test('eastbound, the right is the south half', () => {
  const half = rightOfLine(square, [[-1, 0.5], [2, 0.5]])
  close(area(half), 0.5)
  assert.ok(Math.max(...ys(half)) <= 0.5 + 1e-9)
})

test('westbound on the same road, the right is the north half', () => {
  const half = rightOfLine(square, [[2, 0.5], [-1, 0.5]])
  close(area(half), 0.5)
  assert.ok(Math.min(...ys(half)) >= 0.5 - 1e-9)
})

test('a line off centre cuts the box where it runs', () => {
  close(area(rightOfLine(square, [[-1, 0.3], [2, 0.3]])), 0.3)
  close(area(rightOfLine(square, [[2, 0.3], [-1, 0.3]])), 0.7)
})

test('a line that starts or ends inside is carried on until it is out', () => {
  close(area(rightOfLine(square, [[0.5, 0.5], [2, 0.5]])), 0.5)
  close(area(rightOfLine(square, [[-1, 0.5], [0.4, 0.5]])), 0.5)
})

test('a line that turns inside: east then north keeps all but the top left', () => {
  close(area(rightOfLine(square, [[-1, 0.5], [0.5, 0.5], [0.5, 2]])), 0.75)
})

test('a box beside the road is not cut', () => {
  assert.equal(rightOfLine(square, [[-1, -0.00001], [2, -0.00001]]), null)
})

test('the two directions of the committed map share each box they both cut', () => {
  const file = JSON.parse(readFileSync(new URL('../public/data/map.json', import.meta.url), 'utf8'))
  let cut = 0
  for (const v of file.variants.filter((v) => v.shape)) {
    const line = v.shape.coordinates
    for (const { stop } of hintuansAlong(line, file.stops)) {
      const ring = stopRing(stop)
      const right = rightOfLine(ring, line)
      if (!right) continue
      const left = rightOfLine(ring, [...line].reverse())
      cut++
      // The two sides of one line make the whole box.
      assert.ok(Math.abs(area(right) + area(left) - area(ring)) < area(ring) * 1e-6, `${stop.name}: the halves do not add up`)
      assert.ok(area(right) > 0 && area(left) > 0, `${stop.name}: an empty half`)
    }
  }
  assert.ok(cut > 0, 'no box in the committed map is cut')
  console.log(`  ${cut} direction–box pairs cut`)
})
