// The public map's file reader (src/commuter/mapFile.ts) against files of
// every shape it can meet, served by a fake fetch.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/map-file-test.mjs
//
// Why this exists: an installed app keeps its code for months and fetches
// whatever its path serves. This proves it reads today's index
// (/data/index.v4.json, schema 4: the train lines and the ferry in) with each direction's overview as its line until the full line
// is read from /data/lines/, ignores fields it does not know, and refuses a
// shape it does not know with the message the banner shows — instead of
// drawing nonsense or a blank map. Shape 1 was the one file, /data/map.json,
// which the publish keeps writing for one release so older apps still load;
// shape 2, /data/index.json, the same without any line, and shape 3,
// /data/index.v3.json, without the ferry, each for a month.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

let n = 0
/** A fresh copy of the module, since it caches the first successful load. */
const fresh = () => import(`../../src/commuter/mapFile.ts?case=${n++}`)

const base = { schema: 4, published_at: '2026-09-29T11:33:22Z', variants: [], stops: [], links: [] }
const line = { type: 'LineString', coordinates: [[121, 14.7], [121.001, 14.701], [121.002, 14.7]] }
const overview = { type: 'LineString', coordinates: [[121, 14.7], [121.002, 14.7]] }
const direction = { id: 'd1', route_id: 'r1', direction_name: 'A → B', origin_terminal: null, destination_terminal: null, reversed: false, confidence: 'drawn', overview, route: { id: 'r1' } }

/** Serve by path: `{ '/data/index.v4.json': body }`; a string body is sent as it is. */
function serve(files, { status = 200, headers = {} } = {}) {
  globalThis.fetch = async (url) => {
    const body = files[String(url)]
    if (body === undefined) return new Response('not here', { status: 404 })
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    })
  }
}
const index = (body, opts) => serve({ '/data/index.v4.json': body }, opts)

test("today's index, schema 4, loads", async () => {
  index(base)
  const { loadMapFile, MAP_FILE_SCHEMA } = await fresh()
  assert.equal(MAP_FILE_SCHEMA, 4)
  assert.equal((await loadMapFile()).schema, 4)
})

test("a direction's overview is its line until the full line is read", async () => {
  serve({ '/data/index.v4.json': { ...base, variants: [direction] }, '/data/lines/d1.json': { schema: 2, id: 'd1', shape: line } })
  const { loadMapFile, loadLine } = await fresh()
  const [v] = (await loadMapFile()).variants
  assert.deepEqual(v.shape, overview)
  assert.equal('overview' in v, false)
  assert.deepEqual(await loadLine('d1'), line)
})

test('a line file that is not that direction\'s is refused, and a failed line is asked again', async () => {
  serve({ '/data/lines/d1.json': { schema: 2, id: 'd2', shape: line } })
  const { loadLine } = await fresh()
  await assert.rejects(loadLine('d1'), { message: "/data/lines/d1.json is not that direction's line" })
  serve({ '/data/lines/d1.json': { schema: 2, id: 'd1', shape: line } })
  assert.deepEqual(await loadLine('d1'), line)
})

test('fields the app does not know are ignored, not a new shape', async () => {
  index({ ...base, fares: [{ from: 'Tala', to: 'SM Fairview', pesos: 13 }], terminals: [] })
  const { loadMapFile } = await fresh()
  const file = await loadMapFile()
  assert.deepEqual(file.variants, [])
  assert.equal(file.fares.length, 1)
})

test('a shape this app does not know (schema 5) is refused with the banner message', async () => {
  index({ ...base, schema: 5 })
  const { loadMapFile, MAP_FILE_TOO_NEW } = await fresh()
  await assert.rejects(loadMapFile(), { message: MAP_FILE_TOO_NEW })
})

test('an older shape at the index\'s path is not the index', async () => {
  index({ ...base, schema: 1 })
  const { loadMapFile } = await fresh()
  await assert.rejects(loadMapFile(), { message: '/data/index.v4.json is shape 1, not the index' })
  index({ ...base, schema: 2 })
  await assert.rejects((await fresh()).loadMapFile(), { message: '/data/index.v4.json is shape 2, not the index' })
  index({ ...base, schema: 3 })
  await assert.rejects((await fresh()).loadMapFile(), { message: '/data/index.v4.json is shape 3, not the index' })
})

test('something that is not a map is that error, whatever number it carries', async () => {
  index({ schema: 5, hello: 'world' })
  const { loadMapFile } = await fresh()
  await assert.rejects(loadMapFile(), { message: '/data/index.v4.json is not a published map' })
})

test('a failed answer is an HTTP error', async () => {
  index('gone', { status: 503 })
  const { loadMapFile } = await fresh()
  await assert.rejects(loadMapFile(), { message: '/data/index.v4.json: HTTP 503' })
})

test('a failure is not cached: the next load asks again', async () => {
  index('gone', { status: 503 })
  const { loadMapFile } = await fresh()
  await assert.rejects(loadMapFile())
  index(base)
  assert.equal((await loadMapFile()).schema, 4)
})

test('the stored-copy header marks the load stale; a network answer does not', async () => {
  index(base, { headers: { 'x-parapo-served-from': 'cache' } })
  const a = await fresh()
  await a.loadMapFile()
  assert.equal(a.mapFileIsStale(), true)
  index(base)
  const b = await fresh()
  await b.loadMapFile()
  assert.equal(b.mapFileIsStale(), false)
})

// The committed files, as the publish wrote them.
const data = new URL('../../public/data/', import.meta.url)
const read = (name) => JSON.parse(readFileSync(new URL(name, data), 'utf8'))
const lineFiles = readdirSync(new URL('lines/', data)).filter((f) => f.endsWith('.json'))

test('the committed index and every line beside it are files this app reads', async () => {
  const files = { '/data/index.v4.json': read('index.v4.json') }
  for (const f of lineFiles) files[`/data/lines/${f}`] = read(`lines/${f}`)
  serve(files)
  const { loadMapFile, loadLine, MAP_FILE_SCHEMA } = await fresh()
  const file = await loadMapFile()
  assert.equal(file.schema, MAP_FILE_SCHEMA)
  const drawn = file.variants.filter((v) => v.shape)
  assert.equal(drawn.length, lineFiles.length, 'one line file per drawn direction, and no other')
  for (const v of drawn) assert.ok((await loadLine(v.id)).coordinates.length >= v.shape.coordinates.length, `${v.id}: its line has fewer points than its overview`)
})

// The file diet (scripts/publish/publish-map.mjs): a full line's points and a
// hotspot's corners carry 6 decimals (about 0.1 m), an overview's 5. The
// editor saves 15 or more, and those digits were half the file's bytes.
// Checked on the committed files, so a publish that forgets the rounding
// cannot land quietly.
test('the committed files carry no more decimals than the publish script writes', () => {
  const decimals = (n) => (String(n).split('.')[1] ?? '').length
  const worst = { overview: 0, line: 0, hotspot: 0 }
  const file = read('index.v4.json')
  for (const v of file.variants) for (const c of v.overview?.coordinates ?? []) for (const n of c) worst.overview = Math.max(worst.overview, decimals(n))
  for (const f of lineFiles) for (const c of read(`lines/${f}`).shape.coordinates) for (const n of c) worst.line = Math.max(worst.line, decimals(n))
  for (const s of file.stops) {
    for (const n of s.point?.coordinates ?? []) worst.hotspot = Math.max(worst.hotspot, decimals(n))
    for (const ring of s.area?.coordinates ?? []) for (const c of ring) for (const n of c) worst.hotspot = Math.max(worst.hotspot, decimals(n))
  }
  assert.ok(worst.overview <= 5, `an overview point has ${worst.overview} decimals`)
  assert.ok(worst.line <= 6, `a line point has ${worst.line} decimals`)
  assert.ok(worst.hotspot <= 6, `a hotspot corner has ${worst.hotspot} decimals`)
})

// The shapes an app installed before a line reads (scripts/publish/withoutLines.mjs):
// the same map, without the lines it does not know or their stations, so it
// never draws a jeep stopping at one: shape 3 without the ferry, shapes 1 and 2 without any line.
test('the committed older shapes are the index without the lines they do not know', () => {
  const v4 = read('index.v4.json')
  const v3 = read('index.v3.json')
  const v2 = read('index.json')
  const v1 = read('map.json')
  assert.equal(v3.schema, 3)
  assert.equal(v2.schema, 2)
  assert.equal(v1.schema, 1)
  const cut = (modes, lines) => {
    const gone = new Set(v4.variants.filter((v) => modes.includes(v.route.mode)).map((v) => v.id))
    const stations = new Set(v4.stops.filter((s) => lines.includes(s.line)).map((s) => s.id))
    return { gone, stations }
  }
  for (const [old, { gone, stations }] of [
    [v3, cut(['ferry'], ['PRFS'])],
    [v2, cut(['lrt', 'mrt', 'ferry'], ['LRT-1', 'LRT-2', 'MRT-3', 'PRFS'])],
    [v1, cut(['lrt', 'mrt', 'ferry'], ['LRT-1', 'LRT-2', 'MRT-3', 'PRFS'])],
  ]) {
    assert.deepEqual(old.variants.map((v) => v.id), v4.variants.filter((v) => !gone.has(v.id)).map((v) => v.id))
    assert.deepEqual(old.stops.map((s) => s.id), v4.stops.filter((s) => !stations.has(s.id)).map((s) => s.id))
    assert.equal(old.links.some((l) => gone.has(l.route_variant_id) || stations.has(l.stop_id)), false)
    assert.equal(old.published_at, v4.published_at)
  }
})

// An app updated while offline: its worker stored an older index — shape 3,
// /data/index.v3.json, or shape 2, /data/index.json — and has nothing yet
// under the new path. The newest such copy is the map, marked stale; with
// none stored, the network's error stands.
test('offline after an update, the newest stored older copy is the map, marked stale', async () => {
  const offline = () => {
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch')
    }
  }
  const stored = { ...base, schema: 2, variants: [direction] }
  try {
    offline()
    globalThis.caches = { match: async (url, opts) => (url === '/data/index.json' && opts?.cacheName === 'map-file' ? new Response(JSON.stringify(stored)) : undefined) }
    const a = await fresh()
    const file = await a.loadMapFile()
    assert.equal(file.schema, 2)
    assert.deepEqual(file.variants[0].shape, overview)
    assert.equal(a.mapFileIsStale(), true)

    // Shape 3 stored beside shape 2: the newer one.
    const v3 = { ...base, schema: 3, variants: [direction, { ...direction, id: 'd2' }] }
    globalThis.caches = {
      match: async (url) => (url === '/data/index.v3.json' ? new Response(JSON.stringify(v3)) : url === '/data/index.json' ? new Response(JSON.stringify(stored)) : undefined),
    }
    const b = await fresh()
    assert.equal((await b.loadMapFile()).schema, 3)
    assert.equal(b.mapFileIsStale(), true)

    globalThis.caches = { match: async () => undefined }
    await assert.rejects((await fresh()).loadMapFile(), { message: 'Failed to fetch' })

    // A stored copy that is not the shape its path holds is no map: the network's error stands.
    globalThis.caches = { match: async () => new Response(JSON.stringify({ ...stored, schema: 1 })) }
    await assert.rejects((await fresh()).loadMapFile(), { message: 'Failed to fetch' })
  } finally {
    delete globalThis.caches
  }
})
