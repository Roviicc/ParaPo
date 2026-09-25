// The orange stretches (src/shared/stops.ts, passStretches) with the bounds
// checks of 2026-09-25, against the same walk without them.
//
//   node --experimental-strip-types scripts/pass-stretches-test.mjs
//
// Why this exists: with 1,000 directions and 500 hotspots the public map took
// 142 s to open, all of it measuring every vertex of every line against every
// box. Two cheap questions now come first — is this vertex inside the box's
// padded bounds, and does this line's box reach this box's at all — and
// this proves they change nothing about what is painted: the stretches of
// every direction past every box in the committed map are the same, and a
// pair the caller skips has no stretch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PASS_WITHIN_M, passBounds, passStretches, stopRing } from '../src/shared/stops.ts'
import { bboxOf, bboxesOverlap, distanceToRingM, haversine } from '../src/shared/geo.ts'

const file = JSON.parse(readFileSync(new URL('../public/data/map.json', import.meta.url), 'utf8'))
const lines = file.variants.filter((v) => v.shape).map((v) => ({ id: v.id, line: v.shape.coordinates }))
const rings = file.stops.filter((s) => s.area).map((s) => ({ id: s.id, ring: stopRing(s) }))

/** The walk as it was before the bounds checks: the ring distance for every vertex, samples only near the box. */
function slowStretches(line, ring, withinM = PASS_WITHIN_M, stepM = 1) {
  if (ring.length < 3 || line.length < 2) return []
  const k = Math.cos((ring[0][1] * Math.PI) / 180)
  const padLat = (withinM + 2 * stepM) / 111_000
  const padLng = padLat / k
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of ring) {
    if (x < w) w = x
    if (x > e) e = x
    if (y < s) s = y
    if (y > n) n = y
  }
  ;[w, s, e, n] = [w - padLng, s - padLat, e + padLng, n + padLat]
  const nearBox = (a, b) => Math.max(a[0], b[0]) >= w && Math.min(a[0], b[0]) <= e && Math.max(a[1], b[1]) >= s && Math.min(a[1], b[1]) <= n
  const near = (p) => distanceToRingM(p, ring) <= withinM
  const out = []
  const st = { cur: null, pending: null }
  const close = () => {
    if (!st.cur) return
    if (st.pending) st.cur.push(st.pending)
    if (st.cur.length > 1) out.push(st.cur)
    st.cur = null
    st.pending = null
  }
  const take = (p, isVertex) => {
    if (!near(p)) return close()
    if (!st.cur) st.cur = [p]
    else if (isVertex) st.cur.push(p)
    st.pending = isVertex ? null : st.cur[0] === p ? null : p
  }
  take(line[0], true)
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]]
    if (nearBox(a, b)) {
      const steps = Math.max(1, Math.ceil(haversine(a, b) / stepM))
      for (let t = 1; t < steps; t++) take([a[0] + ((b[0] - a[0]) * t) / steps, a[1] + ((b[1] - a[1]) * t) / steps], false)
    }
    take(b, true)
  }
  close()
  return out
}

test('the committed map has lines and boxes to check against', () => {
  assert.ok(lines.length >= 2, `${lines.length} line(s)`)
  assert.ok(rings.length >= 10, `${rings.length} box(es)`)
})

test('every direction past every box: the same stretches with the bounds checks as without', () => {
  let pairs = 0
  let stretches = 0
  for (const { id, line } of lines) {
    for (const { id: box, ring } of rings) {
      const fast = passStretches(line, ring)
      const slow = slowStretches(line, ring)
      assert.deepEqual(fast, slow, `direction ${id} past box ${box}`)
      pairs++
      stretches += fast.length
    }
  }
  assert.ok(stretches > 0, 'no stretch anywhere in the committed map')
  console.log(`  ${pairs} pairs, ${stretches} stretch(es), identical`)
})

test('a pair whose bounds do not overlap has no stretch, so the caller may skip it', () => {
  let skipped = 0
  for (const { line } of lines) {
    const reach = bboxOf(line)
    for (const { ring } of rings) {
      if (bboxesOverlap(reach, passBounds(ring))) continue
      skipped++
      assert.deepEqual(passStretches(line, ring), [])
    }
  }
  console.log(`  ${skipped} of ${lines.length * rings.length} pairs skippable today`)
})

test('a line through a box is painted; one 100 m away is not', () => {
  // A 40 m box at Tala, and a straight line west to east through its middle.
  const [x, y] = [121.06, 14.735]
  const d = 20 / 111_000
  const ring = [[x - d, y - d], [x + d, y - d], [x + d, y + d], [x - d, y + d]]
  const through = [[x - 10 * d, y], [x + 10 * d, y]]
  const stretch = passStretches(through, ring)
  assert.equal(stretch.length, 1)
  assert.ok(stretch[0].length >= 2)
  for (const p of [stretch[0][0], stretch[0][stretch[0].length - 1]]) assert.ok(distanceToRingM(p, ring) <= PASS_WITHIN_M + 1, `end ${distanceToRingM(p, ring).toFixed(1)} m from the box`)
  const far = [[x - 10 * d, y + 5 * d], [x + 10 * d, y + 5 * d]]
  assert.deepEqual(passStretches(far, ring), [])
})
