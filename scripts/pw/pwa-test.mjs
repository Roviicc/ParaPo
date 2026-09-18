// The installable app, checked against the production build in `vite preview`
// (the service worker is off under `npm run dev`). Run `npm run build` first.
//
//   node scripts/pw/pwa-test.mjs
//
// Starts its own preview server on :4173 (or uses PARAPO_BASE), then:
//   - the manifest is served, valid, and names Para Po with its three icons
//   - the service worker registers on / and controls the page; /studio/ in a
//     fresh browser registers nothing and links no manifest
//   - the map file and the basemap are cached on the first visit
//   - offline: a reload of / still shows the routes and hotspots, the map
//     draws, and the notice says "Offline · map as of <date>"
//   - back online the notice goes; a changed worker (a deploy) is offered as
//     "New version · Reload" and waits until tapped
//   - housekeeping: no page errors, no request to the database
//
// Each check prints PASS/FAIL and the script exits non-zero on any failure.
import { createRequire } from 'node:module'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const require = createRequire(join(root, 'package.json'))
const { chromium } = require('playwright')

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

if (!existsSync(join(root, 'dist', 'sw.js'))) {
  console.log('FAIL  dist/sw.js missing — run npm run build first')
  process.exit(1)
}
const published = JSON.parse(readFileSync(join(root, 'public', 'data', 'map.json'), 'utf8'))
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const d = new Date(published.published_at)
const expectedDate = `${d.getDate()} ${MONTHS[d.getMonth()]}`
const routeCount = published.variants.length

let server = null
let base = process.env.PARAPO_BASE
if (!base) {
  const { preview } = await import('vite')
  server = await preview({ preview: { port: 4173, strictPort: true }, logLevel: 'silent' })
  base = server.resolvedUrls.local[0].replace(/\/$/, '')
}
console.log(`preview at ${base}`)

const browser = await chromium.launch()
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

try {
  // ---------------------------------------------------------------- manifest
  const res = await fetch(`${base}/manifest.webmanifest`)
  const manifest = res.ok ? await res.json() : null
  check('manifest.webmanifest served', res.ok, `HTTP ${res.status}`)
  check(
    'manifest: Para Po, id / start_url / scope "/", standalone, maskable icon',
    !!manifest &&
      manifest.name === 'Para Po' &&
      manifest.short_name === 'Para Po' &&
      manifest.id === '/' &&
      manifest.start_url === '/' &&
      manifest.scope === '/' &&
      manifest.display === 'standalone' &&
      manifest.icons?.some((i) => i.purpose === 'maskable' && i.sizes === '512x512'),
  )
  for (const icon of manifest?.icons ?? []) {
    const r = await fetch(`${base}/${icon.src}`)
    check(`icon ${icon.src} served as PNG`, r.ok && r.headers.get('content-type')?.includes('image/png'))
  }
  const swRes = await fetch(`${base}/sw.js`)
  check('sw.js served as JavaScript', swRes.ok && /javascript/.test(swRes.headers.get('content-type') ?? ''))

  // ------------------------------------------------- the studio: no worker
  {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(`${base}/studio/`, { waitUntil: 'load' })
    // The positive control: the two negatives below mean nothing on a blank page.
    const door = await page.getByText('Sign in to ParaPo Studio').waitFor({ timeout: 15000 }).then(() => true, () => false)
    check('/studio/ shows its sign-in door — the page rendered', door)
    const studio = await page.evaluate(async () => ({
      manifestLink: !!document.querySelector('link[rel="manifest"]'),
      registrations: (await navigator.serviceWorker.getRegistrations()).length,
      controlled: !!navigator.serviceWorker.controller,
    }))
    check('/studio/ links no manifest', !studio.manifestLink)
    check('/studio/ registers no service worker', studio.registrations === 0 && !studio.controlled)
    await ctx.close()
  }

  // ---------------------------------------------- the map: online, then off
  const ctx = await browser.newContext(phone)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  let supabase = 0
  page.on('request', (r) => {
    if (/\.supabase\.co/.test(r.url())) supabase++
  })

  await page.goto(`${base}/`, { waitUntil: 'load' })
  check('index.html links the manifest', await page.evaluate(() => !!document.querySelector('link[rel="manifest"][href="/manifest.webmanifest"]')))
  check('theme-color meta matches the manifest', (await page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute('content'))) === manifest?.theme_color)

  // The worker installs, activates and precaches on the first visit.
  const sw = await page.evaluate(async () => {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, rej) => setTimeout(() => rej(new Error('ready timeout')), 20000)),
    ]).catch((e) => ({ error: String(e) }))
    if (reg.error) return reg
    return { scope: reg.scope, active: !!reg.active }
  })
  check('service worker ready on / with scope /', !sw.error && sw.scope === `${base}/` && sw.active, JSON.stringify(sw))

  // Wait for the routes and the basemap, so both reach the caches.
  const pill = page.getByText(new RegExp(`^${routeCount} routes?`))
  await pill.waitFor({ timeout: 20000 })
  const pillText = (await pill.innerText()).trim()
  check(`online: pill shows the published map ("${pillText}")`, pillText.startsWith(`${routeCount} route`))
  await page.waitForSelector('canvas.maplibregl-canvas', { timeout: 20000 })
  await page.waitForFunction(() => !document.body.innerText.includes('Loading map…'), null, { timeout: 30000 })
  await page.waitForTimeout(4000)
  check('online: no offline notice', (await page.locator('[data-testid="offline"]').count()) === 0)

  const caches = await page.evaluate(async () => {
    const names = await window.caches.keys()
    const out = {}
    for (const n of names) out[n] = (await (await window.caches.open(n)).keys()).map((r) => r.url)
    return out
  })
  const names = Object.keys(caches)
  const mapFile = names.find((n) => n.includes('map-file'))
  const meta = names.find((n) => n.includes('basemap-meta'))
  const tiles = names.find((n) => n.includes('basemap-tiles'))
  const precache = names.find((n) => n.includes('precache'))
  check('caches: precache, map-file, basemap-meta, basemap-tiles all exist', !!(precache && mapFile && meta && tiles), names.join(', '))
  check('map-file cache holds /data/map.json', !!mapFile && caches[mapFile].some((u) => u.endsWith('/data/map.json')))
  check('basemap-meta holds the style and the TileJSON', !!meta && caches[meta].some((u) => u.endsWith('/styles/positron')) && caches[meta].some((u) => u.endsWith('/planet')))
  check(`basemap-tiles holds tiles (${tiles ? caches[tiles].length : 0})`, !!tiles && caches[tiles].length > 0)
  check('precache holds no studio chunk', !!precache && !caches[precache].some((u) => /\/assets\/studio-/.test(u)))
  check('map.json is never precached', !precache || !caches[precache].some((u) => u.includes('/data/map.json')))

  // The worker answers only the map's own address from the stored page. The
  // studio, with or without its slash, goes to the server untouched. (What the
  // server then does is its business: `vite preview` has a SPA fallback that
  // answers `/studio` with the map's HTML; Cloudflare redirects it to
  // `/studio/`. Only the worker is on trial.) The data file and the manifest
  // typed into a tab come through the worker's rules, as themselves.
  for (const [path, marker, viaWorker] of [
    ['/', '/assets/commuter-', true],
    ['/studio', null, false],
    ['/studio/', 'ParaPo Studio', false],
    ['/data/map.json', '"published_at"', null],
    ['/manifest.webmanifest', '"short_name"', null],
  ]) {
    const r = await page.goto(`${base}${path}`, { waitUntil: 'load' })
    const body = await page.evaluate(() => document.documentElement.outerHTML)
    const fromWorker = !!r && r.fromServiceWorker()
    const asItself = !marker || (body.includes(marker) && !body.includes('/assets/commuter-') === (path !== '/'))
    check(
      `controlled page: ${path} ${viaWorker === true ? 'comes from the worker' : viaWorker === false ? 'is not answered by the worker' : 'is served'}${marker ? ' as itself' : ''}`,
      !!r?.ok() && asItself && (viaWorker === null || fromWorker === viaWorker),
    )
  }
  await page.goto(`${base}/`, { waitUntil: 'load' })
  await pill.waitFor({ timeout: 20000 })

  // Now with no network at all: the phone keeps everything it needs.
  await ctx.setOffline(true)
  let tilesFromWorker = 0
  const countTiles = (res) => {
    if (/\.(pbf|png)$/.test(res.url()) && res.fromServiceWorker()) tilesFromWorker++
  }
  page.on('response', countTiles)
  await page.reload({ waitUntil: 'load' }).catch(() => {})
  const offlinePill = page.getByText(new RegExp(`^${routeCount} routes?`))
  const offlineOk = await offlinePill.waitFor({ timeout: 20000 }).then(() => true, () => false)
  check(`offline: reload of / still shows the routes (${routeCount})`, offlineOk)
  const notice = page.locator('[data-testid="offline"]')
  const noticeOk = await notice.waitFor({ timeout: 10000 }).then(() => true, () => false)
  const noticeText = noticeOk ? (await notice.innerText()).trim() : '(none)'
  check(`offline: notice reads "Offline · map as of ${expectedDate}"`, noticeText === `Offline · map as of ${expectedDate}`, noticeText)
  const drew = await page
    .waitForFunction(() => !document.body.innerText.includes('Loading map…') && !document.body.innerText.includes('The map failed to load'), null, { timeout: 30000 })
    .then(() => true, () => false)
  check('offline: the basemap draws (no "Loading map…", no failure banner)', drew)
  await page.waitForTimeout(2000)
  page.off('response', countTiles)
  check(`offline: tiles came from the worker's cache (${tilesFromWorker})`, tilesFromWorker > 0)
  check('offline: no routes-could-not-be-loaded banner', !(await page.evaluate(() => document.body.innerText.includes('could not be loaded'))))
  await page.screenshot({ path: 'pwa-offline.png' })

  // Zoom in and drag away, into tiles the phone never saw: they cannot come,
  // and the map must stay up rather than declare itself failed.
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(195, 400)
    await page.mouse.wheel(0, -300)
    await page.waitForTimeout(150)
  }
  await page.mouse.move(100, 400)
  await page.mouse.down()
  await page.mouse.move(300, 200, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(3000)
  check(
    'offline: panning into unseen tiles raises no failure banner',
    !(await page.evaluate(() => document.body.innerText.includes('The map failed to load'))),
  )

  // A shared link still opens offline.
  const firstId = published.variants[0]?.id
  if (firstId) {
    await page.goto(`${base}/?r=${firstId}`, { waitUntil: 'load' }).catch(() => {})
    const card = await page.locator('[data-testid="card"]').waitFor({ timeout: 20000 }).then(() => true, () => false)
    check('offline: a shared link /?r=<id> opens its route card', card)
  }

  await ctx.setOffline(false)
  // Back to the bare address: with `?r=` a card is open and the pill hidden.
  await page.goto(`${base}/`, { waitUntil: 'load' })
  await page.waitForTimeout(2000)
  check('back online: the notice is gone', (await page.locator('[data-testid="offline"]').count()) === 0)
  check('no "New version" button on an unchanged build', (await page.locator('[data-testid="update"]').count()) === 0)

  // Online but slow: the network does not answer within the worker's 3 s, the
  // stored copy is used, and the page must say so even though the phone
  // believes it is connected.
  const slow = async (route) => {
    await new Promise((r) => setTimeout(r, 6000))
    await route.continue().catch(() => {})
  }
  await ctx.route('**/data/map.json', slow)
  await page.reload({ waitUntil: 'load' })
  const slowPill = await page.getByText(new RegExp(`^${routeCount} routes?`)).waitFor({ timeout: 20000 }).then(() => true, () => false)
  const slowNotice = page.locator('[data-testid="offline"]')
  const slowOk = await slowNotice.waitFor({ timeout: 10000 }).then(() => true, () => false)
  const slowText = slowOk ? (await slowNotice.innerText()).trim() : '(none)'
  check(`slow network: the stored map shows with "Not refreshed · map as of ${expectedDate}"`, slowPill && slowText === `Not refreshed · map as of ${expectedDate}`, slowText)
  await ctx.unroute('**/data/map.json', slow)
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(2000)
  check('fast again: no notice', (await page.locator('[data-testid="offline"]').count()) === 0)

  // ------------------------------------------------------------ an update
  // A deploy changes sw.js. Stand in for one by changing a byte of the built
  // worker, then ask the browser to look: the new worker must wait, the page
  // must offer "New version · Reload", and the tap must bring the new one in.
  // The file is put back afterwards.
  const swFile = join(root, 'dist', 'sw.js')
  const swBefore = readFileSync(swFile, 'utf8')
  try {
    writeFileSync(swFile, swBefore + '\n// updated build\n')
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update())
    const offered = await page.locator('[data-testid="update"]').waitFor({ timeout: 15000 }).then(() => true, () => false)
    check('a changed worker is offered as "New version · Reload", not applied', offered)
    const stillOld = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      return !!reg?.waiting && !!navigator.serviceWorker.controller
    })
    check('the new worker waits while the old one keeps controlling the page', stillOld)
    if (offered) {
      await Promise.all([
        page.waitForEvent('load', { timeout: 15000 }).catch(() => {}),
        page.locator('[data-testid="update"]').click(),
      ])
      await page.waitForTimeout(1500)
      const after = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration()
        return { waiting: !!reg?.waiting, controlled: !!navigator.serviceWorker.controller, button: !!document.querySelector('[data-testid="update"]') }
      })
      check('tapping Reload brings the new worker in and the button goes', !after.waiting && after.controlled && !after.button, JSON.stringify(after))
    }
  } finally {
    writeFileSync(swFile, swBefore)
  }

  // --------------------------------------------------------- housekeeping
  check('no page errors', errors.length === 0, errors.join(' | '))
  check('no request to the database', supabase === 0)
  await ctx.close()
} finally {
  await browser.close()
  await server?.close()
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
