// How fast the public map is on a cheap phone: the production build, timed in
// Chromium with the CPU slowed four times and on DevTools' "Slow 4G", at a
// phone's 390×844, two device pixels per CSS pixel, touch. Written 2026-10-04
// for the cheap-phone plan and grown by its Step 0 the same day, so that each
// step of the plan is measured, not guessed.
//
//   PARAPO_CHROMIUM=/opt/pw-browsers/chromium \
//   PARAPO_BASEMAP_CACHE=<folder> JSON=<file.json> \
//   node scripts/research/phone-speed.mjs [runs]          (3 runs by default)
//
//   PARAPO_CHROMIUM       the Chromium to time in; Playwright's own without it
//   PARAPO_BASEMAP_CACHE  where the basemap's files are kept, one per address
//                         (default node_modules/.cache/phone-speed-basemap)
//   JSON                  where to write every run and the summary; none without it
//
// It builds its own copy of the site once, before anything is timed, with
// VITE_EXPOSE_MAP=1, which hands the map out as a development build does
// (MapView.tsx: window.__mapEarly from its making, window.__map and
// window.__programs from its 'load'), into node_modules/.cache/phone-speed —
// never dist/, which pwa-test serves — and serves it on :4175 as Cloudflare
// would: text gzipped, so the bytes counted are the wire's; public/_headers'
// caching (/assets/* immutable, everything else re-checked on each visit, an
// ETag answered 304); and the map's page for any address with no file
// (single-page-application). Nothing else may run while it measures, the dev
// server included: they share the CPU.
//
// The basemap. The browser here cannot reach tiles.openfreemap.org, and curl
// can (through the sandbox's proxy). So every request to that host — style,
// TileJSON, sprite, glyphs, tiles — is answered from PARAPO_BASEMAP_CACHE, and
// a file not there yet is fetched with curl and kept. An untimed warm-up pass
// visits every scenario once first, so the timed runs find every file there;
// a file fetched during them is counted and said (it should be none). The
// answers go through one link per page, shared by the page, MapLibre's worker
// and the service worker: one file at a time, each 150 ms and then its bytes
// at 200 kB/s. Its bytes are gzip's, as OpenFreeMap sends them (the sprite's
// PNG as it is): the body handed to the browser is the plain one, since Chrome
// does not undo a Content-Encoding on a body DevTools supplies (tried
// 2026-10-04: the style arrived as gzip and failed to parse). A file this
// page already had is answered at once and not counted: OpenFreeMap's files
// are cacheable for a day and more, and a phone would hold them, while Chrome
// keeps nothing answered through DevTools in its cache.
//
// The workers. DevTools auto-attaches to MapLibre's worker and the service
// worker (Target.setAutoAttach, flat sessions, on a connection of the
// harness's own: Playwright's CDP sessions cannot reach the sessions it
// opens), turns their Network on and slows them as the page: the service
// worker's settings are sent again as it first asks for something, as Chrome
// can drop them, and a request of its back sooner than a round trip is
// counted and said. Chrome 141 answers "Not supported" for a dedicated
// worker, does not slow its script on the page's settings, and counts only
// the headers (187 B) of either worker's script and nothing of importScripts.
// So the bytes are the server's: what it sent, headers and body, for the
// worker's script and what that worker asks for (Sec-Fetch-Dest: worker; the
// script as referrer), and for the service worker's script and all it
// fetches, its precache (Sec-Fetch-Dest: serviceworker; sw.js as referrer);
// and the server holds the worker's own requests as Slow 4G would. DevTools'
// sums are kept in the JSON beside them. Each target is its own link: Chrome
// cannot slow two targets on one.
//
// Each run, in fresh browsers (a cold GPU program cache, a cold HTTP cache):
//   cold    a first visit to /. Waits until the map is loaded and idle and the
//           page has run no long task for 2 s (40 s at most), then reads:
//           first paint (FCP); "data in", the first moment the app root's
//           data-directions is above 0; "routes drawn", the first frame the
//           map rendered with the routes' line layer in and their source
//           loaded; the map's 'load'; settled, when that quiet began (all
//           stamped in the page, from the navigation); TBT (each long task's
//           time over 50 ms, from the navigation to settled) and the longest
//           task; the app's bytes and requests (every response from :4175 to
//           the page, as Chrome's network layer counts them); the worker's
//           bytes and when its script was asked for; the basemap's bytes,
//           requests and tiles by zoom.
//   repeat  the same page reloaded, its HTTP cache warm; the same readings.
//   sw      a first visit with the service worker allowed: the cold readings,
//           then the service worker's install waited out (active, and nothing
//           asked of it for 2 s), and its bytes, its precache, and when it
//           became active. Bytes are counted to the end of the install.
//   listTap another first visit, settled, then a finger on a road several
//           routes share, at the view the map opened on, so the route list
//           opens and not a trip (found in public/data as phone-test finds
//           its list tap, placed with window.__map.project).
//   tripTap the same, on a road only one route runs, so the trip's card opens
//           and not the list (found as phone-test's openAlone finds one: the
//           most room from every other route and hotspot, more than a finger
//           reaches at the opening view).
//   A tap reads tap → card, from its first touchstart or pointerdown to the
//   card's appearance in the page (the moment React puts it in), and tap →
//   card painted (a frame and a task after that); what opened, a list (its
//   rows) or a trip; the TBT and longest task of the 3 s after; and the GL
//   programs the tap compiled: window.__programs() before it and once the
//   card is up and the map idle. The spots are chosen in the warm-up and the
//   same every run.
// Service workers are blocked but in the sw scenario.
//
// How to read the numbers (the plan's own caveats, 2026-10-03):
//   - "data in" is not "routes drawn". It flips when the map file arrives;
//     the routes are drawn only after MapLibre's 'load'.
//   - The GPU here is SwiftShader, on the CPU, and it inflates shader
//     compiles: a first-use GL program can block the main thread for a
//     second and more where a phone takes 5–50 ms. Only the first sync GL
//     call in a frame pays that wait, so savings per program do not add up.
//   - Every frame carries a 276–473 ms "Commit" (a SwiftShader artefact). It
//     inflates whatever is timed across a frame, a card's paint among them,
//     and does not shrink when map work is removed.
//   - A real first visit is bound by bytes: the app, the worker, the basemap
//     and the precache share one link on a phone, and four links here.
//     Cloudflare serves brotli, so real bytes are 15–20% under gzip's.
//   - Each figure is a median, with the runs' min–max beside it: a
//     difference smaller than that spread is noise.
import { execFile, execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { connect, createServer as createTcpServer } from 'node:net'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import {
  FINGER_REACH_PX,
  added,
  askedBy,
  headerBytes,
  listSpots,
  mapGeometry,
  serialLink,
  stats,
  tileMetrics,
  tileZoom,
  tilesAlong,
  tripSpots,
} from './phoneSpeedParts.mjs'

// Playwright reports a service worker's network only with this, read as it
// loads (older versions; 1.63 does by default): set before it is imported.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS ??= '1'
const { chromium } = await import('playwright')

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RUNS = Math.max(1, Number.parseInt(process.argv[2] ?? '3', 10) || 3)
const PORT = 4175
const BASE = `http://localhost:${PORT}`
const SITE = join(ROOT, 'node_modules', '.cache', 'phone-speed')
const CACHE = resolve(process.env.PARAPO_BASEMAP_CACHE ?? join(ROOT, 'node_modules', '.cache', 'phone-speed-basemap'))
const JSON_OUT = process.env.JSON ? resolve(process.env.JSON) : null
const BASEMAP_HOST = 'tiles.openfreemap.org'
const BASEMAP_PATTERN = { urlPattern: `*://${BASEMAP_HOST}/*`, requestStage: 'Request' }
const isBasemap = (url) => !!url && new URL(url).host === BASEMAP_HOST

const SETTINGS = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  cpuThrottlingRate: 4,
  // DevTools' "Slow 4G" preset, as it sends it.
  network: { latency: 562.5, downloadThroughput: 180000, uploadThroughput: 84375 },
  // The basemap's one link per page (the plan's Step 0): 150 ms, then 200 kB/s
  // (the kB this prints, 1,024 B), one file at a time.
  basemapLink: { latencyMs: 150, bytesPerSecond: 200 * 1024 },
  // Without these, headless Chrome reads every frame back on the main thread.
  chromiumArgs: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  quietMs: 2000,
  settleCapMs: 40000,
  tapWindowMs: 3000,
  // After a tap, how long the card and the map have to be up and idle.
  idleCapMs: 30000,
  // From the navigation, how long the service worker has to be installed.
  swCapMs: 120000,
}

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ------------------------------------------------------------------ the build
// Once, before anything is timed.
console.log('building with VITE_EXPOSE_MAP=1 into node_modules/.cache/phone-speed …')
const build = spawnSync(
  process.execPath,
  [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', SITE, '--emptyOutDir', '--logLevel', 'warn'],
  { cwd: ROOT, env: { ...process.env, VITE_EXPOSE_MAP: '1' }, stdio: 'inherit' },
)
if (build.status !== 0) {
  console.error('the build failed')
  process.exit(1)
}
const builtJs = readdirSync(join(SITE, 'assets'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(join(SITE, 'assets', f), 'utf8'))
for (const name of ['__map', '__mapEarly', '__programs']) {
  if (!builtJs.some((js) => new RegExp(`${name}\\b`).test(js))) {
    console.error(`the build does not hand out window.${name}: is VITE_EXPOSE_MAP still read in MapView.tsx?`)
    process.exit(1)
  }
}

// The dev server, left running, shares the CPU with what is timed.
const devServer = await new Promise((up) => {
  const c = connect(5173, 'localhost')
  c.once('connect', () => (c.destroy(), up(true)))
  c.once('error', () => up(false))
})
if (devServer) console.log('the dev server is up on :5173: stop it while this measures, it shares the CPU')

// ----------------------------------------------------------------- the server
// Cloudflare's _headers: a path pattern, then its headers indented under it.
// Every rule that matches a path adds its headers.
const headerRules = (() => {
  const rules = []
  const file = join(SITE, '_headers')
  if (!existsSync(file)) return rules
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (!/^\s/.test(line)) {
      const pattern = line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/:[A-Za-z]\w*/g, '[^/]+')
      rules.push({ test: new RegExp(`^${pattern}$`), headers: {} })
    } else if (rules.length) {
      const at = line.indexOf(':')
      if (at > 0) rules.at(-1).headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim()
    }
  }
  return rules
})()
// Kept off the site (.assetsignore): Cloudflare answers them with the map's page.
const ignored = existsSync(join(SITE, '.assetsignore'))
  ? readFileSync(join(SITE, '.assetsignore'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  : []
ignored.push('.assetsignore')

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}
const COMPRESSED = /^(text\/|application\/(json|manifest\+json|javascript)|image\/svg\+xml)/
const files = new Map()
const fileAt = (path) => {
  let f = files.get(path)
  if (!f) {
    const body = readFileSync(path)
    const type = TYPES[extname(path)] ?? 'application/octet-stream'
    f = { body, type, etag: `"${createHash('sha1').update(body).digest('hex').slice(0, 32)}"`, gz: COMPRESSED.test(type) ? gzipSync(body) : null }
    files.set(path, f)
  }
  return f
}
const isFile = (p) => existsSync(p) && statSync(p).isFile()

// What the server sent, and to whom (askedBy): the page, MapLibre's worker or
// the service worker. Counted afresh for each page (phonePage).
const sent = { page: { bytes: 0, requests: 0 }, worker: { bytes: 0, requests: 0 }, sw: { bytes: 0, requests: 0 } }
// Chrome cannot slow a dedicated worker (above), so its requests are held
// here as Slow 4G would: one link, made afresh for each page.
let workerLink = null
const slow4G = () => serialLink({ latencyMs: SETTINGS.network.latency, bytesPerSecond: SETTINGS.network.downloadThroughput })

const server = createServer((req, res) => {
  const url = new URL(req.url, BASE)
  const who = askedBy(req.headers)
  const answer = (status, headers, body) => {
    const bytes = headerBytes(status, headers) + (body?.length ?? 0)
    const go = () => {
      if (res.destroyed) return
      sent[who].bytes += bytes
      sent[who].requests++
      res.writeHead(status, headers)
      res.end(body)
    }
    if (who === 'worker' && workerLink) workerLink.carry(bytes).then(go)
    else go()
  }
  let path
  try {
    path = decodeURIComponent(url.pathname)
  } catch {
    return answer(400, {})
  }
  // html_handling's default: /index.html is /, and a folder wants its slash.
  if (path.endsWith('/index.html')) return answer(307, { location: path.slice(0, -'index.html'.length) + url.search })
  let file = join(SITE, path.endsWith('/') ? path + 'index.html' : path)
  const inside = file.startsWith(SITE + sep)
  const hidden = ignored.some((name) => path === '/' + name || path.startsWith('/' + name + '/'))
  if (inside && !hidden && !path.endsWith('/') && isFile(join(file, 'index.html'))) return answer(307, { location: path + '/' + url.search })
  // single-page-application: an address with no file is the map's page, 200.
  if (!inside || hidden || !isFile(file)) file = join(SITE, 'index.html')
  const f = fileAt(file)
  const headers = {}
  for (const rule of headerRules) if (rule.test.test(path)) Object.assign(headers, rule.headers)
  headers['cache-control'] ??= 'public, max-age=0, must-revalidate'
  headers.etag = f.etag
  headers['content-type'] = f.type
  if (f.gz) headers.vary = 'Accept-Encoding'
  const asked = (req.headers['if-none-match'] ?? '').split(',').map((t) => t.trim().replace(/^W\//, ''))
  if (asked.includes(f.etag)) {
    delete headers['content-type']
    return answer(304, headers)
  }
  const gz = f.gz && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')
  const body = gz ? f.gz : f.body
  if (gz) headers['content-encoding'] = 'gzip'
  headers['content-length'] = body.length
  answer(200, headers, req.method === 'HEAD' ? undefined : body)
})

// ---------------------------------------------------------------- the basemap
mkdirSync(CACHE, { recursive: true })
const fetching = new Map()
/** Gzip's bytes for a basemap file, as OpenFreeMap sends it; an image as it is. */
const wireBytes = new Map()
const onTheWire = (url, f) => {
  if (!wireBytes.has(url)) wireBytes.set(url, /^image\//.test(f.contentType) ? f.body.length : gzipSync(f.body, { level: 9 }).length)
  return wireBytes.get(url)
}
/** One basemap address from the disk cache, fetched with curl and kept when it is not there. */
const basemapFile = (url) => {
  const key = createHash('sha1').update(url).digest('hex')
  const bodyPath = join(CACHE, `${key}.body`)
  const metaPath = join(CACHE, `${key}.json`)
  if (isFile(metaPath) && isFile(bodyPath)) {
    return Promise.resolve({ ...JSON.parse(readFileSync(metaPath, 'utf8')), body: readFileSync(bodyPath), fetched: false })
  }
  if (!fetching.has(url)) {
    const part = `${bodyPath}.${process.pid}.part`
    fetching.set(
      url,
      new Promise((done, fail) =>
        execFile('curl', ['-sS', '-L', '--max-time', '60', '-o', part, '-w', '%{http_code} %{content_type}', url], (err, out) => {
          fetching.delete(url)
          if (err) return fail(err)
          const [code, ...type] = out.trim().split(' ')
          const status = Number(code)
          // A server's passing trouble is not kept: the next run asks again.
          if (!status || status >= 500 || status === 429) return fail(new Error(`${status} for ${url}`))
          const meta = { url, status, contentType: type.join(' ') || 'application/octet-stream' }
          if (!existsSync(part)) writeFileSync(part, '')
          renameSync(part, bodyPath)
          writeFileSync(metaPath, JSON.stringify(meta))
          done({ ...meta, body: readFileSync(bodyPath), fetched: true })
        }),
      ),
    )
  }
  return fetching.get(url)
}

// --------------------------------------------------------------- where to tap
// From the published map (index and full lines), as phone-test finds its
// list tap and its openAlone a trip's; the page keeps the first that fits the
// view it opened on. Chosen in the warm-up and kept for every timed run.
const geometry = (() => {
  const at = (name) => JSON.parse(readFileSync(join(ROOT, 'public', 'data', name), 'utf8'))
  return mapGeometry(at('index.v4.json'), (id) => at(`lines/${id}.json`).shape?.coordinates ?? null)
})()
const SPOTS = { list: listSpots(geometry), trip: tripSpots(geometry).slice(0, 400) }
const chosen = { list: null, trip: null }

// ----------------------------------------------------------------- the browser
/** Stamps, made in the page before any of its own scripts run. */
function stamps() {
  const s = (window.__speed = {
    longtasks: [],
    dataIn: null,
    routesDrawn: null,
    mapLoad: null,
    swReady: null,
    armed: false,
    down: null,
    shown: null,
    painted: null,
    kind: null,
  })
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) s.longtasks.push([e.startTime, e.duration])
    }).observe({ type: 'longtask', buffered: true })
  } catch {}
  // The map from its making (MapView hands it out as window.__mapEarly in
  // this build): its 'load', and "routes drawn", the first frame it renders
  // with the routes' line layer in and their source loaded. Never throws
  // into MapView.
  let early = null
  Object.defineProperty(window, '__mapEarly', {
    configurable: true,
    get: () => early,
    set(m) {
      early = m
      try {
        m.once('load', () => {
          s.mapLoad ??= performance.now()
        })
        const drawn = () => {
          if (m.getSource('saved-routes') && m.getLayer('saved-routes-line') && m.isSourceLoaded('saved-routes')) {
            s.routesDrawn ??= performance.now()
            m.off('render', drawn)
          }
        }
        m.on('render', drawn)
      } catch {}
    },
  })
  navigator.serviceWorker?.ready.then(
    () => {
      s.swReady ??= performance.now()
    },
    () => {},
  )
  // The card painted: a frame, then a task, after it is first shown.
  const paint = () =>
    requestAnimationFrame(() =>
      setTimeout(() => {
        s.painted = performance.now()
        window.__cardPainted = s.painted
      }, 0),
    )
  const look = () => {
    if (s.dataIn === null) {
      const root = document.querySelector('[data-directions]')
      if (root && Number(root.getAttribute('data-directions')) > 0) s.dataIn = performance.now()
    }
    if (s.armed && s.shown === null) {
      const el = document.querySelector('[data-testid="chooser"]:not([hidden]), [data-testid="card"]:not([hidden])')
      if (el) {
        s.shown = performance.now()
        s.kind = el.dataset.testid === 'chooser' ? 'list' : el.querySelector('[data-testid="trip"]') ? 'trip' : 'card'
        paint()
      }
    }
  }
  new MutationObserver(look).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-directions', 'hidden'] })
  const down = () => {
    if (s.armed && s.down === null) s.down = performance.now()
  }
  addEventListener('touchstart', down, { capture: true, passive: true })
  addEventListener('pointerdown', down, { capture: true, passive: true })
}

/** A free port for Chrome's own DevTools endpoint. */
const freePort = () =>
  new Promise((ok, no) => {
    const s = createTcpServer()
    s.once('error', no)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => ok(port))
    })
  })

/**
 * A DevTools connection of the harness's own, beside Playwright's pipe, for
 * the flat sessions a page's auto-attach opens: Playwright drops messages
 * for sessions it did not open itself.
 */
async function rawCdp(port) {
  let info = null
  for (let i = 0; !info; i++) {
    try {
      info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    } catch (e) {
      if (i > 50) throw e
      await sleep(100)
    }
  }
  const ws = new WebSocket(info.webSocketDebuggerUrl)
  await new Promise((ok, no) => {
    ws.addEventListener('open', ok, { once: true })
    ws.addEventListener('error', no, { once: true })
  })
  let id = 0
  const waiting = new Map()
  const listeners = new Set()
  ws.addEventListener('message', ({ data }) => {
    const msg = JSON.parse(data)
    if (msg.id) {
      const w = waiting.get(msg.id)
      waiting.delete(msg.id)
      if (w) msg.error ? w.no(new Error(`${w.method}: ${msg.error.message}`)) : w.ok(msg.result)
      return
    }
    for (const l of listeners) {
      try {
        Promise.resolve(l(msg)).catch(() => {})
      } catch {}
    }
  })
  ws.addEventListener('close', () => {
    for (const w of waiting.values()) w.no(new Error(`${w.method}: the connection closed`))
    waiting.clear()
  })
  return {
    send: (method, params = {}, sessionId) =>
      new Promise((ok, no) => {
        if (ws.readyState !== WebSocket.OPEN) return no(new Error(`${method}: the connection is closed`))
        const i = ++id
        waiting.set(i, { ok, no, method })
        ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }))
      }),
    listen: (l) => (listeners.add(l), () => listeners.delete(l)),
    close: () => ws.close(),
  }
}

let browser = null
let raw = null
let chromiumVersion = null
const launch = async () => {
  const port = await freePort()
  browser = await chromium.launch({
    executablePath: process.env.PARAPO_CHROMIUM || undefined,
    args: [...SETTINGS.chromiumArgs, `--remote-debugging-port=${port}`],
  })
  chromiumVersion ??= browser.version()
  raw = await rawCdp(port)
  return browser
}
const shut = async () => {
  const b = browser
  browser = null
  raw?.close()
  raw = null
  await b?.close().catch(() => {})
}

/**
 * A phone's page: CPU and network slowed before it navigates, its traffic
 * counted, the basemap from the cache through the page's one link, and its
 * workers seen.
 */
async function phonePage({ serviceWorkers = 'block' } = {}) {
  const context = await browser.newContext({
    viewport: SETTINGS.viewport,
    deviceScaleFactor: SETTINGS.deviceScaleFactor,
    isMobile: SETTINGS.isMobile,
    hasTouch: SETTINGS.hasTouch,
    serviceWorkers,
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log('  page error:', String(e).split('\n')[0]))
  await page.addInitScript(stamps)
  let closed = false
  const fresh = () => ({
    appBytes: 0,
    appRequests: 0,
    basemapBytes: 0,
    basemapRequests: 0,
    basemapCached: 0,
    basemapFetched: 0,
    basemapFailed: 0,
    tiles: {},
    workerCdpBytes: 0,
    swCdpBytes: 0,
    swUnslowed: 0,
    navigatedAt: null,
    workerAt: null,
  })
  let net = fresh()
  const throttle = {}
  for (const k of Object.keys(sent)) sent[k] = { bytes: 0, requests: 0 }
  workerLink = slow4G()
  const link = serialLink(SETTINGS.basemapLink)
  // The basemap files this page has had: its HTTP cache, as a phone keeps them.
  const had = new Set()
  /** A basemap request, from the page, its worker or the service worker, answered from the cache through the link. */
  const fulfil = async (e, send) => {
    const url = e.request.url
    try {
      const f = await basemapFile(url)
      if (f.fetched && !closed) net.basemapFetched++
      if (had.has(url)) {
        if (!closed) net.basemapCached++
      } else {
        had.add(url)
        const bytes = onTheWire(url, f)
        await link.carry(bytes)
        if (!closed) {
          net.basemapBytes += bytes
          net.basemapRequests++
          const z = tileZoom(url)
          if (z !== null) {
            const t = (net.tiles[z] ??= { n: 0, bytes: 0 })
            t.n++
            t.bytes += bytes
          }
        }
      }
      await send('Fetch.fulfillRequest', {
        requestId: e.requestId,
        responseCode: f.status,
        responseHeaders: [
          { name: 'Content-Type', value: f.contentType },
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Cache-Control', value: 'public, max-age=86400' },
        ],
        body: f.body.toString('base64'),
      })
    } catch {
      if (!closed) net.basemapFailed++
      await send('Fetch.failRequest', { requestId: e.requestId, errorReason: 'ConnectionFailed' }).catch(() => {})
    }
  }

  // CDP's own interception, not Playwright's page.route: that turns the
  // browser's HTTP cache off, and the repeat visit is about that cache.
  const cdp = await context.newCDPSession(page)
  const urls = new Map()
  const notWire = new Set()
  cdp.on('Network.requestWillBeSent', (e) => {
    urls.set(e.requestId, e.request.url)
    if (e.type === 'Document' && net.navigatedAt === null) net.navigatedAt = e.timestamp
    // When MapLibre's worker's script is asked for, from the navigation.
    if (/\/assets\/maplibre-gl-worker-[^/]*\.js$/.test(new URL(e.request.url).pathname) && net.workerAt === null && net.navigatedAt !== null) {
      net.workerAt = (e.timestamp - net.navigatedAt) * 1000
    }
  })
  cdp.on('Network.requestServedFromCache', (e) => notWire.add(e.requestId))
  cdp.on('Network.responseReceived', (e) => {
    if (e.response.fromDiskCache || e.response.fromServiceWorker) notWire.add(e.requestId)
  })
  // What went over the wire: a 304 is its headers, a file from the cache nothing.
  cdp.on('Network.loadingFinished', (e) => {
    if (!urls.get(e.requestId)?.startsWith(BASE + '/') || notWire.has(e.requestId)) return
    net.appBytes += e.encodedDataLength
    net.appRequests++
  })
  cdp.on('Fetch.requestPaused', (e) => void fulfil(e, (m, p) => cdp.send(m, p)))
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...SETTINGS.network })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: SETTINGS.cpuThrottlingRate })
  await cdp.send('Fetch.enable', { patterns: [BASEMAP_PATTERN] })

  // The workers: the page's own session on the harness's connection,
  // auto-attaching to MapLibre's worker and the service worker.
  const { targetInfo } = await cdp.send('Target.getTargetInfo')
  const { sessionId: pageSid } = await raw.send('Target.attachToTarget', { targetId: targetInfo.targetId, flatten: true })
  const kids = new Map()
  const sw = { pending: new Set(), since: Date.now() }
  const unlisten = raw.listen(async (msg) => {
    if (msg.method === 'Target.attachedToTarget' && msg.sessionId === pageSid) {
      const { sessionId, targetInfo: t } = msg.params
      const kind = t.type === 'service_worker' ? 'sw' : t.type === 'worker' ? 'worker' : null
      if (!kind) return
      kids.set(sessionId, { kind, urls: new Map(), asked: new Map(), cached: new Set(), again: false })
      await raw.send('Network.enable', {}, sessionId).catch(() => {})
      throttle[kind] = await raw.send('Network.emulateNetworkConditions', { offline: false, ...SETTINGS.network }, sessionId).then(
        () => 'applied',
        (e) => e.message.replace(/^[^:]*: /, ''),
      )
      // A page the service worker controls asks the basemap through it.
      if (kind === 'sw') await raw.send('Fetch.enable', { patterns: [BASEMAP_PATTERN] }, sessionId).catch(() => {})
      return
    }
    if (msg.method === 'Target.detachedFromTarget' && msg.sessionId === pageSid) return void kids.delete(msg.params.sessionId)
    const kid = kids.get(msg.sessionId)
    if (!kid) return
    const p = msg.params
    if (msg.method === 'Fetch.requestPaused') return fulfil(p, (m, q) => raw.send(m, q, msg.sessionId))
    if (msg.method === 'Network.requestWillBeSent') {
      kid.urls.set(p.requestId, p.request.url)
      if (!kid.asked.has(p.requestId)) kid.asked.set(p.requestId, p.timestamp)
      if (kid.kind === 'sw') sw.pending.add(p.requestId)
      // Chrome can drop the conditions set on a service worker before its
      // renderer is wired to DevTools: its precache went at full speed in 2
      // of 5 trials (2026-10-04), and in none of 6 once they were set again
      // as it first asks for something. Checked below all the same.
      if (throttle[kid.kind] === 'applied' && !kid.again) {
        kid.again = true
        void raw.send('Network.emulateNetworkConditions', { offline: false, ...SETTINGS.network }, msg.sessionId).catch(() => {})
      }
    }
    if (msg.method === 'Network.requestServedFromCache') kid.cached.add(p.requestId)
    if (msg.method === 'Network.responseReceived' && (p.response.fromDiskCache || p.response.fromServiceWorker)) kid.cached.add(p.requestId)
    if (msg.method === 'Network.loadingFinished' || msg.method === 'Network.loadingFailed') {
      const url = kid.urls.get(p.requestId)
      if (msg.method === 'Network.loadingFinished' && !closed && !isBasemap(url)) {
        net[`${kid.kind}CdpBytes`] += p.encodedDataLength
        // From the network sooner than one Slow 4G round trip: not slowed.
        const asked = kid.asked.get(p.requestId)
        if (kid.kind === 'sw' && asked !== undefined && !kid.cached.has(p.requestId) && p.timestamp - asked < SETTINGS.network.latency / 1000) net.swUnslowed++
      }
      if (kid.kind === 'sw') {
        sw.pending.delete(p.requestId)
        sw.since = Date.now()
      }
    }
  })
  await raw.send('Target.setAutoAttach', { autoAttach: true, flatten: true, waitForDebuggerOnStart: false }, pageSid)

  /** What this page has moved since the last call, and a fresh count. */
  const counted = () => {
    const n = { ...net, throttle: { ...throttle }, sent: structuredClone(sent) }
    net = fresh()
    for (const k of Object.keys(sent)) sent[k] = { bytes: 0, requests: 0 }
    return n
  }
  /** Until the service worker has asked for nothing for `quietMs`, or `capMs` has gone. */
  const swQuiet = async (quietMs, capMs) => {
    const end = Date.now() + capMs
    while (Date.now() < end) {
      if (sw.pending.size === 0 && Date.now() - sw.since >= quietMs) return true
      await sleep(100)
    }
    return false
  }
  const close = async () => {
    closed = true
    unlisten()
    await raw?.send('Target.detachFromTarget', { sessionId: pageSid }).catch(() => {})
    await context.close()
  }
  return { page, counted, swQuiet, close }
}

/** The bytes a visit moved, as the table and the JSON take them. */
const traffic = (n) => ({
  appBytes: n.appBytes,
  appRequests: n.appRequests,
  appServerBytes: n.sent.page.bytes,
  workerBytes: n.sent.worker.bytes,
  workerRequests: n.sent.worker.requests,
  workerCdpBytes: n.workerCdpBytes,
  workerAt: n.workerAt,
  swBytes: n.sent.sw.bytes,
  swRequests: n.sent.sw.requests,
  swCdpBytes: n.swCdpBytes,
  swUnslowed: n.swUnslowed,
  basemapBytes: n.basemapBytes,
  basemapRequests: n.basemapRequests,
  basemapCached: n.basemapCached,
  basemapFetched: n.basemapFetched,
  basemapFailed: n.basemapFailed,
  tiles: n.tiles,
  ...Object.fromEntries(Object.entries(n.tiles).map(([z, t]) => [`tilesZ${z}`, t.n])),
  throttle: n.throttle,
})

/**
 * Waits in the page until the map is loaded and idle and no long task has run
 * for `quietMs`, or until `capMs` after the navigation. Returns when the
 * quiet began (settled) and whether the cap was hit instead.
 */
const settle = (page) =>
  page.evaluate(
    ({ quietMs, capMs }) =>
      new Promise((done) => {
        const s = window.__speed
        let busy = 0
        const tick = () => {
          const now = performance.now()
          const m = window.__map
          const idle = !!m && m.loaded() && m.areTilesLoaded() && !m.isMoving()
          if (!idle) busy = now
          const quiet = Math.max(busy, ...s.longtasks.map(([t, d]) => t + d))
          if (idle && now - quiet >= quietMs) return done({ settled: quiet, capped: false })
          if (now >= capMs) return done({ settled: now, capped: true })
          setTimeout(tick, 100)
        }
        tick()
      }),
    { quietMs: SETTINGS.quietMs, capMs: SETTINGS.settleCapMs },
  )

/** First paint, data in, routes drawn, 'load' and the long tasks from the navigation to `until`. */
const loadReadings = (page, until) =>
  page.evaluate((until) => {
    const s = window.__speed
    const tasks = s.longtasks.filter(([t]) => t < until)
    return {
      fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      dataIn: s.dataIn,
      routesDrawn: s.routesDrawn,
      mapLoad: s.mapLoad,
      settled: until,
      tbt: tasks.reduce((n, [, d]) => n + Math.max(0, d - 50), 0),
      longest: tasks.reduce((n, [, d]) => Math.max(n, d), 0),
    }
  }, until)

async function load(p, reload) {
  if (reload) await p.page.reload({ waitUntil: 'domcontentloaded' })
  else await p.page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  const { settled, capped } = await settle(p.page)
  const r = await loadReadings(p.page, settled)
  return { ...r, capped, ...traffic(p.counted()) }
}

/** A first visit with the service worker allowed, read as a cold one and then to the end of the worker's install. */
async function swVisit() {
  await launch()
  try {
    const p = await phonePage({ serviceWorkers: 'allow' })
    await p.page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    const { settled, capped } = await settle(p.page)
    const r = await loadReadings(p.page, settled)
    // Active (navigator.serviceWorker.ready), then nothing asked of it for
    // 2 s: its precache in, and the page's own warm-up asked through it (pwa.ts).
    const swReady = await p.page.evaluate(
      (capMs) =>
        new Promise((done) => {
          const tick = () => (window.__speed.swReady !== null || performance.now() > capMs ? done(window.__speed.swReady) : setTimeout(tick, 200))
          tick()
        }),
      SETTINGS.swCapMs,
    )
    const quiet = swReady !== null && (await p.swQuiet(SETTINGS.quietMs, SETTINGS.swCapMs))
    const n = p.counted()
    await p.close()
    return { ...r, capped, swReady, swCapped: swReady === null || !quiet, ...traffic(n) }
  } finally {
    await shut()
  }
}

/**
 * Where to put the finger for a `kind` ('list' or 'trip') tap at the view the
 * map opened on: the spot the warm-up chose, else the first that fits. Only
 * project() and elementFromPoint() are asked of the page: a query of the
 * map's features here would take the tap's own first-query cost out of what
 * is timed.
 */
const findSpot = (page, kind) =>
  page.evaluate(
    ({ kind, spots, reachPx }) => {
      const m = window.__map
      const mPerPx = (40075016.686 * Math.cos((m.getCenter().lat * Math.PI) / 180)) / (512 * 2 ** m.getZoom())
      for (const s of spots) {
        // A list: clear of every hotspot box by 4 px. A trip: more room from
        // every other route and every box than a finger reaches.
        const room = kind === 'list' ? s.box : Math.min(s.clear, s.box)
        if (room < (kind === 'list' ? 4 : reachPx) * mPerPx) continue
        const q = m.project(s.p)
        if (q.x < 40 || q.x > innerWidth - 40 || q.y < 160 || q.y > innerHeight - 160) continue
        const r = m.getCanvas().getBoundingClientRect()
        const x = r.left + q.x
        const y = r.top + q.y
        if (!document.elementFromPoint(x, y)?.classList.contains('maplibregl-canvas')) continue
        return { spot: s, x, y, roomPx: room / mPerPx, zoom: m.getZoom(), center: m.getCenter().toArray() }
      }
      return null
    },
    { kind, spots: chosen[kind] ? [chosen[kind]] : SPOTS[kind], reachPx: FINGER_REACH_PX },
  )

/** A tap at the opening view on a settled first visit: what opened, how soon, and what it cost after. */
async function tapVisit(kind) {
  await launch()
  try {
    const p = await phonePage()
    const { page } = p
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    const { capped } = await settle(page)
    const fetched = p.counted().basemapFetched
    const found = await findSpot(page, kind)
    if (!found) {
      await p.close()
      return { tapToCard: null, tapToPaint: null, opened: null, tbt: null, longest: null, capped, basemapFetched: fetched, note: `no spot for a ${kind} tap on the screen at the opening view` }
    }
    chosen[kind] ??= found.spot
    const before = await page.evaluate(() => window.__programs())
    await page.evaluate(() => Object.assign(window.__speed, { armed: true, down: null, shown: null, painted: null, kind: null }))
    await page.touchscreen.tap(found.x, found.y)
    const r = await page.evaluate(
      ({ windowMs }) =>
        new Promise((done) => {
          const s = window.__speed
          const t0 = performance.now()
          const tick = () => {
            const now = performance.now()
            const from = s.down ?? t0
            // The 3 s after the tap, and a little more for the last long task
            // to be reported; and the card painted, if it showed.
            const settledCard = s.shown === null ? now - t0 > 10000 : s.painted !== null || now - t0 > 10000
            if (settledCard && now >= from + windowMs + 300) {
              const tasks = s.longtasks.filter(([t, d]) => t + d > from && t < from + windowMs)
              return done({
                tapToCard: s.down !== null && s.shown !== null ? s.shown - s.down : null,
                tapToPaint: s.down !== null && s.painted !== null ? s.painted - s.down : null,
                opened: s.kind,
                tbt: tasks.reduce((n, [, d]) => n + Math.max(0, d - 50), 0),
                longest: tasks.reduce((n, [, d]) => Math.max(n, d), 0),
                rows: document.querySelectorAll('[data-testid="chooser"] [data-testid="chooser-item"]').length,
                tapSeen: s.down !== null,
              })
            }
            setTimeout(tick, 200)
          }
          tick()
        }),
      { windowMs: SETTINGS.tapWindowMs },
    )
    // The card up and the map idle, then the GL programs it has now.
    const idle = await page.evaluate(
      (capMs) =>
        new Promise((done) => {
          const t0 = performance.now()
          const tick = () => {
            const m = window.__map
            if (m.loaded() && m.areTilesLoaded() && !m.isMoving()) return done(true)
            if (performance.now() - t0 > capMs) return done(false)
            setTimeout(tick, 100)
          }
          tick()
        }),
      SETTINGS.idleCapMs,
    )
    const after = await page.evaluate(() => window.__programs())
    const viewAfter = await page.evaluate(() => ({ center: window.__map.getCenter().toArray(), zoom: window.__map.getZoom() }))
    const keys = added(before, after)
    const n = p.counted()
    await p.close()
    return {
      ...r,
      newPrograms: keys.length,
      programKeys: keys,
      programsBefore: before.length,
      idleCapped: !idle,
      capped,
      point: found.spot.p,
      line: found.spot.line,
      at: [Math.round(found.x), Math.round(found.y)],
      roomPx: Math.round(found.roomPx),
      zoom: found.zoom,
      viewBefore: { center: found.center, zoom: found.zoom },
      viewAfter,
      basemapFetched: fetched + n.basemapFetched,
    }
  } finally {
    await shut()
  }
}

/** One run of every scenario, each in fresh browsers. */
async function oneRun() {
  const run = {}
  await launch()
  try {
    const p = await phonePage()
    run.cold = await load(p, false)
    run.repeat = await load(p, true)
    await p.close()
  } finally {
    await shut()
  }
  run.sw = await swVisit()
  run.listTap = await tapVisit('list')
  run.tripTap = await tapVisit('trip')
  return run
}
const SCENARIOS = ['cold', 'repeat', 'sw', 'listTap', 'tripTap']

/** Fetches into the cache every basemap tile the taps' camera moves could ask for (tilesAlong). */
async function fetchAlong(taps) {
  const tileJson = JSON.parse((await basemapFile(`https://${BASEMAP_HOST}/planet`)).body.toString('utf8'))
  const template = tileJson.tiles?.[0]
  if (!template) return { tiles: 0, fetched: 0, failed: 0 }
  const urls = new Set()
  for (const t of taps) {
    if (!t?.viewBefore || !t.viewAfter) continue
    for (const [z, x, y] of tilesAlong(t.viewBefore, t.viewAfter, SETTINGS.viewport)) {
      if (z >= (tileJson.minzoom ?? 0) && z <= (tileJson.maxzoom ?? 14)) urls.add(template.replace('{z}', z).replace('{x}', x).replace('{y}', y))
    }
  }
  const queue = [...urls]
  let fetched = 0
  let failed = 0
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length) {
        try {
          if ((await basemapFile(queue.shift())).fetched) fetched++
        } catch {
          failed++
        }
      }
    }),
  )
  return { tiles: urls.size, fetched, failed }
}
const fetchedIn = (run) => SCENARIOS.reduce((n, s) => n + (run[s]?.basemapFetched ?? 0), 0)
const failedIn = (run) => SCENARIOS.reduce((n, s) => n + (run[s]?.basemapFailed ?? 0), 0)

// ------------------------------------------------------------------- the runs
const LOAD = {
  fcp: 's',
  dataIn: 's',
  routesDrawn: 's',
  mapLoad: 's',
  settled: 's',
  tbt: 'ms',
  longest: 'ms',
  appBytes: 'kB',
  appRequests: 'n',
  workerBytes: 'kB',
  workerAt: 's',
  basemapBytes: 'kB',
  basemapRequests: 'n',
}
const TAP = { tapToCard: 's', tapToPaint: 's', tbt: 'ms', longest: 'ms', newPrograms: 'n' }
const METRICS = {
  cold: LOAD,
  repeat: LOAD,
  sw: { ...LOAD, swBytes: 'kB', swRequests: 'n', swReady: 's' },
  listTap: { ...TAP, rows: 'n' },
  tripTap: TAP,
}
const LABELS = {
  cold: 'cold first visit',
  repeat: 'repeat visit (warm HTTP cache)',
  sw: 'first visit, the service worker allowed',
  listTap: 'list tap, at the opening view',
  tripTap: 'trip tap, at the opening view',
  fcp: 'first paint',
  dataIn: 'data in',
  routesDrawn: 'routes drawn',
  mapLoad: "map 'load'",
  settled: 'settled (quiet from)',
  tbt: 'TBT',
  longest: 'longest task',
  appBytes: 'app',
  appRequests: 'app requests (network)',
  workerBytes: 'worker (script, wire)',
  workerAt: 'worker script asked at',
  basemapBytes: 'basemap (gzip, wire)',
  basemapRequests: 'basemap requests',
  swBytes: 'service worker (wire)',
  swRequests: 'service worker requests',
  swReady: 'service worker active',
  tapToCard: 'tap → card',
  tapToPaint: 'tap → card painted',
  newPrograms: 'GL programs it compiled',
  rows: 'rows in the list',
}
const label = (m) => LABELS[m] ?? (/^tilesZ\d+$/.test(m) ? `  tiles at z${m.slice(6)}` : m)
const show = (v, unit) =>
  v === null || v === undefined
    ? '—'
    : unit === 's'
      ? `${(v / 1000).toFixed(2)} s`
      : unit === 'ms'
        ? `${Math.round(v)} ms`
        : unit === 'kB'
          ? `${Math.round(v / 1024).toLocaleString('en')} kB`
          : String(Math.round(v))

const runs = []
const warmUp = { basemapFetched: 0, basemapFailed: 0, alongTaps: { tiles: 0, fetched: 0, failed: 0 } }
const closeServer = () =>
  new Promise((r) => {
    server.close(() => r())
    server.closeAllConnections()
  })
const stop = async (code) => {
  await shut()
  await closeServer()
  process.exit(code)
}
process.on('SIGINT', () => void stop(130))
process.on('SIGTERM', () => void stop(143))

let failed = false
try {
  await new Promise((ok, fail) => server.once('error', fail).listen(PORT, 'localhost', ok))
  console.log(`serving the build on ${BASE}; basemap from ${CACHE}`)
  // Untimed: every scenario once, so the basemap's every file is on disk
  // before anything is timed, and the tap spots are chosen.
  console.log('warm-up: every scenario once, untimed …')
  const w = await oneRun()
  warmUp.basemapFetched = fetchedIn(w)
  warmUp.basemapFailed = failedIn(w)
  // A tap moves the camera (a trip's whole route as it opens), and the tiles
  // a move asks for depend on when its frames fall: a timed run's trip tap
  // asked for two z10 tiles the warm-up's had not (the first proof run,
  // 2026-10-04). So every tile the taps' moves could pass is fetched now.
  warmUp.alongTaps = await fetchAlong([w.listTap, w.tripTap])
  console.log(
    `warm-up: ${warmUp.basemapFetched} basemap file(s) fetched with curl; list tap at ${chosen.list ? chosen.list.p.join(', ') : 'nowhere'} ` +
      `(${w.listTap.opened ?? 'nothing'} opened), trip tap at ${chosen.trip ? chosen.trip.p.join(', ') : 'nowhere'} (${w.tripTap.opened ?? 'nothing'} opened); ` +
      `${warmUp.alongTaps.fetched} more of the ${warmUp.alongTaps.tiles} tiles along the taps' camera moves`,
  )
  for (let i = 0; i < RUNS; i++) {
    const run = { run: i + 1, ...(await oneRun()) }
    runs.push(run)
    const c = run.cold
    console.log(
      `run ${i + 1}/${RUNS}: cold FCP ${show(c.fcp, 's')}, data in ${show(c.dataIn, 's')}, routes drawn ${show(c.routesDrawn, 's')}, 'load' ${show(c.mapLoad, 's')}, TBT ${show(c.tbt, 'ms')}; ` +
        `repeat FCP ${show(run.repeat.fcp, 's')}; sw active ${show(run.sw.swReady, 's')}, ${show(run.sw.swBytes, 'kB')}; ` +
        `tap → ${run.listTap.opened ?? 'nothing'} ${show(run.listTap.tapToCard, 's')} (+${run.listTap.newPrograms ?? '?'} programs), ` +
        `tap → ${run.tripTap.opened ?? 'nothing'} ${show(run.tripTap.tapToCard, 's')} (+${run.tripTap.newPrograms ?? '?'} programs)`,
    )
    const fetched = fetchedIn(run)
    if (fetched) console.log(`  ${fetched} basemap file(s) were fetched with curl during this run: its timings carry curl's`)
    if (SCENARIOS.some((s) => run[s].capped)) console.log(`  the ${SETTINGS.settleCapMs / 1000} s cap ended a wait for the map to settle`)
    if (run.sw.swCapped) console.log('  the service worker did not finish installing in time')
    if (run.sw.swUnslowed) console.log(`  ${run.sw.swUnslowed} of the service worker's requests came back sooner than a Slow 4G round trip: not slowed`)
    for (const [s, want] of [['listTap', 'list'], ['tripTap', 'trip']]) {
      if (run[s].opened !== want) console.log(`  the ${s} opened ${run[s].opened ?? 'nothing'}, not the ${want}${run[s].note ? ` (${run[s].note})` : ''}`)
      if (run[s].idleCapped) console.log(`  after the ${s}, the map was not idle within ${SETTINGS.idleCapMs / 1000} s`)
    }
    if (failedIn(run)) console.log(`  ${failedIn(run)} basemap request(s) failed`)
  }
} catch (e) {
  failed = true
  console.error(e)
} finally {
  await shut()
  await closeServer()
}
if (failed || !runs.length) process.exit(1)

// ------------------------------------------------------------------ the table
const summary = {}
const commit = git('rev-parse', '--short', 'HEAD')
console.log(
  `\n${commit}, Chromium ${chromiumVersion}: CPU ${SETTINGS.cpuThrottlingRate}× slower, Slow 4G, ` +
    `${SETTINGS.viewport.width}×${SETTINGS.viewport.height} at ${SETTINGS.deviceScaleFactor}×. ${RUNS} run(s): median, then min–max\n`,
)
// A tap that opened anything but what it aimed at is left out of its scenario.
const counts = (scenario, r) => (scenario === 'listTap' ? r.listTap.opened === 'list' : scenario === 'tripTap' ? r.tripTap.opened === 'trip' : true)
for (const [scenario, base] of Object.entries(METRICS)) {
  const tiles = ['cold', 'repeat', 'sw'].includes(scenario) ? tileMetrics(runs, scenario) : []
  const metrics = { ...base, ...Object.fromEntries(tiles.map((m) => [m, 'n'])) }
  summary[scenario] = {}
  console.log(LABELS[scenario])
  for (const [metric, unit] of Object.entries(metrics)) {
    const xs = runs.filter((r) => counts(scenario, r)).map((r) => r[scenario][metric] ?? (tiles.includes(metric) ? 0 : null))
    const s = stats(xs)
    summary[scenario][metric] = s
    console.log(`  ${label(metric).padEnd(26)}${show(s.median, unit).padStart(10)}   ${show(s.min, unit)}–${show(s.max, unit)}`)
  }
}

// The GL programs each tap compiled, and in how many runs.
const programs = {}
for (const scenario of ['listTap', 'tripTap']) {
  const seen = {}
  for (const r of runs) for (const k of r[scenario].programKeys ?? []) seen[k] = (seen[k] ?? 0) + 1
  programs[scenario] = seen
  const keys = Object.keys(seen)
  console.log(`\nGL programs the ${LABELS[scenario]} compiled (runs that did):${keys.length ? '' : ' none'}`)
  for (const k of keys) console.log(`  ${seen[k]}/${runs.length}  ${k}`)
}

const timedFetched = runs.reduce((n, r) => n + fetchedIn(r), 0)
console.log(
  `\nbasemap files fetched with curl during the timed runs: ${timedFetched} (should be 0; the warm-up fetched ${warmUp.basemapFetched}, ` +
    `and ${warmUp.alongTaps.fetched} of the ${warmUp.alongTaps.tiles} tiles along the taps' camera moves)`,
)
const throttled = Object.assign({}, ...runs.flatMap((r) => SCENARIOS.map((s) => r[s].throttle ?? {})))
console.log(`DevTools' Slow 4G on the workers: ${Object.entries(throttled).map(([k, v]) => `${k} ${v}`).join(', ') || 'none attached'}`)

if (JSON_OUT) {
  const meta = {
    date: new Date().toISOString(),
    commit,
    uncommitted: git('status', '--porcelain', '--untracked-files=no') !== '',
    runs: RUNS,
    settings: {
      ...SETTINGS,
      chromium: chromiumVersion,
      base: BASE,
      units: { times: 'ms; fcp, dataIn, routesDrawn, mapLoad, settled, workerAt and swReady from the navigation', bytes: 'B' },
    },
    spots: { listTap: chosen.list, tripTap: chosen.trip },
    basemapFetched: { warmUp: warmUp.basemapFetched, alongTaps: warmUp.alongTaps, timed: timedFetched },
    throttled,
  }
  mkdirSync(dirname(JSON_OUT), { recursive: true })
  writeFileSync(JSON_OUT, JSON.stringify({ meta, runs, summary, programs }, null, 1))
  console.log(`\nwrote ${JSON_OUT}`)
}
