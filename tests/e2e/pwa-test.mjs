// The installable app, checked against the production build in `vite preview`
// (the service worker is off under `npm run dev`). Run `npm run build` first.
//
//   node tests/e2e/pwa-test.mjs
//
// Starts its own preview server on :4173 (or uses PARAPO_BASE), then:
//   - the manifest is served, valid, and names Para Po with its three icons
//   - the service worker registers on / and controls the page; /studio/ in a
//     fresh browser registers nothing and links no manifest
//   - the map file and the basemap are cached on the first visit
//   - offline: a reload of / still shows the routes and hotspots, the map
//     draws, and the notice says "Offline · map as of <date>"
//   - back online the notice goes; a changed worker (a deploy) is offered as
//     "Update Para Po!" and waits until tapped
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
const published = JSON.parse(readFileSync(join(root, 'public', 'data', 'index.v4.json'), 'utf8'))
/** One past the shape this app reads (src/commuter/mapFile.ts, MAP_FILE_SCHEMA). */
const MAP_FILE_SCHEMA_NEXT = published.schema + 1
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const d = new Date(published.published_at)
const expectedDate = `${d.getDate()} ${MONTHS[d.getMonth()]}`
const routeCount = published.variants.length

/**
 * The basemap's tiles in on page `p`, as a production build shows it (it
 * keeps its map to itself): the map's 'load', which MapLibre fires once
 * every tile in view has come, and which brings MapView's design button
 * (BasemapControl, data-testid="basemap"; framing-test holds it to the
 * 'load'); no failure banner, which a tile that fails before it shows in
 * the button's place; and "Loading map…" gone. The text alone no longer
 * says so: since the owner's answer to question A of the cheap-phone
 * report (2026-10-06) it goes with the first frame that draws the routes,
 * which come from the map file, before the basemap's tiles.
 */
const basemapIn = (p) =>
  p.waitForFunction(
    () => {
      const text = document.body.innerText
      return !!document.querySelector('[data-testid="basemap"]') && !text.includes('The map failed to load') && !text.includes('Loading map…')
    },
    null,
    { timeout: 30000 },
  )

let server = null
let base = process.env.PARAPO_BASE
if (!base) {
  const { preview } = await import('vite')
  server = await preview({ preview: { port: 4173, strictPort: true }, logLevel: 'silent' })
  base = server.resolvedUrls.local[0].replace(/\/$/, '')
}
console.log(`preview at ${base}`)

/**
 * Opens a trip as a visitor does, by a tap on its line. A production build
 * keeps its map to itself (no window.__map) and trip links went on
 * 2026-10-03, so the line is found on a screenshot: a pixel in the colour
 * routes rest in (Map/RouteLine/surface-default, #8ec5ff), away from the
 * screen's edges. A tap there opens a trip, or the route list where routes
 * share the road, whose first row then opens one. The directions it may be,
 * with its name: the row's own when the list was used, else every direction
 * of that name (a via is not in a name, so two can share one). Null when no
 * trip opened. Through the list the check is weaker than the link it
 * replaced: the list lights, and so reads, every line it lists.
 */
async function openSomeTrip(page) {
  let at = null
  for (let i = 0; i < 10 && !at; i++) {
    const shot = (await page.screenshot()).toString('base64')
    at = await page.evaluate(async (b64) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
      const c = new OffscreenCanvas(img.width, img.height)
      const g = c.getContext('2d')
      g.drawImage(img, 0, 0)
      const { data, width, height } = g.getImageData(0, 0, img.width, img.height)
      const scale = img.width / window.innerWidth
      const hits = []
      for (let y = Math.round(height * 0.15); y < height * 0.7; y += 2)
        for (let x = Math.round(width * 0.1); x < width * 0.9; x += 2) {
          const k = (y * width + x) * 4
          if (Math.abs(data[k] - 0x8e) + Math.abs(data[k + 1] - 0xc5) + Math.abs(data[k + 2] - 0xff) < 12) hits.push([x / scale, y / scale])
        }
      return hits.length ? hits[Math.floor(hits.length / 2)] : null
    }, shot)
    if (!at) await page.waitForTimeout(500)
  }
  if (!at) return null
  await page.touchscreen.tap(at[0], at[1])
  const trip = page.locator('[data-testid="card"]:not([hidden]) [data-testid="trip"]')
  // A route's row (a hotspot under the tap is a row of the list too, without a direction).
  const row = page.locator('[data-testid="chooser"] button[data-testid="chooser-item"][data-direction]')
  await Promise.race([trip.first().waitFor({ timeout: 10000 }), row.first().waitFor({ timeout: 10000 })]).catch(() => {})
  let viaList = null
  if (!(await trip.count()) && (await row.count())) {
    viaList = await row.first().getAttribute('data-direction')
    await row.first().tap()
    await trip.first().waitFor({ timeout: 10000 }).catch(() => {})
  }
  if (!(await trip.count())) return null
  const label = await page.locator('[data-testid="card"]:not([hidden])').filter({ has: page.locator('[data-testid="trip"]') }).first().getAttribute('aria-label')
  const ids = viaList ? [viaList] : published.variants.filter((v) => v.direction_name === label).map((v) => v.id)
  return ids.length ? { ids, name: label } : null
}

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
  // The page as served starts in the brand colour the manifest carries; once
  // the map is up, the status bar takes the map's background (statusBar.ts).
  const served = await page.evaluate(async () => (await (await fetch('/')).text()).match(/<meta name="theme-color" content="([^"]+)"/)?.[1] ?? null)
  check('theme-color meta matches the manifest, as served', served === manifest?.theme_color, `${served} vs ${manifest?.theme_color}`)
  // A production build keeps the map to itself: the bar leaving the brand
  // colour for another is the map's background taking it.
  const bar = await page
    .waitForFunction(
      (brand) => {
        const meta = document.querySelector('meta[name="theme-color"]')?.getAttribute('content')
        return !!meta && meta !== brand ? meta : false
      },
      manifest?.theme_color,
      { timeout: 20000 },
    )
    .then((h) => h.jsonValue())
    .catch(() => null)
  check("once the map is up, the status bar wears the map's background", !!bar, String(bar))

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

  // Wait for the routes and the basemap, so both reach the caches. The page
  // says how many directions its map file brought (`data-directions`): the
  // count pill that showed it went on 2026-09-29, the owner's "annoying for
  // users".
  const arrived = page.locator(`[data-directions="${routeCount}"]`)
  const online = await arrived.waitFor({ state: 'attached', timeout: 20000 }).then(() => true, () => false)
  check(`online: the published map's ${routeCount} directions arrive`, online)
  await page.waitForSelector('canvas.maplibregl-canvas', { timeout: 20000 })
  await basemapIn(page)
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
  check('map-file cache holds /data/index.v4.json', !!mapFile && caches[mapFile].some((u) => u.endsWith('/data/index.v4.json')))
  check('basemap-meta holds the style and the TileJSON', !!meta && caches[meta].some((u) => u.endsWith('/styles/positron')) && caches[meta].some((u) => u.endsWith('/planet')))
  check(`basemap-tiles holds tiles (${tiles ? caches[tiles].length : 0})`, !!tiles && caches[tiles].length > 0)
  check('precache holds no studio chunk', !!precache && !caches[precache].some((u) => /\/assets\/studio-/.test(u)))
  check('the index and the lines are never precached', !precache || !caches[precache].some((u) => u.includes('/data/')))

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
    ['/data/index.v4.json', '"published_at"', null],
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
  await arrived.waitFor({ state: 'attached', timeout: 20000 })

  // Now with no network at all: the phone keeps everything it needs.
  await ctx.setOffline(true)
  let tilesFromWorker = 0
  const countTiles = (res) => {
    if (/\.(pbf|png)$/.test(res.url()) && res.fromServiceWorker()) tilesFromWorker++
  }
  page.on('response', countTiles)
  await page.reload({ waitUntil: 'load' }).catch(() => {})
  const offlineOk = await arrived.waitFor({ state: 'attached', timeout: 20000 }).then(() => true, () => false)
  check(`offline: reload of / still shows the routes (${routeCount})`, offlineOk)
  const notice = page.locator('[data-testid="offline"]')
  const noticeOk = await notice.waitFor({ timeout: 10000 }).then(() => true, () => false)
  const noticeText = noticeOk ? (await notice.innerText()).trim() : '(none)'
  check(`offline: notice reads "Offline · map as of ${expectedDate}"`, noticeText === `Offline · map as of ${expectedDate}`, noticeText)
  const drew = await basemapIn(page).then(() => true, () => false)
  check('offline: the basemap draws: its tiles in, the map\'s \'load\' bringing the design button (no failure banner, no "Loading map…")', drew)
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

  await ctx.setOffline(false)
  // Back to the bare address, with no card open.
  await page.goto(`${base}/`, { waitUntil: 'load' })
  await page.waitForTimeout(2000)
  check('back online: the notice is gone', (await page.locator('[data-testid="offline"]').count()) === 0)
  check('no "Update Para Po!" button on an unchanged build', (await page.locator('[data-testid="update"]').count()) === 0)

  // Online but slow: the network does not answer within the worker's 3 s, the
  // stored copy is used, and the page must say so even though the phone
  // believes it is connected.
  const slow = async (route) => {
    await new Promise((r) => setTimeout(r, 6000))
    await route.continue().catch(() => {})
  }
  await ctx.route('**/data/index.v4.json', slow)
  await page.reload({ waitUntil: 'load' })
  const slowMap = await arrived.waitFor({ state: 'attached', timeout: 20000 }).then(() => true, () => false)
  const slowNotice = page.locator('[data-testid="offline"]')
  const slowOk = await slowNotice.waitFor({ timeout: 10000 }).then(() => true, () => false)
  const slowText = slowOk ? (await slowNotice.innerText()).trim() : '(none)'
  check(`slow network: the stored map shows with "Not refreshed · map as of ${expectedDate}"`, slowMap && slowText === `Not refreshed · map as of ${expectedDate}`, slowText)
  await ctx.unroute('**/data/index.v4.json', slow)
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(2000)
  check('fast again: no notice', (await page.locator('[data-testid="offline"]').count()) === 0)

  // A trip opened reads its direction's full line, and the worker keeps it.
  // Opened by a tap, as a visitor opens one: trip links (?r=<id>) went on
  // 2026-10-03.
  const opened = await openSomeTrip(page)
  if (!opened) check('an opened trip reads its full line, and the worker keeps it', false, 'no trip opened: no route line found on the screen to tap')
  else {
    await page.waitForTimeout(2500)
    const kept = await page.evaluate(async (ids) => {
      const name = (await window.caches.keys()).find((n) => n.includes('map-lines'))
      return !!name && (await (await window.caches.open(name)).keys()).some((r) => ids.some((id) => r.url.endsWith(`/data/lines/${id}.json`)))
    }, opened.ids)
    check('an opened trip reads its full line, and the worker keeps it', kept, `"${opened.name}"`)
  }
  await page.goto(`${base}/`, { waitUntil: 'load' })
  await page.waitForTimeout(1000)

  // A map published for a newer app: the banner says so and offers Reload,
  // which goes through the worker (pwa.ts, reloadForNewerApp) and, with no
  // newer app waiting, reloads — here onto a map this app reads again.
  const newer = (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...published, schema: MAP_FILE_SCHEMA_NEXT }) })
  await ctx.route('**/data/index.v4.json', newer)
  await page.reload({ waitUntil: 'load' })
  const banner = page.getByText('This map was published for a newer version of the app.')
  const bannerShown = await banner.waitFor({ timeout: 15000 }).then(() => true, () => false)
  check('a map published for a newer app: the banner says so, with Reload', bannerShown && (await page.getByRole('button', { name: 'Reload', exact: true }).count()) > 0)
  await ctx.unroute('**/data/index.v4.json', newer)
  if (bannerShown) {
    await Promise.all([
      page.waitForEvent('load', { timeout: 20000 }).catch(() => {}),
      page.getByRole('button', { name: 'Reload', exact: true }).first().click(),
    ])
    const back = await arrived.waitFor({ state: 'attached', timeout: 20000 }).then(() => true, () => false)
    check('  its Reload reloads, and a map this app reads draws again', back && (await banner.count()) === 0)
  }

  // ------------------------------------------------------------ an update
  // A deploy changes sw.js. Stand in for one by changing a byte of the built
  // worker, then ask the browser to look: the new worker must wait, the page
  // must offer "Update Para Po!", and the tap must bring the new one in.
  // The file is put back afterwards.
  const swFile = join(root, 'dist', 'sw.js')
  const swBefore = readFileSync(swFile, 'utf8')
  try {
    writeFileSync(swFile, swBefore + '\n// updated build\n')
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update())
    const offered = await page.locator('[data-testid="update"]').waitFor({ timeout: 15000 }).then(() => true, () => false)
    check('a changed worker is offered as "Update Para Po!", not applied', offered)
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
