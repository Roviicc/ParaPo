// How fast the public map is on a cheap phone: the production build, timed in
// Chromium with the CPU slowed four times and on DevTools' "Slow 4G", at a
// phone's 390×844, two device pixels per CSS pixel, touch. Written 2026-10-04
// for the cheap-phone plan (its Step 0 builds on it), so that each step of the
// plan is measured, not guessed.
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
// It builds its own copy of the site with VITE_EXPOSE_MAP=1, which hands the
// map out as window.__map as a development build does (MapView.tsx), into
// node_modules/.cache/phone-speed — never dist/, which pwa-test serves — and
// serves it on :4175 as Cloudflare would: text gzipped, so the bytes counted
// are the wire's; public/_headers' caching (/assets/* immutable, everything
// else re-checked on each visit, an ETag answered 304); and the map's page for
// any address with no file (single-page-application). Nothing else may run
// while it measures, the dev server included: they share the CPU.
//
// The browser here cannot reach tiles.openfreemap.org, and curl can (through
// the sandbox's proxy). So every request to that host — style, TileJSON,
// sprite, glyphs, tiles — is answered from PARAPO_BASEMAP_CACHE, and a file not
// there yet is fetched with curl and kept. A run that had to fetch says so:
// its timings carry curl's, so run again.
//
// Each run, in fresh browsers (a cold GPU program cache, a cold HTTP cache):
//   cold    a first visit to /. Waits until the map is loaded and idle and the
//           page has run no long task for 2 s (40 s at most), then reads:
//           first paint (FCP); "data in", the first moment the app root's
//           data-directions is above 0, stamped in the page; settled, when
//           that quiet began; TBT (each long task's time over 50 ms, from the
//           navigation to settled) and the longest task; the app's bytes and
//           requests (every response from :4175, as Chrome's network layer
//           counts them); the basemap's bytes and requests.
//   repeat  the same page reloaded, its HTTP cache warm; the same readings,
//           but for the basemap: a reload asks for it again, as Chrome keeps
//           nothing answered through CDP in its cache (a phone would have it).
//   listTap another first visit, settled, then a finger on a road several
//           routes share, at the view the map opened on, so the route list
//           opens and not a trip (found in public/data as phone-test finds
//           its list tap, placed with window.__map.project). Reads tap → card,
//           from the tap's first touchstart or pointerdown in the page to the
//           list's appearance in the page (both stamped there: the moment
//           React puts it in, not its paint), whether it was the list and how
//           many rows it has, and the TBT and longest task of the 3 s after.
// Service workers are blocked throughout.
//
// How to read the numbers (the plan's own caveats, 2026-10-03):
//   - "data in" is not "routes drawn". It flips when the map file arrives;
//     the routes are drawn only after MapLibre's 'load', so a change that
//     moves 'load' cannot show in it.
//   - The GPU here is SwiftShader, on the CPU, and it inflates shader
//     compiles: a first-use GL program can block the main thread for a
//     second and more where a phone takes 5–50 ms. Only the first sync GL
//     call in a frame pays that wait, so savings per program do not add up.
//   - Every frame carries a 276–473 ms "Commit" (a SwiftShader artefact). It
//     inflates whatever is timed across a frame, a card's paint among them,
//     and does not shrink when map work is removed.
//   - Some traffic is not seen: MapLibre's worker script (~135 kB gzipped) is
//     fetched for the worker's own target, neither counted nor held to Slow
//     4G, and the basemap is served from disk at full speed, its bytes
//     decompressed (z11 is ~189 kB and z9 ~397 kB gzipped on the wire).
//     Cloudflare serves brotli, so real bytes are 15–20% under gzip's. A real
//     first visit is bound by bytes.
//   - Each figure is a median, with the runs' min–max beside it: a
//     difference smaller than that spread is noise.
import { chromium } from 'playwright'
import { execFile, execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RUNS = Math.max(1, Number.parseInt(process.argv[2] ?? '3', 10) || 3)
const PORT = 4175
const BASE = `http://localhost:${PORT}`
const SITE = join(ROOT, 'node_modules', '.cache', 'phone-speed')
const CACHE = resolve(process.env.PARAPO_BASEMAP_CACHE ?? join(ROOT, 'node_modules', '.cache', 'phone-speed-basemap'))
const JSON_OUT = process.env.JSON ? resolve(process.env.JSON) : null
const BASEMAP_HOST = 'tiles.openfreemap.org'

const SETTINGS = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  serviceWorkers: 'block',
  cpuThrottlingRate: 4,
  // DevTools' "Slow 4G" preset, as it sends it.
  network: { latency: 562.5, downloadThroughput: 180000, uploadThroughput: 84375 },
  // Without these, headless Chrome reads every frame back on the main thread.
  chromiumArgs: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  quietMs: 2000,
  settleCapMs: 40000,
  tapWindowMs: 3000,
}

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()

// ------------------------------------------------------------------ the build
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
const exposes = readdirSync(join(SITE, 'assets')).some((f) => f.endsWith('.js') && /__map\b/.test(readFileSync(join(SITE, 'assets', f), 'utf8')))
if (!exposes) {
  console.error('the build does not hand out window.__map: is VITE_EXPOSE_MAP still read in MapView.tsx?')
  process.exit(1)
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

const server = createServer((req, res) => {
  const url = new URL(req.url, BASE)
  let path
  try {
    path = decodeURIComponent(url.pathname)
  } catch {
    res.writeHead(400)
    return res.end()
  }
  // html_handling's default: /index.html is /, and a folder wants its slash.
  if (path.endsWith('/index.html')) {
    res.writeHead(307, { location: path.slice(0, -'index.html'.length) + url.search })
    return res.end()
  }
  let file = join(SITE, path.endsWith('/') ? path + 'index.html' : path)
  const inside = file.startsWith(SITE + sep)
  const hidden = ignored.some((name) => path === '/' + name || path.startsWith('/' + name + '/'))
  if (inside && !hidden && !path.endsWith('/') && isFile(join(file, 'index.html'))) {
    res.writeHead(307, { location: path + '/' + url.search })
    return res.end()
  }
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
    res.writeHead(304, headers)
    return res.end()
  }
  const gz = f.gz && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')
  const body = gz ? f.gz : f.body
  if (gz) headers['content-encoding'] = 'gzip'
  headers['content-length'] = body.length
  res.writeHead(200, headers)
  res.end(req.method === 'HEAD' ? undefined : body)
})

// ---------------------------------------------------------------- the basemap
mkdirSync(CACHE, { recursive: true })
const fetching = new Map()
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

// -------------------------------------------------------- where to tap a list
// A road several routes share, from the published map (index and full lines)
// as phone-test finds its list tap: a vertex of one direction within 15 m of
// a direction of another route (another name on the signboard). Sampled
// evenly along each line, in the file's order.
const M_PER_DEG_LAT = 110_574
const mPerDegLng = (lat) => 111_320 * Math.cos((lat * Math.PI) / 180)
function distPointSegment(p, a, b, k) {
  const px = (p[0] - a[0]) * k
  const py = (p[1] - a[1]) * M_PER_DEG_LAT
  const bx = (b[0] - a[0]) * k
  const by = (b[1] - a[1]) * M_PER_DEG_LAT
  const len2 = bx * bx + by * by
  let t = len2 ? (px * bx + py * by) / len2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - bx * t, py - by * t)
}
const distToLine = (p, coords, k) => {
  let best = Infinity
  for (let i = 1; i < coords.length; i++) best = Math.min(best, distPointSegment(p, coords[i - 1], coords[i], k))
  return best
}
const listSpots = (() => {
  const at = (name) => JSON.parse(readFileSync(join(ROOT, 'public', 'data', name), 'utf8'))
  const index = at('index.v4.json')
  const lines = index.variants
    .map((v) => ({ id: v.id, name: v.route?.name ?? '', coords: (v.overview ? at(`lines/${v.id}.json`).shape?.coordinates : null) ?? v.overview?.coordinates ?? [] }))
    .filter((l) => l.coords.length > 1 && l.name)
  const rings = index.stops.filter((s) => s.area?.type === 'Polygon').map((s) => s.area.coordinates[0])
  const spots = []
  for (const l of lines) {
    const stride = Math.max(1, Math.ceil(l.coords.length / Math.max(1, 2000 / lines.length)))
    for (let i = 0; i < l.coords.length; i += stride) {
      const p = l.coords[i]
      const k = mPerDegLng(p[1])
      if (!lines.some((o) => o.name !== l.name && distToLine(p, o.coords, k) <= 15)) continue
      // Metres to the nearest hotspot box edge: a tap inside one is the hotspot's (tap.ts).
      const box = Math.min(...rings.map((r) => distToLine(p, r, k)))
      spots.push({ p, line: l.id, box })
    }
  }
  return spots
})()

// ----------------------------------------------------------------- the browser
/** Stamps, made in the page before any of its own scripts run. */
function stamps() {
  const s = (window.__speed = { longtasks: [], dataIn: null, armed: false, down: null, shown: null, kind: null })
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) s.longtasks.push([e.startTime, e.duration])
    }).observe({ type: 'longtask', buffered: true })
  } catch {}
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

let browser = null
let chromiumVersion = null
const launch = async () => {
  browser = await chromium.launch({ executablePath: process.env.PARAPO_CHROMIUM || undefined, args: SETTINGS.chromiumArgs })
  chromiumVersion ??= browser.version()
  return browser
}
const shut = async () => {
  const b = browser
  browser = null
  await b?.close().catch(() => {})
}

/** A phone's page: CPU and network slowed before it navigates, its traffic counted, the basemap from the cache. */
async function phonePage() {
  const context = await browser.newContext({
    viewport: SETTINGS.viewport,
    deviceScaleFactor: SETTINGS.deviceScaleFactor,
    isMobile: SETTINGS.isMobile,
    hasTouch: SETTINGS.hasTouch,
    serviceWorkers: SETTINGS.serviceWorkers,
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log('  page error:', String(e).split('\n')[0]))
  await page.addInitScript(stamps)
  // CDP's own interception, not Playwright's page.route: that turns the
  // browser's HTTP cache off, and the repeat visit is about that cache.
  const cdp = await context.newCDPSession(page)
  const urls = new Map()
  const cached = new Set()
  const net = { appBytes: 0, appRequests: 0, basemapBytes: 0, basemapRequests: 0, basemapFetched: 0, basemapFailed: 0 }
  cdp.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, e.request.url))
  cdp.on('Network.requestServedFromCache', (e) => cached.add(e.requestId))
  cdp.on('Network.responseReceived', (e) => {
    if (e.response.fromDiskCache) cached.add(e.requestId)
  })
  // What went over the wire: a 304 is its headers, a file from the cache nothing.
  cdp.on('Network.loadingFinished', (e) => {
    if (!urls.get(e.requestId)?.startsWith(BASE + '/') || cached.has(e.requestId)) return
    net.appBytes += e.encodedDataLength
    net.appRequests++
  })
  cdp.on('Fetch.requestPaused', async (e) => {
    try {
      const f = await basemapFile(e.request.url)
      net.basemapRequests++
      net.basemapBytes += f.body.length
      if (f.fetched) net.basemapFetched++
      await cdp.send('Fetch.fulfillRequest', {
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
      net.basemapFailed++
      await cdp.send('Fetch.failRequest', { requestId: e.requestId, errorReason: 'ConnectionFailed' }).catch(() => {})
    }
  })
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...SETTINGS.network })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: SETTINGS.cpuThrottlingRate })
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: `*://${BASEMAP_HOST}/*`, requestStage: 'Request' }] })
  const counted = () => {
    const now = { ...net }
    for (const k of Object.keys(net)) net[k] = 0
    return now
  }
  return { context, page, counted }
}

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

/** First paint, data in and the long tasks from the navigation to `until`. */
const loadReadings = (page, until) =>
  page.evaluate((until) => {
    const s = window.__speed
    const tasks = s.longtasks.filter(([t]) => t < until)
    return {
      fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      dataIn: s.dataIn,
      settled: until,
      tbt: tasks.reduce((n, [, d]) => n + Math.max(0, d - 50), 0),
      longest: tasks.reduce((n, [, d]) => Math.max(n, d), 0),
    }
  }, until)

async function load(page, counted, reload) {
  if (reload) await page.reload({ waitUntil: 'domcontentloaded' })
  else await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  const { settled, capped } = await settle(page)
  const r = await loadReadings(page, settled)
  const n = counted()
  return { ...r, capped, appBytes: n.appBytes, appRequests: n.appRequests, basemapBytes: n.basemapBytes, basemapRequests: n.basemapRequests, basemapFetched: n.basemapFetched, basemapFailed: n.basemapFailed }
}

async function listTap() {
  await launch()
  try {
    const { context, page, counted } = await phonePage()
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    const { capped } = await settle(page)
    const fetched = counted().basemapFetched
    // The first spot on the screen, clear of the controls and of every
    // hotspot box at this zoom. Only project() and elementFromPoint() are
    // asked of the page: a query of the map's features here would take the
    // tap's own first-query cost out of what is timed.
    const spot = await page.evaluate((spots) => {
      const m = window.__map
      const mPerPx = (40075016.686 * Math.cos((m.getCenter().lat * Math.PI) / 180)) / (512 * 2 ** m.getZoom())
      for (const s of spots) {
        if (s.box < 4 * mPerPx) continue
        const q = m.project(s.p)
        if (q.x < 40 || q.x > innerWidth - 40 || q.y < 160 || q.y > innerHeight - 160) continue
        const r = m.getCanvas().getBoundingClientRect()
        const x = r.left + q.x
        const y = r.top + q.y
        if (!document.elementFromPoint(x, y)?.classList.contains('maplibregl-canvas')) continue
        return { x, y, p: s.p, line: s.line, zoom: m.getZoom() }
      }
      return null
    }, listSpots)
    if (!spot) {
      await context.close()
      return { tapToCard: null, opened: null, tbt: null, longest: null, capped, note: 'no shared road on the screen at the opening view' }
    }
    await page.evaluate(() => Object.assign(window.__speed, { armed: true, down: null, shown: null, kind: null }))
    await page.touchscreen.tap(spot.x, spot.y)
    const r = await page.evaluate(
      ({ windowMs }) =>
        new Promise((done) => {
          const s = window.__speed
          const t0 = performance.now()
          const tick = () => {
            const now = performance.now()
            const from = s.down ?? t0
            // The 3 s after the tap, and a little more for the last long task to be reported.
            if ((s.shown !== null || now - t0 > 10000) && now >= from + windowMs + 300) {
              const tasks = s.longtasks.filter(([t, d]) => t + d > from && t < from + windowMs)
              return done({
                tapToCard: s.down !== null && s.shown !== null ? s.shown - s.down : null,
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
    await context.close()
    return { ...r, capped, point: spot.p, line: spot.line, zoom: spot.zoom, basemapFetched: fetched + counted().basemapFetched }
  } finally {
    await shut()
  }
}

// ------------------------------------------------------------------- the runs
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const METRICS = {
  cold: { fcp: 's', dataIn: 's', settled: 's', tbt: 'ms', longest: 'ms', appBytes: 'kB', appRequests: 'n', basemapBytes: 'kB', basemapRequests: 'n' },
  // Not the basemap: a reload asks for it again, as Chrome keeps nothing
  // fulfilled through CDP in its cache, where a phone would have it cached.
  repeat: { fcp: 's', dataIn: 's', settled: 's', tbt: 'ms', longest: 'ms', appBytes: 'kB', appRequests: 'n' },
  listTap: { tapToCard: 's', tbt: 'ms', longest: 'ms', rows: 'n' },
}
const LABELS = {
  cold: 'cold first visit',
  repeat: 'repeat visit (warm HTTP cache)',
  listTap: 'list tap, at the opening view',
  fcp: 'first paint',
  dataIn: 'data in',
  settled: 'settled (quiet from)',
  tbt: 'TBT',
  longest: 'longest task',
  appBytes: 'app',
  appRequests: 'app requests (network)',
  basemapBytes: 'basemap',
  basemapRequests: 'basemap requests',
  tapToCard: 'tap → card',
  rows: 'rows in the list',
}
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
  for (let i = 0; i < RUNS; i++) {
    const run = { run: i + 1 }
    await launch()
    try {
      const { context, page, counted } = await phonePage()
      run.cold = await load(page, counted, false)
      run.repeat = await load(page, counted, true)
      await context.close()
    } finally {
      await shut()
    }
    run.listTap = await listTap()
    runs.push(run)
    const c = run.cold
    const t = run.listTap
    console.log(
      `run ${i + 1}/${RUNS}: cold FCP ${show(c.fcp, 's')}, data in ${show(c.dataIn, 's')}, TBT ${show(c.tbt, 'ms')}; ` +
        `repeat FCP ${show(run.repeat.fcp, 's')}; tap → ${t.opened ?? 'nothing'} ${show(t.tapToCard, 's')}`,
    )
    const fetched = c.basemapFetched + run.repeat.basemapFetched + (t.basemapFetched ?? 0)
    if (fetched) console.log(`  ${fetched} basemap file(s) were fetched with curl during this run: its timings carry curl's`)
    if (c.capped || run.repeat.capped || t.capped) console.log(`  the ${SETTINGS.settleCapMs / 1000} s cap ended a wait for the map to settle`)
    if (t.opened !== 'list') console.log(`  the tap opened ${t.opened ?? 'nothing'}, not the list${t.note ? ` (${t.note})` : ''}`)
    if (c.basemapFailed || run.repeat.basemapFailed) console.log(`  ${c.basemapFailed + run.repeat.basemapFailed} basemap request(s) failed`)
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
for (const [scenario, metrics] of Object.entries(METRICS)) {
  summary[scenario] = {}
  console.log(LABELS[scenario])
  for (const [metric, unit] of Object.entries(metrics)) {
    // A tap that opened anything but the list is not a list tap: left out.
    const xs = runs
      .filter((r) => scenario !== 'listTap' || r.listTap.opened === 'list')
      .map((r) => r[scenario][metric])
      .filter((v) => typeof v === 'number')
    const s = xs.length ? { median: median(xs), min: Math.min(...xs), max: Math.max(...xs) } : { median: null, min: null, max: null }
    summary[scenario][metric] = s
    console.log(`  ${LABELS[metric].padEnd(24)}${show(s.median, unit).padStart(10)}   ${show(s.min, unit)}–${show(s.max, unit)}`)
  }
}

if (JSON_OUT) {
  const meta = {
    date: new Date().toISOString(),
    commit,
    uncommitted: git('status', '--porcelain', '--untracked-files=no') !== '',
    runs: RUNS,
    settings: { ...SETTINGS, chromium: chromiumVersion, base: BASE, units: { times: 'ms; fcp, dataIn and settled from the navigation', bytes: 'B' } },
  }
  mkdirSync(dirname(JSON_OUT), { recursive: true })
  writeFileSync(JSON_OUT, JSON.stringify({ meta, runs, summary }, null, 1))
  console.log(`\nwrote ${JSON_OUT}`)
}
