// MapLibre's worker built with the page, and the chunks both pages share
// (the cheap-phone plan, steps 12 and 14, 2026-10-05). Reads the real
// vite.config.ts: its plugin's hooks against a stand-in of Rolldown's
// context, and which of its chunk groups takes each module. The build
// itself is proved by check-build.mjs (`npm run build`): the worker's
// imports, each chunk's contents and weight, the stylesheets' order.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/maplibre-worker-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import config, { MAPLIBRE_WORKER_URL, maplibreWorkerWithThePage } from '../../vite.config.ts'

const plugin = maplibreWorkerWithThePage()

test("MapView.tsx asks for the worker's URL by the import the plugin answers in a build and Vite's worker plugin in dev", () => {
  const src = readFileSync(new URL('../../src/features/routes/map/map-view.tsx', import.meta.url), 'utf8')
  assert.ok(src.includes(`import maplibreWorkerUrl from '${MAPLIBRE_WORKER_URL}'`), MAPLIBRE_WORKER_URL)
  assert.ok(
    config.plugins.flat().some((p) => p?.name === plugin.name),
    'the plugin is in the config',
  )
  // Build only, so `npm run dev` keeps `?worker&url`; ahead of Vite's own.
  assert.equal(plugin.apply, 'build')
  assert.equal(plugin.enforce, 'pre')
})

test('the plugin takes that one import, and emits the worker as a chunk of the build whose URL it hands back', async () => {
  const id = plugin.resolveId(MAPLIBRE_WORKER_URL)
  assert.equal(typeof id, 'string')
  assert.ok(id.startsWith('\0'), 'a virtual module no other plugin loads')
  for (const other of [
    'maplibre-gl',
    'maplibre-gl/dist/maplibre-gl-worker.mjs',
    'maplibre-gl/dist/maplibre-gl-worker.mjs?worker',
    './worker.ts?worker&url',
  ]) {
    assert.equal(plugin.resolveId(other), null, other)
  }

  const emitted = []
  const context = (resolved) => ({
    resolve: async (source) => (source === 'maplibre-gl/dist/maplibre-gl-worker.mjs' ? resolved : null),
    emitFile: (file) => {
      emitted.push(file)
      return 'ref7'
    },
  })
  const worker = { id: '/repo/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs' }
  assert.equal(await plugin.load.call(context(worker), id), 'export default import.meta.ROLLUP_FILE_URL_ref7')
  assert.deepEqual(emitted, [{ type: 'chunk', id: worker.id, name: 'maplibre-gl-worker' }])
  assert.equal(await plugin.load.call(context(worker), '/repo/src/features/routes/map/map-view.tsx'), null, 'no other module')
  assert.equal(emitted.length, 1)
  await assert.rejects(plugin.load.call(context(null), id), /maplibre-gl-worker\.mjs is missing/)
})

/**
 * The group Rolldown would put a module in by its test alone: the highest
 * priority first, the first listed of equals. Share counts are left out;
 * `shared` has no test and takes what two chunks import.
 */
const groups = config.build.rolldownOptions.output.codeSplitting.groups
const groupOf = (id) =>
  [...groups]
    .map((g, i) => ({ ...g, i }))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.i - b.i)
    .find((g) => g.test && g.test.test(id))?.name ?? null

test("the worker's two imports have groups to themselves, ahead of the page's MapLibre; its own file and the stylesheet none", () => {
  const dist = (f) => `/repo/node_modules/maplibre-gl/dist/${f}`
  assert.equal(groupOf(dist('maplibre-gl-shared.mjs')), 'maplibre-gl-shared')
  assert.equal(groupOf('\0vite/preload-helper.js'), 'vite-preload')
  assert.equal(groupOf(dist('maplibre-gl.mjs')), 'maplibre')
  // An entry of its own: in `maplibre` it would bring the page's MapLibre
  // into the worker. And the stylesheet stays with index.css's (shared-*.css).
  assert.equal(groupOf(dist('maplibre-gl-worker.mjs')), null)
  assert.equal(groupOf(dist('maplibre-gl.css')), null)
  assert.equal(groupOf(dist('maplibre-gl-worker.mjs') + '?worker&url'), null)
  assert.equal(groupOf('C:\\repo\\node_modules\\maplibre-gl\\dist\\maplibre-gl-shared.mjs'), 'maplibre-gl-shared', 'Windows paths')
})

test('React has its group; our code, other packages and the runtime none', () => {
  for (const f of ['react/index.js', 'react/jsx-runtime.js', 'react-dom/client.js', 'react-dom/cjs/react-dom.production.js', 'scheduler/index.js']) {
    assert.equal(groupOf(`/repo/node_modules/${f}`), 'react', f)
  }
  assert.equal(groupOf('C:\\repo\\node_modules\\react-dom\\client.js'), 'react', 'Windows paths')
  for (const id of [
    '/repo/node_modules/react-is/index.js',
    '/repo/node_modules/workbox-window/build/workbox-window.prod.es5.mjs',
    '/repo/node_modules/@supabase/supabase-js/dist/index.mjs',
    '/repo/src/features/routes/map/map-view.tsx',
    '/repo/src/react/x.ts',
    '\0rolldown/runtime.js',
  ]) {
    assert.equal(groupOf(id), null, id)
  }
  const shared = groups.find((g) => g.name === 'shared')
  assert.equal(shared.test, undefined)
  assert.equal(shared.minShareCount, 2)
})
