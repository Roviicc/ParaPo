// How the public map feels on a cheap phone: loading it, and a tap.
//
//   node scripts/research/phone-speed.mjs [runs]        (default 3 of each)
//
// Builds the app with VITE_EXPOSE_MAP=1 (so the tap can find a route on the
// screen, as a dev build lets the suites, and the map says when it drew;
// MapView.tsx) into a folder of its own, serves it with `vite preview`, and
// drives headless Chromium as a 390×844 phone at DPR 2, its CPU slowed 4×
// (CPU=…), over Slow 4G (150 ms, 1.6 Mbps). GPU compositing is on
// (SwiftShader): without it headless Chrome reads every map frame back on the
// main thread, seconds a phone never pays.
//
// Prints medians, in ms from the navigation or from the tap's touch, and KB
// on the wire:
//   firstVisit    no service worker yet: first paint; data in (the map file,
//                 the root's data-directions); MapLibre's 'load'; routes
//                 drawn (the first frame with our routes in it, which only
//                 follows 'load'); long tasks and total blocking time; the
//                 KB of the app, of MapLibre's worker and of the basemap, its
//                 files, and its tiles by zoom.
//   firstVisitSW  a first visit as a visitor has it, the service worker
//                 allowed: the same, with what its install fetched and when
//                 it was ready.
//   repeatVisit   the next visit, served by the worker.
//   tapLine       a tap on the first route line on the home view; where
//                 several run there it opens the list.
//   tapTrip       a tap where one route runs alone: its trip card.
// A tap: until the card or the list is in the page (card) and its first
// frame painted (painted, a requestAnimationFrame then a setTimeout), until
// the map settles, the blocking from the touch on, what opened, and the GL
// programs MapLibre compiled for it (keys new to its program cache).
// Written 2026-10-03 for the cheap-phone work; the cheap-phone plan's step
// 0, 2026-10-04, added routes drawn, 'load', the trip tap, the paint probe,
// the program keys, the workers' bytes, the basemap's link and the visit
// with the service worker. The shared link went with trip links (b0204ad).
//
// The network. Chrome throttles the page's own requests, and the service
// worker's on its own: each target is a Slow 4G of its own where a phone
// has one link for all, so read the KB beside the times. What Chrome does
// not throttle goes down one link the harness models (phoneSpeedParts.mjs,
// slowLink): the basemap, which the harness hands over itself, and
// MapLibre's worker script, which Chrome fetches before the worker can be
// throttled (and the worker refuses it: "Not supported"). Until 2026-10-04
// both came at disk speed, unseen. A basemap file asked for again in a page
// comes at once and is counted once: OpenFreeMap sends max-age, so a phone
// has it cached, and only Playwright's routing turns the cache off here.
//
// PARAPO_CHROMIUM: a Chromium to use (the sandbox's /opt/pw-browsers/chromium).
// PARAPO_BASEMAP_CACHE: a folder; basemap files are then fetched once with
// curl and served from it — for a sandbox whose browser cannot reach
// tiles.openfreemap.org. Without it the harness fetches them for the browser.
// ONLY=firstVisit,tapTrip runs just those; DEBUG=1 lists each of the app's
// files as it arrives: to the page from the network or from the service
// worker, or fetched by the service worker or by MapLibre's worker; JSON=file
// keeps every run. `vite preview` sends no long cache headers, so a repeat visit's bytes
// here are the worker's doing alone; on the site /assets/ is also cached for
// a year (_headers).
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { byZoom, loneSpot, median, slowLink, wireBytes } from './phoneSpeedParts.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RUNS = Number(process.argv[2] ?? 3)
const CPU = Number(process.env.CPU ?? 4)
const OUT = join(tmpdir(), 'parapo-phone-speed')
const CACHE = process.env.PARAPO_BASEMAP_CACHE
const DEBUG = !!process.env.DEBUG

/** Slow 4G as Chrome emulates it, and as the harness's own link carries it. */
const SLOW_4G = { offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 96_000 }
/** MapLibre's worker script, the build's maplibre-gl-worker chunk (MapView.tsx). */
const WORKER_SCRIPT = /\/maplibre-gl-worker[^/]*\.js$/
/** How far from a tap a line is still hit: the tap box's corner, 20√2 px, and half the hit line (phone-test's openAlone). */
const REACH = 20 * Math.SQRT2 + 9

console.log(`building into ${OUT} …`)
// Not DEBUG: Tailwind's plugin reads it too, and prints its every step.
const { DEBUG: _, ...env } = process.env
execFileSync('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...env, VITE_EXPOSE_MAP: '1' },
})
const { preview } = await import('vite')
const server = await preview({ root, build: { outDir: OUT }, preview: { port: 4175, strictPort: true }, logLevel: 'silent' })
const BASE = 'http://localhost:4175'

function fromCache(url) {
  mkdirSync(CACHE, { recursive: true })
  const body = join(CACHE, createHash('sha1').update(url).digest('hex'))
  if (!existsSync(body + '.json')) {
    const head = execFileSync('curl', ['-sS', '-o', body, '-D', '-', '--compressed', url], { maxBuffer: 1 << 26 }).toString()
    writeFileSync(body + '.json', JSON.stringify({ type: /content-type:\s*([^\r\n]+)/i.exec(head)?.[1] ?? 'application/octet-stream' }))
  }
  return { type: JSON.parse(readFileSync(body + '.json', 'utf8')).type, body: existsSync(body) ? readFileSync(body) : Buffer.alloc(0) }
}

/** What a file weighs on the wire, worked out once per address. */
const wireMemo = new Map()
const wireOf = (url, body) => {
  if (!wireMemo.has(url)) wireMemo.set(url, wireBytes(body))
  return wireMemo.get(url)
}

const file = JSON.parse(readFileSync(join(root, 'public/data/index.v4.json'), 'utf8'))
const drawn = file.variants.filter((v) => v.overview)
const boxes = file.stops.map((s) => s.area?.coordinates?.[0]).filter((ring) => ring?.length > 2)
const browser = await chromium.launch({
  executablePath: process.env.PARAPO_CHROMIUM || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)))

/**
 * The page's own marks, set before any of its scripts: long tasks, first
 * paint, the map file in, the service worker ready, and the card paint
 * probe — from the tap's touch, the card or the list in the page, then the
 * frame it is painted in. MapView.tsx adds 'load' and routes drawn.
 */
function marks() {
  const s = (window.__speed = { long: [], fcp: null, dataIn: null, load: null, routesDrawn: null, swReady: null, touch: null, shown: null, painted: null })
  new PerformanceObserver((l) => l.getEntries().forEach((e) => s.long.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true })
  new PerformanceObserver((l) => l.getEntries().forEach((e) => e.name === 'first-contentful-paint' && (s.fcp = e.startTime))).observe({ type: 'paint', buffered: true })
  const t = setInterval(() => {
    if (Number(document.querySelector('[data-directions]')?.getAttribute('data-directions') ?? 0) > 0) {
      s.dataIn = performance.now()
      clearInterval(t)
    }
  }, 20)
  navigator.serviceWorker?.ready.then(() => (s.swReady = performance.now()))
  const SHOWN = '[data-testid="card"]:not([hidden]), [data-testid="chooser"]:not([hidden])'
  addEventListener(
    'touchstart',
    (e) => {
      if (s.touch !== null) return
      s.touch = e.timeStamp
      const look = () => {
        if (!document.querySelector(SHOWN)) return false
        s.shown = performance.now()
        requestAnimationFrame(() => setTimeout(() => (s.painted = performance.now())))
        return true
      }
      const watch = new MutationObserver(() => look() && watch.disconnect())
      watch.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] })
    },
    { capture: true, passive: true },
  )
}

/**
 * A phone page: the app's bytes counted, the workers' and the basemap's
 * too, and nothing slowed until `slow()` (a warm-up visit runs at full
 * speed).
 */
async function phone({ worker = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: worker ? 'allow' : 'block' })
  const kb = { app: 0, worker: 0, sw: 0, basemap: 0 }
  const basemap = { urls: [], again: 0 }
  let slowed = false
  // One link for the page's basemap and MapLibre's worker script, from page
  // and service worker alike (Playwright routes the service worker's
  // requests too, by default since 1.5x).
  const link = slowLink({ latency: SLOW_4G.latency, bytesPerSecond: SLOW_4G.downloadThroughput })
  const viaLink = (asked, bytes) => (slowed ? sleep(asked + link.hold(asked, bytes) - Date.now()) : null)
  // Each basemap file once for this phone, a repeat visit's warm-up
  // included: a phone's cache has it by then.
  const fetched = new Map()
  await ctx.route(/tiles\.openfreemap\.org/, async (route) => {
    const asked = Date.now()
    const url = route.request().url()
    const first = fetched.get(url)
    let answered
    if (!first) fetched.set(url, new Promise((r) => (answered = r)))
    try {
      let answer, body
      if (CACHE) {
        const c = fromCache(url)
        body = c.body
        answer = { status: 200, contentType: c.type, body, headers: { 'access-control-allow-origin': '*' } }
      } else {
        const res = await route.fetch()
        body = await res.body()
        answer = { response: res }
      }
      if (first) {
        basemap.again++
        await first
      } else {
        const bytes = wireOf(url, body)
        kb.basemap += bytes
        basemap.urls.push(url)
        await viaLink(asked, bytes)
      }
      await route.fulfill(answer)
    } catch (err) {
      console.warn(`  (basemap ${url}: ${err.message.split('\n')[0]})`)
      await route.fulfill({ status: 502, body: '' }).catch(() => {})
    } finally {
      answered?.()
    }
  })
  await ctx.route(
    (url) => url.href.startsWith(BASE) && WORKER_SCRIPT.test(url.pathname),
    async (route) => {
      // The service worker's install takes it too; Chrome throttles that.
      if (route.request().serviceWorker()) return route.fallback()
      const asked = Date.now()
      const res = await route.fetch()
      const body = await res.body()
      const bytes = wireBytes(body)
      kb.worker += bytes
      await viaLink(asked, bytes)
      const headers = { ...res.headers() }
      for (const h of ['content-encoding', 'content-length', 'transfer-encoding']) delete headers[h]
      return route.fulfill({ status: res.status(), headers, body })
    },
  )
  const page = await ctx.newPage()
  await page.addInitScript(marks)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  const own = new Set()
  cdp.on('Network.responseReceived', (e) => {
    if (!e.response.url.startsWith(BASE)) return
    if (!e.response.fromServiceWorker) own.add(e.requestId)
    if (DEBUG) console.log('   ', e.response.fromServiceWorker ? 'page ← sw  ' : 'page ← net ', e.response.url.slice(BASE.length))
  })
  cdp.on('Network.loadingFinished', (e) => own.has(e.requestId) && (kb.app += e.encodedDataLength))

  // The workers: MapLibre's and the service worker, attached as they start
  // and held there until their Network is on. Playwright's CDP session drops
  // messages for child sessions it did not make itself, so they are spoken
  // to through this one (flatten: false, Target.sendMessageToTarget).
  const kids = new Map()
  const answers = new Map()
  let lastId = 0
  const toKid = (sessionId, method, params = {}) =>
    Promise.race([
      new Promise((resolve) => {
        const id = ++lastId
        answers.set(id, resolve)
        cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(() => resolve(null))
      }),
      sleep(5000),
    ])
  const throttle = (sessionId) => toKid(sessionId, 'Network.emulateNetworkConditions', SLOW_4G)
  cdp.on('Target.attachedToTarget', async ({ sessionId, targetInfo, waitingForDebugger }) => {
    const kid = { type: targetInfo.type, urls: new Map() }
    kids.set(sessionId, kid)
    try {
      if (kid.type === 'worker' || kid.type === 'service_worker') {
        await toKid(sessionId, 'Network.enable')
        if (slowed) await throttle(sessionId)
      }
    } finally {
      if (waitingForDebugger) await toKid(sessionId, 'Runtime.runIfWaitingForDebugger')
    }
  })
  cdp.on('Target.detachedFromTarget', ({ sessionId }) => kids.delete(sessionId))
  cdp.on('Target.receivedMessageFromTarget', ({ sessionId, message }) => {
    const m = JSON.parse(message)
    if (m.id !== undefined) {
      answers.get(m.id)?.(m.error ? null : m.result)
      answers.delete(m.id)
      return
    }
    const kid = kids.get(sessionId)
    if (!kid) return
    if (m.method === 'Network.responseReceived' && m.params.response.url.startsWith(BASE)) kid.urls.set(m.params.requestId, m.params.response.url)
    else if (m.method === 'Network.loadingFinished' && kid.urls.has(m.params.requestId)) {
      kb[kid.type === 'service_worker' ? 'sw' : 'worker'] += m.params.encodedDataLength
      if (DEBUG) console.log('   ', kid.type === 'service_worker' ? 'sw ← net   ' : 'maplibre   ', kid.urls.get(m.params.requestId).slice(BASE.length))
    }
  })
  await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: false })

  const slow = async () => {
    slowed = true
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G)
    // A dedicated worker answers "Not supported"; the service worker takes it.
    await Promise.all([...kids].filter(([, k]) => k.type === 'worker' || k.type === 'service_worker').map(([id]) => throttle(id)))
  }
  const reset = () => {
    for (const k of Object.keys(kb)) kb[k] = 0
    basemap.urls = []
    basemap.again = 0
  }
  return { ctx, page, slow, reset, kb, basemap }
}

const settled = (page) =>
  page.waitForFunction(() => window.__map?.loaded() && !window.__map.isMoving(), null, { timeout: 120_000, polling: 100 }).catch(() => {})
const blocking = (long, from = 0) => {
  const xs = long.filter(([s]) => s >= from)
  return { longTasks: xs.length, longest: Math.round(Math.max(0, ...xs.map(([, d]) => d))), tbt: Math.round(xs.reduce((a, [, d]) => a + Math.max(0, d - 50), 0)) }
}
const ms = (x) => (typeof x === 'number' ? Math.round(x) : null)
const KB = (bytes) => Math.round(bytes / 1024)

async function load({ sw, warm }) {
  const p = await phone({ worker: sw })
  if (warm) {
    await p.page.goto(BASE + '/')
    await p.page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 60_000 }).catch(() => {})
    await settled(p.page)
    await p.page.waitForTimeout(3000)
    p.reset()
  }
  await p.slow()
  await p.page.goto(BASE + '/', { timeout: 120_000 })
  await p.page.waitForFunction(() => window.__speed.routesDrawn, null, { timeout: 120_000, polling: 100 }).catch(() => console.warn('  (no routes drawn in 120 s)'))
  await settled(p.page)
  if (sw) await p.page.waitForFunction(() => window.__speed.swReady, null, { timeout: 60_000, polling: 100 }).catch(() => {})
  await p.page.waitForTimeout(2000)
  const s = await p.page.evaluate(() => window.__speed)
  const out = {
    firstPaint: ms(s.fcp),
    dataIn: ms(s.dataIn),
    load: ms(s.load),
    routesDrawn: ms(s.routesDrawn),
    ...(sw ? { swReady: warm ? null : ms(s.swReady) } : {}),
    ...blocking(s.long),
    appKB: KB(p.kb.app),
    workerKB: KB(p.kb.worker),
    ...(sw ? { swKB: KB(p.kb.sw) } : {}),
    basemapKB: KB(p.kb.basemap),
    basemapFiles: p.basemap.urls.length,
    basemapAgain: p.basemap.again,
    tiles: byZoom(p.basemap.urls),
  }
  if (warm && !(await p.page.evaluate(() => !!navigator.serviceWorker?.controller))) console.warn('  (the repeat visit was not served by the worker)')
  await p.ctx.close()
  return out
}

/** Where on the page a tap lands on a route line: the first vertex on the screen, away from its edges. */
const anyLine = (page) =>
  page.evaluate((lines) => {
    const m = window.__map
    const r = m.getContainer().getBoundingClientRect()
    for (const line of lines)
      for (let k = Math.floor(line.length / 3); k < line.length; k += 5) {
        const s = m.project(line[k])
        if (s.x > 60 && s.x < r.width - 60 && s.y > 120 && s.y < r.height - 200) return [r.left + s.x, r.top + s.y]
      }
    return null
  }, drawn.map((v) => v.overview.coordinates))

/** Where on the page a tap lands on one route alone, its trip and not the list (loneSpot). */
async function loneLine(page) {
  const seen = await page.evaluate(
    ({ lines, boxes }) => {
      const m = window.__map
      const r = m.getContainer().getBoundingClientRect()
      const at = (c) => {
        const s = m.project(c)
        return [s.x, s.y]
      }
      return { left: r.left, top: r.top, width: r.width, height: r.height, lines: lines.map((l) => l.map(at)), boxes: boxes.map((b) => b.map(at)) }
    },
    { lines: drawn.map((v) => v.overview.coordinates), boxes },
  )
  const spot = loneSpot({
    lines: drawn.map((v, i) => ({ route: v.route_id, pts: seen.lines[i] })),
    rings: seen.boxes,
    reach: REACH,
    view: { left: 60, top: 120, right: seen.width - 60, bottom: seen.height - 200 },
  })
  return spot && [seen.left + spot.at[0], seen.top + spot.at[1]]
}

/** What the tap left open: the list, a trip, another card, or nothing. */
const opened = (page) =>
  page.evaluate(() =>
    document.querySelector('[data-testid="chooser"]:not([hidden])')
      ? 'list'
      : document.querySelector('[data-testid="card"]:not([hidden]) [data-testid="trip"]')
        ? 'trip'
        : document.querySelector('[data-testid="card"]:not([hidden])')
          ? 'card'
          : 'nothing',
  )

async function tap(where) {
  const p = await phone()
  await p.page.goto(BASE + '/')
  await p.page.waitForFunction(() => window.__speed.routesDrawn, null, { timeout: 120_000, polling: 100 })
  await settled(p.page)
  await p.page.waitForTimeout(1500)
  const at = await where(p.page)
  if (!at) {
    await p.ctx.close()
    return null
  }
  const before = new Set(await p.page.evaluate(() => window.__programs()))
  await p.slow()
  const t0 = Date.now()
  await p.page.touchscreen.tap(at[0], at[1])
  await p.page.waitForFunction(() => window.__speed.painted, null, { timeout: 60_000, polling: 100 }).catch(() => {})
  await p.page.waitForTimeout(300)
  await settled(p.page)
  const done = Date.now() - t0
  await p.page.waitForTimeout(1000)
  const s = await p.page.evaluate(() => window.__speed)
  const programs = (await p.page.evaluate(() => window.__programs())).filter((k) => !before.has(k))
  const since = (t) => (t !== null && s.touch !== null ? ms(t - s.touch) : null)
  const out = {
    card: since(s.shown),
    painted: since(s.painted),
    settled: done,
    ...blocking(s.long, s.touch ?? Infinity),
    opened: await opened(p.page),
    programs,
  }
  await p.ctx.close()
  return out
}

const scenarios = {
  firstVisit: () => load({ sw: false, warm: false }),
  firstVisitSW: () => load({ sw: true, warm: false }),
  repeatVisit: () => load({ sw: true, warm: true }),
  tapLine: () => tap(anyLine),
  tapTrip: () => tap(loneLine),
}
const only = process.env.ONLY?.split(',')
const runs = Object.fromEntries(Object.keys(scenarios).filter((name) => !only || only.includes(name)).map((name) => [name, []]))
for (let i = 0; i < RUNS; i++)
  for (const name of Object.keys(runs)) {
    const r = await scenarios[name]()
    if (r) runs[name].push(r)
    else console.warn(`  (${name}: no place on the screen to tap)`)
  }

/** "a 3 · b 1", most first. */
const tally = (counts) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, n]) => `${k} ${n}`)
    .join(' · ')
const count = (xs) => xs.reduce((c, x) => ((c[x] = (c[x] ?? 0) + 1), c), {})

console.log(`\nCPU ${CPU}×, Slow 4G, ${RUNS} run(s) each; medians (ms; KB on the wire):`)
const pad = ''.padEnd(15)
for (const [name, rs] of Object.entries(runs)) {
  if (!rs.length) continue
  const numbers = Object.keys(rs[0]).filter((k) => rs.some((r) => typeof r[k] === 'number'))
  console.log(`  ${name.padEnd(13)}${numbers.map((k) => `${k} ${median(rs.map((r) => r[k])) ?? '—'}`).join(' · ')}`)
  if (rs[0].tiles) {
    const zooms = [...new Set(rs.flatMap((r) => Object.keys(r.tiles)))].sort((a, b) => (a === 'other') - (b === 'other') || Number(a.slice(1)) - Number(b.slice(1)))
    console.log(`${pad}basemap files: ${zooms.map((z) => `${z} ${median(rs.map((r) => r.tiles[z] ?? 0))}`).join(' · ') || 'none'}`)
  }
  if (rs[0].opened) {
    console.log(`${pad}opened: ${tally(count(rs.map((r) => r.opened)))}`)
    const programs = count(rs.flatMap((r) => r.programs))
    console.log(`${pad}GL programs the tap compiled (runs): ${Object.keys(programs).length ? '' : 'none'}`)
    for (const [key, n] of Object.entries(programs).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) console.log(`${pad}  ${key} (${n})`)
  }
}
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(runs, null, 2))
await browser.close()
await server.close()
