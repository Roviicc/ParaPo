// How the public map feels on a cheap phone: load, a shared link, a tap.
//
//   node scripts/research/phone-speed.mjs [runs]        (default 3 of each)
//
// Builds the app with VITE_EXPOSE_MAP=1 (so the tap can find a route on the
// screen, as a dev build lets the suites) into a folder of its own, serves it
// with `vite preview`, and drives headless Chromium as a 390×844 phone at
// DPR 2, its CPU slowed 4× (CPU=…), the app's own files over Slow 4G (150 ms,
// 1.6 Mbps). GPU compositing is on (SwiftShader): without it headless Chrome
// reads every map frame back on the main thread, seconds a phone never pays.
//
// Prints, as medians: a first visit and a repeat visit (first paint, routes on
// the map, long tasks, total blocking time, bytes of the app and of the
// basemap), a shared link /?r=<id> (until its trip card is up, until the map
// settles), and a tap on a route line (until its card or the list is up, and
// the blocking time after). Written 2026-10-03 for the cheap-phone work.
//
// PARAPO_CHROMIUM: a Chromium to use (the sandbox's /opt/pw-browsers/chromium).
// PARAPO_BASEMAP_CACHE: a folder; basemap files are then fetched once with
// curl and served from it — for a sandbox whose browser cannot reach
// tiles.openfreemap.org. Without it the browser fetches them itself.
// ONLY=firstVisit,tapLine runs just those; DEBUG=1 lists each of the app's
// files as it arrives, from the worker or the network. `vite preview` sends
// no long cache headers, so a repeat visit's bytes here are the worker's
// doing alone; on the site /assets/ is also cached for a year (_headers).
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RUNS = Number(process.argv[2] ?? 3)
const CPU = Number(process.env.CPU ?? 4)
const OUT = join(tmpdir(), 'parapo-phone-speed')
const CACHE = process.env.PARAPO_BASEMAP_CACHE

console.log(`building into ${OUT} …`)
execFileSync('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_EXPOSE_MAP: '1' },
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

const file = JSON.parse(readFileSync(join(root, 'public/data/index.v4.json'), 'utf8'))
const drawn = file.variants.filter((v) => v.overview)
const browser = await chromium.launch({
  executablePath: process.env.PARAPO_CHROMIUM || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

/** A phone page, its basemap counted, long tasks and first paint recorded. */
async function phone({ worker = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: worker ? 'allow' : 'block' })
  const basemap = { n: 0, bytes: 0 }
  await ctx.route(/tiles\.openfreemap\.org/, async (route) => {
    basemap.n++
    if (!CACHE) {
      const res = await route.fetch()
      basemap.bytes += (await res.body()).length
      return route.fulfill({ response: res })
    }
    const c = fromCache(route.request().url())
    basemap.bytes += c.body.length
    return route.fulfill({ status: 200, contentType: c.type, body: c.body, headers: { 'access-control-allow-origin': '*' } })
  })
  const page = await ctx.newPage()
  await page.addInitScript(() => {
    window.__speed = { long: [], fcp: null, routes: null }
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__speed.long.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true })
    new PerformanceObserver((l) => l.getEntries().forEach((e) => e.name === 'first-contentful-paint' && (window.__speed.fcp = e.startTime))).observe({ type: 'paint', buffered: true })
    const t = setInterval(() => {
      if (Number(document.querySelector('[data-directions]')?.getAttribute('data-directions') ?? 0) > 0) {
        window.__speed.routes = performance.now()
        clearInterval(t)
      }
    }, 20)
  })
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  const app = { bytes: 0, ids: new Set() }
  cdp.on('Network.responseReceived', (e) => {
    if (!e.response.url.startsWith(BASE)) return
    app.ids.add(e.requestId)
    if (process.env.DEBUG) console.log('   ', e.response.fromServiceWorker ? 'worker ' : 'network', e.response.url.slice(BASE.length))
  })
  cdp.on('Network.loadingFinished', (e) => app.ids.has(e.requestId) && (app.bytes += e.encodedDataLength))
  const slow = async () => {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 96_000 })
  }
  const reset = () => { app.bytes = 0; app.ids.clear(); basemap.n = 0; basemap.bytes = 0 }
  return { ctx, page, slow, reset, app, basemap }
}

const settled = (page) =>
  page.waitForFunction(() => window.__map?.loaded() && !window.__map.isMoving(), null, { timeout: 120_000, polling: 100 }).catch(() => {})
const blocking = (long, from = 0) => {
  const xs = long.filter(([s]) => s >= from)
  return { longTasks: xs.length, longest: Math.round(Math.max(0, ...xs.map(([, d]) => d))), tbt: Math.round(xs.reduce((a, [, d]) => a + Math.max(0, d - 50), 0)) }
}

async function load(warm) {
  const p = await phone({ worker: warm })
  if (warm) {
    await p.page.goto(BASE + '/')
    await p.page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 60_000 }).catch(() => {})
    await settled(p.page)
    await p.page.waitForTimeout(3000)
    p.reset()
  }
  await p.slow()
  await p.page.goto(BASE + '/', { timeout: 120_000 })
  await p.page.waitForFunction(() => window.__speed.routes, null, { timeout: 120_000 })
  await settled(p.page)
  await p.page.waitForTimeout(2000)
  const s = await p.page.evaluate(() => window.__speed)
  const out = { firstPaint: Math.round(s.fcp), routes: Math.round(s.routes), ...blocking(s.long), appKB: Math.round(p.app.bytes / 1024), basemapKB: Math.round(p.basemap.bytes / 1024), basemapFiles: p.basemap.n }
  if (warm && !(await p.page.evaluate(() => !!navigator.serviceWorker?.controller))) console.warn('  (the repeat visit was not served by the worker)')
  await p.ctx.close()
  return out
}

async function share(i) {
  const v = drawn[i % drawn.length]
  const p = await phone()
  await p.slow()
  const t0 = Date.now()
  await p.page.goto(`${BASE}/?r=${v.id}`, { timeout: 120_000 })
  await p.page.waitForSelector('[data-testid="card"]:not([hidden]) [data-testid="trip"]', { timeout: 120_000 })
  const card = Date.now() - t0
  await settled(p.page)
  const out = { card, settled: Date.now() - t0, ...blocking(await p.page.evaluate(() => window.__speed.long)) }
  await p.ctx.close()
  return out
}

async function tap() {
  const p = await phone()
  await p.page.goto(BASE + '/')
  await p.page.waitForFunction(() => window.__speed.routes, null, { timeout: 120_000 })
  await settled(p.page)
  await p.page.waitForTimeout(1500)
  const at = await p.page.evaluate((lines) => {
    const m = window.__map
    const { width, height } = m.getContainer().getBoundingClientRect()
    for (const line of lines)
      for (let k = Math.floor(line.length / 3); k < line.length; k += 5) {
        const s = m.project(line[k])
        if (s.x > 60 && s.x < width - 60 && s.y > 120 && s.y < height - 200) return [s.x, s.y]
      }
    return null
  }, drawn.map((v) => v.overview.coordinates))
  if (!at) return null
  await p.slow()
  const from = await p.page.evaluate(() => performance.now())
  const t0 = Date.now()
  await p.page.touchscreen.tap(at[0], at[1])
  await p.page.waitForSelector('[data-testid="card"]:not([hidden]), [data-testid="chooser"]:not([hidden])', { timeout: 60_000 })
  const card = Date.now() - t0
  await p.page.waitForTimeout(300)
  await settled(p.page)
  const done = Date.now() - t0
  await p.page.waitForTimeout(1000)
  const out = { card, settled: done, ...blocking(await p.page.evaluate(() => window.__speed.long), from) }
  await p.ctx.close()
  return out
}

// ONLY=firstVisit,tapLine … runs just those.
const only = process.env.ONLY?.split(',')
const want = (name) => !only || only.includes(name)
const runs = { firstVisit: [], repeatVisit: [], sharedLink: [], tapLine: [] }
for (let i = 0; i < RUNS; i++) {
  if (want('firstVisit')) runs.firstVisit.push(await load(false))
  if (want('repeatVisit')) runs.repeatVisit.push(await load(true))
  if (want('sharedLink')) runs.sharedLink.push(await share(i))
  const t = want('tapLine') ? await tap() : null
  if (t) runs.tapLine.push(t)
}
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
console.log(`\nCPU ${CPU}×, Slow 4G, ${RUNS} run(s) each; medians (ms, KB):`)
for (const [name, rs] of Object.entries(runs)) {
  if (!rs.length) continue
  const keys = Object.keys(rs[0])
  console.log(`  ${name.padEnd(12)} ${keys.map((k) => `${k} ${median(rs.map((r) => r[k]))}`).join(' · ')}`)
}
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(runs, null, 2))
await browser.close()
await server.close()
