// The public map's file reader (src/shared/mapFile.ts) against files of
// every shape it can meet, served by a fake fetch.
//
//   node --experimental-strip-types scripts/map-file-test.mjs
//
// Why this exists: an installed app keeps its code for months and fetches
// whatever /data/map.json serves. This proves it reads every file published
// so far (no schema number) and today's (schema 1), ignores fields it does
// not know, and refuses a shape it does not know with the message the banner
// shows — instead of drawing nonsense or a blank map.
import { test } from 'node:test'
import assert from 'node:assert/strict'

let n = 0
/** A fresh copy of the module, since it caches the first successful load. */
const fresh = () => import(`../src/shared/mapFile.ts?case=${n++}`)

const base = { published_at: '2026-09-25T11:33:22Z', variants: [], stops: [], links: [] }

/** Serve `body` (an object, or a string for a non-JSON answer) with `status`. */
function serve(body, { status = 200, headers = {} } = {}) {
  globalThis.fetch = async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    })
}

test('a file published before the number existed (no schema) is shape 1 and loads', async () => {
  serve(base)
  const { loadMapFile } = await fresh()
  const file = await loadMapFile()
  assert.equal(file.published_at, base.published_at)
})

test("today's file, schema 1, loads", async () => {
  serve({ schema: 1, ...base })
  const { loadMapFile, MAP_FILE_SCHEMA } = await fresh()
  assert.equal(MAP_FILE_SCHEMA, 1)
  assert.equal((await loadMapFile()).schema, 1)
})

test('fields the app does not know are ignored, not a new shape', async () => {
  serve({ schema: 1, ...base, fares: [{ from: 'Tala', to: 'SM Fairview', pesos: 13 }], terminals: [] })
  const { loadMapFile } = await fresh()
  const file = await loadMapFile()
  assert.deepEqual(file.variants, [])
  assert.equal(file.fares.length, 1)
})

test('a shape this app does not know (schema 2) is refused with the banner message', async () => {
  serve({ schema: 2, ...base })
  const { loadMapFile, MAP_FILE_TOO_NEW } = await fresh()
  await assert.rejects(loadMapFile(), { message: MAP_FILE_TOO_NEW })
})

test('something that is not a map is that error, whatever number it carries', async () => {
  serve({ schema: 2, hello: 'world' })
  const { loadMapFile } = await fresh()
  await assert.rejects(loadMapFile(), { message: '/data/map.json is not a published map' })
})

test('a failed answer is an HTTP error', async () => {
  serve('gone', { status: 503 })
  const { loadMapFile } = await fresh()
  await assert.rejects(loadMapFile(), { message: '/data/map.json: HTTP 503' })
})

test('a failure is not cached: the next load asks again', async () => {
  serve('gone', { status: 503 })
  const { loadMapFile } = await fresh()
  await assert.rejects(loadMapFile())
  serve({ schema: 1, ...base })
  assert.equal((await loadMapFile()).schema, 1)
})

test('the stored-copy header marks the load stale; a network answer does not', async () => {
  serve({ schema: 1, ...base }, { headers: { 'x-parapo-served-from': 'cache' } })
  const a = await fresh()
  await a.loadMapFile()
  assert.equal(a.mapFileIsStale(), true)
  serve({ schema: 1, ...base })
  const b = await fresh()
  await b.loadMapFile()
  assert.equal(b.mapFileIsStale(), false)
})

test('the committed public/data/map.json is a file this app reads', async () => {
  const { readFileSync } = await import('node:fs')
  serve(JSON.parse(readFileSync(new URL('../public/data/map.json', import.meta.url), 'utf8')))
  const { loadMapFile, MAP_FILE_SCHEMA } = await fresh()
  assert.equal((await loadMapFile()).schema, MAP_FILE_SCHEMA)
})

// The file diet of 2026-09-25 (scripts/publish-map.mjs): a line's points
// carry 5 decimals (about 1 m), a hotspot's corners 6 (about 0.1 m). The
// editor saves 15 or more, and those digits were half the file's bytes.
// Checked on the committed file, so a publish that forgets the rounding
// cannot land quietly.
test('the committed file carries no more decimals than the publish script writes', async () => {
  const { readFileSync } = await import('node:fs')
  const file = JSON.parse(readFileSync(new URL('../public/data/map.json', import.meta.url), 'utf8'))
  const decimals = (n) => (String(n).split('.')[1] ?? '').length
  const worst = { line: 0, hotspot: 0 }
  for (const v of file.variants) for (const c of v.shape?.coordinates ?? []) for (const n of c) worst.line = Math.max(worst.line, decimals(n))
  for (const s of file.stops) {
    for (const n of s.point?.coordinates ?? []) worst.hotspot = Math.max(worst.hotspot, decimals(n))
    for (const ring of s.area?.coordinates ?? []) for (const c of ring) for (const n of c) worst.hotspot = Math.max(worst.hotspot, decimals(n))
  }
  assert.ok(worst.line <= 5, `a line point has ${worst.line} decimals`)
  assert.ok(worst.hotspot <= 6, `a hotspot corner has ${worst.hotspot} decimals`)
})
