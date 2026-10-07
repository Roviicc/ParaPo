// Our GeoJSON sources (the cheap-phone plan, step 10, 2026-10-04): each tile
// of the chevrons and the end circles carries 32 px past its edges, not
// MapLibre's 128, and every layer drawn from them still fits in that, while
// the lines and boxes keep the 128 (d; review of step 10 (d), 2026-10-05);
// the routes and the hotspots are
// laid out as their sources are added, when they are in by then, and not a
// second time (c); and a full line read is patched into the routes once (e),
// and once more into a style made afresh (2026-10-05). And the hotspots'
// three box fills, as they are added, are one bucket for MapLibre's worker
// (step 5, 2026-10-05).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/map-sources-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createPropertyExpression, groupByLayout, latest } from '@maplibre/maplibre-gl-style-spec'
import { TILE_BUFFER, layOutOnce } from '../../src/features/routes/map/layers.ts'
import { loadOnce } from '../../src/features/routes/map/load-once.ts'
import { addSavedRoutes, routesData, unpatched } from '../../src/features/routes/map/saved-routes-layers.ts'
import { addSavedStops, hiddenStopFilters, stopsData } from '../../src/features/routes/map/saved-stops-layers.ts'
import { variantLine } from '../../src/features/routes/model/routes.ts'
import { stopRing } from '../../src/features/routes/model/stops.ts'
import { labelGroups } from '../../src/features/routes/model/places.ts'
import { addPassStretches } from '../../src/features/routes/geo/pass-stretches.ts'
import { addDirectionArrows } from '../../src/features/routes/map/direction-arrows.ts'
import { addBabaanSides } from '../../src/features/routes/geo/babaan-sides.ts'
import { INSET_PX, chevronAt } from '../../src/features/routes/map/chevrons.ts'
import { litWidthAt } from '../../src/features/routes/map/line-style.ts'

/**
 * A map that keeps what is added to it, in its drawing order: a basemap of
 * a background and a label to start, as the add functions place their
 * layers against the first label.
 */
function standInMap() {
  const sources = new Map()
  const layers = [
    { id: 'background', type: 'background' },
    { id: 'road-label', type: 'symbol', source: 'openmaptiles' },
  ]
  const images = new Set()
  return {
    sources,
    layers,
    addSource: (id, spec) => {
      assert.ok(!sources.has(id), `${id} added twice`)
      sources.set(id, spec)
    },
    getSource: (id) => sources.get(id),
    addLayer: (spec, before) => {
      const at = before === undefined ? layers.length : layers.findIndex((l) => l.id === before)
      assert.ok(at >= 0, `${spec.id} placed before ${before}, which is not there`)
      layers.splice(at, 0, spec)
    },
    getLayer: (id) => layers.find((l) => l.id === id),
    getLayersOrder: () => layers.map((l) => l.id),
    hasImage: (id) => images.has(id),
    addImage: (id) => images.add(id),
  }
}

/** Everything the two maps add, in the order their hooks run on either page. */
function allAdded() {
  const map = standInMap()
  addSavedRoutes(map)
  addSavedStops(map)
  addPassStretches(map)
  addDirectionArrows(map)
  addBabaanSides(map)
  return map
}

const BUFFERED = ['direction-arrows', 'direction-ends']
/**
 * Our sources that keep MapLibre's 128 px: the lines and boxes, where a tile
 * cut nearer moved their edges on screen (review of step 10 (d),
 * 2026-10-05: the cut point is rounded to the tile's grid and kept where
 * the rest of a line is simplified, so the stretch inside turns a little),
 * and the place wash, whose dashes count from where its ring was cut.
 */
const DEFAULT_BUFFER = ['saved-routes', 'saved-stops', 'place-wash', 'saved-routes-pass', 'babaan-side']
/** MapLibre's own buffer for a GeoJSON source given none. */
const MAPLIBRE_BUFFER = 128
const ZOOMS = Array.from({ length: 24 * 20 + 1 }, (_, i) => i / 20)

/** A paint property's value at `zoom`, as MapLibre evaluates it; its spec's default when unset. */
function paintAt(layer, name, zoom) {
  const spec = latest[`paint_${layer.type}`][name]
  const value = layer.paint?.[name] ?? spec.default
  const e = createPropertyExpression(value, 'paint', spec)
  assert.equal(e.result, 'success', `${layer.id}: ${name}`)
  assert.ok(e.value.kind === 'constant' || e.value.kind === 'camera', `${layer.id}: ${name} varies by feature, which this check does not read`)
  return e.value.evaluate({ zoom })
}

/**
 * How far a layer's pixels reach from its geometry, at its widest zoom, in
 * CSS pixels: a line's half width, gap and offset and its antialiasing
 * (half a pixel at most: MapLibre's line shader, 1 / pixel ratio / 2); a
 * fill's edge, its 1 px antialiasing line; a circle's radius, ring and blur.
 * Null for a symbol: MapLibre lays one out only in the tile its point is in
 * and draws it whole, across tile edges (symbol_layout.ts).
 */
function reach(layer) {
  const widest = (f) => Math.max(...ZOOMS.map(f))
  if (layer.type === 'line')
    return widest((z) => paintAt(layer, 'line-width', z) / 2 + paintAt(layer, 'line-gap-width', z) + Math.abs(paintAt(layer, 'line-offset', z)) + 0.5)
  if (layer.type === 'fill') return 1
  if (layer.type === 'circle') return widest((z) => paintAt(layer, 'circle-radius', z) + paintAt(layer, 'circle-stroke-width', z) + 1)
  if (layer.type === 'symbol') return null
  assert.fail(`${layer.id}: a ${layer.type} layer, which this check does not read`)
}

test('the chevrons and the end circles carry 32 px past each tile edge; the lines, the boxes and the place wash keep MapLibre’s 128', () => {
  const { sources } = allAdded()
  assert.equal(TILE_BUFFER, 32)
  for (const id of BUFFERED) assert.equal(sources.get(id)?.buffer, TILE_BUFFER, id)
  // A cut at 32 px moved the lines' and the boxes' edges by up to 41 levels
  // of 255 on a phone's screen; nothing may change what a visitor sees.
  for (const id of DEFAULT_BUFFER) assert.equal(sources.get(id)?.buffer, undefined, `${id} keeps MapLibre's buffer`)
  assert.deepEqual([...sources.keys()].sort(), [...BUFFERED, ...DEFAULT_BUFFER].sort(), 'every source of ours is in one list')
})

test('every layer drawn from the two reaches less than 32 px from its geometry, and every other of ours less than 128, at every zoom', () => {
  const { layers } = allAdded()
  const ours = [...BUFFERED, ...DEFAULT_BUFFER]
  const drawn = layers.filter((l) => ours.includes(l.source))
  // Every source has a layer, and each layer's reach is read.
  assert.deepEqual([...new Set(drawn.map((l) => l.source))].sort(), [...ours].sort())
  const reaches = Object.fromEntries(drawn.map((l) => [l.id, reach(l)]))
  for (const l of drawn) {
    const r = reaches[l.id]
    if (r === null) continue
    assert.ok(r < (BUFFERED.includes(l.source) ? TILE_BUFFER : MAPLIBRE_BUFFER), `${l.id} reaches ${r} px`)
  }
  // The widest: the routes' hit area, 24 px at zoom 20 and up; the lit
  // line's casing, 15 px; the end circles, 8.5 px and a 2 px ring.
  assert.equal(reaches['saved-routes-hit'], 12.5)
  assert.equal(reaches['saved-routes-selected-casing'], 8)
  assert.equal(reaches['direction-end-circles'], 11.5)
  assert.equal(reaches['direction-arrow-chevrons'], 1)
  assert.deepEqual(
    Object.entries(reaches).filter(([, r]) => r === null).map(([id]) => id).sort(),
    ['saved-stops-label', 'saved-stops-label-hintuan'],
  )
  // A tile is drawn at its own zoom's scale or larger (the map's zoom, never
  // below a tile's: measured at pitch 0, 45 and 60, zoom 11 to 21), so its
  // 32 px are 32 px on screen or more.
})

test('the two draw no line and no chevron as wide as 32 px: none is cut where a tile shows it', () => {
  const { layers } = allAdded()
  // A line's edge moves when it is cut nearer (DEFAULT_BUFFER says how): the
  // two draw only the chevrons' fill and the ends' circles. A circle is laid
  // out only in the tile its point is in (MapLibre's circle_bucket.ts).
  assert.deepEqual(
    layers.filter((l) => BUFFERED.includes(l.source)).map((l) => [l.source, l.type]),
    [['direction-arrows', 'fill'], ['direction-ends', 'circle']],
  )
  // A chevron, shaped in pixels at the view's zoom, as wide as the lit line
  // there: from corner to corner, at every zoom and turned any way, less
  // than 32 px, so none reaches from inside a tile to 32 px past its edge,
  // and the polygon in the tile is the one drawn with MapLibre's 128.
  const at = [121.03, 14.65]
  const cosLat = Math.cos((at[1] * Math.PI) / 180)
  let widest = 0
  for (const zoom of ZOOMS) {
    const degrees = 360 / (512 * 2 ** zoom)
    for (const bearing of [0, 37, 90, 141, 225]) {
      const ring = chevronAt(at, bearing, Math.max(0, litWidthAt(zoom) - 2 * INSET_PX), zoom).geometry.coordinates[0]
      const px = ring.map(([x, y]) => [(x - at[0]) / degrees, (y - at[1]) / (degrees * cosLat)])
      for (const p of px) for (const q of px) widest = Math.max(widest, Math.hypot(p[0] - q[0], p[1] - q[1]))
    }
  }
  assert.ok(widest < TILE_BUFFER, `a chevron ${widest} px across`)
  // 13 px across and 22 along, at zoom 20 and up: its tip to a back corner.
  assert.ok(Math.abs(widest - 22.85) < 0.01, `${widest}`)
})

// ------------------------------------------------------------ the hotspots' buckets (step 5)

/**
 * A layer as MapLibre's worker is handed it to group (StyleLayer.serialize,
 * style_layer_index.ts): an empty layout left out, as serialize leaves it.
 */
const asSerialized = ({ layout, ...spec }) => (layout && Object.keys(layout).length ? { ...spec, layout } : spec)

/**
 * The ids of each fill bucket the worker lays the hotspots' source out in:
 * MapLibre's own groupByLayout over their type, source, zooms, filter and
 * layout. Each bucket's boxes are triangulated and uploaded once.
 */
const stopFillBuckets = (layers) =>
  groupByLayout(layers.filter((l) => l.source === 'saved-stops').map(asSerialized))
    .filter((g) => g[0].type === 'fill')
    .map((g) => g.map((l) => l.id).sort())

test("the hotspots' three box fills are one bucket as they are added, as the public map keeps them, and with the studio's filters set", () => {
  const { layers } = allAdded()
  const ONE = [['saved-stops-fill', 'saved-stops-hatch', 'saved-stops-siblings']]
  // The public map sets no filter on them (applyHidden; map-style-test), so
  // what is added is what the worker groups, for good: one fill bucket, where
  // a filter or a layout of SIBLINGS' or HATCH's own would make it two.
  assert.deepEqual(stopFillBuckets(layers), ONE)
  // The studio's, set on these very layers: none hidden, and one box hidden.
  for (const hidden of ['', 'b1']) {
    const set = new Map(hiddenStopFilters(hidden))
    assert.ok(layers.some((l) => set.has(l.id)), 'the filters are for these layers')
    const filtered = layers.map((l) => (set.has(l.id) ? { ...l, filter: set.get(l.id) } : l))
    assert.deepEqual(stopFillBuckets(filtered), ONE, `hidden '${hidden}'`)
  }
})

// ------------------------------------------------------------ (c)

/** The committed map as the public map reads it (map-file.ts): each overview as the direction's line. */
const index = JSON.parse(readFileSync(new URL('../../public/data/index.v4.json', import.meta.url), 'utf8'))
const rows = index.variants.map(({ overview, ...v }) => ({ ...v, shape: overview ?? null }))
const stops = index.stops

/** What the routes' effect laid out before 2026-10-04, word for word. */
const routesBefore = (rows) => ({
  type: 'FeatureCollection',
  features: rows
    .map((v) => ({ v, line: variantLine(v) }))
    .filter(({ line }) => line.length > 1)
    .map(({ v, line }) => ({
      type: 'Feature',
      properties: {
        id: v.id,
        route_id: v.route_id,
        name: v.route?.name ?? '',
        mode: v.route?.mode ?? 'jeepney',
      },
      geometry: { type: 'LineString', coordinates: line },
    })),
})

/** What the hotspots' effect laid out before 2026-10-04, word for word (boxMiddle as it was). */
const boxMiddle = (ring) => {
  const lngs = ring.map((p) => p[0])
  const lats = ring.map((p) => p[1])
  return [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2]
}
const stopsBefore = (stops) => {
  const withArea = stops.filter((s) => stopRing(s).length >= 3)
  return {
    type: 'FeatureCollection',
    features: [
      ...withArea.map((s) => ({
        type: 'Feature',
        properties: { id: s.id, kind: s.kind, name: s.name },
        geometry: s.area,
      })),
      ...labelGroups(withArea.map((s) => ({ ...s, point: { type: 'Point', coordinates: boxMiddle(stopRing(s)) } }))).map((g) => ({
        type: 'Feature',
        properties: { id: g.ids[0], ids: g.ids.join(','), kind: g.kind, name: g.name },
        geometry: { type: 'Point', coordinates: g.point },
      })),
    ],
  }
}

test('the committed map is laid out as before: every direction with a line, every box and name', () => {
  assert.ok(rows.length >= 20 && stops.length >= 100, `${rows.length} directions, ${stops.length} hotspots`)
  assert.deepEqual(routesData(rows), routesBefore(rows))
  assert.deepEqual(stopsData(stops), stopsBefore(stops))
  // A slot, a return not drawn yet, has no line, and is left out as before.
  const slot = { ...rows[0], id: 'slot', shape: null }
  assert.equal(routesData([...rows, slot]).features.length, rows.length)
  assert.deepEqual(routesData([...rows, slot]), routesBefore([...rows, slot]))
  assert.deepEqual(routesData([]), { type: 'FeatureCollection', features: [] })
  assert.deepEqual(stopsData([]), { type: 'FeatureCollection', features: [] })
})

test('a source is added with what is loaded by then; with nothing loaded, empty, as it was', () => {
  const loaded = standInMap()
  addSavedRoutes(loaded, rows)
  addSavedStops(loaded, stops)
  assert.deepEqual(loaded.sources.get('saved-routes').data, routesBefore(rows))
  assert.deepEqual(loaded.sources.get('saved-stops').data, stopsBefore(stops))
  const early = standInMap()
  addSavedRoutes(early)
  addSavedStops(early)
  for (const id of ['saved-routes', 'saved-stops', 'place-wash']) assert.deepEqual(early.sources.get(id).data, { type: 'FeatureCollection', features: [] }, id)
  // The rest of what is added does not change with what is loaded.
  const strip = (m) => ({ layers: m.layers, sources: [...m.sources].map(([id, { data, ...spec }]) => [id, spec]) })
  assert.deepEqual(strip(loaded), strip(early))
})

test('laid out once: added with the rows, the effect that follows does nothing; new rows are laid out', () => {
  const laidOut = { current: null }
  const sent = []
  const layOut = (r) => sent.push(r)
  // Added with the rows in: the hook notes them as laid out.
  const first = rows
  laidOut.current = first
  layOutOnce(laidOut, first, layOut)
  assert.deepEqual(sent, [])
  // A reload's rows, even the same directions, are a new array: laid out.
  const second = [...rows]
  layOutOnce(laidOut, second, layOut)
  layOutOnce(laidOut, second, layOut)
  assert.deepEqual(sent, [second])
  // Added before anything loaded: the empty list it started with is not laid out again; what loads is.
  const empty = []
  const early = { current: empty }
  const late = []
  layOutOnce(early, empty, (r) => late.push(r))
  layOutOnce(early, rows, (r) => late.push(r))
  assert.deepEqual(late, [rows])
})

test('read once as the hooks mount: twice in development under StrictMode was one read; another loader, or a reload, reads again', () => {
  // The hooks' effect calls loadOnce with their loader; StrictMode runs it twice, the ref kept.
  const loadedBy = { current: null }
  const reads = []
  const listVariants = () => 'routes'
  const effect = (load) => loadOnce(loadedBy, load, () => reads.push(load()))
  assert.equal(effect(listVariants), true)
  assert.equal(effect(listVariants), false)
  assert.deepEqual(reads, ['routes'])
  // A loader of another identity (one made each render, which the hooks warn against) reads again.
  const other = () => 'other'
  assert.equal(effect(other), true)
  assert.deepEqual(reads, ['routes', 'other'])
  // Both hooks run their mount's read through it, keyed on the loader; a reload is the hook's own and reads afresh.
  for (const file of ['use-saved-routes.ts', 'use-saved-stops.ts']) {
    const src = readFileSync(new URL(`../../src/features/routes/map/${file}`, import.meta.url), 'utf8')
    assert.match(src, /useEffect\(\(\) => \{\n\s*loadOnce\(loadedBy, load, \(\) => void reload\(\)\)\n\s*\}, \[load, reload\]\)/, file)
    assert.equal((src.match(/void reload\(\)/g) ?? []).length, 1, `${file}: the mount's read only through loadOnce`)
  }
})

// ------------------------------------------------------------ (e)

const lineOf = (id) => ({ type: 'LineString', coordinates: [[121, 14], [121.01, 14.01 + id.length / 1000]] })

test('each full line is patched in once: an arrival sends only the lines not sent yet', () => {
  const sent = new Map()
  // A list's six lines, handed on in three frames as useSavedRoutes does:
  // each frame's map a copy of the last with the new lines set.
  const frames = [['a', 'b'], ['c'], ['d', 'e', 'f']]
  let lines = new Map()
  const updates = []
  for (const ids of frames) {
    lines = new Map(lines)
    for (const id of ids) lines.set(id, lineOf(id))
    updates.push(unpatched(sent, lines))
  }
  assert.deepEqual(updates.map((u) => u.map((x) => x.id)), [['a', 'b'], ['c'], ['d', 'e', 'f']])
  // Each update is the line itself, as updateData takes it.
  assert.equal(updates[1][0].newGeometry, lines.get('c'))
  // Before, each arrival sent every line read so far: 2 + 3 + 6.
  assert.equal(updates.flat().length, 6)
  // The effect run again with nothing new (a lit change, the same lines): nothing.
  assert.deepEqual(unpatched(sent, lines), [])
})

test('a line that is another object for an id is sent again; new rows, laid out afresh, have every line sent again', () => {
  const sent = new Map()
  const lines = new Map([['a', lineOf('a')], ['b', lineOf('b')]])
  unpatched(sent, lines)
  const again = new Map(lines).set('b', lineOf('b'))
  assert.deepEqual(unpatched(sent, again).map((x) => x.id), ['b'])
  // The rows' effect lays the source out again from the overviews and starts a new record.
  const fresh = new Map()
  assert.deepEqual(unpatched(fresh, again).map((x) => x.id), ['a', 'b'])
})

// Review of step 10 (e), 2026-10-05: a style made afresh. MapLibre builds
// every source anew from its own copy of the data when a lost GL context is
// given back (map.ts, _contextRestored) and on a basemap switch (basemap.ts),
// and a patch reaches that copy only once the worker has answered it
// (geojson_source.ts): a line on its way then is not in the new source.
// The hook itself, in real React (react-dom's client, as commit-turn-test
// renders it), on a stand-in map.

/** A map of what useSavedRoutesLayers asks, each source's updateData kept; `afresh` builds the sources anew from their data as added, as a style made afresh would without the lines on their way, and says 'style.load'. */
function routesMap() {
  const map = standInMap()
  const handlers = new Map()
  const made = (spec) => ({ spec, updates: [], setData() {}, updateData(diff) { this.updates.push(diff.update.map((u) => u.id)) } })
  const live = new Map()
  Object.assign(map, {
    addSource: (id, spec) => {
      assert.ok(!live.has(id), `${id} added twice`)
      live.set(id, made(spec))
    },
    getSource: (id) => live.get(id),
    on: (type, f) => (handlers.get(type) ?? handlers.set(type, new Set()).get(type)).add(f),
    once: (type, f) => {
      const g = (...a) => (map.off(type, g), f(...a))
      map.on(type, g)
    },
    off: (type, f) => handlers.get(type)?.delete(f),
    fire: (type) => [...(handlers.get(type) ?? [])].forEach((f) => f({ type })),
    setFeatureState: () => {},
    getPaintProperty: () => undefined,
    setPaintProperty: () => {},
    setFilter: () => {},
    afresh: () => {
      for (const [id, s] of live) live.set(id, made(s.spec))
      map.fire('style.load')
    },
  })
  return map
}

test('a style made afresh gets every full line read so far, one on its way when the source was copied among them; then only new ones', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.window ??= globalThis
  globalThis.HTMLIFrameElement ??= class {}
  const noop = () => {}
  const container = { nodeType: 1, nodeName: 'DIV', tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml', addEventListener: noop, removeEventListener: noop }
  globalThis.document ??= { nodeType: 9, addEventListener: noop, removeEventListener: noop, defaultView: globalThis, documentElement: container, body: container, activeElement: null }
  container.ownerDocument = globalThis.document
  const { createElement: h, act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { useSavedRoutesLayers } = await import('../../src/features/routes/map/saved-routes-layers.ts')

  const map = routesMap()
  const [a, b, c] = rows.map((r) => r.id)
  const read = (...ids) => new Map(ids.map((id) => [id, lineOf(id)]))
  const routes = () => map.getSource('saved-routes')
  function Routes({ lines }) {
    useSavedRoutesLayers(map, rows, lines, null, [])
    return null
  }
  const root = createRoot({ ...container })
  const show = (lines) => act(async () => root.render(h(Routes, { lines })))

  await show(new Map())
  assert.deepEqual(routes().spec.data, routesBefore(rows), 'added with the rows')
  // Made afresh before any line is read: nothing to send.
  map.afresh()
  assert.deepEqual(routes().updates, [])

  let lines = read(a)
  await show(lines)
  lines = new Map(lines).set(b, lineOf(b))
  await show(lines)
  assert.deepEqual(routes().updates, [[a], [b]], 'each line once, as it arrives')
  // The GL context is lost with b's line on its way to the worker, and given
  // back: the source is made again from the copy, b's overview in it.
  map.afresh()
  assert.deepEqual(routes().updates, [[a, b]], 'every line read so far, to the new source')
  // And from there, only what is new.
  lines = new Map(lines).set(c, lineOf(c))
  await show(lines)
  assert.deepEqual(routes().updates, [[a, b], [c]])
  // A basemap switch, the same.
  map.afresh()
  assert.deepEqual(routes().updates, [[a, b, c]])
  // Undone: a style made afresh after is no longer heard.
  await act(async () => root.unmount())
  map.afresh()
  assert.deepEqual(routes().updates, [])
})
