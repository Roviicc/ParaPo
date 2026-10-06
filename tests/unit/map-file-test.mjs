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

// The cheap-phone plan, step 13, 2026-10-05: a line file may carry its
// direction's orange stretches and their key (src/shared/geo/linePass.ts).
// The line read is the same object either way; the stretches are kept
// under it, and a file without them, or with them unreadable, keeps none.
test("step 13: a line file's orange stretches are kept under the line it brings; the line is read as before", async () => {
  const { passBoxes, linePass, publishedStretches } = await import('../../src/shared/geo/linePass.ts')
  // A jeep's hintuan on the line's middle point.
  const [x, y] = line.coordinates[1]
  const d = 0.0001
  const stops = [{ id: 'h', kind: 'hintuan', area: { type: 'Polygon', coordinates: [[[x - d, y - d], [x + d, y - d], [x + d, y + d], [x - d, y + d], [x - d, y - d]]] } }]
  const boxes = passBoxes(stops)
  const row = { ...direction, route: { id: 'r1', mode: 'jeepney' } }
  const { pass, passKey } = linePass({ ...row, shape: line }, boxes)
  assert.ok(pass.length > 0)
  // Made-up stretches under the true key: what comes back is the file's own, not a walk.
  const theirs = [[[121, 14.7], [121.0001, 14.7]]]
  serve({
    '/data/lines/d1.json': { schema: 2, id: 'd1', shape: line, pass: theirs, passKey },
    '/data/lines/d2.json': { schema: 2, id: 'd2', shape: line },
    '/data/lines/d3.json': { schema: 2, id: 'd3', shape: line, pass: 'stretches', passKey },
  })
  const { loadLine } = await fresh()
  for (const id of ['d1', 'd2', 'd3']) assert.deepStrictEqual(await loadLine(id), line, `${id}: the line, and only the line`)
  const with1 = { ...row, shape: await loadLine('d1') }
  assert.deepStrictEqual(publishedStretches(with1, boxes).map((f) => f.geometry.coordinates), theirs)
  assert.equal(publishedStretches({ ...row, id: 'd2', shape: await loadLine('d2') }, boxes), null, 'no stretches in the file')
  assert.equal(publishedStretches({ ...row, id: 'd3', shape: await loadLine('d3') }, boxes), null, 'stretches it cannot read')
  // Another index's hintuans: not taken.
  assert.equal(publishedStretches(with1, passBoxes([{ ...stops[0], id: 'h2' }])), null)
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

// The cheap-phone plan, step 20 (2026-10-04): index.html's own script asks
// for the file as the page is read (vite.config.ts, mapFileEarly) and leaves
// the answer under EARLY_MAP_FILE, the body read from a copy. This is that
// script's promise, made the way it makes it.
const pageAsked = (res) => {
  const q = Promise.resolve(res).then((r) => ({ res: r, body: r.ok ? r.clone().json().catch(() => {}) : null }))
  q.catch(() => {})
  return q
}
const json = (body, { status = 200, headers = {} } = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
/** A fetch that serves `files` (serve's) and counts what it is asked. */
const counted = (files) => {
  const asked = []
  serve(files)
  const served = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    asked.push(String(url))
    return served(url, init)
  }
  return asked
}

test("step 20: index.html's request is the one read, taken once; after a failure the page asks itself", async () => {
  const asked = counted({ '/data/index.v4.json': { ...base, published_at: 'from the page' } })
  globalThis.__parapoMapFile = pageAsked(json({ ...base, published_at: 'from index.html' }))
  try {
    const a = await fresh()
    assert.equal((await a.loadMapFile()).published_at, 'from index.html')
    assert.deepEqual(asked, [], 'no second request')
    assert.equal('__parapoMapFile' in globalThis, false, 'taken off the page')
    assert.equal((await a.loadMapFile()).published_at, 'from index.html', 'kept, as a load from the page is')

    // A failed one: the next load asks the network itself, never the same answer again.
    globalThis.__parapoMapFile = pageAsked(json('gone', { status: 503 }))
    const b = await fresh()
    await assert.rejects(b.loadMapFile(), { message: '/data/index.v4.json: HTTP 503' })
    assert.equal((await b.loadMapFile()).published_at, 'from the page')
    assert.deepEqual(asked, ['/data/index.v4.json'])
  } finally {
    delete globalThis.__parapoMapFile
  }
})

test('step 20: a request of index.html\'s that failed (no network as the page was read) is asked again by the page', async () => {
  const asked = counted({ '/data/index.v4.json': base })
  globalThis.__parapoMapFile = pageAsked(Promise.reject(new TypeError('Failed to fetch')))
  try {
    const { loadMapFile } = await fresh()
    assert.equal((await loadMapFile()).schema, 4)
    assert.deepEqual(asked, ['/data/index.v4.json'])
  } finally {
    delete globalThis.__parapoMapFile
  }
  // Failed again here, nothing stored: the network's error, as before.
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch')
  }
  globalThis.__parapoMapFile = pageAsked(Promise.reject(new TypeError('Failed to fetch')))
  try {
    await assert.rejects((await fresh()).loadMapFile(), { message: 'Failed to fetch' })
  } finally {
    delete globalThis.__parapoMapFile
  }
})

test("step 20: index.html's answer is read as the page's own was: an error, the page in place of the file, a stored copy, the worker's stamp", async () => {
  const asked = counted({})
  const stored = { '/data/index.v4.json': { ...base, published_at: '2026-09-30T00:00:00Z' } }
  try {
    // A server's error: the error, and with a copy in store, the copy, marked stale.
    globalThis.__parapoMapFile = pageAsked(json('gone', { status: 503 }))
    await assert.rejects((await fresh()).loadMapFile(), { message: '/data/index.v4.json: HTTP 503' })
    globalThis.caches = { match: async (url, { cacheName }) => (cacheName === 'map-file' && stored[url] ? json(stored[url]) : undefined) }
    globalThis.__parapoMapFile = pageAsked(json('gone', { status: 503 }))
    const a = await fresh()
    assert.equal((await a.loadMapFile()).published_at, '2026-09-30T00:00:00Z')
    assert.equal(a.mapFileIsStale(), true)
    // The page itself, 200, in place of a missing file: not JSON, so the copy.
    globalThis.__parapoMapFile = pageAsked(new Response('<!doctype html><title>Para Po</title>', { headers: { 'content-type': 'text/html' } }))
    const b = await fresh()
    assert.equal((await b.loadMapFile()).published_at, '2026-09-30T00:00:00Z')
    assert.equal(b.mapFileIsStale(), true)
    delete globalThis.caches
    globalThis.__parapoMapFile = pageAsked(new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }))
    await assert.rejects((await fresh()).loadMapFile(), { message: '/data/index.v4.json: not JSON' })
    // Served by the worker from its store: stale; from the network: not.
    globalThis.__parapoMapFile = pageAsked(json(base, { headers: { 'x-parapo-served-from': 'cache' } }))
    const c = await fresh()
    await c.loadMapFile()
    assert.equal(c.mapFileIsStale(), true)
    globalThis.__parapoMapFile = pageAsked(json(base))
    const d = await fresh()
    await d.loadMapFile()
    assert.equal(d.mapFileIsStale(), false)
    // A shape this app does not know: the banner's message, as before.
    globalThis.__parapoMapFile = pageAsked(json({ ...base, schema: 5 }))
    const { loadMapFile, MAP_FILE_TOO_NEW } = await fresh()
    await assert.rejects(loadMapFile(), { message: MAP_FILE_TOO_NEW })
    // An ok answer handed over without its body read: read here.
    globalThis.__parapoMapFile = Promise.resolve({ res: json({ ...base, published_at: 'read here' }), body: null })
    assert.equal((await (await fresh()).loadMapFile()).published_at, 'read here')
    assert.deepEqual(asked, [], 'never asked the network again')
  } finally {
    delete globalThis.caches
    delete globalThis.__parapoMapFile
  }
})

// The owner's Q1 (2026-10-04): the public map opens framed on the routes
// (MapView's `openOn`), asked for as the map is made. The map file's when
// its load has ended by then, read from nothing else; the copy the worker
// kept on an earlier visit while it is on its way, read only then; none with
// neither.
const kept = { ...base, published_at: '2026-09-30T00:00:00Z', variants: [{ ...direction, id: 'kept', overview: { type: 'LineString', coordinates: [[121.1, 14.6], [121.2, 14.65]] } }] }
/** A worker's store holding `stored` by path, counting what it is asked; `gate` holds each answer back until it settles. */
const store = (stored, gate = Promise.resolve()) => {
  const asked = []
  globalThis.caches = {
    match: async (url, { cacheName }) => {
      asked.push(url)
      await gate
      return cacheName === 'map-file' && stored[url] ? json(stored[url]) : undefined
    },
  }
  return asked
}

test("Q1: the framing is the map file's once its load has ended, and the kept copy is not read for it", async () => {
  index({ ...base, variants: [direction] })
  const asked = store({ '/data/index.v4.json': kept })
  try {
    const { loadMapFile, openingVariants } = await fresh()
    const file = await loadMapFile()
    assert.deepEqual(await openingVariants(), file.variants)
    assert.deepEqual(asked, [], 'the store not asked')
  } finally {
    delete globalThis.caches
  }
})

test('Q1: while the file is on its way, the copy kept from an earlier visit frames the opening', async () => {
  globalThis.fetch = () => new Promise(() => {})
  const asked = store({ '/data/index.v4.json': kept })
  try {
    const a = await fresh()
    void a.loadMapFile()
    assert.deepEqual((await a.openingVariants()).map((v) => v.id), ['kept'])
    assert.deepEqual(asked, ['/data/index.v4.json'])
    // Before any load at all, the same; with nothing kept and no load, nothing.
    assert.deepEqual((await (await fresh()).openingVariants()).map((v) => v.id), ['kept'])
    store({})
    assert.equal(await (await fresh()).openingVariants(), null)
  } finally {
    delete globalThis.caches
  }
})

test('Q1: with no copy kept, the file on its way once it comes (MapView waits a second at most); none if it fails', async () => {
  let arrive
  globalThis.fetch = () =>
    new Promise((done) => {
      arrive = () => done(json({ ...base, variants: [direction] }))
    })
  store({})
  try {
    const a = await fresh()
    void a.loadMapFile()
    let framing = null
    const opening = a.openingVariants().then((v) => (framing = v))
    await new Promise((done) => setTimeout(done, 10))
    assert.equal(framing, null, 'still waiting for the file')
    arrive()
    await opening
    assert.deepEqual(framing.map((v) => v.id), ['d1'])
    // No worker's store at all: the same.
    delete globalThis.caches
    const b = await fresh()
    void b.loadMapFile()
    const later = b.openingVariants()
    arrive()
    assert.deepEqual((await later).map((v) => v.id), ['d1'])
    // The file failing, nothing kept: nothing to open on.
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch')
    }
    const c = await fresh()
    c.loadMapFile().catch(() => {})
    assert.equal(await c.openingVariants(), null)
  } finally {
    delete globalThis.caches
  }
})

test('Q1: a file that comes while the kept copy is read is the one opened on', async () => {
  let arrive
  globalThis.fetch = () =>
    new Promise((done) => {
      arrive = () => done(json({ ...base, variants: [direction] }))
    })
  let open
  store({ '/data/index.v4.json': kept }, new Promise((done) => (open = done)))
  try {
    const { loadMapFile, openingVariants } = await fresh()
    const loading = loadMapFile()
    const framing = openingVariants()
    await new Promise((done) => setTimeout(done, 0))
    arrive()
    await loading
    open()
    assert.deepEqual((await framing).map((v) => v.id), ['d1'])
  } finally {
    delete globalThis.caches
  }
})

test('Q1: a load that failed, with no copy kept, opens on nothing; the next load is asked for again', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch')
  }
  const { loadMapFile, openingVariants } = await fresh()
  await assert.rejects(loadMapFile(), { message: 'Failed to fetch' })
  assert.equal(await openingVariants(), null)
  index({ ...base, variants: [direction] })
  await loadMapFile()
  assert.deepEqual((await openingVariants()).map((v) => v.id), ['d1'])
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

// Review of 2026-10-03, finding 16: the worker falls back to its copy only
// when fetch fails outright; a 5xx reached the page, which showed the error
// banner with a good copy in the store.
test("a server's error with a stored copy shows the copy, marked stale", async () => {
  const stored = { '/data/index.v4.json': { ...base, published_at: '2026-09-30T00:00:00Z' } }
  globalThis.caches = {
    match: async (url, { cacheName }) =>
      cacheName === 'map-file' && stored[url] ? new Response(JSON.stringify(stored[url]), { status: 200 }) : undefined,
  }
  try {
    index('gone', { status: 503 })
    const a = await fresh()
    const file = await a.loadMapFile()
    assert.equal(file.published_at, '2026-09-30T00:00:00Z')
    assert.equal(a.mapFileIsStale(), true)
    // Only an older shape kept: that one, as offline.
    delete stored['/data/index.v4.json']
    stored['/data/index.v3.json'] = { ...base, schema: 3 }
    const b = await fresh()
    assert.equal((await b.loadMapFile()).schema, 3)
    // Nothing kept: the error, as before.
    delete stored['/data/index.v3.json']
    await assert.rejects((await fresh()).loadMapFile(), { message: '/data/index.v4.json: HTTP 503' })
  } finally {
    delete globalThis.caches
  }
})

test('the page served in place of a missing index shows the stored copy too', async () => {
  globalThis.caches = {
    match: async (url, { cacheName }) =>
      cacheName === 'map-file' && url === '/data/index.v4.json' ? new Response(JSON.stringify(base), { status: 200 }) : undefined,
  }
  try {
    index('<!doctype html><title>Para Po</title>', { headers: { 'content-type': 'text/html' } })
    const a = await fresh()
    assert.equal((await a.loadMapFile()).schema, 4)
    assert.equal(a.mapFileIsStale(), true)
  } finally {
    delete globalThis.caches
  }
  index('<!doctype html>', { headers: { 'content-type': 'text/html' } })
  await assert.rejects((await fresh()).loadMapFile(), { message: '/data/index.v4.json: not JSON' })
})

// The cheap-phone plan, step 16 (g), 2026-10-04: the public map's age is set
// anew only when it says something new (status.ts, sameAge), so a full line
// read — a new list of directions — renders nothing more.
test("step 16 (g): the map's age, the same date and the same copy, is the one already set; a new date or copy is the new one", async () => {
  const { sameAge } = await import('../../src/commuter/status.ts')
  const was = { publishedAt: '2026-09-29T11:33:22Z', stale: false }
  assert.equal(sameAge(was, { publishedAt: '2026-09-29T11:33:22Z', stale: false }), was)
  const newer = { publishedAt: '2026-10-04T00:00:00Z', stale: false }
  assert.equal(sameAge(was, newer), newer)
  const stored = { publishedAt: '2026-09-29T11:33:22Z', stale: true }
  assert.equal(sameAge(was, stored), stored)
  const none = { publishedAt: null, stale: false }
  const first = { publishedAt: '2026-09-29T11:33:22Z', stale: false }
  assert.equal(sameAge(none, first), first, 'the first read sets it')
  assert.equal(sameAge(none, { publishedAt: null, stale: false }), none)
})
