// Screens for UX research: the public map and the studio, phone and desktop.
//
//   npm run dev                                  (in another terminal, on :5173)
//   node scripts/research/shots.mjs [outDir]     (default ./research-shots)
//
// Reads today's published file for a route and a hintuan to open, so nothing
// here is hard-coded about the data. Each screen waits real time for tiles.
// Uses window.__map, which only development builds expose.
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const BASE = (process.env.PARAPO_BASE ?? 'http://localhost:5173').replace(/\/$/, '')
const OUT = resolve(process.argv[2] ?? 'research-shots')
mkdirSync(OUT, { recursive: true })

const file = JSON.parse(readFileSync(new URL('../../public/data/map.json', import.meta.url), 'utf8'))
const routeId = file.variants[0]?.id
const stop = file.stops.find((s) => s.kind === 'hintuan') ?? file.stops[0]

const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
const desk = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch()

async function shot(ctxOpts, url, name, { before, after } = {}) {
  const ctx = await browser.newContext(ctxOpts)
  const page = await ctx.newPage()
  try {
    if (before) await before(page)
    await page.goto(BASE + url)
    await page.waitForFunction(() => window.__map?.loaded?.(), null, { timeout: 30000 }).catch(() => {})
    await wait(6000)
    if (after) await after(page)
    await page.screenshot({ path: join(OUT, name + '.png') })
    console.log('ok  ', name)
  } catch (e) {
    console.log('FAIL', name, e.message.split('\n')[0])
  } finally {
    await ctx.close()
  }
}

const tapHandle = async (p) => {
  await p.locator('[data-testid="sheet-handle"]').first().tap()
  await wait(1500)
}

/** Centre the map on the hintuan's box and tap its middle. Near a line this opens the chooser. */
const tapStop = async (p) => {
  const ring = stop.area.coordinates[0]
  const c = [ring.reduce((a, q) => a + q[0], 0) / ring.length, ring.reduce((a, q) => a + q[1], 0) / ring.length]
  await p.evaluate((c) => window.__map.jumpTo({ center: c, zoom: 17 }), c)
  await wait(3000)
  const pt = await p.evaluate((c) => window.__map.project(c), c)
  await p.touchscreen.tap(pt.x, pt.y)
  await wait(1500)
}

await shot(phone, '/', '01-phone-map')
if (routeId) {
  await shot(phone, `/?r=${routeId}`, '02-phone-route-peek')
  await shot(phone, `/?r=${routeId}`, '03-phone-route-open', { after: tapHandle })
}
if (stop) {
  await shot(phone, '/', '04-phone-chooser', { after: tapStop })
  await shot(phone, '/', '04b-phone-hotspot', {
    after: async (p) => {
      await tapStop(p)
      const item = p.locator('[data-testid="chooser-item"]')
      if (await item.count()) await item.first().tap()
      await wait(1500)
    },
  })
}
await shot(phone, '/', '05-phone-load-error', { before: (p) => p.route('**/data/map.json*', (r) => r.abort()) })
await shot(desk, '/', '06-desktop-map')
if (routeId) await shot(desk, `/?r=${routeId}`, '07-desktop-route')
await shot(desk, '/studio/', '08-studio-signin')
await shot(desk, '/studio/?e2e=1', '09-studio-editor')

await browser.close()
