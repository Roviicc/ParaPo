// The GL programs a tap would compile (the cheap-phone plan, steps 2-4,
// 2026-10-04): a first-use program stalls a cheap phone's main thread for
// 5-50 ms, and the harness's (SwiftShader's) for up to a second and more, so
// the layers a tap lights are painted to share the programs the map compiles
// at load. These checks read the layers as MapLibre would, from the style
// spec; the suites (phone-test, visitor-test) and the cheap-phone timer read
// the programs the map really compiles, by their keys.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/gl-programs-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Color, createPropertyExpression, featureFilter, latest } from '@maplibre/maplibre-gl-style-spec'
import { PASS_LAYER } from '../../src/shared/geo/passStretches.ts'
import { ENDS_PAINT, ENDS_TWIN } from '../../src/shared/map/directionArrows.ts'
import { WARM_SOURCE, afterIdle, warmPrograms } from '../../src/shared/map/warmPrograms.ts'
import { hiddenStopFilters, namePaint } from '../../src/shared/map/savedStopsLayers.ts'
import { HOTSPOT_CONTENT } from '../../src/shared/map/colours.ts'
import { litOpacity } from '../../src/shared/map/savedRoutesLayers.ts'
import { litWidth } from '../../src/shared/map/lineStyle.ts'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

/**
 * The part of a layer's GL program key its paint decides, as MapLibre 6.7
 * builds it (program_configuration.ts): for each paint property that can
 * vary by feature, u when it is one value for the layer — a constant, or of
 * the zoom alone, worked out each frame — a when it varies by feature, and z
 * by feature and zoom (a cross-faded one, a pattern, is a then too). Two
 * layers of one type with the same answer are drawn by one program. `only`
 * picks the properties: a symbol layer's text and icons are programs apart.
 */
function programOf(layer, only = () => true) {
  const spec = latest[`paint_${layer.type}`]
  return Object.entries(spec)
    .filter(([name, p]) => only(name) && /data-driven$/.test(p['property-type']))
    .map(([name, p]) => {
      const value = layer.paint?.[name]
      if (value === undefined) return `u_${name}`
      const e = createPropertyExpression(value, 'paint', p)
      assert.equal(e.result, 'success', `${layer.id ?? layer.type}: ${name}`)
      const kind = e.value.kind
      const crossFaded = p['property-type'] === 'cross-faded-data-driven'
      return `${kind === 'constant' || kind === 'camera' ? 'u' : kind === 'source' || crossFaded ? 'a' : 'z'}_${name}`
    })
    .sort()
    .join('/')
}

test('programOf reads a paint as MapLibre keys it: a constant or the zoom alone is u, a feature a, both z', () => {
  const lit = ['case', ['boolean', ['feature-state', 'lit'], false], 1, 0]
  const key = (opacity) => programOf({ type: 'line', paint: { 'line-color': '#123456', 'line-width': litWidth(), 'line-opacity': opacity } })
  assert.match(key(1), /(^|\/)u_line-opacity(\/|$)/)
  assert.match(key(lit), /(^|\/)a_line-opacity(\/|$)/)
  // The orange stretches' opacity before 2026-10-04: the key the harness saw a tap compile.
  assert.match(key(['step', ['zoom'], 0, 15, lit]), /(^|\/)z_line-opacity(\/|$)/)
  assert.match(key(1), /(^|\/)u_line-width(\/|$)/, 'a width of the zoom alone is u')
})

// ------------------------------------------------------------ step 2

test("the orange stretches are drawn by the lit line's program, from zoom 15", () => {
  // The lit line and its casing as savedRoutesLayers.ts paints them: a
  // colour for the layer, litWidth() and litOpacity(). Read off the file, so
  // a change there is a change here.
  const routes = read('../../src/shared/map/savedRoutesLayers.ts')
  const selected = routes.match(/id: SELECTED,[\s\S]*?paint: \{([\s\S]*?)\n\s*\},\n\s*\},\n\s*before,/)
  assert.ok(selected, 'savedRoutesLayers.ts adds SELECTED with a paint')
  assert.match(selected[1], /'line-width': litWidth\(\),/)
  assert.match(selected[1], /'line-opacity': litOpacity\(\),/)
  const litLine = { type: 'line', paint: { 'line-color': '#000000', 'line-width': litWidth(), 'line-opacity': litOpacity() } }
  assert.equal(programOf(PASS_LAYER), programOf(litLine))
  assert.doesNotMatch(programOf(PASS_LAYER), /z_/, 'no paint of the zoom and a feature at once')
  // Shown from 15 by the layer, and lit as the line is: a switch, never a shade.
  assert.equal(PASS_LAYER.minzoom, 15)
  assert.deepEqual(PASS_LAYER.paint['line-opacity'], litOpacity())
})

test('the same pixels as the step it replaces: nothing below 15, the lit stretches whole from 15', () => {
  // The step's opacity, evaluated as MapLibre does, against the layer's
  // minzoom (a layer is hidden below it) and litOpacity, at the zooms
  // either side and on the edge, for a stretch lit and one not.
  const lit = ['case', ['boolean', ['feature-state', 'lit'], false], 1, 0]
  const step = createPropertyExpression(['step', ['zoom'], 0, 15, lit], 'paint', latest.paint_line['line-opacity']).value
  const now = createPropertyExpression(PASS_LAYER.paint['line-opacity'], 'paint', latest.paint_line['line-opacity']).value
  for (const zoom of [10, 14, 14.9, 14.999, 15, 15.1, 16, 18, 22]) {
    for (const state of [{ lit: true }, { lit: false }, {}]) {
      const before = step.evaluate({ zoom }, { properties: {} }, state)
      const after = zoom < PASS_LAYER.minzoom ? 0 : now.evaluate({ zoom }, { properties: {} }, state)
      assert.equal(after, before, `zoom ${zoom}, ${JSON.stringify(state)}`)
    }
  }
})

// ------------------------------------------------------------ step 3

test("the end circles' twin is drawn by their program, unseen", () => {
  const ends = { type: 'circle', paint: ENDS_PAINT }
  assert.equal(ENDS_TWIN.type, 'circle')
  assert.equal(programOf(ENDS_TWIN), programOf(ends))
  // One program for the layer whatever a card paints its ring (useRideColours sets a colour).
  assert.doesNotMatch(programOf(ends), /(^|\/)[az]_/)
  // Clear, but drawn: MapLibre skips a circle layer only for an opacity of 0.
  for (const k of ['circle-color', 'circle-stroke-color']) assert.equal(Color.parse(ENDS_TWIN.paint[k])?.a, 0, k)
  for (const k of ['circle-opacity', 'circle-stroke-opacity']) assert.equal(ENDS_TWIN.paint[k], undefined, k)
  assert.equal(ENDS_TWIN.paint['circle-stroke-width'], ENDS_PAINT['circle-stroke-width'])
  assert.deepEqual(ENDS_TWIN.paint['circle-radius'], ENDS_PAINT['circle-radius'])
})

/** A map with the calls warmPrograms makes, its style a list of layers over sources, and its events fired by hand. */
function fakeMap(order = ['background', 'saved-stops-fill', 'saved-routes-casing', 'direction-end-circles', 'saved-routes-hit']) {
  const sources = new Map([['direction-ends', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }]])
  const layers = order.map((id) => ({ id }))
  const once = new Map()
  const log = []
  return {
    log,
    layers,
    sources,
    style: {},
    getSource: (id) => sources.get(id),
    addSource: (id, s) => {
      assert.ok(!sources.has(id), `source ${id} added twice`)
      sources.set(id, s)
      log.push(`+source ${id}`)
    },
    removeSource: (id) => {
      assert.ok(!layers.some((l) => l.source === id), `source ${id} removed under its layers`)
      sources.delete(id)
      log.push(`-source ${id}`)
    },
    getLayer: (id) => layers.find((l) => l.id === id),
    addLayer: (layer, before) => {
      assert.ok(sources.has(layer.source), `layer ${layer.id} on no source`)
      const at = before === undefined ? layers.length : layers.findIndex((l) => l.id === before)
      layers.splice(at, 0, layer)
      log.push(`+layer ${layer.id} before ${before}`)
    },
    removeLayer: (id) => {
      layers.splice(layers.findIndex((l) => l.id === id), 1)
      log.push(`-layer ${id}`)
    },
    getLayersOrder: () => layers.map((l) => l.id),
    getCenter: () => ({ toArray: () => [121.05, 14.65] }),
    once(type, fn) {
      once.set(type, [...(once.get(type) ?? []), fn])
      return this
    },
    off(type, fn) {
      once.set(type, (once.get(type) ?? []).filter((f) => f !== fn))
      return this
    },
    fire(type) {
      const fns = once.get(type) ?? []
      once.delete(type)
      for (const fn of fns) fn()
    },
    waiting: (type) => (once.get(type) ?? []).length,
  }
}

test('a warm-up: one point at the middle of the view, its twin at the bottom of the stack, gone at the next idle', () => {
  const map = fakeMap()
  assert.equal(warmPrograms(map, [ENDS_TWIN]), true)
  const src = map.getSource(WARM_SOURCE)
  assert.deepEqual(src.data.geometry, { type: 'Point', coordinates: [121.05, 14.65] })
  // Over the background, under everything of ours.
  assert.deepEqual(map.getLayersOrder(), ['background', 'warm-programs-0', 'saved-stops-fill', 'saved-routes-casing', 'direction-end-circles', 'saved-routes-hit'])
  assert.deepEqual(map.getLayer('warm-programs-0').paint, ENDS_TWIN.paint)
  // Its own source and ids: none of the editor's, and the ends' untouched.
  assert.ok(map.getLayersOrder().every((id) => !id.startsWith('draw-')))
  assert.deepEqual(map.getSource('direction-ends').data.features, [])
  // Asked again before the idle: nothing more.
  assert.equal(warmPrograms(map, [ENDS_TWIN]), false)
  assert.equal(map.log.length, 2)
  map.fire('idle')
  assert.deepEqual(map.getLayersOrder(), ['background', 'saved-stops-fill', 'saved-routes-casing', 'direction-end-circles', 'saved-routes-hit'])
  assert.equal(map.getSource(WARM_SOURCE), undefined)
  assert.deepEqual(map.log, ['+source warm-programs', '+layer warm-programs-0 before saved-stops-fill', '-layer warm-programs-0', '-source warm-programs'])
  // And again, as after a lost GL context: the same once more.
  assert.equal(warmPrograms(map, [ENDS_TWIN]), true)
  map.fire('idle')
  assert.equal(map.getSource(WARM_SOURCE), undefined)
})

test('a basemap switch while the twin is there: it goes by its id all the same, or is already gone', () => {
  // Carried across, in another place among the new basemap's layers (basemap.ts's transform).
  const map = fakeMap()
  warmPrograms(map, [ENDS_TWIN])
  const twin = map.layers.splice(1, 1)[0]
  map.layers.splice(3, 0, { id: 'road' }, twin)
  map.fire('idle')
  assert.ok(!map.getLayersOrder().includes('warm-programs-0'))
  assert.equal(map.getSource(WARM_SOURCE), undefined)
  // A style rebuilt without it: nothing to take away, no error.
  const bare = fakeMap()
  warmPrograms(bare, [ENDS_TWIN])
  bare.layers.splice(1, 1)
  bare.sources.delete(WARM_SOURCE)
  assert.doesNotThrow(() => bare.fire('idle'))
})

/** A browser's idle callbacks and timers, run by hand. */
function fakeBrowser({ idle = true } = {}) {
  const queue = []
  const cancel = (n) => {
    b.cancelled.push(n)
    queue[n - 1].cancelled = true
  }
  const b = {
    queue,
    asked: [],
    cancelled: [],
    setTimeout: (run, ms) => (queue.push({ run, ms, kind: 'timer' }), queue.length),
    clearTimeout: cancel,
    /** Runs what is waiting and not cancelled. */
    flush: () => queue.filter((q) => !q.done && !q.cancelled).forEach((q) => ((q.done = true), q.run())),
  }
  if (idle) {
    b.requestIdleCallback = (run, options) => (b.asked.push(options), queue.push({ run, kind: 'idle' }), queue.length)
    b.cancelIdleCallback = cancel
  }
  return b
}

test("afterIdle waits for the map's next idle, then for the browser's spare moment", () => {
  const map = fakeMap()
  const browser = fakeBrowser()
  let runs = 0
  afterIdle(map, () => runs++, browser)
  assert.equal(browser.queue.length, 0, 'nothing before the idle')
  map.fire('idle')
  assert.equal(runs, 0, 'not in the idle itself')
  assert.equal(browser.queue[0].kind, 'idle')
  assert.ok(browser.asked[0].timeout > 0, 'a busy page still gets it, in time')
  browser.flush()
  assert.equal(runs, 1)
  map.fire('idle')
  browser.flush()
  assert.equal(runs, 1, 'once')
})

test('afterIdle without requestIdleCallback (Safari): a timer', () => {
  const map = fakeMap()
  const browser = fakeBrowser({ idle: false })
  let runs = 0
  afterIdle(map, () => runs++, browser)
  map.fire('idle')
  assert.equal(browser.queue[0].kind, 'timer')
  browser.flush()
  assert.equal(runs, 1)
})

test('afterIdle cancelled before the idle, or after it, runs nothing; nor on a map whose style is gone', () => {
  const map = fakeMap()
  const browser = fakeBrowser()
  let runs = 0
  const cancel = afterIdle(map, () => runs++, browser)
  cancel()
  assert.equal(map.waiting('idle'), 0)
  map.fire('idle')
  assert.equal(browser.queue.length, 0)
  const later = afterIdle(map, () => runs++, browser)
  map.fire('idle')
  later()
  assert.deepEqual(browser.cancelled, [1])
  // A lost context: MapLibre has no style until it is given back.
  const lost = fakeMap()
  afterIdle(lost, () => runs++, browser)
  lost.fire('idle')
  lost.style = null
  browser.flush()
  assert.equal(runs, 0)
})

// ------------------------------------------------------------ step 4

test("hotspot names are one colour a layer: the basemap's names' program, the same pixels as the match on the kind", () => {
  // The colour as it was: the boxes' content colour by kind, one expression for both layers.
  const match = ['match', ['get', 'kind'], 'terminal', HOTSPOT_CONTENT.terminal, HOTSPOT_CONTENT.hintuan]
  const was = createPropertyExpression(match, 'paint', latest.paint_symbol['text-color']).value
  const text = (name) => name.startsWith('text-')
  assert.match(programOf({ type: 'symbol', paint: { 'text-color': match } }, text), /(^|\/)a_text-color(\/|$)/, 'the match was a program of its own')
  // Each layer holds one kind's names (its filter, as the layer is added: none hidden).
  const filters = Object.fromEntries(hiddenStopFilters(''))
  const layers = { 'saved-stops-label': 'terminal', 'saved-stops-label-hintuan': 'hintuan' }
  for (const [id, kind] of Object.entries(layers)) {
    const paint = namePaint(kind)
    assert.doesNotMatch(programOf({ type: 'symbol', paint }, text), /(^|\/)[az]_/, `${id}: one value for the layer`)
    const f = featureFilter(filters[id], `layers.${id}.filter`)
    for (const other of ['terminal', 'hintuan']) {
      const name = { type: 1, properties: { id: 'x', ids: 'x', kind: other, name: 'A' } }
      const shown = f.filter({ zoom: 17 }, name)
      assert.equal(shown, other === kind, `${id} shows ${other} names: ${shown}`)
      // Where a name is shown, the colour it gets is the colour the match gave it.
      if (shown) assert.deepEqual(Color.parse(paint['text-color']), was.evaluate({ zoom: 17 }, name), `${id}, a ${other}'s name`)
    }
    assert.deepEqual(paint['text-halo-width'], 1)
  }
})
