// "Where am I" on the public map: the walking figure that stands for the
// visitor (src/commuter/whereAmI.ts, Walker.tsx, WhereAmI.tsx), driven by a
// pretend GPS. Playwright's geolocation emulation feeds the browser's own
// watchPosition, so the app's code path is the real one.
//
//   node scripts/pw/where-test.mjs                against http://localhost:5173
//   PARAPO_NO_TILES=1 node scripts/pw/where-test.mjs   no basemap tiles (a sandbox)
//   PARAPO_VIDEO=out/  node scripts/pw/where-test.mjs  also records the run as out/where-am-i.webm
//
// What it proves: the button is off and there is no figure until asked;
// asking shows the figure at the fix, standing, over a halo the size of
// the fix's accuracy, and brings the map to it; a walk turns the figure
// to walk facing the way it goes; jeep speed makes it fly; the map follows
// until the visitor drags it, and a tap follows again; a second tap while
// following turns it off; a browser that refuses says so under the button.
import { chromium } from 'playwright'
import { mkdirSync, renameSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = (process.env.PARAPO_BASE ?? 'http://localhost:5173').replace(/\/$/, '')
const NO_TILES = !!process.env.PARAPO_NO_TILES
const VIDEO = process.env.PARAPO_VIDEO

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

// Tala, on Quirino Highway. Metres to degrees at this latitude.
const P0 = { longitude: 121.0603, latitude: 14.7351 }
const M_LAT = 1 / 111_000
const M_LNG = 1 / (111_000 * Math.cos((P0.latitude * Math.PI) / 180))
const east = (p, m) => ({ longitude: p.longitude + m * M_LNG, latitude: p.latitude })
const north = (p, m) => ({ longitude: p.longitude, latitude: p.latitude + m * M_LAT })

const b = await chromium.launch()
const stubTiles = (page) =>
  NO_TILES &&
  page.route(/tiles\.openfreemap\.org/, (route) =>
    /\/styles\//.test(route.request().url())
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eeeeee' } }] }),
        })
      : route.fulfill({ status: 404, body: '' }),
  )
const open = async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
  await page.waitForTimeout(500)
}
const walker = (page) => page.locator('[data-testid="walker"]')
const attr = async (page, name) => walker(page).first().getAttribute(name)
const centre = (page) =>
  page.evaluate(() => {
    const c = window.__map.getCenter()
    return { longitude: c.lng, latitude: c.lat }
  })
const metresApart = (a, b) => {
  const r = Math.PI / 180
  const x = (b.longitude - a.longitude) * r * Math.cos(((a.latitude + b.latitude) / 2) * r)
  const y = (b.latitude - a.latitude) * r
  return Math.sqrt(x * x + y * y) * 6_371_000
}
const until = async (cond, ms = 6000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await cond()) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return await cond()
}

// ---------------------------------------------------------- a granted visitor
if (VIDEO) mkdirSync(VIDEO, { recursive: true })
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  geolocation: { ...P0, accuracy: 30 },
  permissions: ['geolocation'],
  ...(VIDEO ? { recordVideo: { dir: VIDEO, size: { width: 390, height: 844 } } } : {}),
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await stubTiles(page)
await open(page)

const button = page.locator('[data-testid="where"]')
check('the button is there, off, with no figure on the map', (await button.getAttribute('data-state')) === 'off' && (await walker(page).count()) === 0)
check('it says what it does', (await button.getAttribute('aria-label')) === 'Where am I')

await button.click()
check('a tap shows the figure', await until(async () => (await walker(page).count()) === 1, 8000))
await page.waitForTimeout(900)
check('  standing, at 30 m accuracy', (await attr(page, 'data-pose')) === 'standing' && (await attr(page, 'data-accuracy-m')) === '30', `${await attr(page, 'data-pose')}, ${await attr(page, 'data-accuracy-m')} m`)
const zoom = await page.evaluate(() => window.__map.getZoom())
const mpp = (156543.03392 * Math.cos((P0.latitude * Math.PI) / 180)) / 2 ** zoom
const haloPx = Number(await attr(page, 'data-halo-px'))
// Never smaller than 28 px: at zoom 15 a pixel is 4.6 m, and 60 m would be a dot under the feet.
check('  the halo is the accuracy in pixels at this zoom, 28 at least', Math.abs(haloPx - Math.max(28, (2 * 30) / mpp)) <= 3, `${haloPx} px for 60 m at zoom ${zoom.toFixed(1)}`)
await page.evaluate(() => window.__map.zoomTo(18, { duration: 0 }))
await page.waitForTimeout(300)
const haloAt18 = Number(await attr(page, 'data-halo-px'))
const mpp18 = (156543.03392 * Math.cos((P0.latitude * Math.PI) / 180)) / 2 ** 18
check('  and grows with the zoom', Math.abs(haloAt18 - (2 * 30) / mpp18) <= 3, `${haloAt18} px at zoom 18, expected ${((2 * 30) / mpp18).toFixed(0)}`)
await page.evaluate(() => window.__map.zoomTo(15, { duration: 0 }))
await page.waitForTimeout(300)
check('  the map came to it, close enough to see the street', metresApart(await centre(page), P0) < 5 && zoom >= 15, `${metresApart(await centre(page), P0).toFixed(1)} m off, zoom ${zoom.toFixed(1)}`)
check('  the button shows it is following', (await button.getAttribute('data-state')) === 'following')

// A walk east at 2 m/s: one fix a second.
let p = P0
for (let i = 1; i <= 4; i++) {
  p = east(P0, 2 * i)
  await ctx.setGeolocation({ ...p, accuracy: 10 })
  await page.waitForTimeout(1000)
}
check('a walk makes the figure walk', await until(async () => (await attr(page, 'data-pose')) === 'walking'), `pose ${await attr(page, 'data-pose')}`)
check('  facing the way it goes (east: right)', (await attr(page, 'data-facing')) === 'right', `facing ${await attr(page, 'data-facing')}`)
await page.waitForTimeout(700)
check('  and the map follows', metresApart(await centre(page), p) < 5, `${metresApart(await centre(page), p).toFixed(1)} m off`)
const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.walker-figure')).animationName)
check('  the walk cycle runs (a CSS animation, not the map)', anim === 'walker-step', anim)

// Jeep speed north: 20 m/s.
const q0 = p
for (let i = 1; i <= 4; i++) {
  p = north(q0, 20 * i)
  await ctx.setGeolocation({ ...p, accuracy: 10 })
  await page.waitForTimeout(1000)
}
check('jeep speed makes the figure fly', await until(async () => (await attr(page, 'data-pose')) === 'flying'), `pose ${await attr(page, 'data-pose')}`)
check('  heading north, drawn from its right side', (await attr(page, 'data-facing')) === 'up' && (await attr(page, 'data-side')) === 'right', `facing ${await attr(page, 'data-facing')}, side ${await attr(page, 'data-side')}`)
const flyBg = await page.evaluate(() => getComputedStyle(document.querySelector('.walker-figure')).backgroundImage)
check('  with the flying frame', /flying@2x\.png/.test(flyBg), flyBg.slice(0, 60))

// The visitor drags the map: it stops following. A tap follows again.
const box = await page.locator('canvas').first().boundingBox()
await page.mouse.move(box.x + 195, box.y + 500)
await page.mouse.down()
await page.mouse.move(box.x + 100, box.y + 300, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(400)
check('dragging the map lets go', (await button.getAttribute('data-state')) === 'on', `state ${await button.getAttribute('data-state')}`)
const dragged = await centre(page)
p = north(p, 20)
await ctx.setGeolocation({ ...p, accuracy: 10 })
await page.waitForTimeout(1200)
check('  a new fix moves the figure, not the map', metresApart(await centre(page), dragged) < 2 && (await walker(page).count()) === 1, `${metresApart(await centre(page), dragged).toFixed(1)} m moved`)
await button.click()
await page.waitForTimeout(900)
check('  a tap follows again', (await button.getAttribute('data-state')) === 'following' && metresApart(await centre(page), p) < 5, `${metresApart(await centre(page), p).toFixed(1)} m off`)

await button.click()
await page.waitForTimeout(300)
check('a tap while following turns it off: no figure, button off', (await walker(page).count()) === 0 && (await button.getAttribute('data-state')) === 'off')
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
await page.close()
await ctx.close()
if (VIDEO) {
  const made = readdirSync(VIDEO).filter((f) => f.endsWith('.webm')).map((f) => join(VIDEO, f))
  if (made.length) renameSync(made[made.length - 1], join(VIDEO, 'where-am-i.webm'))
}

// ---------------------------------------------------------- a refusing browser
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page2 = await ctx2.newPage()
await stubTiles(page2)
await open(page2)
await page2.locator('[data-testid="where"]').click()
const note = page2.locator('[data-testid="where-note"]')
check('a browser that refuses: a note under the button, and no figure', await until(async () => (await note.count()) === 1, 8000) && (await walker(page2).count()) === 0, (await note.count()) ? await note.innerText() : 'no note')
check('  the button is plain again, to try after the setting changes', (await page2.locator('[data-testid="where"]').getAttribute('data-state')) === 'denied')
await ctx2.close()

await b.close()
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
