// What a tap lands on (src/shared/map/tap.ts), asked of the map once a tap
// (the cheap-phone plan, step 7, 2026-10-04): both hooks hear the map's one
// click (routeTaps, stopTaps) and ask the same question, so the second takes
// the first's answer, kept on the browser's event, or without one on the
// point MapLibre made for the listeners. Against a stand-in map that counts
// its queries.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/tap-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ROUTES_HIT_LAYER, STOPS_FILL_LAYER, resolveTap, tapBox, tapTargets } from '../../src/shared/map/tap.ts'

/**
 * A map with the two hit layers: `under` gives, for a layer, what a query
 * there finds — `inside` for the one-pixel ask inside a box, the layer's id
 * for the tap's box. Every query is counted in `asked`, as [layer, a point
 * or a box].
 */
function standIn(under) {
  const asked = []
  return {
    asked,
    getLayer: (id) => (id === ROUTES_HIT_LAYER || id === STOPS_FILL_LAYER ? { id } : undefined),
    queryRenderedFeatures(where, { layers }) {
      asked.push([layers[0], Array.isArray(where[0]) ? 'box' : 'point'])
      const found = under[Array.isArray(where[0]) ? layers[0] : 'inside'] ?? []
      return found.map((properties) => ({ properties }))
    },
  }
}

/** A finger's click, as a browser makes it: a PointerEvent's pointerType. */
const touch = () => ({ type: 'click', pointerType: 'touch' })

test("a tap's answer is asked of the map once, and the other hook takes it", () => {
  const map = standIn({ [ROUTES_HIT_LAYER]: [{ id: 'a-out', route_id: 'a' }, { id: 'a-out', route_id: 'a' }] })
  const event = touch()
  const point = { x: 100, y: 200 }
  const first = tapTargets(map, point, event)
  // Inside a box (none here), then the routes in the finger's box.
  assert.deepEqual(map.asked, [[STOPS_FILL_LAYER, 'point'], [ROUTES_HIT_LAYER, 'box']])
  assert.deepEqual(first, { routeIds: ['a-out'], routeKeys: ['a'], stopIds: [] })
  const second = tapTargets(map, point, event)
  assert.equal(map.asked.length, 2, 'the second hook asks nothing')
  assert.equal(second, first, 'and has the same answer')
  assert.deepEqual(resolveTap(second), { kind: 'route', routeIds: ['a-out'] })
})

test('the next tap is asked afresh, even on the same spot', () => {
  const map = standIn({ [STOPS_FILL_LAYER]: [{ id: 's1' }] })
  const point = { x: 10, y: 10 }
  // Near a box, a finger's width off its edge: all three questions.
  assert.deepEqual(tapTargets(map, point, touch()), { routeIds: [], routeKeys: [], stopIds: ['s1'] })
  assert.equal(map.asked.length, 3)
  tapTargets(map, point, touch())
  assert.equal(map.asked.length, 6)
})

test("without the browser's event, the answer is kept on MapLibre's point, the one every listener gets", () => {
  const map = standIn({ inside: [{ id: 's1' }, { id: 's2' }, { id: 's1' }] })
  const point = { x: 5, y: 6 }
  assert.deepEqual(tapTargets(map, point), { routeIds: [], routeKeys: [], stopIds: ['s1', 's2'] })
  assert.equal(map.asked.length, 1, 'inside a box: one question')
  tapTargets(map, point)
  assert.equal(map.asked.length, 1, 'the same point: kept')
  tapTargets(map, { x: 5, y: 6 })
  assert.equal(map.asked.length, 2, 'another point where that one was: asked again')
})

test('an answer is kept for its own map and its own point only', () => {
  const under = { [ROUTES_HIT_LAYER]: [{ id: 'b-back', route_id: 'b' }] }
  const [one, two] = [standIn(under), standIn(under)]
  const event = touch()
  tapTargets(one, { x: 1, y: 1 }, event)
  tapTargets(two, { x: 1, y: 1 }, event)
  assert.equal(two.asked.length, 2, 'another map asks for itself')
  tapTargets(one, { x: 2, y: 1 }, event)
  assert.equal(one.asked.length, 4, 'another point on the same event asks again')
  // The last asked is the one kept: the event's first point is asked again too.
  tapTargets(one, { x: 1, y: 1 }, event)
  assert.equal(one.asked.length, 6)
})

test("the box is a finger's or a mouse's, by the event's pointer", () => {
  assert.deepEqual(tapBox({ x: 100, y: 100 }, { pointerType: 'touch' }), [[80, 80], [120, 120]])
  assert.deepEqual(tapBox({ x: 100, y: 100 }, { pointerType: 'mouse' }), [[95, 95], [105, 105]])
})
