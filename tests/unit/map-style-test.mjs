// What the map's style costs the main thread (the cheap-phone plan, steps 1
// and 5, 2026-10-04): the whole style is not checked against the spec, on a
// load or a basemap switch; the public map sets no hiding filter, and the
// studio's still hide and show; the hotspots' fills stay one bucket.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/map-style-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Map as MapLibreMap } from 'maplibre-gl'
import { featureFilter, groupByLayout } from '@maplibre/maplibre-gl-style-spec'
import { BASEMAPS, applyBasemap } from '../../src/shared/map/basemap.ts'
import { applyHidden } from '../../src/shared/map/layers.ts'
import { hiddenStopFilters } from '../../src/shared/map/savedStopsLayers.ts'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('the map is made with no whole-style check', () => {
  const made = read('../../src/shared/map/MapView.tsx').match(/new MapLibreMap\(\{[\s\S]*?\n\s*\}\)/)
  assert.ok(made, 'MapView.tsx makes its map with new MapLibreMap({ … })')
  assert.match(made[0], /\n\s*validateStyle: false,/)
})

test('a basemap switch skips the check too: MapLibre’s setStyle takes the map’s option as its default', () => {
  for (const b of BASEMAPS) {
    // MapLibre's own setStyle, on a map with no canvas: what it hands on to
    // the diff (a style already up) or to a rebuild.
    const asked = []
    const map = Object.assign(Object.create(MapLibreMap.prototype), {
      _validateStyle: false,
      _localIdeographFontFamily: 'sans-serif',
      style: {},
      _diffStyle: (style, options) => asked.push({ way: 'diff', style, options }),
      _updateStyle: (style, options) => asked.push({ way: 'rebuild', style, options }),
    })
    applyBasemap(map, b)
    assert.equal(asked.length, 1, b.id)
    assert.equal(asked[0].way, 'diff', b.id)
    assert.equal(asked[0].style, b.url, b.id)
    assert.equal(asked[0].options.validate, false, `${b.id}: the switch validates the whole style`)
    assert.equal(typeof asked[0].options.transformStyle, 'function', `${b.id}: our layers ride across`)
  }
})

// ------------------------------------------------------------ hiding filters

/** What each hook's filters were set to over a run of hidden ids, as its effect would run: '' shows them all. */
const hidings = (asked) => {
  const applied = { current: null }
  const set = []
  for (const hidden of asked) applyHidden(applied, hidden, (id) => set.push(id))
  return set
}

test('the public map, which never hides anything, sets no hiding filter', () => {
  assert.deepEqual(hidings([null, undefined, null, null]), [])
})

test("the studio's outline hides its saved copy, shows it again once closed, and then sets nothing more", () => {
  // Opened, the effect run again with it (a map made again), closed, closed,
  // then another opened, a third straight after, and closed.
  assert.deepEqual(hidings([null, 'x', 'x', null, null, 'y', 'z', null, undefined]), ['x', 'x', '', 'y', 'z', ''])
})

const STOP_LAYERS = {
  'saved-stops-fill': 'fill',
  'saved-stops-outline': 'line',
  'saved-stops-siblings': 'fill',
  'saved-stops-hatch': 'fill',
  'saved-stops-label': 'symbol',
  'saved-stops-label-hintuan': 'symbol',
}
const BOX_LAYERS = ['saved-stops-fill', 'saved-stops-outline', 'saved-stops-siblings', 'saved-stops-hatch']

test("the hotspots' three box fills, the siblings' among them, keep one filter: the worker lays them out as one bucket", () => {
  for (const hidden of ['', 'b1']) {
    const filters = hiddenStopFilters(hidden)
    assert.deepEqual(filters.map(([id]) => id).sort(), Object.keys(STOP_LAYERS).sort(), 'every layer of the source')
    // MapLibre's own grouping (style-spec groupByLayout): type, source, filter, layout.
    const groups = groupByLayout(filters.map(([id, filter]) => ({ id, type: STOP_LAYERS[id], source: 'saved-stops', filter })))
    const fills = groups.filter((g) => g[0].type === 'fill').map((g) => g.map((l) => l.id).sort())
    assert.deepEqual(fills, [['saved-stops-fill', 'saved-stops-hatch', 'saved-stops-siblings']], `hidden '${hidden}'`)
  }
})

test('the box being edited, and the name it shares, are left out of every hotspot layer, and nothing else', () => {
  const box = (id, kind) => ({ type: 3, properties: { id, kind } })
  const label = (ids, kind) => ({ type: 1, properties: { id: ids[0], ids: ids.join(','), kind } })
  const features = [box('b1', 'hintuan'), box('b2', 'hintuan'), box('t1', 'terminal'), label(['b1', 'b2'], 'hintuan'), label(['b3'], 'hintuan'), label(['t1'], 'terminal')]
  const shown = (hidden) =>
    Object.fromEntries(
      hiddenStopFilters(hidden).map(([id, filter]) => {
        const f = featureFilter(filter, `layers.${id}.filter`)
        return [id, features.filter((ft) => f.filter({ zoom: 17 }, ft)).map((ft) => ft.properties.ids ?? ft.properties.id)]
      }),
    )
  // None hidden: as the layers are added, the boxes in their four, each kind's names in its own.
  const none = shown('')
  for (const id of BOX_LAYERS) assert.deepEqual(none[id], ['b1', 'b2', 't1'], id)
  assert.deepEqual(none['saved-stops-label-hintuan'], ['b1,b2', 'b3'])
  assert.deepEqual(none['saved-stops-label'], ['t1'])
  const b1 = shown('b1')
  for (const id of BOX_LAYERS) assert.deepEqual(b1[id], ['b2', 't1'], id)
  assert.deepEqual(b1['saved-stops-label-hintuan'], ['b3'])
  assert.deepEqual(b1['saved-stops-label'], ['t1'])
})
