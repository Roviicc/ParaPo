// What the map's style costs the main thread (the cheap-phone plan, steps 1
// and 5, 2026-10-04): the whole style is not checked against the spec, on a
// load or a basemap switch.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/map-style-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Map as MapLibreMap } from 'maplibre-gl'
import { BASEMAPS, applyBasemap } from '../../src/shared/map/basemap.ts'

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
