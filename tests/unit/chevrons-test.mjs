// The chevrons' geometry (src/features/routes/map/chevrons.ts): where along a lit line
// they sit, the stretches an earlier lit line already flows on, and each
// one's polygon; and what a move of the map does to them
// (src/features/routes/map/direction-arrows.ts, onAMove), and in the hook itself when
// one move starts as another ends (useDirectionArrows, 2026-10-05).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/chevrons-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chevronAt, chevronsAt, markCovered, measure, spacingPx } from '../../src/features/routes/map/chevrons.ts'
import { haversine, metresPerPixel } from '../../src/shared/utils/geo.ts'
import { onAMove, widened } from '../../src/features/routes/map/direction-arrows.ts'

/** A straight line north from [121.04, 14.70], `km` long, in `n` segments: sample data. */
const north = (km, n = 10, lng = 121.04) =>
  Array.from({ length: n + 1 }, (_, i) => [lng, 14.7 + (km / 111.2) * (i / n)])
const whole = { west: 120, east: 122, south: 14, north: 15.5, zoom: 15 }

test('a line is measured along its length, each segment with its bearing', () => {
  const line = north(1)
  const m = measure(line)
  assert.equal(m.at.length, line.length)
  assert.ok(Math.abs(m.length - haversine(line[0], line[line.length - 1])) < 0.5, `${m.length}`)
  assert.ok(m.bearing.every((b) => Math.abs(b) < 0.001), 'due north is 0°')
  const south = measure([...line].reverse())
  assert.ok(south.bearing.every((b) => Math.abs(Math.abs(b) - 180) < 0.001), 'due south is ±180°')
  assert.deepEqual(m.covered, m.bearing.map(() => false))
})

test('a second line on the same road, the same way, is covered; the other way, or a street over, is not', () => {
  const first = measure(north(1))
  const same = measure(north(1))
  markCovered(same, [first])
  assert.ok(same.covered.every(Boolean))
  const opposite = measure([...north(1)].reverse())
  markCovered(opposite, [first])
  assert.ok(opposite.covered.every((c) => !c))
  // 30 m east: another road.
  const over = measure(north(1, 10, 121.04 + 30 / 107_600))
  markCovered(over, [first])
  assert.ok(over.covered.every((c) => !c))
})

test('the spacing steps: more chevrons zoomed out, fewer zoomed in', () => {
  assert.ok(spacingPx(13) < spacingPx(15))
  assert.ok(spacingPx(16) > spacingPx(15))
  assert.equal(spacingPx(14), spacingPx(15.9))
})

test('a chevron is a closed V, as wide across as asked, pointing along its bearing', () => {
  const at = [121.04, 14.7]
  const c = chevronAt(at, 0, 10, 16)
  const ring = c.geometry.coordinates[0]
  assert.equal(ring.length, 7)
  assert.deepEqual(ring[0], ring[6])
  const px = 360 / (512 * 2 ** 16)
  const lngs = ring.map(([x]) => x)
  assert.ok(Math.abs((Math.max(...lngs) - Math.min(...lngs)) / px - 10) < 1e-6, 'arms reach the band edges')
  // The tip is the northernmost point for a chevron pointing north.
  assert.equal(Math.max(...ring.map(([, y]) => y)), ring[0][1])
})

test('chevrons sit every `spacing` metres from `offset`, none on a covered stretch or off screen', () => {
  const m = measure(north(1))
  const features = []
  chevronsAt(m, 50, 100, 8, whole, features)
  assert.equal(features.length, Math.floor((m.length - 50) / 100) + 1)
  const covered = measure(north(1))
  markCovered(covered, [m])
  const none = []
  chevronsAt(covered, 50, 100, 8, whole, none)
  assert.equal(none.length, 0)
  const elsewhere = []
  chevronsAt(m, 50, 100, 8, { west: 120, east: 120.5, south: 14, north: 14.5, zoom: 15 }, elsewhere)
  assert.equal(elsewhere.length, 0)
})

// The cheap-phone plan, step 16 (d), 2026-10-04: a line measured once and
// kept (chevrons.ts), its `covered` fresh at every call.

/** measure before step 16, word for word (but for types). */
function oldMeasure(line) {
  const at = [0]
  const bearing = []
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]
    const [bx, by] = line[i]
    at.push(at[i - 1] + haversine(line[i - 1], line[i]))
    const dx = (bx - ax) * Math.cos((ay * Math.PI) / 180)
    const dy = by - ay
    bearing.push((Math.atan2(dx, dy) * 180) / Math.PI)
  }
  return { line, at, bearing, length: at[at.length - 1], lat: line[Math.floor(line.length / 2)][1], covered: bearing.map(() => false) }
}

test('step 16 (d): measured as before; asked again, the same measures and a fresh covered; a new line, measured anew', () => {
  const line = [[121.04, 14.7], [121.041, 14.701], [121.043, 14.701], [121.043, 14.704]]
  const first = measure(line)
  assert.deepStrictEqual(first, oldMeasure(line))
  // Covered by another lit line this time…
  markCovered(first, [measure(line)])
  assert.ok(first.covered.every(Boolean))
  // …and the next time asked, nothing covered yet: covered is the call's own.
  const again = measure(line)
  assert.deepStrictEqual(again, oldMeasure(line))
  assert.notEqual(again.covered, first.covered)
  assert.ok(again.covered.every((c) => !c))
  assert.equal(again.at, first.at, 'the measures are kept')
  assert.equal(again.bearing, first.bearing)
  assert.equal(again.line, line)
  // A new line, even one with the same points, is another array: measured anew.
  const copy = line.map((p) => [...p])
  const other = measure(copy)
  assert.notEqual(other.at, first.at)
  assert.deepStrictEqual(other, oldMeasure(copy))
  const moved = line.map(([x, y]) => [x, y + 0.001])
  assert.notDeepStrictEqual(measure(moved).at.slice(1), [], 'measured')
  assert.deepStrictEqual(measure(moved), oldMeasure(moved))
})

test('step 16 (d): the committed map, every line both ways, measured as before', async () => {
  const { readPublished } = await import('../../scripts/checks/check-map-data.mjs')
  const { fileURLToPath } = await import('node:url')
  const file = readPublished(fileURLToPath(new URL('../../public/data/index.v4.json', import.meta.url))).file
  for (const v of file.variants.filter((x) => x.shape)) {
    for (const line of [v.shape.coordinates, [...v.shape.coordinates].reverse()]) {
      assert.deepStrictEqual(measure(line), oldMeasure(line))
      assert.deepStrictEqual(measure(line), oldMeasure(line), 'and asked again')
    }
  }
})

// The cheap-phone plan, step 17, 2026-10-04: held during pans.

/** A phone's view at `zoom` round [lng, lat]: 390 by 844 px of 512-px tiles, as the map's bounds read. */
const viewAt = ([lng, lat], zoom, dx = 0, dy = 0) => {
  const deg = 360 / (512 * 2 ** zoom)
  const [w, h] = [390 * deg, 844 * deg * Math.cos((lat * Math.PI) / 180)]
  const [x, y] = [lng + dx * w, lat + dy * h]
  return { west: x - w / 2, east: x + w / 2, south: y - h / 2, north: y + h / 2, zoom }
}

test('widened: a screen more each way, three across and three up, at the same zoom', () => {
  const v = viewAt([121.04, 14.7], 15)
  const w = widened(v)
  assert.equal(w.zoom, 15)
  assert.ok(Math.abs(w.east - w.west - 3 * (v.east - v.west)) < 1e-12)
  assert.ok(Math.abs(w.north - w.south - 3 * (v.north - v.south)) < 1e-12)
  assert.ok(Math.abs((w.east + w.west) / 2 - (v.east + v.west) / 2) < 1e-12, 'about the same middle')
})

test('a pan at one zoom holds them inside the window, and draws them a screen wider again once it leaves it', () => {
  const at = [121.04, 14.7]
  // movestart: drawn wide, and held.
  const held = widened(viewAt(at, 15))
  for (const [dx, dy] of [[0, 0], [0.4, 0], [-0.9, 0.3], [0.99, -0.99]]) assert.equal(onAMove(held, 15, viewAt(at, 15, dx, dy)), 'hold', `${dx}, ${dy}`)
  // Past a screen's width or height: out of the window, at the zoom they were drawn at.
  assert.equal(onAMove(held, 15, viewAt(at, 15, 1.01, 0)), 'wide')
  assert.equal(onAMove(held, 15, viewAt(at, 15, 0, -1.01)), 'wide')
  // Not held (drawn for the view: the steps' draws, or a zoom's): a pan at that zoom draws wide.
  assert.equal(onAMove(null, 15, viewAt(at, 15, 0.1, 0)), 'wide')
})

test('a zoom draws them for the view at each move; once the zoom stops changing, wide again', () => {
  const at = [121.04, 14.7]
  const held = widened(viewAt(at, 15))
  // Zooming in, the view is inside the window, but every frame changes their size.
  assert.equal(onAMove(held, 15, viewAt(at, 15.2)), 'view')
  assert.equal(onAMove(null, 15.2, viewAt(at, 15.4)), 'view')
  // The zoom it was drawn at, panning on: wide, and held from there.
  assert.equal(onAMove(null, 15.4, viewAt(at, 15.4, 0.2, 0)), 'wide')
  // And held from there.
  assert.equal(onAMove(widened(viewAt(at, 15.4, 0.2, 0)), 15.4, viewAt(at, 15.4, 0.5, 0)), 'hold')
})

test('held, every chevron a draw for the view would make is there, the same polygon', () => {
  // A line across several screens at zoom 16, the flow part way along.
  const line = Array.from({ length: 41 }, (_, i) => [121.03 + i * 0.0006, 14.69 + Math.sin(i / 4) * 0.002])
  const m = measure(line)
  const zoom = 16
  const mpp = metresPerPixel(m.lat, zoom)
  const spacing = spacingPx(zoom) * mpp
  const offset = (1.7 * 28 * mpp) % spacing
  const across = 9.5
  const start = viewAt(line[10], zoom)
  const wide = []
  chevronsAt(m, offset, spacing, across, widened(start), wide)
  const key = (f) => JSON.stringify(f)
  const drawn = new Set(wide.map(key))
  for (let step = 0; step <= 20; step++) {
    const now = viewAt(line[10], zoom, step / 20, -step / 40)
    assert.equal(onAMove(widened(start), zoom, now), 'hold')
    const tight = []
    chevronsAt(m, offset, spacing, across, now, tight)
    assert.ok(tight.length > 0, `chevrons on screen at step ${step}`)
    for (const f of tight) assert.ok(drawn.has(key(f)), `step ${step}: a chevron missing from what is held`)
  }
})

// Review of step 17, 2026-10-05: a camera call that stops another says
// 'moveend' and 'movestart' back to back (MapLibre's easeTo), as the compass
// camera does at every turn of the phone. The hook itself, in real React
// (react-dom's client, as commit-turn-test renders it), on a stand-in map
// whose frames run only when the check says so.

/** A map of what useDirectionArrows asks: its events, its view, and each source's setData kept. */
function chevronMap(view) {
  const handlers = new Map()
  const sets = { 'direction-arrows': [], 'direction-ends': [] }
  const sources = new Map()
  const map = {
    view,
    style: {},
    sets,
    on: (type, f) => (handlers.get(type) ?? handlers.set(type, new Set()).get(type)).add(f),
    once: (type, f) => {
      const g = (...a) => (map.off(type, g), f(...a))
      map.on(type, g)
    },
    off: (type, f) => handlers.get(type)?.delete(f),
    fire: (type) => [...(handlers.get(type) ?? [])].forEach((f) => f({ type })),
    getLayer: (id) => (id === 'saved-routes-hit' || sources.size > 0 ? { id } : undefined),
    getSource: (id) => sources.get(id),
    addSource: (id) => sources.set(id, { setData: (d) => sets[id].push(d.features) }),
    addLayer: () => {},
    setPaintProperty: () => {},
    getZoom: () => map.view.zoom,
    getBounds: () => ({ getWest: () => map.view.west, getEast: () => map.view.east, getSouth: () => map.view.south, getNorth: () => map.view.north }),
  }
  return map
}

test('a move that starts as another ends, as a camera call stops another, draws nothing while it stays in what is held; one that stops draws for the view a frame on', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.window ??= globalThis
  globalThis.HTMLIFrameElement ??= class {}
  const noop = () => {}
  const container = { nodeType: 1, nodeName: 'DIV', tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml', addEventListener: noop, removeEventListener: noop }
  globalThis.document ??= { nodeType: 9, addEventListener: noop, removeEventListener: noop, defaultView: globalThis, documentElement: container, body: container, activeElement: null }
  container.ownerDocument = globalThis.document
  // Frames run only when asked, each at time 0: the flow's steps never come
  // (their 66 ms never pass), so every draw counted is a move's.
  const queued = new Map()
  let nextFrame = 1
  globalThis.requestAnimationFrame = (f) => (queued.set(nextFrame, f), nextFrame++)
  globalThis.cancelAnimationFrame = (n) => queued.delete(n)
  const frame = () => {
    const due = [...queued.values()]
    queued.clear()
    for (const f of due) f(0)
  }
  const { createElement: h, act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { useDirectionArrows } = await import('../../src/features/routes/map/direction-arrows.ts')

  const line = Array.from({ length: 41 }, (_, i) => [121.03 + i * 0.0006, 14.69 + Math.sin(i / 4) * 0.002])
  const rides = [{ id: 'd1', line, from: 'A', to: 'B' }]
  const zoom = 16
  const map = chevronMap(viewAt(line[10], zoom))
  const arrows = map.sets['direction-arrows']
  function Arrows() {
    useDirectionArrows(map, rides)
    return null
  }
  const root = createRoot({ ...container })
  await act(async () => root.render(h(Arrows)))
  assert.equal(arrows.length, 1, 'drawn once for the view')
  const tight = arrows[0].length
  assert.ok(tight > 0)

  const moves = () => arrows.length
  // A move starts: drawn a screen wider each way, and held.
  map.fire('movestart')
  assert.equal(moves(), 2)
  const wide = arrows[1].length
  assert.ok(wide > tight, `${wide} held, ${tight} on screen`)
  map.view = viewAt(line[10], zoom, 0.3, -0.1)
  map.fire('move')
  assert.equal(moves(), 2, 'inside the window: held')
  // Another camera call stops it and starts its own: 'moveend', then at once 'movestart'.
  for (const [dx, dy] of [[0.4, -0.1], [0.5, 0], [0.6, 0.1]]) {
    map.fire('moveend')
    map.fire('movestart')
    map.view = viewAt(line[10], zoom, dx, dy)
    map.fire('move')
    frame()
  }
  assert.equal(moves(), 2, 'back to back, inside what is held: no draw at all')
  // It stops: nothing at once, then drawn for the view a frame on, as the steps draw them.
  map.fire('moveend')
  assert.equal(moves(), 2)
  frame()
  assert.equal(moves(), 3)
  assert.ok(arrows[2].length < wide && arrows[2].length > 0, `${arrows[2].length} for the view`)
  frame()
  assert.equal(moves(), 3, 'once')
  // A move that starts a frame or more after one stopped finds nothing held: drawn wide, as before.
  map.fire('movestart')
  assert.equal(moves(), 4)
  assert.ok(arrows[3].length > arrows[2].length)
  // One that starts out of what is held, at another zoom, is drawn wide for where it is.
  map.fire('moveend')
  map.view = viewAt(line[30], zoom + 1)
  map.fire('movestart')
  assert.equal(moves(), 5, 'drawn wide where the map now is')
  map.fire('moveend')
  frame()
  assert.equal(moves(), 6)
  // Undone with a draw for the view still to come: it never comes.
  map.fire('movestart')
  map.fire('moveend')
  const before = moves()
  await act(async () => root.unmount())
  frame()
  assert.equal(moves(), before, 'nothing after the hook is gone')
})
