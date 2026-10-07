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
import { PASS_LAYER } from '../../src/features/routes/geo/pass-stretches.ts'
import { ENDS_PAINT, ENDS_TWIN } from '../../src/features/routes/map/direction-arrows.ts'
import { WARM_SOURCE, afterIdle, warmPrograms, warmSoon } from '../../src/features/routes/map/warm-programs.ts'
import { twinsOf } from '../../src/features/routes/map/layer-switch.ts'
import { addSavedRoutes } from '../../src/features/routes/map/saved-routes-layers.ts'
import { addSavedStops } from '../../src/features/routes/map/saved-stops-layers.ts'
import { hiddenStopFilters, namePaint } from '../../src/features/routes/map/saved-stops-layers.ts'
import { HOTSPOT_CONTENT } from '../../src/features/routes/map/colours.ts'
import { litOpacity } from '../../src/features/routes/map/saved-routes-layers.ts'
import { litWidth } from '../../src/features/routes/map/line-style.ts'

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
  // The lit line and its casing as saved-routes-layers.ts paints them: a
  // colour for the layer, litWidth() and litOpacity(). Read off the file, so
  // a change there is a change here.
  const routes = read('../../src/features/routes/map/saved-routes-layers.ts')
  const selected = routes.match(/id: SELECTED,[\s\S]*?paint: \{([\s\S]*?)\n\s*\},\n\s*\},\n\s*before,/)
  assert.ok(selected, 'saved-routes-layers.ts adds SELECTED with a paint')
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
    getZoom: () => 10,
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

test('a warm-up: a speck at the middle of the view, each twin over its own at the bottom of the stack, gone with the first move after the idle', () => {
  const map = fakeMap()
  const line = { type: 'line', paint: { 'line-color': '#000000', 'line-width': litWidth(), 'line-opacity': litOpacity() } }
  assert.equal(warmPrograms(map, [ENDS_TWIN, line]), true)
  const src = map.getSource(WARM_SOURCE)
  // A point, a line and a box, 16 px each way at the zoom (512 px tiles): no tile simplifies them away.
  const d = (16 * 360) / (512 * 2 ** 10)
  assert.deepEqual(
    src.data.features.map((f) => f.geometry),
    [
      { type: 'Point', coordinates: [121.05, 14.65] },
      { type: 'LineString', coordinates: [[121.05 - d, 14.65], [121.05 + d, 14.65]] },
      { type: 'Polygon', coordinates: [[[121.05 - d, 14.65 - d], [121.05 + d, 14.65 - d], [121.05 + d, 14.65 + d], [121.05 - d, 14.65 + d], [121.05 - d, 14.65 - d]]] },
    ],
  )
  // Over the background, under everything of ours, each over the speck its type draws.
  assert.deepEqual(map.getLayersOrder(), ['background', 'warm-programs-0', 'warm-programs-1', 'saved-stops-fill', 'saved-routes-casing', 'direction-end-circles', 'saved-routes-hit'])
  assert.deepEqual(map.getLayer('warm-programs-0').paint, ENDS_TWIN.paint)
  assert.deepEqual(map.getLayer('warm-programs-0').filter, ['==', ['geometry-type'], 'Point'])
  assert.deepEqual(map.getLayer('warm-programs-1').paint, line.paint)
  assert.deepEqual(map.getLayer('warm-programs-1').filter, ['==', ['geometry-type'], 'LineString'])
  // Its own source and ids: none of the editor's, and the ends' untouched.
  assert.ok(map.getLayersOrder().every((id) => !id.startsWith('draw-')))
  assert.deepEqual(map.getSource('direction-ends').data.features, [])
  // No twins: nothing.
  assert.equal(warmPrograms(map, []), false)
  assert.equal(map.log.length, 3)
  // The idle takes nothing away: that would be a frame of the whole map of its own.
  map.fire('idle')
  assert.equal(map.log.length, 3)
  assert.equal(map.waiting('movestart'), 1)
  // The first move does, in the frames it draws anyway.
  map.fire('movestart')
  assert.deepEqual(map.getLayersOrder(), ['background', 'saved-stops-fill', 'saved-routes-casing', 'direction-end-circles', 'saved-routes-hit'])
  assert.equal(map.getSource(WARM_SOURCE), undefined)
  assert.deepEqual(map.log, [
    '+source warm-programs',
    '+layer warm-programs-0 before saved-stops-fill',
    '+layer warm-programs-1 before saved-stops-fill',
    '-layer warm-programs-0',
    '-layer warm-programs-1',
    '-source warm-programs',
  ])
  // And again, as after a lost GL context: the same once more.
  assert.equal(warmPrograms(map, [ENDS_TWIN]), true)
  map.fire('idle')
  map.fire('movestart')
  assert.equal(map.getSource(WARM_SOURCE), undefined)
})

test('a warm-up still on the map is joined: beside its twins, over its specks, and all go with the move after the next idle', () => {
  const map = fakeMap()
  warmPrograms(map, [ENDS_TWIN])
  map.fire('idle')
  // Asked again before a move: on beside the first, the source as it was.
  const fill = { type: 'fill', paint: { 'fill-color': '#000000', 'fill-opacity': ['case', ['boolean', ['feature-state', 'lit'], false], 1, 0] } }
  assert.equal(warmPrograms(map, [fill]), true)
  assert.deepEqual(map.getLayersOrder().slice(0, 3), ['background', 'warm-programs-1', 'warm-programs-0'])
  assert.deepEqual(map.getLayer('warm-programs-1').filter, ['==', ['geometry-type'], 'Polygon'])
  assert.equal(map.log.filter((l) => l.startsWith('+source')).length, 1)
  // A move before the joined twin's idle takes nothing: it may not be drawn yet.
  map.fire('movestart')
  assert.ok(map.getLayer('warm-programs-1'))
  map.fire('idle')
  map.fire('movestart')
  assert.ok(!map.getLayersOrder().some((id) => id.startsWith('warm-programs')))
  assert.equal(map.getSource(WARM_SOURCE), undefined)
})

test('a basemap switch while the twin is there: it goes by its id all the same, or is already gone', () => {
  // Carried across, in another place among the new basemap's layers (basemap.ts's transform).
  const map = fakeMap()
  warmPrograms(map, [ENDS_TWIN])
  const twin = map.layers.splice(1, 1)[0]
  map.layers.splice(3, 0, { id: 'road' }, twin)
  map.fire('idle')
  map.fire('movestart')
  assert.ok(!map.getLayersOrder().includes('warm-programs-0'))
  assert.equal(map.getSource(WARM_SOURCE), undefined)
  // A style rebuilt without it: nothing to take away, no error.
  const bare = fakeMap()
  warmPrograms(bare, [ENDS_TWIN])
  bare.layers.splice(1, 1)
  bare.sources.delete(WARM_SOURCE)
  bare.fire('idle')
  assert.doesNotThrow(() => bare.fire('movestart'))
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

test('warmSoon: the hooks that ask before the idle are one warm-up, asked as it comes; one that asks later is the next', () => {
  const map = fakeMap()
  const browser = fakeBrowser()
  const line = { type: 'line', paint: { 'line-color': '#000000', 'line-opacity': litOpacity() } }
  let ends = 0
  warmSoon(map, () => (ends === 0 ? [ENDS_TWIN] : []), browser)
  warmSoon(map, () => [line], browser)
  assert.equal(browser.queue.length, 0, 'nothing before the idle')
  map.fire('idle')
  // Asked after the idle: the next warm-up's, not this one's.
  let later = 0
  warmSoon(map, () => (later++, [line]), browser)
  assert.equal(browser.queue.length, 1, 'one warm-up for the two that asked before the idle')
  browser.flush()
  assert.deepEqual(map.getLayersOrder().filter((id) => id.startsWith('warm-programs')), ['warm-programs-0', 'warm-programs-1'])
  assert.equal(later, 0)
  // The next one, at the next idle: it joins what is still on the map.
  map.fire('idle')
  browser.flush()
  assert.equal(later, 1)
  assert.equal(map.getLayersOrder().filter((id) => id.startsWith('warm-programs')).length, 3)
  // A provider with nothing to warm by then adds nothing; a warm-up with nothing adds no source.
  const quiet = fakeMap()
  ends = 1
  warmSoon(quiet, () => (ends === 0 ? [ENDS_TWIN] : []), browser)
  quiet.fire('idle')
  browser.flush()
  assert.equal(quiet.getSource(WARM_SOURCE), undefined)
})

test('warmSoon cancelled: the last one cancels the warm-up, before the idle or after it; one of two leaves the other', () => {
  const browser = fakeBrowser()
  const a = fakeMap()
  const cancel = warmSoon(a, () => [ENDS_TWIN], browser)
  cancel()
  assert.equal(a.waiting('idle'), 0)
  a.fire('idle')
  assert.equal(browser.queue.length, 0)
  const b = fakeMap()
  const one = warmSoon(b, () => [ENDS_TWIN], browser)
  const line = { type: 'line', paint: { 'line-color': '#000000', 'line-opacity': litOpacity() } }
  warmSoon(b, () => [line], browser)
  one()
  b.fire('idle')
  browser.flush()
  assert.deepEqual(b.getLayersOrder().filter((id) => id.startsWith('warm-programs')), ['warm-programs-0'])
  assert.deepEqual(b.getLayer('warm-programs-0').paint, line.paint)
  const c = fakeMap()
  const after = warmSoon(c, () => [ENDS_TWIN], browser)
  c.fire('idle')
  after()
  browser.flush()
  assert.equal(c.getSource(WARM_SOURCE), undefined)
  // Asked again after a cancel: a warm-up of its own.
  warmSoon(c, () => [ENDS_TWIN], browser)
  c.fire('idle')
  browser.flush()
  assert.ok(c.getLayer('warm-programs-0'))
})

test("the switched layers' twins: each layer's type and paint but its switch, drawn by its program, unseen", () => {
  // The five as the hooks add them: off from the start (layer-switch.ts).
  const sources = new Map()
  const layers = [{ id: 'background', type: 'background' }, { id: 'road-label', type: 'symbol' }]
  const map = {
    addSource: (id, spec) => sources.set(id, spec),
    addLayer: (spec, before) => layers.splice(before ? layers.findIndex((l) => l.id === before) : layers.length, 0, spec),
    getLayer: (id) => layers.find((l) => l.id === id),
    getLayersOrder: () => layers.map((l) => l.id),
    hasImage: () => false,
    addImage: () => {},
  }
  addSavedRoutes(map)
  addSavedStops(map)
  layers.push(PASS_LAYER)
  const switched = ['saved-routes-selected-casing', 'saved-routes-selected', 'saved-routes-selected-pass', 'saved-stops-siblings', 'saved-stops-hatch']
  const twins = twinsOf(map, [...switched, 'not-added'])
  assert.equal(twins.length, switched.length, 'one a layer on the map; none for one not there')
  twins.forEach((twin, i) => {
    const layer = map.getLayer(switched[i])
    assert.equal(twin.type, layer.type, layer.id)
    assert.equal(programOf(twin), programOf(layer), `${layer.id}: the same program`)
    assert.ok(!Object.keys(twin.paint).some((k) => k.includes('layer-opacity')), `${layer.id}: drawn, at 1 as when lit`)
    const rest = Object.fromEntries(Object.entries(layer.paint).filter(([k]) => !k.includes('layer-opacity')))
    assert.deepEqual(twin.paint, rest, `${layer.id}: the rest of its paint as it is`)
    // Unseen: what it shows is what the feature state lights, and a speck has none.
    const prop = `${layer.type}-opacity`
    const e = createPropertyExpression(layer.paint[prop], 'paint', latest[`paint_${layer.type}`][prop])
    assert.equal(e.result, 'success', layer.id)
    assert.equal(e.value.evaluate({ zoom: 15 }, { type: layer.type === 'line' ? 2 : 3, properties: { kind: 'hintuan' } }, {}), 0, `${layer.id}: nothing to see`)
  })
  // A MapLibre layer is read as it serializes: its paint as set now.
  const live = { getLayer: () => ({ serialize: () => ({ id: 'x', type: 'line', source: 's', paint: { 'line-color': '#123456', 'line-layer-opacity': 1, 'line-layer-opacity-transition': { duration: 0 } } }) }) }
  assert.deepEqual(twinsOf(live, ['x']), [{ type: 'line', paint: { 'line-color': '#123456' } }])
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
