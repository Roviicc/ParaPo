// Our GeoJSON sources (the cheap-phone plan, step 10, 2026-10-04): each tile
// of them carries 32 px past its edges, not MapLibre's 128, and every layer
// drawn from them still fits in that.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/map-sources-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPropertyExpression, latest } from '@maplibre/maplibre-gl-style-spec'
import { TILE_BUFFER } from '../../src/shared/map/layers.ts'
import { addSavedRoutes } from '../../src/shared/map/savedRoutesLayers.ts'
import { addSavedStops } from '../../src/shared/map/savedStopsLayers.ts'
import { addPassStretches } from '../../src/shared/geo/passStretches.ts'
import { addDirectionArrows } from '../../src/shared/map/directionArrows.ts'
import { addBabaanSides } from '../../src/shared/geo/babaanSides.ts'

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

const BUFFERED = ['saved-routes', 'saved-stops', 'saved-routes-pass', 'direction-arrows', 'direction-ends', 'babaan-side']
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

test('the six sources carry 32 px past each tile edge; the place wash keeps MapLibre’s 128', () => {
  const { sources } = allAdded()
  assert.equal(TILE_BUFFER, 32)
  for (const id of BUFFERED) assert.equal(sources.get(id)?.buffer, TILE_BUFFER, id)
  // Its dashes start counting where its ring was cut: a tile cut nearer would move them.
  assert.equal(sources.get('place-wash')?.buffer, undefined)
  assert.deepEqual(
    [...sources.keys()].filter((id) => !BUFFERED.includes(id)),
    ['place-wash'],
    'every other source of ours is in the list',
  )
})

test('every layer drawn from them reaches less than 32 px from its geometry, at every zoom', () => {
  const { layers } = allAdded()
  const drawn = layers.filter((l) => BUFFERED.includes(l.source))
  // Every one of the six has a layer, and each layer's reach is read.
  assert.deepEqual([...new Set(drawn.map((l) => l.source))].sort(), [...BUFFERED].sort())
  const reaches = Object.fromEntries(drawn.map((l) => [l.id, reach(l)]))
  for (const [id, r] of Object.entries(reaches)) if (r !== null) assert.ok(r < TILE_BUFFER, `${id} reaches ${r} px`)
  // The widest: the routes' hit area, 24 px at zoom 20 and up; the lit
  // line's casing, 15 px; the end circles, 8.5 px and a 2 px ring.
  assert.equal(reaches['saved-routes-hit'], 12.5)
  assert.equal(reaches['saved-routes-selected-casing'], 8)
  assert.equal(reaches['direction-end-circles'], 11.5)
  assert.deepEqual(
    Object.entries(reaches).filter(([, r]) => r === null).map(([id]) => id).sort(),
    ['saved-stops-label', 'saved-stops-label-hintuan'],
  )
  // A tile is drawn at its own zoom's scale or larger (the map's zoom, never
  // below a tile's: measured at pitch 0, 45 and 60, zoom 11 to 21), so its
  // 32 px are 32 px on screen or more.
})

test('none of their lines is dashed, patterned or graded: those count from where a cut line starts', () => {
  const { layers } = allAdded()
  for (const l of layers.filter((x) => BUFFERED.includes(x.source) && x.type === 'line')) {
    for (const name of ['line-dasharray', 'line-pattern', 'line-gradient']) assert.equal(l.paint?.[name], undefined, `${l.id}: ${name}`)
  }
})
