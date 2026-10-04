// The babaan side (src/shared/geo/rightOfLine.ts): a hintuan box drawn
// across the road, cut along a direction's line, keeps the half on the
// line's right — the owner's rule of 2026-09-26, papunta and balikan alike.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/babaan-side-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rightOfLine } from '../../src/shared/geo/rightOfLine.ts'
import { hintuansAlong } from '../../src/shared/model/timeline.ts'
import { stopRing } from '../../src/shared/model/stops.ts'
import { fileURLToPath } from 'node:url'
import { readPublished } from '../../scripts/checks/check-map-data.mjs'

/** The committed map, every line in full: the index and its lines/ (check-map-data.mjs). */
const published = () => readPublished(fileURLToPath(new URL('../../public/data/index.v4.json', import.meta.url))).file

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
  const file = published()
  let cut = 0
  for (const v of file.variants.filter((v) => v.shape)) {
    const line = v.shape.coordinates
    for (const { stop } of hintuansAlong(line, file.stops, v.route)) {
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

// Review of 2026-10-03: carry measured the last step, and a repeated end
// point made it zero long, so a tail stopping in the box cut nothing.
test('a line ending in the box on a repeated point still cuts it', () => {
  const once = rightOfLine(square, [[-1, 0.5], [0.6, 0.5]])
  const twice = rightOfLine(square, [[-1, 0.5], [0.6, 0.5], [0.6, 0.5]])
  close(area(once), 0.5)
  assert.ok(twice)
  close(area(twice), 0.5)
  const start = rightOfLine(square, [[0.4, 0.5], [0.4, 0.5], [2, 0.5]])
  assert.ok(start)
  close(area(start), 0.5)
})

// The cheap-phone plan, step 8 (2026-10-04): rightOfLine walks the line from
// each end instead of copying it twice, skips the segments that do not reach
// the box, and the babaan sides cut first and place only the boxes they cut.
// The same output, held here against the code as it was, kept word for word
// below: deep equality, not a tolerance, for every line and every hintuan of
// the committed map, both ways, and for lines made up to find the corners.
import { bboxOf } from '../../src/shared/geo/geo.ts'
import { nearestOnSegment } from '../../src/shared/geo/geo.ts'
import { pointInRing, ringToPolygon } from '../../src/shared/geo/ring.ts'
import { passIndex } from '../../src/shared/geo/pass.ts'
import { isLineMode, servedBy, variantLine } from '../../src/shared/model/routes.ts'
import { drawnFromTheEnd } from '../../src/shared/model/timeline.ts'
import { babaanSideFeatures } from '../../src/shared/geo/babaanSides.ts'

/** rightOfLine before step 8, word for word (but for its name and types). */
function oldRightOfLine(ring, line) {
  const n = ring.length
  if (n < 3 || line.length < 2) return null
  const [w, s, e, nn] = bboxOf(ring)
  const reach = 2 * Math.hypot(e - w, nn - s)
  const carry = (from, to) => {
    const [dx, dy] = [to[0] - from[0], to[1] - from[1]]
    const len = Math.hypot(dx, dy)
    return len === 0 ? to : [to[0] + (dx / len) * reach, to[1] + (dy / len) * reach]
  }
  const unlike = (end, from) => from.find((p) => p[0] !== end[0] || p[1] !== end[1])
  const path = [...line]
  const first = path[0]
  const beforeFirst = unlike(first, path.slice(1))
  if (beforeFirst && pointInRing(first, ring)) path.unshift(carry(beforeFirst, first))
  const last = path[path.length - 1]
  const beforeLast = unlike(last, path.slice(0, -1).reverse())
  if (beforeLast && pointInRing(last, ring)) path.push(carry(beforeLast, last))
  const hits = []
  for (let k = 0; k + 1 < path.length; k++) {
    const [a, b] = [path[k], path[k + 1]]
    for (let i = 0; i < n; i++) {
      const [c, d] = [ring[i], ring[(i + 1) % n]]
      const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])
      if (den === 0) continue
      const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den
      const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den
      if (t < 0 || t >= 1 || u < 0 || u >= 1) continue
      hits.push({ k, t, at: i + u, p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] })
    }
  }
  hits.sort((x, y) => x.k - y.k || x.t - y.t)
  for (let j = 0; j + 1 < hits.length; j++) {
    const [into, out] = [hits[j], hits[j + 1]]
    const next = out.k === into.k ? out.p : path[into.k + 1]
    if (!pointInRing([(into.p[0] + next[0]) / 2, (into.p[1] + next[1]) / 2], ring)) continue
    const d = (((into.at - out.at) % n) + n) % n
    if (d === 0) return null
    const cut = [into.p, ...path.slice(into.k + 1, out.k + 1), out.p]
    const forward = []
    for (let v = Math.floor(out.at) + 1; v - out.at < d; v++) forward.push(ring[v % n])
    const backward = []
    for (let v = Math.ceil(out.at) - 1; out.at - v < n - d; v--) backward.push(ring[((v % n) + n) % n])
    const a = [...cut, ...forward]
    return oldSignedArea2(a) < 0 ? a : [...cut, ...backward]
  }
  return null
}
function oldSignedArea2(ring) {
  const [ox, oy] = ring[0]
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    a += (ring[j][0] - ox) * (ring[i][1] - oy) - (ring[i][0] - ox) * (ring[j][1] - oy)
  return a
}
/** hintuansAlong (timeline.ts) before step 8, word for word. */
function oldHintuansAlong(line, stops, route) {
  const along = []
  for (const stop of stops) {
    if (stop.kind !== 'hintuan' || !stop.area || !servedBy(stop, route)) continue
    const index = passIndex(line, stopRing(stop))
    if (index >= 0) along.push({ stop, index, at: nearestOnSegment(stop.point.coordinates, line[index], line[index + 1] ?? line[index]).t })
  }
  return along.sort((a, b) => a.index - b.index || a.at - b.at).map(({ stop, index }) => ({ stop, index }))
}
/** travelLine (ride.ts) before step 16's cache, word for word. */
function oldTravelLine(v, stops) {
  const line = variantLine(v)
  if (line.length < 2) return line
  const head = stops.find((s) => s.id === v.route?.head_stop_id)
  const tail = stops.find((s) => s.id === v.route?.tail_stop_id)
  const [from, to] = v.reversed ? [tail, head] : [head, tail]
  if (!from || !to) return line
  return drawnFromTheEnd(line[0], from, to) ? [...line].reverse() : line
}
/** useBabaanSides' features before step 8, word for word. */
function oldBabaanFeatures(chosen, stops) {
  if (!chosen || isLineMode(chosen.route?.mode)) return []
  const line = oldTravelLine(chosen, stops)
  return oldHintuansAlong(line, stops, chosen.route).flatMap(({ stop }) => {
    const side = oldRightOfLine(stopRing(stop), line)
    return side ? [{ type: 'Feature', properties: { id: stop.id }, geometry: ringToPolygon(side) }] : []
  })
}

test('step 8: every line of the committed map against every hintuan, both ways, cut exactly as before', () => {
  const file = published()
  const lines = file.variants.filter((v) => v.shape).map((v) => v.shape.coordinates)
  const boxes = file.stops.filter((s) => s.kind === 'hintuan' && s.area).map(stopRing)
  assert.ok(lines.length >= 20 && boxes.length >= 100, `${lines.length} lines, ${boxes.length} boxes`)
  let pairs = 0
  let cut = 0
  for (const forward of lines) {
    for (const line of [forward, [...forward].reverse()]) {
      for (const ring of boxes) {
        const was = oldRightOfLine(ring, line)
        assert.deepStrictEqual(rightOfLine(ring, line), was)
        pairs++
        if (was) cut++
      }
    }
  }
  assert.ok(cut > 50, `only ${cut} cut`)
  console.log(`  ${pairs} line–box pairs, ${cut} cut, all as before`)
})

test("step 8: every direction's babaan sides, either way round, the same features in the same order", () => {
  const file = published()
  let features = 0
  for (const v of file.variants.filter((v) => v.shape)) {
    for (const chosen of [v, { ...v, reversed: !v.reversed }]) {
      const was = oldBabaanFeatures(chosen, file.stops)
      assert.deepStrictEqual(babaanSideFeatures(chosen, file.stops), was, `${v.direction_name}`)
      features += was.length
    }
  }
  assert.ok(features > 20, `only ${features} sides`)
  assert.deepStrictEqual(babaanSideFeatures(null, file.stops), [])
  console.log(`  ${features} babaan sides, all as before`)
})

test('step 8: made-up lines, ends repeated, starting and ending inside, grazing corners: cut as before', () => {
  // A seeded generator, so a failure is the same failure every run.
  let seed = 20261004
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const pick = (xs) => xs[Math.floor(rand() * xs.length)]
  const rings = [
    square,
    [[0, 0], [1, 0], [1, 1], [0.5, 0.4], [0, 1]], // a notch: in, out and in again
    [[0, 0], [2, 0], [2, 0.2], [0, 0.2]], // long and thin
    [[121.0, 14.6], [121.0001, 14.6], [121.0001, 14.6001], [121.0, 14.6001]], // ten metres at Manila
  ]
  // Points on a grid that lands on corners and edges, and off it.
  const coord = (lo, hi) => (rand() < 0.5 ? lo + Math.round(rand() * 8) * ((hi - lo) / 4) - (hi - lo) : lo - (hi - lo) + rand() * 3 * (hi - lo))
  let cut = 0
  for (let n = 0; n < 6000; n++) {
    const ring = pick(rings)
    const [w, s, e, nn] = bboxOf(ring)
    const line = []
    const count = 2 + Math.floor(rand() * 5)
    for (let i = 0; i < count; i++) {
      if (i > 0 && rand() < 0.2) line.push(line[i - 1]) // a click made twice
      else line.push([coord(w, e), coord(s, nn)])
    }
    const was = oldRightOfLine(ring, line)
    assert.deepStrictEqual(rightOfLine(ring, line), was, JSON.stringify({ ring, line }))
    if (was) cut++
  }
  assert.ok(cut > 500, `only ${cut} cut`)
  // One point, or one point twice: nothing to carry, nothing cut.
  for (const line of [[[0.5, 0.5]], [[0.5, 0.5], [0.5, 0.5]], [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5]]])
    assert.deepStrictEqual(rightOfLine(square, line), oldRightOfLine(square, line))
})

test('step 8: made-up directions — ties on one segment, stations, terminals, boxes with no area, either end first — the same features', () => {
  let seed = 4102026
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const pick = (xs) => xs[Math.floor(rand() * xs.length)]
  // A road east along 14.6°N with a bend, vertices about 100 m apart, so
  // two boxes often sit on one segment and tie on passIndex.
  const road = [[121.0, 14.6], [121.001, 14.6], [121.002, 14.6002], [121.003, 14.6006], [121.004, 14.6006]]
  const boxAt = (x, y, wx, wy) => ({ type: 'Polygon', coordinates: [[[x, y], [x + wx, y], [x + wx, y + wy], [x, y + wy], [x, y]]] })
  let sides = 0
  let ties = 0
  for (let n = 0; n < 400; n++) {
    const stops = []
    const count = 3 + Math.floor(rand() * 10)
    for (let i = 0; i < count; i++) {
      const x = 121.0 + rand() * 0.0045 - 0.0002
      const y = 14.5996 + rand() * 0.0012
      stops.push({
        id: `s${n}-${i}`,
        name: `Box ${i}`,
        informal: null,
        aliases: [],
        kind: rand() < 0.8 ? 'hintuan' : 'terminal',
        point: { type: 'Point', coordinates: [x + 0.00005, y + 0.00005] },
        area: rand() < 0.9 ? boxAt(x, y - 0.0003 * rand(), 0.00002 + 0.0002 * rand(), 0.0001 + 0.0006 * rand()) : null,
        note: null,
        created_at: '2026-10-04',
        line: rand() < 0.15 ? pick(['LRT-1', 'MRT-3']) : null,
      })
    }
    const train = rand() < 0.15
    const route = {
      id: 'r', name: 'R', signboard: null, long_name: null, fare_note: null, via: null,
      mode: train ? 'lrt' : 'jeepney', route_code: train ? 'LRT-1' : null,
      head_stop_id: rand() < 0.8 ? pick(stops).id : null, tail_stop_id: rand() < 0.8 ? pick(stops).id : null,
    }
    const line = rand() < 0.5 ? road : [...road].reverse()
    const chosen = { id: `v${n}`, route_id: 'r', direction_name: null, origin_terminal: null, destination_terminal: null, shape: { type: 'LineString', coordinates: line }, reversed: rand() < 0.5, confidence: 'drawn', route }
    const was = oldBabaanFeatures(chosen, stops)
    assert.deepStrictEqual(babaanSideFeatures(chosen, stops), was, JSON.stringify(chosen))
    sides += was.length
    const along = oldHintuansAlong(oldTravelLine(chosen, stops), stops, route)
    ties += along.filter((a, i) => i > 0 && a.index === along[i - 1].index).length
  }
  assert.ok(sides > 300 && ties > 50, `${sides} sides, ${ties} ties`)
})
