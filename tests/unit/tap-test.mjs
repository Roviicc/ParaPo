// What a tap lands on (src/shared/map/tap.ts), asked of the map once a tap
// (the cheap-phone plan, step 7, 2026-10-04): both hooks hear the map's one
// click (routeTaps, stopTaps) and ask the same question, so the second takes
// the first's answer, kept on the browser's event, or without one on the
// point MapLibre made for the listeners. Against a stand-in map that counts
// its queries. And the hand over a line or a box bound only where a pointer
// can hover, from when one can (bindHover; the taps review, 2026-10-05),
// against a stand-in map that keeps its listeners and a stand-in
// matchMedia.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/tap-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ROUTES_HIT_LAYER, STOPS_FILL_LAYER, bindHover, resolveTap, tapBox, tapTargets } from '../../src/shared/map/tap.ts'

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

/**
 * The page's '(any-hover: hover)', as a stand-in MediaQueryList: `heard`
 * holds its 'change' listeners, and `change(to)` is a pointer that can hover
 * coming (true) or going (false). Set as window.matchMedia's answer until
 * `restore`.
 */
function hoverQuery(matches) {
  const heard = new Set()
  const asked = []
  const query = {
    heard,
    asked,
    get matches() {
      return matches
    },
    addEventListener: (type, f) => type === 'change' && heard.add(f),
    removeEventListener: (type, f) => type === 'change' && heard.delete(f),
    change(to) {
      matches = to
      for (const f of [...heard]) f({ matches: to, media: '(any-hover: hover)' })
    },
  }
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window')
  globalThis.window = { matchMedia: (q) => (asked.push(q), query) }
  query.restore = () => (had ? Object.defineProperty(globalThis, 'window', had) : delete globalThis.window)
  return query
}

/** A map that keeps the layer listeners bound to it, by event and layer. */
function listeningMap() {
  const bound = []
  return {
    bound,
    on: (type, layer, f) => bound.push([type, layer, f]),
    off(type, layer, f) {
      const at = bound.findIndex((b) => b[0] === type && b[1] === layer && b[2] === f)
      if (at >= 0) bound.splice(at, 1)
    },
  }
}

const enter = () => {}
const leave = () => {}
const pair = (layer) => [['mouseenter', layer, enter], ['mouseleave', layer, leave]]

test('where a pointer can hover as the hook binds, the hand is bound at once and undone with the hook', () => {
  const query = hoverQuery(true)
  try {
    const map = listeningMap()
    const undo = bindHover(map, ROUTES_HIT_LAYER, enter, leave)
    assert.deepEqual(query.asked, ['(any-hover: hover)'])
    assert.deepEqual(map.bound, pair(ROUTES_HIT_LAYER))
    assert.equal(query.heard.size, 0, 'nothing left to wait for')
    undo()
    assert.deepEqual(map.bound, [])
  } finally {
    query.restore()
  }
})

test('a phone binds no hand, until a pointer that can hover comes; then it is bound, and kept should it go', () => {
  const query = hoverQuery(false)
  try {
    const map = listeningMap()
    const undo = bindHover(map, STOPS_FILL_LAYER, enter, leave)
    assert.deepEqual(map.bound, [], 'a finger: no pair, so no query of the map as it moves')
    assert.equal(query.heard.size, 1)
    // A mouse paired, or a keyboard with a trackpad attached, mid-visit.
    query.change(true)
    assert.deepEqual(map.bound, pair(STOPS_FILL_LAYER))
    assert.equal(query.heard.size, 0, 'bound once, no longer listening')
    // Gone again: the pair stays, as before step 7, so a hand left showing
    // is taken off by the next pointer's first move off the box.
    query.change(false)
    assert.deepEqual(map.bound, pair(STOPS_FILL_LAYER), 'kept')
    query.change(true)
    assert.deepEqual(map.bound, pair(STOPS_FILL_LAYER), 'still the one pair')
    undo()
    assert.deepEqual(map.bound, [])
  } finally {
    query.restore()
  }
})

test('a hook undone before any pointer could hover binds nothing, then or later', () => {
  const query = hoverQuery(false)
  try {
    const map = listeningMap()
    bindHover(map, ROUTES_HIT_LAYER, enter, leave)()
    assert.equal(query.heard.size, 0, 'no longer listening')
    query.change(true)
    assert.deepEqual(map.bound, [])
  } finally {
    query.restore()
  }
})

test('without matchMedia the hand is bound at once, as on every device before step 7', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window')
  globalThis.window = {}
  try {
    const map = listeningMap()
    const undo = bindHover(map, ROUTES_HIT_LAYER, enter, leave)
    assert.deepEqual(map.bound, pair(ROUTES_HIT_LAYER))
    undo()
    assert.deepEqual(map.bound, [])
  } finally {
    had ? Object.defineProperty(globalThis, 'window', had) : delete globalThis.window
  }
})
