// The LocatorButton on the public map (src/features/locator/use-locator.ts,
// locator-rules.ts, locator.tsx, locator-button.tsx,
// locator-indicator-overlay.tsx, locator-on-map.tsx — the owner's 3870:5408
// rules, 2026-10-01), driven by a pretend GPS. Playwright's
// geolocation emulation feeds the browser's own watchPosition, so the app's
// code path is the real one — except for the GPS that never has a fix, which
// stands in for navigator.geolocation itself, and the compass, a
// `deviceorientationabsolute` event sent as a phone's sensor would.
//
//   node tests/e2e/where-test.mjs                against http://localhost:5173
//   PARA_NO_TILES=1 node tests/e2e/where-test.mjs   no basemap tiles (a sandbox)
//   PARA_VIDEO=out/  node tests/e2e/where-test.mjs  also records the run as out/where-am-i.webm
//
// What it proves: the button shows LocationOff at the map's foot and
// there is no overlay until asked; asking shows the overlay at the fix over
// a circle the size of its accuracy, and brings the camera to it 200 m on the scale bar
// across, north up (TrackedLocation); a walk turns the beam its way and the
// camera follows; a drag lets go (TrackOwnLocation) and a tap comes back; the
// next tap tilts the camera, 200 m on the bar, turned the way the compass says
// (TracksTheMapBasedOnCompassFacing), and turns with it; the next puts north
// up again, and the next tilts again; an app camera move lets go; a route
// tapped draws the dot's gaze, and the card it opened set to another height
// while the camera follows keeps the camera on the commuter; a browser
// that refuses says so; a GPS with no fix says so without a second watch;
// with no compass read, TrackedLocation's tap only comes back;
// and with a mouse there is no compass, the button sitting bottom right.
import { chromium } from 'playwright';
import { mkdirSync, renameSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, bareStyle, cardsSettled, harness, mapIdle } from './lib/harness.mjs';

const NO_TILES = !!process.env.PARA_NO_TILES;
const VIDEO = process.env.PARA_VIDEO;

const { check, tally } = harness();

// Tala, on Quirino Highway. Metres to degrees at this latitude.
const P0 = { longitude: 121.0603, latitude: 14.7351 };
const M_LAT = 1 / 111_000;
const M_LNG = 1 / (111_000 * Math.cos((P0.latitude * Math.PI) / 180));
const east = (p, m) => ({ longitude: p.longitude + m * M_LNG, latitude: p.latitude });
const north = (p, m) => ({ longitude: p.longitude, latitude: p.latitude + m * M_LAT });

const b = await chromium.launch();
const stubTiles = (page) => NO_TILES && bareStyle(page);
const open = async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 });
  await mapIdle(page);
};
const overlay = (page) => page.locator('[data-testid="locator-overlay"]');
const attr = async (page, name) => overlay(page).first().getAttribute(name);
const camera = (page) =>
  page.evaluate(() => {
    const m = window.__map;
    const c = m.getCenter();
    return {
      longitude: c.lng,
      latitude: c.lat,
      zoom: m.getZoom(),
      pitch: m.getPitch(),
      bearing: m.getBearing(),
    };
  });
/** Where the fix is on the screen, against where the camera aims (the map's centre, offset clear of any card). */
const onScreen = (page, p) =>
  page.evaluate(
    ([lng, lat]) => {
      const m = window.__map;
      const at = m.project([lng, lat]);
      const c = m.getContainer();
      return { x: at.x, y: at.y, w: c.clientWidth, h: c.clientHeight };
    },
    [p.longitude, p.latitude],
  );
/** Whether the overlay sits on fix `p`, as the map draws it there: the fix has come in. */
const overlayOn = async (page, p) => {
  const box = await overlay(page)
    .first()
    .boundingBox()
    .catch(() => null);
  if (!box) return false;
  const at = await page.evaluate(
    ([lng, lat]) => {
      const q = window.__map.project([lng, lat]);
      const r = window.__map.getContainer().getBoundingClientRect();
      return { x: r.left + q.x, y: r.top + q.y };
    },
    [p.longitude, p.latitude],
  );
  return Math.hypot(box.x + box.width / 2 - at.x, box.y + box.height / 2 - at.y) < 4;
};
const centred = async (page, p) => {
  const s = await onScreen(page, p);
  return Math.hypot(s.x - s.w / 2, s.y - s.h / 2);
};
/** The zoom at which the map's scale bar reads `metres` per 100 px here: the app's zoomForScale, worked out independently. */
const zoomFor = (page, metres) =>
  page.evaluate(
    ([metres, lat]) =>
      Math.log2((40075016.686 * Math.cos((lat * Math.PI) / 180) * 100) / (512 * metres)),
    [metres, P0.latitude],
  );
const apart = (a, b) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);
const until = async (cond, ms = 6000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return await cond();
};
/** A phone's compass, facing `heading`: Chrome's absolute orientation, alpha counter-clockwise from north. */
const face = (page, heading) =>
  page.evaluate((h) => {
    window.dispatchEvent(
      new DeviceOrientationEvent('deviceorientationabsolute', {
        alpha: (360 - h) % 360,
        beta: 0,
        gamma: 0,
        absolute: true,
      }),
    );
  }, heading);
/**
 * Where the dot's eyes look on the screen once their turn has ended: the way
 * they are moved from where they are drawn, in degrees clockwise from up
 * (null when they are not moved), with what the dot says it looks at and their
 * animation. A face that holds the eyes off the middle is in both readings,
 * so it drops out. Measured off the drawn boxes, so the map's bearing and tilt are
 * in it as a commuter sees them.
 */
const eyesOnScreen = (page) =>
  page.evaluate(async () => {
    const dot = document.querySelector('[data-testid="locator-overlay"] .locator-dot');
    const look = dot?.querySelector('.locator-look');
    const eyes = dot?.querySelector('.locator-eyes');
    if (!dot || !look || !eyes) return null;
    const turns = look.getAnimations().filter((a) => a.transitionProperty === 'translate');
    await Promise.allSettled(turns.map((a) => a.finished));
    const mid = (r) => [r.left + r.width / 2, r.top + r.height / 2];
    // The two eyes' own middle, on the screen.
    const eyesAt = () => {
      const [a, b] = [...eyes.querySelectorAll('.locator-eye')].map((e) =>
        mid(e.getBoundingClientRect()),
      );
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    };
    // Where they look, less where they sit as drawn (a little above the
    // middle): the same eyes with the look's offset taken away for a moment.
    const [ex, ey] = eyesAt();
    const was = [dot.style.getPropertyValue('--gaze-x'), dot.style.getPropertyValue('--gaze-y')];
    look.style.transition = 'none';
    dot.style.setProperty('--gaze-x', '0px');
    dot.style.setProperty('--gaze-y', '0px');
    const [dx, dy] = eyesAt();
    dot.style.setProperty('--gaze-x', was[0]);
    dot.style.setProperty('--gaze-y', was[1]);
    look.style.transition = '';
    const off = Math.hypot(ex - dx, ey - dy);
    // The face's own place for the eyes, looking and not: the same but for
    // the glance and the wink, whose eyes come to the middle to look.
    const faceTransform = getComputedStyle(eyes).transform;
    const lookAttr = dot.getAttribute('data-look');
    eyes.style.transition = 'none';
    dot.removeAttribute('data-look');
    const restingTransform = getComputedStyle(eyes).transform;
    if (lookAttr !== null) dot.setAttribute('data-look', lookAttr);
    eyes.style.transition = '';
    return {
      look: dot.dataset.look ?? null,
      gaze: dot.dataset.gaze ?? null,
      deg:
        off < 0.5 ? null : Math.round(((Math.atan2(ex - dx, dy - ey) * 180) / Math.PI + 360) % 360),
      animation: getComputedStyle(eyes).animationName,
      face: dot.dataset.face,
      faceKept: ['glance', 'wink'].includes(dot.dataset.face) || faceTransform === restingTransform,
      at: [Math.round((ex - dx) * 10) / 10, Math.round((ey - dy) * 10) / 10],
    };
  });

/**
 * The faces that hold the eyes still of their own (locator.css): dozing, squeezed > <, and
 * glaring. Their eyes have no animation whether or not anything is looked at.
 */
const STILL_EYED_FACES = new Set(['sleepy', 'squee', 'glare', 'huff']);
/**
 * The eyes left to the face, as with no heading and no pick: nothing looked at, so not moved,
 * and looking about as the face does, still only on a face that holds them still.
 */
const eyesWander = (eyes) =>
  eyes?.look === null &&
  eyes.gaze === null &&
  eyes.deg === null &&
  (eyes.animation !== 'none' || STILL_EYED_FACES.has(eyes.face));

// ---------------------------------------------------------- a granted commuter, on a phone
if (VIDEO) mkdirSync(VIDEO, { recursive: true });
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  geolocation: { ...P0, accuracy: 30 },
  permissions: ['geolocation'],
  ...(VIDEO ? { recordVideo: { dir: VIDEO, size: { width: 390, height: 844 } } } : {}),
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await stubTiles(page);
await open(page);

const button = page.locator('[data-testid="where"]');
const mode = () => button.getAttribute('data-mode');
check(
  'the button is there, LocationOff, with no overlay on the map',
  (await button.getAttribute('data-state')) === 'off' &&
    (await mode()) === 'LocationOff' &&
    (await overlay(page).count()) === 0,
);
check('it says what it does', (await button.getAttribute('aria-label')) === 'Turn on my location');
const foot = await page.evaluate(() => {
  const b = document.querySelector('[data-testid="where"]').getBoundingClientRect();
  const m = window.__map.getContainer().getBoundingClientRect();
  return { below: m.bottom - b.bottom, right: m.right - b.right };
});
check(
  '  at the map foot, bottom right, 12 in',
  Math.abs(foot.below - 12) <= 1 && Math.abs(foot.right - 12) <= 1,
  JSON.stringify(foot),
);

await button.click();
check(
  'a tap shows the overlay',
  await until(async () => (await overlay(page).count()) === 1, 8000),
);
// Its moods (locator-mood.ts, the owner's ask of 2026-10-01): glad as the location comes.
const dotMood = () => overlay(page).locator('.locator-dot').first().getAttribute('data-mood');
check(
  '  the dot glad as the location comes',
  (await dotMood()) === 'happy',
  `mood ${await dotMood()}`,
);
// The camera's flight to the fix over.
await until(async () => (await attr(page, 'data-accuracy-m')) === '30');
await mapIdle(page);
check(
  '  at 30 m accuracy',
  (await attr(page, 'data-accuracy-m')) === '30',
  `${await attr(page, 'data-accuracy-m')} m`,
);
// The map's own scale, measured: 100 m east of the fix on Web Mercator's
// sphere, projected. A constant here once agreed with the app's wrong one
// (the 256 px figure) and the halo was half its size unnoticed.
const measuredMpp = () =>
  page.evaluate(
    ([lng, lat]) => {
      const east = 100 / (111319.49079 * Math.cos((lat * Math.PI) / 180));
      const a = window.__map.project([lng, lat]),
        b = window.__map.project([lng + east, lat]);
      return 100 / Math.hypot(b.x - a.x, b.y - a.y);
    },
    [P0.longitude, P0.latitude],
  );
const haloPx = Number(await attr(page, 'data-halo-px'));
const mpp = await measuredMpp();
check(
  '  its circle is the accuracy, 40 m at the least, in pixels at this zoom',
  Math.abs(haloPx - (2 * 40) / mpp) <= 3,
  `${haloPx} px for 80 m across, ${mpp.toFixed(2)} m/px`,
);
let cam = await camera(page);
const trackedZoom = await zoomFor(page, 200);
check(
  '  the camera came to it from the city, further out than 2 km on the scale bar: in to 200 m, north up',
  (await centred(page, P0)) < 4 &&
    Math.abs(cam.zoom - trackedZoom) < 0.05 &&
    cam.pitch < 0.5 &&
    Math.abs(cam.bearing) < 0.5,
  `${(await centred(page, P0)).toFixed(1)} px off, zoom ${cam.zoom.toFixed(2)} for ${trackedZoom.toFixed(2)}, pitch ${cam.pitch.toFixed(1)}, bearing ${cam.bearing.toFixed(1)}`,
);
check(
  '  the button: TrackedLocation',
  (await mode()) === 'TrackedLocation' && (await button.getAttribute('data-state')) === 'on',
  `${await mode()}`,
);

// A walk east at 2 m/s: one fix a second.
let p = P0;
for (let i = 1; i <= 4; i++) {
  p = east(P0, 2 * i);
  await ctx.setGeolocation({ ...p, accuracy: 10 });
  await page.waitForTimeout(1000);
}
check(
  'a walk turns the beam its way (east)',
  await until(async () => apart(Number(await attr(page, 'data-heading')), 90) < 10),
  `heading ${await attr(page, 'data-heading')}`,
);
await until(async () => (await centred(page, p)) < 4);
check(
  '  and the camera follows',
  (await centred(page, p)) < 4,
  `${(await centred(page, p)).toFixed(1)} px off`,
);
await button.click();
// Tilted, it would be by the time the map is at rest.
await mapIdle(page);
check(
  'with no compass read yet, a tap stays TrackedLocation, flat',
  (await mode()) === 'TrackedLocation' && (await camera(page)).pitch < 0.5,
  `${await mode()}, pitch ${(await camera(page)).pitch.toFixed(1)}`,
);
// That tap had a reaction: a boing, or now and then a huff (the owner, 2026-10-01).
const dotFace = () => overlay(page).locator('.locator-dot').first().getAttribute('data-face');
check(
  '  and the dot reacts to it: a boing, or a huff',
  ['boing', 'huff'].includes(await dotFace()),
  `face ${await dotFace()}`,
);
// Three taps in a run: cross, scowling, for a few seconds; then over it.
// Taps as a thumb does, at its place: Playwright's click waits for the
// button to hold still, and its boing then stretches three over the 2 s.
const box = await button.boundingBox();
const t0 = Date.now();
for (let i = 0; i < 3; i++) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
const tapsTook = Date.now() - t0;
check(
  'three quick taps on the button: the dot is cross',
  await until(async () => (await dotMood()) === 'angry', 1500),
  `mood ${await dotMood()}; 3 taps in ${tapsTook} ms`,
);
// Over it in 3 s; left to itself it may glare a moment longer, a 5 s turn of its mood swings.
check(
  '  and gets over it',
  await until(async () => (await dotMood()) !== 'angry', 9000),
  `mood ${await dotMood()}`,
);
// The dot itself takes a tap (the owner, 2026-10-01): the same reaction, and
// nothing else — the button's look and the camera stay as they were.
const beforePoke = { mode: await mode(), cam: await camera(page) };
// A real click at its centre; `force`, as it never holds still (it breathes, it may hop).
await overlay(page).locator('button.locator-dot').click({ force: true });
await until(async () => ['boing', 'huff'].includes(await dotFace()), 2000);
await mapIdle(page);
const afterPoke = await camera(page);
check(
  'a tap on the dot: a boing or a huff, the camera and the button as they were',
  ['boing', 'huff'].includes(await dotFace()) &&
    (await mode()) === beforePoke.mode &&
    Math.abs(afterPoke.zoom - beforePoke.cam.zoom) < 0.01 &&
    Math.abs(afterPoke.bearing - beforePoke.cam.bearing) < 0.5,
  `face ${await dotFace()}, ${beforePoke.mode} → ${await mode()}, zoom ${beforePoke.cam.zoom.toFixed(2)} → ${afterPoke.zoom.toFixed(2)}`,
);

// The commuter drags the map: it lets go. A tap comes back.
const dotBox = await overlay(page).locator('button.locator-dot').boundingBox();
const from = { x: dotBox.x + dotBox.width / 2, y: dotBox.y + dotBox.height / 2 };
await page.mouse.move(from.x, from.y);
await page.mouse.down();
await page.mouse.move(from.x - 75, from.y - 100, { steps: 8 });
await page.mouse.up();
await until(async () => (await mode()) === 'TrackOwnLocation', 3000);
// The drag starts on the commuter's dot, mid-screen: it pans all the same.
check(
  'dragging the map, from the dot itself, lets go: TrackOwnLocation',
  (await mode()) === 'TrackOwnLocation',
  `${await mode()}`,
);
const dragged = await camera(page);
p = north(p, 20);
await ctx.setGeolocation({ ...p, accuracy: 10 });
const overlayMoved = await until(() => overlayOn(page, p));
await mapIdle(page);
const after = await camera(page);
check(
  '  a new fix moves the overlay, not the camera',
  overlayMoved &&
    Math.abs(after.longitude - dragged.longitude) < 1e-7 &&
    Math.abs(after.latitude - dragged.latitude) < 1e-7 &&
    (await overlay(page).count()) === 1,
  `the overlay ${overlayMoved ? 'on the new fix' : 'not on the new fix'}`,
);
// Google Maps' way (the owner's screenshots, 2026-10-01): the circle is the
// fix's metres, so zoomed out it shrinks under the dot and is gone.
await page.evaluate(() => window.__map.jumpTo({ zoom: 12 }));
await until(async () => (await attr(page, 'data-halo-px')) === '0', 3000);
check(
  '  zoomed out till the dot covers its circle, the circle is gone',
  (await attr(page, 'data-halo-px')) === '0' &&
    (await overlay(page).locator('[data-part="circle"]').count()) === 0,
  `${await attr(page, 'data-halo-px')} px`,
);
check(
  "  and the dot and beam are drawn smaller, as Google Maps' are",
  (await attr(page, 'data-scale')) === '0.54',
  `scale ${await attr(page, 'data-scale')}`,
);
// A fix indoors, 1 km out: the circle claims 80 m at most (the owner's call, 2026-10-01).
await page.evaluate(() => window.__map.jumpTo({ zoom: 16 }));
await ctx.setGeolocation({ ...p, accuracy: 1000 });
await until(async () => (await attr(page, 'data-accuracy-m')) === '1000');
await mapIdle(page);
const capMpp = await page.evaluate(
  ([lng, lat]) => {
    const east = 100 / (111319.49079 * Math.cos((lat * Math.PI) / 180));
    const a = window.__map.project([lng, lat]),
      b = window.__map.project([lng + east, lat]);
    return 100 / Math.hypot(b.x - a.x, b.y - a.y);
  },
  [p.longitude, p.latitude],
);
const capped = Number(await attr(page, 'data-halo-px'));
check(
  '  a fix 1 km out draws an 80 m circle, no more',
  (await attr(page, 'data-accuracy-m')) === '1000' && Math.abs(capped - 160 / capMpp) <= 3,
  `${capped} px for 160 m across`,
);
// The phone's compass, facing east-south-east.
await face(page, 120);
await button.click();
await until(async () => (await mode()) === 'TrackedLocation', 3000);
await mapIdle(page);
check(
  '  a tap comes back: TrackedLocation, on the fix',
  (await mode()) === 'TrackedLocation' && (await centred(page, p)) < 4,
  `${await mode()}, ${(await centred(page, p)).toFixed(1)} px off`,
);
check(
  "  at the zoom it was at, under 2 km on the scale bar: the height is the commuter's",
  Math.abs((await camera(page)).zoom - 16) < 0.05,
  `zoom ${(await camera(page)).zoom.toFixed(2)}`,
);
check(
  '  its label offers the compass',
  (await button.getAttribute('aria-label')) === 'Turn the map the way I face',
);
// The eyes say which way the commuter faces, as the beam does, wherever the map is turned;
// the face keeps its own place for them.
await until(async () => (await eyesOnScreen(page))?.look === '120', 3000);
const eyesNorthUp = await eyesOnScreen(page);
check(
  "  the dot's eyes look the way the phone faces, the beam's way: east-south-east on a north-up map, in the face's own place for them",
  eyesNorthUp?.look === '120' &&
    eyesNorthUp.animation === 'none' &&
    eyesNorthUp.deg !== null &&
    apart(eyesNorthUp.deg, 120) < 8 &&
    eyesNorthUp.faceKept,
  JSON.stringify(eyesNorthUp),
);

await button.click();
await until(async () => (await mode()) === 'TracksTheMapBasedOnCompassFacing', 3000);
await mapIdle(page);
cam = await camera(page);
const compassZoom = await zoomFor(page, 200);
check(
  'the next tap tilts the camera, 200 m on the scale bar, turned the way the phone faces',
  (await mode()) === 'TracksTheMapBasedOnCompassFacing' &&
    Math.abs(cam.zoom - compassZoom) < 0.05 &&
    Math.abs(cam.pitch - 45) < 0.5 &&
    apart(cam.bearing, 120) < 1,
  `${await mode()}, zoom ${cam.zoom.toFixed(2)} for ${compassZoom.toFixed(2)}, pitch ${cam.pitch.toFixed(1)}, bearing ${cam.bearing.toFixed(1)}`,
);
check(
  '  still on the fix',
  (await centred(page, p)) < 4,
  `${(await centred(page, p)).toFixed(1)} px off`,
);
check(
  "  the overlay's heading is the compass's",
  apart(Number(await attr(page, 'data-heading')), 120) < 1,
  `${await attr(page, 'data-heading')}`,
);
const eyesCompass = await eyesOnScreen(page);
check(
  '  and with the map turned the way the phone faces, its eyes look up the screen, the face kept',
  eyesCompass?.look === '120' &&
    eyesCompass.deg !== null &&
    apart(eyesCompass.deg, 0) < 8 &&
    eyesCompass.faceKept,
  JSON.stringify(eyesCompass),
);
await face(page, 200);
await until(async () => apart((await camera(page)).bearing, 200) < 1, 3000);
check(
  '  and the camera turns with the phone',
  apart((await camera(page)).bearing, 200) < 1,
  `bearing ${(await camera(page)).bearing.toFixed(1)}`,
);
await face(page, 201);
// Turned, it would be by the time the map is at rest.
await mapIdle(page);
check(
  '  a shiver under 3° leaves it be',
  apart((await camera(page)).bearing, 200) < 0.5,
  `bearing ${(await camera(page)).bearing.toFixed(1)}`,
);

await button.click();
await until(async () => (await mode()) === 'TrackedLocation', 3000);
await mapIdle(page);
cam = await camera(page);
check(
  'the next tap puts north up again: TrackedLocation at the zoom it had, flat',
  (await mode()) === 'TrackedLocation' &&
    Math.abs(cam.zoom - 16) < 0.05 &&
    cam.pitch < 0.5 &&
    Math.abs(cam.bearing) < 0.5,
  `${await mode()}, zoom ${cam.zoom.toFixed(2)}, pitch ${cam.pitch.toFixed(1)}, bearing ${cam.bearing.toFixed(1)}`,
);
check(
  '  its arrow turned the way the phone faces',
  /rotate:\s*200deg/.test((await button.locator('svg').first().getAttribute('style')) ?? ''),
  `${await button.locator('svg').first().getAttribute('style')}`,
);
await button.click();
await until(async () => (await mode()) === 'TracksTheMapBasedOnCompassFacing', 3000);
await mapIdle(page);
check(
  '  and the next tilts again',
  (await mode()) === 'TracksTheMapBasedOnCompassFacing' &&
    Math.abs((await camera(page)).pitch - 45) < 0.5,
  `${await mode()}`,
);

// The app moves the camera for the commuter (a hintuan picked, an end tapped:
// features/routes/map/map-view.tsx APP_MOVE). That lets go too, or the next fix undoes it.
const away = north(p, 400);
await page.evaluate(
  (c) => window.__map.easeTo({ center: [c.longitude, c.latitude], duration: 0 }, { appMove: true }),
  away,
);
await until(async () => (await mode()) === 'TrackOwnLocation', 3000);
check(
  'an app camera move lets go: TrackOwnLocation',
  (await mode()) === 'TrackOwnLocation',
  `${await mode()}`,
);
const moved = await camera(page);
p = north(p, 20);
await ctx.setGeolocation({ ...p, accuracy: 10 });
// Off the screen here, but drawn where the map puts it all the same.
const overlayFollowed = await until(() => overlayOn(page, p));
await mapIdle(page);
const kept = await camera(page);
check(
  '  and the next fix leaves the camera where the app put it',
  overlayFollowed && Math.abs(kept.latitude - moved.latitude) < 1e-7,
  `the overlay ${overlayFollowed ? 'on the new fix' : 'not on the new fix'}; ${((kept.latitude - moved.latitude) / M_LAT).toFixed(1)} m moved`,
);

// A route tapped: the dot gazes at it — its eyes turn the way to it for three
// seconds, then wander again (dot-gaze.ts; the owner's ask, 2026-10-01).
const onLine = await page.evaluate(async () => {
  const m = window.__map;
  const data = await m.getSource('saved-routes')?.getData();
  const f = data?.features.find(
    (x) => x.geometry?.type === 'LineString' && x.geometry.coordinates.length > 1,
  );
  if (!f) return null;
  const [a, b] = f.geometry.coordinates;
  const at = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  m.jumpTo({ center: at, zoom: 16 });
  return at;
});
if (!onLine) {
  check('a route tapped: the dot gazes at it', false, 'no route line on the map');
} else {
  await mapIdle(page);
  const [tx, ty] = await page.evaluate((c) => Object.values(window.__map.project(c)), onLine);
  // Read in the page, not over round trips that the tap's busiest seconds
  // could stretch past the gaze: its heading, and the eyes once their turn
  // has ended (a face whose eyes held still turns them over a quarter second).
  await page.evaluate(() => {
    window.__gazed = null;
    const host = document.querySelector('[data-testid="locator-overlay"]');
    const seen = () => {
      const dot = host?.querySelector('.locator-dot[data-gaze]');
      if (!dot || window.__gazed !== null) return;
      window.__gazed = false;
      const look = dot.querySelector('.locator-look');
      const eyes = dot.querySelector('.locator-eyes');
      const read = () => {
        if (window.__gazed) return;
        window.__gazed = {
          deg: Number(dot.dataset.gaze),
          animation: getComputedStyle(eyes).animationName,
          translate: getComputedStyle(look).translate,
        };
      };
      // Once the eyes' own turn has ended, read off the turn itself (the
      // transition the gaze starts) rather than off a timer: on a busy
      // runner the tap's work held the page past a 400 ms timer, which
      // then read the eyes before they had begun to turn (PR #127's CI,
      // 2026-10-03). A turn replaced by another is waited out again; no
      // turn at all is read at once — eyes that never move fail as before.
      const settle = () => {
        const turns = look.getAnimations().filter((a) => a.transitionProperty === 'translate');
        if (!turns.length) return read();
        Promise.all(turns.map((a) => a.finished)).then(read, settle);
      };
      settle();
    };
    new MutationObserver(seen).observe(host, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-gaze'],
    });
  });
  await page.mouse.click(tx, ty);
  const dot = overlay(page).locator('.locator-dot').first();
  const gazed = await until(async () => !!(await page.evaluate(() => window.__gazed)), 5000);
  const { deg, ...eyes } = (await page.evaluate(() => window.__gazed)) || {
    deg: NaN,
    animation: '',
    translate: '',
  };
  const [ex, ey] = String(eyes.translate)
    .split(' ')
    .map((v) => parseFloat(v));
  // Its eyes the way it gazes, 3.5 px out, the dot lying north up: x east, y south.
  const want = [3.5 * Math.sin((deg * Math.PI) / 180), -3.5 * Math.cos((deg * Math.PI) / 180)];
  check(
    'a route tapped: the dot gazes at it, its eyes still and turned that way',
    gazed && eyes.animation === 'none' && Math.hypot(ex - want[0], (ey || 0) - want[1]) < 0.2,
    `gaze ${deg}°; eyes ${JSON.stringify(eyes)}`,
  );
  const heading = await attr(page, 'data-heading');
  check(
    '  and after three seconds they look the way the phone faces again',
    (await until(async () => (await dot.getAttribute('data-gaze')) === null, 4500)) &&
      heading !== '' &&
      (await dot.getAttribute('data-look')) === heading,
    `gaze ${await dot.getAttribute('data-gaze')}, look ${await dot.getAttribute('data-look')}, heading ${heading}`,
  );

  // The card that tap opened set to another height while the camera follows
  // the commuter: the card's overview starts (useHeightOverview) and the
  // camera following the commuter takes over in the same commit, as it did
  // when the locator's hooks were PublicMapApp's own, after the cards'. Since
  // they moved into CommuterLocation, which React runs before the page's own
  // effects, its camera waits for the page's turn (commit-turn.ts; the
  // cheap-phone plan, step 15, 2026-10-05). It stays on the commuter, at the
  // zoom it followed at.
  // A list where routes share the road, or a trip's card: either has a handle.
  const handle = page.locator('button[data-testid="dock-handle"]:visible').first();
  if (!(await handle.count())) {
    check(
      'a card set to another height while the camera follows: it stays on the commuter',
      false,
      'no card open after the route tap',
    );
  } else {
    await button.click();
    await until(async () => (await mode()) === 'TrackedLocation', 3000);
    await mapIdle(page);
    const following = await camera(page);
    const was = await onScreen(page, p);
    await handle.click();
    // The sheet at its new height, and the camera after it.
    await cardsSettled(page);
    const now = await camera(page);
    const is = await onScreen(page, p);
    check(
      "a card set to another height while the camera follows: it stays on the commuter, at its zoom, the card's overview overtaken",
      Math.abs(now.zoom - following.zoom) < 0.05 &&
        Math.abs(is.x - is.w / 2) < 4 &&
        is.y > 0 &&
        is.y < is.h,
      `zoom ${following.zoom.toFixed(2)} → ${now.zoom.toFixed(2)}, the commuter at ${is.x.toFixed(0)},${is.y.toFixed(0)} (was ${was.x.toFixed(0)},${was.y.toFixed(0)})`,
    );
  }
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await page.close();
await ctx.close();
if (VIDEO) {
  const made = readdirSync(VIDEO)
    .filter((f) => f.endsWith('.webm'))
    .map((f) => join(VIDEO, f));
  if (made.length) renameSync(made[made.length - 1], join(VIDEO, 'where-am-i.webm'));
}

// ---------------------------------------------------------- a refusing browser
const ctx2 = await b.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page2 = await ctx2.newPage();
await stubTiles(page2);
await open(page2);
await page2.locator('[data-testid="where"]').click();
const note = page2.locator('[data-testid="where-note"]');
check(
  'a browser that refuses: a note above the button, and no overlay',
  (await until(async () => (await note.count()) === 1, 8000)) &&
    (await overlay(page2).count()) === 0,
  (await note.count()) ? await note.innerText() : 'no note',
);
check(
  '  the button stays LocationOff, to try after the setting changes',
  (await page2.locator('[data-testid="where"]').getAttribute('data-state')) === 'denied' &&
    (await page2.locator('[data-testid="where"]').getAttribute('data-mode')) === 'LocationOff',
);
await ctx2.close();

// ---------------------------------------------------------- no fix, ever
// A GPS that only times out: navigator.geolocation stood in for (Playwright
// cannot make the real one time out), its watch answering TIMEOUT every
// second and never a position. A note, and the watch kept: a second tap
// starts no second one.
const ctx3 = await b.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page3 = await ctx3.newPage();
await page3.addInitScript(() => {
  let n = 0;
  const timers = new Map();
  const geo = {
    watchPosition: (_ok, fail) => {
      const id = ++n;
      timers.set(
        id,
        setInterval(
          () =>
            fail({
              code: 3,
              message: 'Timeout expired',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            }),
          1000,
        ),
      );
      window.__watches = timers.size;
      window.__started = n;
      return id;
    },
    clearWatch: (id) => {
      clearInterval(timers.get(id));
      timers.delete(id);
      window.__watches = timers.size;
    },
    getCurrentPosition: () => {},
  };
  Object.defineProperty(navigator, 'geolocation', { get: () => geo });
});
await stubTiles(page3);
await open(page3);
const where3 = page3.locator('[data-testid="where"]');
await where3.click();
const note3 = page3.locator('[data-testid="where-note"]');
check(
  'a GPS that only times out: a note, still asking, LocationOff',
  (await until(async () => (await note3.count()) === 1, 8000)) &&
    (await where3.getAttribute('data-state')) === 'asking' &&
    (await where3.getAttribute('data-mode')) === 'LocationOff',
  `${await where3.getAttribute('data-state')}; ${(await note3.count()) ? await note3.innerText() : 'no note'}`,
);
await where3.click();
// A second watch, it would have started in the tap's own frame.
await mapIdle(page3);
check(
  '  a second tap starts no second watch',
  (await page3.evaluate(() => window.__watches)) === 1,
  `${await page3.evaluate(() => window.__watches)} watch(es)`,
);
// Quiet past QUIET_MS (locator-rules.ts, use-locator.ts): the phone's location off, say. A tap
// asks again, a new watch in its place, for Android's "turn on location"
// answers only a new request (the owner, 2026-10-13).
await page3.waitForTimeout(10_500);
await where3.click();
await until(async () => (await page3.evaluate(() => window.__started)) === 2, 3000);
const watches3 = await page3.evaluate(() => [window.__started, window.__watches]);
check(
  "  a tap after 10 s with no fix asks again: a new watch in the old one's place",
  watches3[0] === 2 && watches3[1] === 1,
  `${watches3[0]} started, ${watches3[1]} running`,
);
await ctx3.close();

// ---------------------------------------------------------- permission taken back
// A fix, then the permission revoked: the watch answers PERMISSION_DENIED.
// The overlay goes with the fix; kept, it stood where the commuter was, and
// the next tap eased the camera there (review of 2026-10-03, finding 9).
const ctx5 = await b.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page5 = await ctx5.newPage();
await page5.addInitScript(
  ([lng, lat]) => {
    const watchers = new Map();
    let n = 0;
    const geo = {
      watchPosition: (ok, fail) => {
        const id = ++n;
        watchers.set(id, fail);
        setTimeout(
          () =>
            ok({
              coords: { longitude: lng, latitude: lat, accuracy: 20, speed: null, heading: null },
              timestamp: Date.now(),
            }),
          100,
        );
        return id;
      },
      clearWatch: (id) => watchers.delete(id),
      getCurrentPosition: () => {},
    };
    window.__revoke = () => {
      for (const fail of watchers.values())
        fail({
          code: 1,
          message: 'User denied Geolocation',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
    };
    Object.defineProperty(navigator, 'geolocation', { get: () => geo });
  },
  [P0.longitude, P0.latitude],
);
await stubTiles(page5);
await open(page5);
const where5 = page5.locator('[data-testid="where"]');
await where5.click();
check(
  'permission taken back after a fix: first the overlay',
  await until(async () => (await overlay(page5).count()) === 1, 8000),
);
await page5.evaluate(() => window.__revoke());
check(
  '  then no overlay, and the button LocationOff',
  (await until(async () => (await overlay(page5).count()) === 0, 4000)) &&
    (await where5.getAttribute('data-state')) === 'denied',
  `${await overlay(page5).count()} overlay(s), ${await where5.getAttribute('data-state')}`,
);
await ctx5.close();

// ---------------------------------------------------------- a mouse: no compass
const ctx4 = await b.newContext({
  viewport: { width: 1280, height: 800 },
  geolocation: { ...P0, accuracy: 20 },
  permissions: ['geolocation'],
});
const page4 = await ctx4.newPage();
await stubTiles(page4);
await open(page4);
const where4 = page4.locator('[data-testid="where"]');
const corner = await page4.evaluate(() => {
  const b = document.querySelector('[data-testid="where"]').getBoundingClientRect();
  const m = window.__map.getContainer().getBoundingClientRect();
  return { below: m.bottom - b.bottom, right: m.right - b.right };
});
check(
  'with a mouse: bottom right, clear of the credit line',
  Math.abs(corner.below - 40) <= 1 && Math.abs(corner.right - 12) <= 1,
  JSON.stringify(corner),
);
await where4.click();
await until(async () => (await where4.getAttribute('data-mode')) === 'TrackedLocation', 8000);
await mapIdle(page4);
check(
  '  a tap comes to the commuter: TrackedLocation',
  (await where4.getAttribute('data-mode')) === 'TrackedLocation',
);
check(
  '  its label says so, no compass offered',
  (await where4.getAttribute('aria-label')) === 'Show where I am',
);
const eyesNoCompass = await eyesOnScreen(page4);
check(
  "  with no heading, no beam: the dot's eyes wander",
  eyesWander(eyesNoCompass),
  JSON.stringify(eyesNoCompass),
);
// A route tapped with no compass: the gaze, then the wandering again, not a heading.
const onLine4 = await page4.evaluate(async () => {
  const m = window.__map;
  const data = await m.getSource('saved-routes')?.getData();
  const f = data?.features.find(
    (x) => x.geometry?.type === 'LineString' && x.geometry.coordinates.length > 1,
  );
  if (!f) return null;
  const [a, b] = f.geometry.coordinates;
  const at = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  m.jumpTo({ center: at, zoom: 16 });
  return at;
});
if (!onLine4) {
  check('  a route tapped with no compass: a gaze, then wandering', false, 'no route line');
} else {
  await mapIdle(page4);
  const [tx4, ty4] = await page4.evaluate((c) => Object.values(window.__map.project(c)), onLine4);
  await page4.mouse.click(tx4, ty4);
  const dot4 = overlay(page4).locator('.locator-dot').first();
  const gazed4 = await until(async () => (await dot4.getAttribute('data-gaze')) !== null, 5000);
  const back4 =
    gazed4 && (await until(async () => (await dot4.getAttribute('data-gaze')) === null, 4500));
  const after4 = await eyesOnScreen(page4);
  check(
    '  a route tapped with no compass: the dot gazes at it, and after three seconds its eyes wander again',
    gazed4 && back4 && eyesWander(after4),
    JSON.stringify({ gazed4, back4, after4 }),
  );
}
await where4.click();
// Tilted, it would be by the time the map is at rest.
await mapIdle(page4);
const flat = await page4.evaluate(() => window.__map.getPitch());
check(
  '  the next tap stays TrackedLocation, flat: no compass to turn by',
  (await where4.getAttribute('data-mode')) === 'TrackedLocation' && flat < 0.5,
  `${await where4.getAttribute('data-mode')}, pitch ${flat.toFixed(1)}`,
);
await ctx4.close();

await b.close();
tally();
