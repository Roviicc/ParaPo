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
import { createPropertyExpression, latest } from '@maplibre/maplibre-gl-style-spec'
import { PASS_LAYER } from '../../src/shared/geo/passStretches.ts'
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
