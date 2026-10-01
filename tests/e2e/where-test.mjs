// The LocatorButton on the public map (src/commuter/useLocator.ts,
// Locator.tsx, LocatorButton.tsx, LocatorIndicatorOverlay.tsx — the owner's
// 3870:5408 rules, 2026-10-01), driven by a pretend GPS. Playwright's
// geolocation emulation feeds the browser's own watchPosition, so the app's
// code path is the real one — except for the GPS that never has a fix, which
// stands in for navigator.geolocation itself, and the compass, a
// `deviceorientationabsolute` event sent as a phone's sensor would.
//
//   node tests/e2e/where-test.mjs                against http://localhost:5173
//   PARAPO_NO_TILES=1 node tests/e2e/where-test.mjs   no basemap tiles (a sandbox)
//   PARAPO_VIDEO=out/  node tests/e2e/where-test.mjs  also records the run as out/where-am-i.webm
//
// What it proves: the button shows LocationOff at the map's foot and
// there is no overlay until asked; asking shows the overlay at the fix over
// a circle the size of its accuracy, and brings the camera to it 200 m on the scale bar
// across, north up (TrackedLocation); a walk turns the beam its way and the
// camera follows; a drag lets go (TrackOwnLocation) and a tap comes back; the
// next tap tilts the camera, 200 m on the bar, turned the way the compass says
// (TracksTheMapBasedOnCompassFacing), and turns with it; the next puts north
// up again, and the next tilts again; an app camera move lets go; a browser
// that refuses says so; a GPS with no fix says so without a second watch;
// with no compass read, TrackedLocation's tap only comes back;
// and with a mouse there is no compass, the button sitting bottom right.
import { chromium } from 'playwright'
import { mkdirSync, renameSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { BASE, bareStyle, harness } from './lib/harness.mjs'

const NO_TILES = !!process.env.PARAPO_NO_TILES
const VIDEO = process.env.PARAPO_VIDEO

const { check, tally } = harness()

// Tala, on Quirino Highway. Metres to degrees at this latitude.
const P0 = { longitude: 121.0603, latitude: 14.7351 }
const M_LAT = 1 / 111_000
const M_LNG = 1 / (111_000 * Math.cos((P0.latitude * Math.PI) / 180))
const east = (p, m) => ({ longitude: p.longitude + m * M_LNG, latitude: p.latitude })
const north = (p, m) => ({ longitude: p.longitude, latitude: p.latitude + m * M_LAT })

const b = await chromium.launch()
const stubTiles = (page) => NO_TILES && bareStyle(page)
const open = async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
  await page.waitForTimeout(500)
}
const overlay = (page) => page.locator('[data-testid="locator-overlay"]')
const attr = async (page, name) => overlay(page).first().getAttribute(name)
const camera = (page) =>
  page.evaluate(() => {
    const m = window.__map
    const c = m.getCenter()
    return { longitude: c.lng, latitude: c.lat, zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing() }
  })
/** Where the fix is on the screen, against where the camera aims (the map's centre, offset clear of any card). */
const onScreen = (page, p) =>
  page.evaluate(([lng, lat]) => {
    const m = window.__map
    const at = m.project([lng, lat])
    const c = m.getContainer()
    return { x: at.x, y: at.y, w: c.clientWidth, h: c.clientHeight }
  }, [p.longitude, p.latitude])
const centred = async (page, p) => {
  const s = await onScreen(page, p)
  return Math.hypot(s.x - s.w / 2, s.y - s.h / 2)
}
/** The zoom at which the map's scale bar reads `metres` per 100 px here: the app's zoomForScale, worked out independently. */
const zoomFor = (page, metres) =>
  page.evaluate(([metres, lat]) => Math.log2((40075016.686 * Math.cos((lat * Math.PI) / 180) * 100) / (512 * metres)), [metres, P0.latitude])
const apart = (a, b) => Math.abs(((((a - b) % 360) + 540) % 360) - 180)
const until = async (cond, ms = 6000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await cond()) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return await cond()
}
/** A phone's compass, facing `heading`: Chrome's absolute orientation, alpha counter-clockwise from north. */
const face = (page, heading) =>
  page.evaluate((h) => {
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: (360 - h) % 360, beta: 0, gamma: 0, absolute: true }))
  }, heading)

// ---------------------------------------------------------- a granted visitor, on a phone
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
const mode = () => button.getAttribute('data-mode')
check(
  'the button is there, LocationOff, with no overlay on the map',
  (await button.getAttribute('data-state')) === 'off' && (await mode()) === 'LocationOff' && (await overlay(page).count()) === 0,
)
check('it says what it does', (await button.getAttribute('aria-label')) === 'Turn on my location')
const foot = await page.evaluate(() => {
  const b = document.querySelector('[data-testid="where"]').getBoundingClientRect()
  const m = window.__map.getContainer().getBoundingClientRect()
  return { below: m.bottom - b.bottom, right: m.right - b.right }
})
check('  at the map foot, bottom right, 12 in', Math.abs(foot.below - 12) <= 1 && Math.abs(foot.right - 12) <= 1, JSON.stringify(foot))

await button.click()
check('a tap shows the overlay', await until(async () => (await overlay(page).count()) === 1, 8000))
// Its moods (locatorMood.ts, the owner's ask of 2026-10-01): glad as the location comes.
const dotMood = () => overlay(page).locator('.locator-dot').first().getAttribute('data-mood')
check('  the dot glad as the location comes', (await dotMood()) === 'happy', `mood ${await dotMood()}`)
await page.waitForTimeout(1200)
check('  at 30 m accuracy', (await attr(page, 'data-accuracy-m')) === '30', `${await attr(page, 'data-accuracy-m')} m`)
// The map's own scale, measured: 100 m east of the fix on Web Mercator's
// sphere, projected. A constant here once agreed with the app's wrong one
// (the 256 px figure) and the halo was half its size unnoticed.
const measuredMpp = () =>
  page.evaluate(([lng, lat]) => {
    const east = 100 / (111319.49079 * Math.cos((lat * Math.PI) / 180))
    const a = window.__map.project([lng, lat]), b = window.__map.project([lng + east, lat])
    return 100 / Math.hypot(b.x - a.x, b.y - a.y)
  }, [P0.longitude, P0.latitude])
const haloPx = Number(await attr(page, 'data-halo-px'))
const mpp = await measuredMpp()
check('  its circle is the accuracy, 40 m at the least, in pixels at this zoom', Math.abs(haloPx - (2 * 40) / mpp) <= 3, `${haloPx} px for 80 m across, ${mpp.toFixed(2)} m/px`)
let cam = await camera(page)
const trackedZoom = await zoomFor(page, 200)
check('  the camera came to it from the city, further out than 2 km on the scale bar: in to 200 m, north up', (await centred(page, P0)) < 4 && Math.abs(cam.zoom - trackedZoom) < 0.05 && cam.pitch < 0.5 && Math.abs(cam.bearing) < 0.5, `${(await centred(page, P0)).toFixed(1)} px off, zoom ${cam.zoom.toFixed(2)} for ${trackedZoom.toFixed(2)}, pitch ${cam.pitch.toFixed(1)}, bearing ${cam.bearing.toFixed(1)}`)
check('  the button: TrackedLocation', (await mode()) === 'TrackedLocation' && (await button.getAttribute('data-state')) === 'on', `${await mode()}`)

// A walk east at 2 m/s: one fix a second.
let p = P0
for (let i = 1; i <= 4; i++) {
  p = east(P0, 2 * i)
  await ctx.setGeolocation({ ...p, accuracy: 10 })
  await page.waitForTimeout(1000)
}
check('a walk turns the beam its way (east)', await until(async () => apart(Number(await attr(page, 'data-heading')), 90) < 10), `heading ${await attr(page, 'data-heading')}`)
await page.waitForTimeout(700)
check('  and the camera follows', (await centred(page, p)) < 4, `${(await centred(page, p)).toFixed(1)} px off`)
await button.click()
await page.waitForTimeout(900)
check('with no compass read yet, a tap stays TrackedLocation, flat', (await mode()) === 'TrackedLocation' && (await camera(page)).pitch < 0.5, `${await mode()}, pitch ${(await camera(page)).pitch.toFixed(1)}`)
// That tap had a reaction: a boing, or now and then a huff (the owner, 2026-10-01).
const dotFace = () => overlay(page).locator('.locator-dot').first().getAttribute('data-face')
check('  and the dot reacts to it: a boing, or a huff', ['boing', 'huff'].includes(await dotFace()), `face ${await dotFace()}`)
// Three taps in a run: cross, scowling, for a few seconds; then over it.
// Taps as a thumb does, at its place: Playwright's click waits for the
// button to hold still, and its boing then stretches three over the 2 s.
const box = await button.boundingBox()
const t0 = Date.now()
for (let i = 0; i < 3; i++) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
const tapsTook = Date.now() - t0
check('three quick taps on the button: the dot is cross', await until(async () => (await dotMood()) === 'angry', 1500), `mood ${await dotMood()}; 3 taps in ${tapsTook} ms`)
// Over it in 3 s; left to itself it may glare a moment longer, a 5 s turn of its mood swings.
check('  and gets over it', await until(async () => (await dotMood()) !== 'angry', 9000), `mood ${await dotMood()}`)
// The dot itself takes a tap (the owner, 2026-10-01): the same reaction, and
// nothing else — the button's look and the camera stay as they were.
const beforePoke = { mode: await mode(), cam: await camera(page) }
// A real click at its centre; `force`, as it never holds still (it breathes, it may hop).
await overlay(page).locator('button.locator-dot').click({ force: true })
await page.waitForTimeout(300)
const afterPoke = await camera(page)
check(
  'a tap on the dot: a boing or a huff, the camera and the button as they were',
  ['boing', 'huff'].includes(await dotFace()) &&
    (await mode()) === beforePoke.mode &&
    Math.abs(afterPoke.zoom - beforePoke.cam.zoom) < 0.01 &&
    Math.abs(afterPoke.bearing - beforePoke.cam.bearing) < 0.5,
  `face ${await dotFace()}, ${beforePoke.mode} → ${await mode()}, zoom ${beforePoke.cam.zoom.toFixed(2)} → ${afterPoke.zoom.toFixed(2)}`,
)

// The visitor drags the map: it lets go. A tap comes back.
const dotBox = await overlay(page).locator('button.locator-dot').boundingBox()
const from = { x: dotBox.x + dotBox.width / 2, y: dotBox.y + dotBox.height / 2 }
await page.mouse.move(from.x, from.y)
await page.mouse.down()
await page.mouse.move(from.x - 75, from.y - 100, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(400)
// The drag starts on the visitor's dot, mid-screen: it pans all the same.
check('dragging the map, from the dot itself, lets go: TrackOwnLocation', (await mode()) === 'TrackOwnLocation', `${await mode()}`)
const dragged = await camera(page)
p = north(p, 20)
await ctx.setGeolocation({ ...p, accuracy: 10 })
await page.waitForTimeout(1200)
const after = await camera(page)
check('  a new fix moves the overlay, not the camera', Math.abs(after.longitude - dragged.longitude) < 1e-7 && Math.abs(after.latitude - dragged.latitude) < 1e-7 && (await overlay(page).count()) === 1)
// Google Maps' way (the owner's screenshots, 2026-10-01): the circle is the
// fix's metres, so zoomed out it shrinks under the dot and is gone.
await page.evaluate(() => window.__map.jumpTo({ zoom: 12 }))
await page.waitForTimeout(300)
check('  zoomed out till the dot covers its circle, the circle is gone', (await attr(page, 'data-halo-px')) === '0' && (await overlay(page).locator('[data-part="circle"]').count()) === 0, `${await attr(page, 'data-halo-px')} px`)
check('  and the dot and beam are drawn smaller, as Google Maps\' are', (await attr(page, 'data-scale')) === '0.54', `scale ${await attr(page, 'data-scale')}`)
// A fix indoors, 1 km out: the circle claims 80 m at most (the owner's call, 2026-10-01).
await page.evaluate(() => window.__map.jumpTo({ zoom: 16 }))
await ctx.setGeolocation({ ...p, accuracy: 1000 })
await page.waitForTimeout(1200)
const capMpp = await page.evaluate(([lng, lat]) => {
  const east = 100 / (111319.49079 * Math.cos((lat * Math.PI) / 180))
  const a = window.__map.project([lng, lat]), b = window.__map.project([lng + east, lat])
  return 100 / Math.hypot(b.x - a.x, b.y - a.y)
}, [p.longitude, p.latitude])
const capped = Number(await attr(page, 'data-halo-px'))
check('  a fix 1 km out draws an 80 m circle, no more', (await attr(page, 'data-accuracy-m')) === '1000' && Math.abs(capped - 160 / capMpp) <= 3, `${capped} px for 160 m across`)
// The phone's compass, facing east-south-east.
await face(page, 120)
await button.click()
await page.waitForTimeout(1200)
check('  a tap comes back: TrackedLocation, on the fix', (await mode()) === 'TrackedLocation' && (await centred(page, p)) < 4, `${await mode()}, ${(await centred(page, p)).toFixed(1)} px off`)
check('  at the zoom it was at, under 2 km on the scale bar: the height is the visitor\'s', Math.abs((await camera(page)).zoom - 16) < 0.05, `zoom ${(await camera(page)).zoom.toFixed(2)}`)
check('  its label offers the compass', (await button.getAttribute('aria-label')) === 'Turn the map the way I face')

await button.click()
await page.waitForTimeout(1200)
cam = await camera(page)
const compassZoom = await zoomFor(page, 200)
check('the next tap tilts the camera, 200 m on the scale bar, turned the way the phone faces', (await mode()) === 'TracksTheMapBasedOnCompassFacing' && Math.abs(cam.zoom - compassZoom) < 0.05 && Math.abs(cam.pitch - 45) < 0.5 && apart(cam.bearing, 120) < 1, `${await mode()}, zoom ${cam.zoom.toFixed(2)} for ${compassZoom.toFixed(2)}, pitch ${cam.pitch.toFixed(1)}, bearing ${cam.bearing.toFixed(1)}`)
check('  still on the fix', (await centred(page, p)) < 4, `${(await centred(page, p)).toFixed(1)} px off`)
check("  the overlay's heading is the compass's", apart(Number(await attr(page, 'data-heading')), 120) < 1, `${await attr(page, 'data-heading')}`)
await face(page, 200)
await page.waitForTimeout(800)
check('  and the camera turns with the phone', apart((await camera(page)).bearing, 200) < 1, `bearing ${(await camera(page)).bearing.toFixed(1)}`)
await face(page, 201)
await page.waitForTimeout(500)
check('  a shiver under 3° leaves it be', apart((await camera(page)).bearing, 200) < 0.5, `bearing ${(await camera(page)).bearing.toFixed(1)}`)

await button.click()
await page.waitForTimeout(1200)
cam = await camera(page)
check('the next tap puts north up again: TrackedLocation at the zoom it had, flat', (await mode()) === 'TrackedLocation' && Math.abs(cam.zoom - 16) < 0.05 && cam.pitch < 0.5 && Math.abs(cam.bearing) < 0.5, `${await mode()}, zoom ${cam.zoom.toFixed(2)}, pitch ${cam.pitch.toFixed(1)}, bearing ${cam.bearing.toFixed(1)}`)
check("  its arrow turned the way the phone faces", /rotate:\s*200deg/.test((await button.locator('svg').first().getAttribute('style')) ?? ''), `${await button.locator('svg').first().getAttribute('style')}`)
await button.click()
await page.waitForTimeout(1200)
check('  and the next tilts again', (await mode()) === 'TracksTheMapBasedOnCompassFacing' && Math.abs((await camera(page)).pitch - 45) < 0.5, `${await mode()}`)

// The app moves the camera for the visitor (a hintuan picked, an end tapped:
// shared/map/MapView.tsx APP_MOVE). That lets go too, or the next fix undoes it.
const away = north(p, 400)
await page.evaluate((c) => window.__map.easeTo({ center: [c.longitude, c.latitude], duration: 0 }, { appMove: true }), away)
await page.waitForTimeout(300)
check('an app camera move lets go: TrackOwnLocation', (await mode()) === 'TrackOwnLocation', `${await mode()}`)
const moved = await camera(page)
p = north(p, 20)
await ctx.setGeolocation({ ...p, accuracy: 10 })
await page.waitForTimeout(1200)
const kept = await camera(page)
check('  and the next fix leaves the camera where the app put it', Math.abs(kept.latitude - moved.latitude) < 1e-7, `${((kept.latitude - moved.latitude) / M_LAT).toFixed(1)} m moved`)
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
check('a browser that refuses: a note above the button, and no overlay', await until(async () => (await note.count()) === 1, 8000) && (await overlay(page2).count()) === 0, (await note.count()) ? await note.innerText() : 'no note')
check('  the button stays LocationOff, to try after the setting changes', (await page2.locator('[data-testid="where"]').getAttribute('data-state')) === 'denied' && (await page2.locator('[data-testid="where"]').getAttribute('data-mode')) === 'LocationOff')
await ctx2.close()

// ---------------------------------------------------------- no fix, ever
// A GPS that only times out: navigator.geolocation stood in for (Playwright
// cannot make the real one time out), its watch answering TIMEOUT every
// second and never a position. A note, and the watch kept: a second tap
// starts no second one.
const ctx3 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page3 = await ctx3.newPage()
await page3.addInitScript(() => {
  let n = 0
  const timers = new Map()
  const geo = {
    watchPosition: (_ok, fail) => {
      const id = ++n
      timers.set(id, setInterval(() => fail({ code: 3, message: 'Timeout expired', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }), 1000))
      window.__watches = timers.size
      return id
    },
    clearWatch: (id) => { clearInterval(timers.get(id)); timers.delete(id); window.__watches = timers.size },
    getCurrentPosition: () => {},
  }
  Object.defineProperty(navigator, 'geolocation', { get: () => geo })
})
await stubTiles(page3)
await open(page3)
const where3 = page3.locator('[data-testid="where"]')
await where3.click()
const note3 = page3.locator('[data-testid="where-note"]')
check('a GPS that only times out: a note, still asking, LocationOff', await until(async () => (await note3.count()) === 1, 8000) && (await where3.getAttribute('data-state')) === 'asking' && (await where3.getAttribute('data-mode')) === 'LocationOff', `${await where3.getAttribute('data-state')}; ${(await note3.count()) ? await note3.innerText() : 'no note'}`)
await where3.click()
await page3.waitForTimeout(300)
check('  a second tap starts no second watch', (await page3.evaluate(() => window.__watches)) === 1, `${await page3.evaluate(() => window.__watches)} watch(es)`)
await ctx3.close()

// ---------------------------------------------------------- a mouse: no compass
const ctx4 = await b.newContext({ viewport: { width: 1280, height: 800 }, geolocation: { ...P0, accuracy: 20 }, permissions: ['geolocation'] })
const page4 = await ctx4.newPage()
await stubTiles(page4)
await open(page4)
const where4 = page4.locator('[data-testid="where"]')
const corner = await page4.evaluate(() => {
  const b = document.querySelector('[data-testid="where"]').getBoundingClientRect()
  const m = window.__map.getContainer().getBoundingClientRect()
  return { below: m.bottom - b.bottom, right: m.right - b.right }
})
check('with a mouse: bottom right, clear of the credit line', Math.abs(corner.below - 40) <= 1 && Math.abs(corner.right - 12) <= 1, JSON.stringify(corner))
await where4.click()
await until(async () => (await where4.getAttribute('data-mode')) === 'TrackedLocation', 8000)
await page4.waitForTimeout(1000)
check('  a tap comes to the visitor: TrackedLocation', (await where4.getAttribute('data-mode')) === 'TrackedLocation')
check('  its label says so, no compass offered', (await where4.getAttribute('aria-label')) === 'Show where I am')
await where4.click()
await page4.waitForTimeout(1000)
const flat = await page4.evaluate(() => window.__map.getPitch())
check('  the next tap stays TrackedLocation, flat: no compass to turn by', (await where4.getAttribute('data-mode')) === 'TrackedLocation' && flat < 0.5, `${await where4.getAttribute('data-mode')}, pitch ${flat.toFixed(1)}`)
await ctx4.close()

await b.close()
tally()
