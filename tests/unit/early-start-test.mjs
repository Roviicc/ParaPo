// MapLibre's worker, started as MapView.tsx is read rather than when the map
// is made, and the basemap's host connected to from the map's page before
// its script has run (the cheap-phone plan, step 6, 2026-10-04). MapView.tsx
// itself cannot be loaded here (Vite's `?worker&url`), so the first check
// reads it; the second runs MapLibre's own prewarm() and Style against a
// stand-in Worker, so an upgrade that changes what prewarm() does says so.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/early-start-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BASEMAPS } from '../../src/shared/map/basemap.ts'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('MapView.tsx starts the worker as it is read, after giving MapLibre its address', () => {
  const src = read('../../src/shared/map/MapView.tsx')
  // At the top of the module, unindented: not in the component or an effect.
  const set = src.search(/^setWorkerUrl\(maplibreWorkerUrl\)$/m)
  const warm = src.search(/^prewarm\(\)$/m)
  assert.ok(set >= 0, 'setWorkerUrl(maplibreWorkerUrl) at the top of the module')
  assert.ok(warm >= 0, 'prewarm() at the top of the module')
  assert.ok(set < warm, 'prewarm() comes after setWorkerUrl: the worker reads its address as it starts')
  assert.equal(src.match(/^\s*prewarm\(/gm).length, 1, 'prewarm() called once')
})

test("MapLibre 6.7: prewarm() starts the one worker at the address set, there and then, and a map's style takes that one", async () => {
  /** Every worker started, in order. */
  const started = []
  globalThis.Worker = class {
    constructor(url, options) {
      this.url = url
      this.options = options
      this.terminated = false
      this.posted = []
      started.push(this)
    }
    addEventListener() {}
    removeEventListener() {}
    postMessage(message) {
      this.posted.push(message)
    }
    terminate() {
      this.terminated = true
    }
  }
  // What MapLibre's Actor and Style read of a page. A real MessageChannel
  // would hold this process open; the stand-in never answers, and nothing
  // here waits on an answer.
  globalThis.MessageChannel = class {
    port1 = { postMessage() {} }
    port2 = {}
  }
  globalThis.ImageData ??= class {}
  globalThis.self ??= globalThis
  globalThis.window ??= globalThis
  globalThis.location ??= new URL('http://localhost:5173/')

  const { Style, getGlobalDispatcher, getWorkerCount, prewarm, setWorkerUrl } = await import('maplibre-gl')
  const url = '/assets/maplibre-gl-worker-test.js'
  setWorkerUrl(url)
  prewarm()
  // As prewarm() runs, not on a later task: the worker's script is asked for at once.
  assert.equal(started.length, getWorkerCount())
  assert.equal(getWorkerCount(), 1, 'one worker off Safari')
  assert.equal(started[0].url, url)
  assert.equal(started[0].options?.type, 'module')

  // A map makes its Style, and the Style its dispatcher, from the same pool.
  const style = new Style({ _getMapId: () => 1, _requestManager: {} })
  await style.dispatcher.waitForInitComplete()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(started.length, 1, 'no second worker for the map')
  assert.equal(style.dispatcher.actors[0].target, started[0], "the map's style talks to the worker prewarm() started")
  assert.ok(started[0].posted.length > 0, 'and has written to it')

  // MapLibre's global dispatcher (made by every Style, for the RTL text
  // plugin) holds the same worker for the page's life, prewarm() or not.
  await getGlobalDispatcher().waitForInitComplete()
  assert.equal(getGlobalDispatcher().actors[0].target, started[0])

  // A second prewarm() — MapView.tsx read again by a hot reload in dev — starts none.
  prewarm()
  assert.equal(started.length, 1)

  // The map removed: the worker stays for the next one.
  style.dispatcher.remove(true)
  assert.equal(started[0].terminated, false)
})

test("the map's page connects early to the basemaps' host, as MapLibre will ask it", () => {
  const html = read('../../index.html')
  const head = html.slice(0, html.indexOf('</head>'))
  const links = [...head.matchAll(/<link\b[^>]*\brel="preconnect"[^>]*>/g)].map((m) => m[0])
  assert.equal(links.length, 1, 'one preconnect, in the head')
  // Every design's style is there (and, OpenFreeMap's, its tiles, sprite and glyphs).
  const href = /\bhref="([^"]+)"/.exec(links[0])?.[1]
  for (const b of BASEMAPS) assert.equal(new URL(b.url).origin, href, b.id)
  // Bare `crossorigin` is anonymous: the connections MapLibre's requests use,
  // sent without credentials. Without it the preconnect opens one they never take.
  assert.match(links[0], /\scrossorigin(\s|\/?>)/)
})
