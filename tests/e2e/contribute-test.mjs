// The contributor page /contribute/, driven by a phone: a mocked GPS walks the
// whole loop and the screens answer it.
//
//   npm run dev                          (in another terminal)
//   node tests/e2e/contribute-test.mjs
//
// PARAPO_SHOTS=dir keeps screenshots of Ready, Recording (papunta, then
// pabalik), the Save form and Successfully recorded at 393×852.
//
// The GPS is a stand-in navigator.geolocation the suite feeds fix by fix, with
// timestamps of its own (a second apart), so a kilometre out and back takes
// no time. The 2-minute form timeout runs on Playwright's fake clock.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { fakeContributions } from './lib/fake-contributions.mjs';
import { BASE, bareStyle, harness, nodeFetch } from './lib/harness.mjs';

const { check, tally } = harness();
const SHOTS = process.env.PARAPO_SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// Tala's neighbourhood, 14.6°N: a degree of longitude is 107.6 km there.
const START = [121.0, 14.6];
const M_PER_DEG_LNG = 107_600;
const eastOf = (metres) => [START[0] + metres / M_PER_DEG_LNG, START[1]];

const GPS = () => {
  const watchers = new Map();
  let nextId = 0;
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: (ok, _error, options) => {
        watchers.set(++nextId, { ok, options });
        return nextId;
      },
      clearWatch: (id) => watchers.delete(id),
      getCurrentPosition: () => {},
    },
  });
  // The page's own clock, held by the suite: a fix and a tap then agree on when they happened.
  let now = Date.UTC(2026, 9, 17, 6, 0, 0);
  Date.now = () => now;
  window.__advance = (ms) => (now += ms);
  window.__fix = (lng, lat, t) =>
    watchers.forEach(({ ok }) =>
      ok({
        timestamp: t,
        coords: { longitude: lng, latitude: lat, accuracy: 5, heading: null, speed: null },
      }),
    );
  // The recording's watch asks for no cached fix (maximumAge 0); the locator's takes one a second old.
  const count = (isRecording) =>
    [...watchers.values()].filter(({ options }) => (options?.maximumAge === 0) === isRecording)
      .length;
  window.__watchers = () => count(true);
  window.__locatorWatchers = () => count(false);
};

const browser = await chromium.launch();

/**
 * A phone-sized page with the stand-in GPS; `consented` skips the first-visit question.
 * `earlierConsent` stores the first text's agreement instead, which the page no longer accepts.
 * `granted` is a browser that already lets the page read the location.
 */
async function phone({ consented, earlierConsent = false, granted = false }) {
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    acceptDownloads: true,
  });
  // The browser already lets the page read the location, as it does after a first visit's yes.
  if (granted) await context.grantPermissions(['geolocation']);
  const page = await context.newPage();
  // PARAPO_CPU_THROTTLE=4 runs the page at a quarter of the container's speed, as a slow CI runner is.
  if (process.env.PARAPO_CPU_THROTTLE) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', {
      rate: Number(process.env.PARAPO_CPU_THROTTLE),
    });
  }
  await nodeFetch(page);
  await bareStyle(page);
  // Saved recordings upload: to the stand-in, never to a real project (upload-test covers it).
  await fakeContributions(page);
  await page.addInitScript(GPS);
  if (consented) {
    await page.addInitScript(() => localStorage.setItem('parapo.contribute.consent', '3'));
  }
  if (earlierConsent) {
    await page.addInitScript(() => localStorage.setItem('parapo.contribute.consent', 'yes'));
  }
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/contribute/`, { waitUntil: 'load' });
  return { page, context, errors };
}

const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : null);
/** One fix of the ride, `metres` east of the start, a second after the last. */
const emit = (page, metres) => {
  const [lng, lat] = eastOf(metres);
  return page.evaluate(([a, b]) => window.__fix(a, b, window.__advance(1000)), [lng, lat]);
};
/** A fix every 10 m from `from` to `to` metres east, a second apart: 36 km/h, as a jeepney. */
const ride = async (page, from, to) => {
  const step = to >= from ? 10 : -10;
  for (let m = from; step > 0 ? m <= to : m >= to; m += step) await emit(page, m);
};
const mapSource = (page) =>
  page.evaluate(() => window.__map.getSource('recording-trail')?.serialize().data ?? null);
/** The map's bearing as 0–360, so -90 and 270 are the same way. */
/** The status of the recording IndexedDB holds, or null. */
const storedStatus = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('parapo-contribute');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const all = open.result.transaction('recordings').objectStore('recordings').getAll();
          all.onsuccess = () => {
            open.result.close();
            resolve(all.result[0]?.status ?? null);
          };
        };
      }),
  );
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
/** The locator's button, and the look it wears (LocatorButton's Property 1). */
const locate = (page) => page.locator('[data-testid="where"]');
const locatorMode = (page) => locate(page).getAttribute('data-mode');
/** How far the map's centre is from `metres` east of the start, in metres. */
const centreOff = (page, metres) =>
  page.evaluate(
    ([lng, mPerDeg]) => Math.abs(window.__map.getCenter().lng - lng) * mPerDeg,
    [eastOf(metres)[0], M_PER_DEG_LNG],
  );
const bearing = (page) => page.evaluate(() => (window.__map.getBearing() + 360) % 360);
/** The History screen, opened through its button on Ready unless it is already showing. */
const openHistory = async (page) => {
  const heading = page.getByRole('heading', { level: 1, name: 'History' });
  const history = page.getByRole('button', { name: 'History' });
  // A reload on #history lands on the screen itself; otherwise Ready's button opens it.
  await heading.or(history).waitFor({ timeout: 10000 });
  if (await heading.isVisible()) return;
  await history.click();
  await heading.waitFor();
};
/** Every card's actions opened, so its Download is there to press. */
const openCardMenus = async (page) => {
  for (const more of await page.getByRole('button', { name: /^More actions/ }).all()) {
    if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  }
};
const buttons = (page) =>
  page
    .getByRole('button')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent));

// ----------------------------------- consent to the first text is not enough
{
  const { page, errors } = await phone({ consented: false, earlierConsent: true });
  await page.getByRole('heading', { name: 'Before you record' }).waitFor({ timeout: 20000 });
  check(
    'a phone that agreed to the first text is asked again: the new text shows, with no Start or History',
    (await page.getByRole('button', { name: 'Start recording' }).count()) === 0 &&
      (await page.getByRole('button', { name: 'History' }).count()) === 0 &&
      (await page.getByRole('button', { name: 'Okay, I understand' }).count()) === 1,
  );
  await page.getByRole('button', { name: 'Okay, I understand' }).click();
  await page.getByRole('button', { name: 'Start recording' }).waitFor();
  check('  after agreeing, Start shows', errors.length === 0, errors.join(' | '));
}

// ---------------------------------------------------------------- the loop
{
  const { page, errors } = await phone({ consented: false });
  await page.getByRole('heading', { name: 'Before you record' }).waitFor({ timeout: 20000 });
  check(
    'a first visit says what the page does before anything else, with no Start',
    (await page.getByRole('button', { name: 'Start recording' }).count()) === 0 &&
      (await page.getByRole('button', { name: 'Okay, I understand' }).count()) === 1,
  );
  check(
    '  focus is on the consent heading',
    await page.evaluate(() => document.activeElement?.textContent === 'Before you record'),
  );
  {
    const text = await page.locator('section[aria-labelledby="consent-heading"]').innerText();
    check(
      '  it says what is recorded, what for (machine learning), who sees it, how long, where, deleting and who is responsible',
      ['What is recorded', 'What for', 'Who sees it', 'How long', 'Where', 'Deleting'].every(
        (label) => text.includes(label),
      ) &&
        /machine learning/.test(text) &&
        /24 months/.test(text) &&
        text.includes('Who is responsible'),
    );
    check(
      '  it no longer says nothing is sent',
      !/Nothing is sent anywhere/.test(text) && /sent to ParaPo/.test(text),
    );
  }
  // A reload on #history before consent must not send the visitor to History once they agree.
  await page.evaluate(() => {
    location.hash = 'history';
  });
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('heading', { name: 'Before you record' }).waitFor({ timeout: 20000 });
  check(
    '  #history before consent is let go of, and the consent panel shows',
    (await page.evaluate(() => location.hash)) === '' ||
      (await page
        .waitForFunction(() => location.hash === '', null, { timeout: 5000 })
        .then(() => true)
        .catch(() => false)),
  );
  await page.getByRole('button', { name: 'Okay, I understand' }).click();
  await page.getByRole('button', { name: 'Start recording' }).waitFor();
  check(
    '  agreeing stores the version of the text agreed to',
    await page.evaluate(() =>
      Object.keys(localStorage).some(
        (key) => key.startsWith('parapo.contribute.consent') && localStorage.getItem(key) === '3',
      ),
    ),
  );
  await page.waitForFunction(() => !!window.__map?.loaded(), null, { timeout: 30000 });
  {
    const start = await page.getByRole('button', { name: 'Start recording' }).boundingBox();
    const credits = await page.locator('.maplibregl-ctrl-bottom-right').boundingBox();
    check(
      'on a first visit, after Okay, the credits sit above the Start bar',
      start && credits && credits.y + credits.height <= start.y + 0.5,
      JSON.stringify([credits, start]),
    );
  }
  await page.waitForFunction(() => !!window.__map?.loaded());
  check(
    'Ready: Start and a way back to the map, no saved-recordings list',
    (await page.getByRole('button', { name: 'Back to the map' }).count()) === 1 &&
      (await page.getByText('Saved on this phone').count()) === 0 &&
      (await page.getByText('No saved recordings yet.').count()) === 0,
  );
  {
    const history = page.getByRole('button', { name: 'History' });
    check(
      '  History is a button beside Back; nothing of it shows above the Start bar',
      (await history.count()) === 1 &&
        (await page.getByRole('heading', { name: 'History' }).count()) === 0 &&
        (await page.getByRole('button', { name: 'Start recording' }).count()) === 1,
    );
    const start = await page.getByRole('button', { name: 'Start recording' }).boundingBox();
    const stack = await page.locator('section[aria-labelledby="ready-heading"]').boundingBox();
    check(
      '  nothing but the Start bar covers the map',
      !!start &&
        !!stack &&
        Math.abs(stack.y - start.y) <= 1 &&
        Math.abs(stack.y + stack.height - (start.y + start.height)) <= 1,
      JSON.stringify([stack, start]),
    );
    await history.click();
    await page.getByRole('heading', { level: 1, name: 'History' }).waitFor();
    await page
      .waitForFunction(() => document.activeElement?.textContent === 'History', null, {
        timeout: 5000,
      })
      .catch(() => {});
    const opened = {
      hash: await page.evaluate(() => location.hash),
      focus: await page.evaluate(() => document.activeElement?.textContent),
      starts: await page.getByRole('button', { name: 'Start recording' }).count(),
      historyButtons: await page.getByRole('button', { name: 'History' }).count(),
      // Inert, not removed: the map stays mounted, but nothing in it can be focused or pressed.
      isMapInert: await page.evaluate(
        () => !!document.querySelector('button[aria-label="Map design"]')?.closest('[inert]'),
      ),
      empty: await page.getByText('No recordings yet.').count(),
    };
    check(
      '  History opened is a screen of its own: #history, focus on its heading, no Start, no map controls reachable',
      opened.hash === '#history' &&
        opened.focus === 'History' &&
        opened.starts === 0 &&
        opened.historyButtons === 0 &&
        opened.isMapInert &&
        opened.empty === 1,
      JSON.stringify(opened),
    );
    await page.reload({ waitUntil: 'load' });
    await page.getByRole('heading', { level: 1, name: 'History' }).waitFor({ timeout: 10000 });
    check('  a reload stays on History', (await page.evaluate(() => location.hash)) === '#history');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'Start recording' }).waitFor();
    check(
      '  its own back button returns to Ready, and the hash is gone',
      (await page.evaluate(() => location.hash)) === '',
    );
    await page.getByRole('button', { name: 'History' }).click();
    await page.getByRole('heading', { level: 1, name: 'History' }).waitFor();
    await page.goBack();
    await page.getByRole('button', { name: 'Start recording' }).waitFor();
    check(
      "  the browser's Back returns to Ready too, with focus back on the History button that opened it",
      (await page.getByRole('heading', { name: 'History' }).count()) === 0 &&
        (await page
          .waitForFunction(
            () => document.activeElement?.getAttribute('aria-label') === 'History',
            null,
            { timeout: 5000 },
          )
          .then(() => true)
          .catch(() => false)),
    );
  }
  check(
    '  the map-style button is on the locator button',
    (await page.getByRole('button', { name: 'Map design' }).count()) === 1,
  );
  check(
    '  nothing scrolls sideways',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  );
  // The map's first frame is still painting under the buttons for a moment.
  await page.waitForTimeout(1500);
  await shot(page, '1-ready');

  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  check(
    'Start begins on Papunta: the stats say so, and the leg button offers Pabalik',
    (await page.getByRole('group', { name: 'Recording so far' }).innerText()).includes('Papunta') &&
      (await page.getByRole('group', { name: 'Recording so far' }).innerText()).includes(
        'Recording',
      ) &&
      (await buttons(page)).join('|').includes('Switch to Pabalik'),
  );
  check(
    '  Stop, Switch to Pabalik, Save and Cancel are buttons',
    ['Stop', 'Switch to Pabalik', 'Save', 'Cancel'].every((n) => (n ? true : false)) &&
      (
        await Promise.all(
          ['Stop', 'Switch to Pabalik', 'Save', 'Cancel'].map((n) =>
            page.getByRole('button', { name: n, exact: true }).count(),
          ),
        )
      ).every((c) => c === 1),
  );
  check(
    '  the stats are not a live region; the one status region is empty',
    (await page.locator('[aria-live]').count()) === 0 &&
      (await page.getByRole('status').innerText()) === '',
  );

  // Out 1.2 km, a fix every 100 m.
  await ride(page, 0, 1200);
  await page.waitForTimeout(1500);
  const outDistance = await page.getByRole('group', { name: 'Recording so far' }).innerText();
  check(
    'the distance reads one decimal: 1.2 km',
    /1\.2\s*km/.test(outDistance),
    outDistance.replace(/\n/g, ' '),
  );
  await page.waitForFunction(() => !window.__map.isMoving(), null, { timeout: 30000 });
  check(
    "Start puts the locator on the ride: the camera follows it, north up, and the dot is the locator's",
    (await locatorMode(page)) === 'TrackedLocation' &&
      (await centreOff(page, 1200)) < 15 &&
      Math.abs((await bearing(page)) % 360) < 1 &&
      (await page.locator('[data-testid="locator-overlay"]').count()) === 1,
    `${await locatorMode(page)}, ${(await centreOff(page, 1200)).toFixed(1)} m off, bearing ${await bearing(page)}`,
  );
  const lift = await page.evaluate(([lng, lat]) => {
    const stack = parseFloat(document.documentElement.style.getPropertyValue('--stack-room'));
    return { y: window.__map.project([lng, lat]).y, mid: (innerHeight - stack) / 2, stack };
  }, eastOf(1200));
  check(
    '  and it sits lifted clear of the bottom bars, in the middle of the map above them',
    lift.stack > 0 && Math.abs(lift.y - lift.mid) < 3,
    JSON.stringify(lift),
  );
  const outData = await mapSource(page);
  check(
    'the trail is drawn live: one papunta line, no switch dot yet',
    outData?.features.filter((f) => f.properties.way === 'outbound').length === 1 &&
      outData.features.filter((f) => f.properties.kind === 'switch').length === 0,
  );
  const paint = await page.evaluate(() => {
    const colour = (id) => window.__map.getPaintProperty(id, 'line-color');
    return JSON.stringify(colour('recording-trail-line'));
  });
  check(
    '  the line takes both colours from map-colours (blue/700 papunta, orange/700 pabalik)',
    paint.includes('#1447e6') && paint.includes('#ca3500'),
    paint,
  );
  await shot(page, '2-recording-papunta');

  // Stop pauses, Resume carries on.
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByRole('button', { name: 'Resume' }).waitFor();
  check(
    'Stop pauses: the bar becomes Resume, and the row stays',
    (await page.getByRole('button', { name: 'Stop', exact: true }).count()) === 0 &&
      (
        await Promise.all(
          ['Switch to Pabalik', 'Save', 'Cancel'].map((n) =>
            page.getByRole('button', { name: n }).count(),
          ),
        )
      ).every((c) => c === 1) &&
      (await page.getByRole('group', { name: 'Recording so far' }).innerText()).includes('Stopped'),
  );
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).waitFor();

  // The leg button.
  await page.getByRole('button', { name: 'Switch to Pabalik' }).click();
  await page.getByRole('button', { name: 'Switch to Papunta' }).waitFor();
  check(
    'the leg switch is announced once, politely, and the stats now say Pabalik',
    (await page.getByRole('status').innerText()) === 'Switched to Pabalik' &&
      (await page.getByRole('group', { name: 'Recording so far' }).innerText()).includes('Pabalik'),
    `${await page.getByRole('status').innerText()} / ${(await page.getByRole('group', { name: 'Recording so far' }).innerText()).replace(/\n/g, ' ')}`,
  );
  const afterSwitch = await mapSource(page);
  check(
    'a dot is left at the switch',
    afterSwitch?.features.filter((f) => f.properties.kind === 'switch').length === 1,
  );
  await ride(page, 1190, 700);
  await page.waitForTimeout(1200);
  const pabalikData = await mapSource(page);
  const lineOf = (way) =>
    pabalikData.features.filter(
      (f) => f.geometry.type === 'LineString' && f.properties.way === way,
    );
  check(
    'blue papunta and orange pabalik, joined at the switch',
    lineOf('return').length === 1 &&
      lineOf('outbound').length === 1 &&
      JSON.stringify(lineOf('return')[0].geometry.coordinates[0]) ===
        JSON.stringify(lineOf('outbound')[0].geometry.coordinates.at(-1)),
  );
  check(
    '  no dot of the recording is drawn: the locator is the one dot',
    pabalikData.features.every((f) => f.properties.kind !== 'here'),
  );
  await shot(page, '3-recording-pabalik');

  // Mark this place: a pin where the trail is, a polite "Marked", and nothing to answer.
  const markButton = page.getByRole('button', { name: 'Mark this place' });
  const markBox = await markButton.boundingBox();
  const locatorBox = await locate(page).boundingBox();
  const styleBox = await page.getByRole('button', { name: 'Map design' }).boundingBox();
  check(
    'while recording, "Mark this place" is a round 48 px button directly above the locator column',
    markBox?.width === 48 &&
      markBox.height === 48 &&
      Math.abs(markBox.x - locatorBox.x) < 1 &&
      markBox.y + markBox.height <= styleBox.y,
    JSON.stringify([markBox, locatorBox]),
  );
  await markButton.click();
  await page.getByTestId('marked-note').waitFor();
  check(
    '  a tap says "Marked" on the screen and politely in the status line, with no dialog',
    (await page.getByTestId('marked-note').innerText()) === 'Marked' &&
      (await page.getByRole('status').filter({ hasText: 'Marked, 1' }).count()) === 1 &&
      (await page.getByRole('dialog').count()) === 0,
  );
  await shot(page, '3b-marked');
  const marked = await mapSource(page);
  check(
    '  a pin is left on the trail, in the mark colour, above the line',
    marked?.features.filter((f) => f.properties.kind === 'mark').length === 1 &&
      (await page.evaluate(() =>
        window.__map.getPaintProperty('recording-trail-marks', 'circle-color'),
      )) === '#8200db' &&
      (await page.evaluate(() => {
        const ids = window.__map.getStyle().layers.map((l) => l.id);
        return ids.indexOf('recording-trail-marks') > ids.indexOf('recording-trail-line');
      })),
  );
  await page.getByTestId('marked-note').waitFor({ state: 'detached', timeout: 5000 });
  check('  "Marked" goes away by itself', true);

  // The locator's cycle: turn with the compass, north up again, a pan lets go, a tap follows.
  await face(page, 270);
  await locate(page).click();
  await page.waitForFunction(
    () => Math.abs(((window.__map.getBearing() + 360) % 360) - 270) < 5,
    null,
    {
      timeout: 30000,
    },
  );
  check(
    'a tap on the locator turns the map the way the phone faces: west, as the ride goes',
    (await locatorMode(page)) === 'TracksTheMapBasedOnCompassFacing',
    `${await locatorMode(page)}, bearing ${await bearing(page)}`,
  );
  check(
    '  its label has become "Put north up"',
    (await locate(page).getAttribute('aria-label')) === 'Put north up',
  );
  await locate(page).click();
  await page.waitForFunction(
    () => Math.abs(window.__map.getBearing()) < 1 || Math.abs(window.__map.getBearing()) > 359,
    null,
    { timeout: 30000 },
  );
  check(
    'the next tap puts north up again, still following',
    (await locatorMode(page)) === 'TrackedLocation',
    await locatorMode(page),
  );
  await page.mouse.move(200, 300);
  await page.mouse.down();
  await page.mouse.move(120, 360, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(() => !window.__map.isMoving(), null, { timeout: 30000 });
  check(
    'a pan lets the camera go: the locator button offers the way back',
    (await locatorMode(page)) === 'TrackOwnLocation' &&
      (await locate(page).getAttribute('aria-label')) === 'Show where I am',
    await locatorMode(page),
  );
  // The drag's glide is over; then a fix arrives, and the camera must not follow it.
  const centreBefore = await page.evaluate(() => window.__map.getCenter().lng);
  await ride(page, 690, 640);
  await page.waitForTimeout(1500);
  check(
    '  a new fix does not move a map the finger took',
    Math.abs((await page.evaluate(() => window.__map.getCenter().lng)) - centreBefore) < 1e-6,
  );
  await locate(page).click();
  await page.waitForFunction(() => !window.__map.isMoving(), null, { timeout: 30000 });
  check(
    '  a tap brings the camera back to the ride',
    (await locatorMode(page)) === 'TrackedLocation' && (await centreOff(page, 640)) < 15,
    `${await locatorMode(page)}, ${(await centreOff(page, 640)).toFixed(1)} m off`,
  );

  // Back within 300 m of the start: the recording ends itself and the form opens.
  await ride(page, 630, 150);
  await page.getByRole('heading', { name: 'About this route' }).waitFor({ timeout: 10000 });
  check(
    'back within 300 m of the start after a Pabalik tap and over a kilometre: auto-stop opens the Save form',
    true,
  );
  check(
    '  focus is on the form heading',
    await page.evaluate(() => document.activeElement?.textContent === 'About this route'),
  );
  check(
    '  the auto-stop was announced',
    (await page.getByRole('status').innerText()) === 'Back at the start. The recording stopped.',
  );
  check('  the watch let go of the GPS', (await page.evaluate(() => window.__watchers())) === 0);
  const labels = await page.locator('label').allInnerTexts();
  check(
    '  four visible labels: start point name, end point name, description, What did you ride?',
    ['Start point name', 'End point name', 'Description', 'What did you ride?'].every((l) =>
      labels.some((t) => t.startsWith(l)),
    ),
    labels.map((l) => l.split('\n')[0]).join(' | '),
  );
  check(
    '  Continue and Skip, and "Saving in" quietly',
    (await page.getByRole('button', { name: 'Continue' }).count()) === 1 &&
      (await page.getByRole('button', { name: 'Skip' }).count()) === 1 &&
      /Saving in \d:\d\d/.test(await page.locator('form').innerText()),
  );
  await shot(page, '4-form');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('heading', { name: 'Successfully recorded' }).waitFor();
  check(
    'Skip saves, and Successfully recorded keeps no list',
    (await page.getByRole('button', { name: 'Record again' }).count()) === 1 &&
      (await page.getByText('Saved on this phone').count()) === 0,
  );
  await shot(page, '5-success');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download last recording' }).click(),
  ]);
  const file = JSON.parse(
    await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'),
  );
  check(
    'the field-test download holds the ride: its switch, no details, many fixes',
    file.switches.length === 1 &&
      file.startPointName === '' &&
      file.rideKind === null &&
      file.fixes.length > 20 &&
      file.savedAt !== null,
    `${file.switches.length} switch, ${file.fixes.length} fixes`,
  );
  check('  and its mark', file.marks.length === 1 && !Number.isNaN(Date.parse(file.marks[0].time)));
  await page.getByRole('button', { name: 'Record again' }).click();
  await page.getByRole('button', { name: 'Start recording' }).waitFor();
  check(
    'Record again is Ready, with nothing kept on the screen, and no mark button',
    (await page.getByRole('button', { name: 'Mark this place' }).count()) === 0,
  );
  check('no page errors on the loop', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ----------------------------------------------- Save by hand, and Cancel
{
  const { page, errors } = await phone({ consented: true });
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 300);

  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByRole('button', { name: 'Resume' }).waitFor();
  await page.evaluate(() => window.__advance(600_000));
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).waitFor();
  check(
    'after ten minutes stopped, Resume shows no time for the pause before the first new fix',
    /Time\s+0 min/.test(await page.getByRole('group', { name: 'Recording so far' }).innerText()),
    (await page.getByRole('group', { name: 'Recording so far' }).innerText()).replace(/\n/g, ' '),
  );
  await ride(page, 310, 330);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('group', { name: 'Throw this recording away?' }).waitFor();
  check(
    'Cancel asks once, on the page, with focus on the safe answer',
    await page.evaluate(() => document.activeElement?.textContent === 'Keep it'),
  );
  await page.getByRole('button', { name: 'Keep it' }).click();
  await page.getByRole('button', { name: 'Cancel' }).waitFor();
  check(
    '  Keep it brings the row back and focus on Cancel',
    await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Cancel'),
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: 'About this route' }).waitFor();
  check(
    'Save by hand while recording stops the recording and shows the same form',
    (await page.evaluate(() => window.__watchers())) === 0 &&
      (await page.getByRole('button', { name: 'Continue' }).count()) === 1,
  );
  await page.getByLabel('Start point name').fill('Tala');
  await page.getByLabel('End point name').fill('Cubao');
  await page.getByLabel('What did you ride?').selectOption('Jeep');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Successfully recorded' }).waitFor();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download last recording' }).click(),
  ]);
  const file = JSON.parse(
    await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'),
  );
  check(
    'Continue saves with the details',
    file.startPointName === 'Tala' && file.endPointName === 'Cubao' && file.rideKind === 'Jeep',
    JSON.stringify([file.startPointName, file.endPointName, file.rideKind]),
  );
  await page.getByRole('button', { name: 'Record again' }).click();
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('button', { name: 'Cancel' }).waitFor();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Start recording' }).waitFor();
  check('Cancel then Delete throws the recording away and returns to Ready', true);
  check('no page errors', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// -------------------------------- a Resume after an auto-stop stops no second time
{
  const { page, errors } = await phone({ consented: true });
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 1200);
  await page.getByRole('button', { name: 'Switch to Pabalik' }).click();
  await ride(page, 1190, 200);
  await page.getByRole('heading', { name: 'About this route' }).waitFor({ timeout: 30000 });
  // The recording's stop is written to IndexedDB a moment after the form opens: reload
  // only once it has been, as a person's reload would come long after.
  for (let tries = 0; tries < 100 && (await storedStatus(page)) !== 'stopped'; tries++) {
    await page.waitForTimeout(100);
  }
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Resume' }).waitFor({ timeout: 30000 });
  check(
    'a recording that stopped itself and was reloaded is stopped, with Resume',
    (await page.getByRole('button', { name: 'Stop', exact: true }).count()) === 0,
  );
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).waitFor();
  await ride(page, 190, 50);
  await page.waitForTimeout(500);
  check(
    'Resume near the start does not stop it again',
    (await page.getByRole('button', { name: 'Stop', exact: true }).count()) === 1 &&
      (await page.getByRole('heading', { name: 'About this route' }).count()) === 0,
  );
  check('no page errors', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ------------------------------------------------------- Keep recording on the form
{
  const { page, errors } = await phone({ consented: true });
  const stats = async () =>
    (await page.getByRole('group', { name: 'Recording so far' }).innerText()).replace(/\n/g, ' ');
  const activeName = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label'));

  // (a) a wrong auto-stop, ten minutes on the form, and back.
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 1200);
  await page.getByRole('button', { name: 'Switch to Pabalik' }).click();
  await ride(page, 1190, 200);
  await page.getByRole('heading', { name: 'About this route' }).waitFor({ timeout: 30000 });
  await page.evaluate(() => window.__advance(600_000));
  await page.getByRole('button', { name: 'Keep recording' }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).waitFor();
  check(
    'Keep recording after an auto-stop: back on the recording screen, Stop focused, "Recording again" said',
    (await activeName()) === 'Stop' &&
      (await page.getByRole('status').innerText()) === 'Recording again',
    `${await activeName()} / ${await page.getByRole('status').innerText()}`,
  );
  const minutes = Number((await stats()).match(/Time\s+(\d+) min/)?.[1]);
  check(
    '  Time does not count the ten minutes on the form',
    minutes < 8,
    `${minutes} min; ${await stats()}`,
  );
  await ride(page, 190, 50);
  await page.waitForTimeout(500);
  check(
    '  a fix near the start does not stop it again, and the ways are kept',
    (await page.getByRole('heading', { name: 'About this route' }).count()) === 0 &&
      (await stats()).includes('Pabalik') &&
      (await mapSource(page)).features.filter((f) => f.properties.kind === 'switch').length === 1,
    await stats(),
  );

  // (c) then a manual Stop and Skip save it once, as one contribution.
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('heading', { name: 'Successfully recorded' }).waitFor();
  const counts = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('parapo-contribute');
        open.onsuccess = () => {
          const all = open.result.transaction('recordings').objectStore('recordings').getAll();
          all.onsuccess = () => resolve(all.result.map((r) => r.status));
        };
      }),
  );
  check(
    'after Keep recording, a manual Stop and Skip save it once, as one contribution',
    counts.length === 1 && counts[0] === 'saved',
    JSON.stringify(counts),
  );
  await page.getByRole('button', { name: 'Record again' }).click();

  // (b) a Save by hand, then Keep recording.
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 300);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: 'About this route' }).waitFor();
  await page.evaluate(() => window.__advance(600_000));
  await page.getByRole('button', { name: 'Keep recording' }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).waitFor();
  check(
    'Keep recording after a Save by hand: recording again, Stop focused, no time for the form',
    (await activeName()) === 'Stop' &&
      Number((await stats()).match(/Time\s+(\d+) min/)?.[1]) < 8 &&
      (await page.evaluate(() => window.__watchers())) === 1,
    await stats(),
  );
  await ride(page, 310, 340);
  check('  and the fixes after it count', /Distance\s+0\.3 km/.test(await stats()), await stats());
  check('no page errors', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ----------------- the locator before Start: on its own when the browser allows it, else on a tap
{
  const { page, errors } = await phone({ consented: true, granted: true });
  await page.getByRole('button', { name: 'Start recording' }).waitFor();
  await page.waitForFunction(() => !!window.__map?.loaded(), null, { timeout: 30000 });
  await page.waitForFunction(() => window.__locatorWatchers() === 1, null, { timeout: 10000 });
  check(
    'with location already allowed, the locator starts on open, and the recording has not',
    (await page.evaluate(() => window.__watchers())) === 0,
  );
  await emit(page, 0);
  await page.waitForFunction(
    (lng) => Math.abs(window.__map.getCenter().lng - lng) < 1e-4 && !window.__map.isMoving(),
    eastOf(0)[0],
    { timeout: 30000 },
  );
  check(
    '  its dot shows on the first fix, and the camera is on it, before Start',
    (await page.locator('[data-testid="locator-overlay"]').count()) === 1 &&
      (await locatorMode(page)) === 'TrackedLocation' &&
      (await centreOff(page, 0)) < 15,
    `${await locatorMode(page)}, ${(await centreOff(page, 0)).toFixed(1)} m off`,
  );
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  check(
    'Start leaves the locator following, with its own watch beside the recording',
    (await locatorMode(page)) === 'TrackedLocation' &&
      (await page.evaluate(() => [window.__watchers(), window.__locatorWatchers()])).join() ===
        '1,1',
  );
  check('no page errors', errors.length === 0, errors.join('; '));
  await page.context().close();
}
{
  const { page, errors } = await phone({ consented: true });
  await page.getByRole('button', { name: 'Start recording' }).waitFor();
  await page.waitForFunction(() => !!window.__map?.loaded(), null, { timeout: 30000 });
  await page.waitForTimeout(500);
  check(
    'without it, nothing asks until a tap: no watch, no dot, the button offers location',
    (await page.evaluate(() => window.__locatorWatchers())) === 0 &&
      (await locatorMode(page)) === 'LocationOff' &&
      (await locate(page).getAttribute('aria-label')) === 'Turn on my location',
  );
  await locate(page).click();
  check(
    '  a tap on the button asks, as on the public map',
    (await page.evaluate(() => window.__locatorWatchers())) === 1,
  );
  await emit(page, 0);
  await page.waitForFunction(
    (lng) => Math.abs(window.__map.getCenter().lng - lng) < 1e-4 && !window.__map.isMoving(),
    eastOf(0)[0],
    { timeout: 30000 },
  );
  await page.mouse.move(200, 300);
  await page.mouse.down();
  await page.mouse.move(120, 360, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(() => !window.__map.isMoving(), null, { timeout: 30000 });
  check('  a drag lets the camera go', (await locatorMode(page)) === 'TrackOwnLocation');
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await page.waitForFunction(() => !window.__map.isMoving(), null, { timeout: 30000 });
  check(
    'Start with the camera let go brings it back to the contributor',
    (await locatorMode(page)) === 'TrackedLocation',
    await locatorMode(page),
  );
  check('no page errors', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ----------------- where the buttons are, standing still, and Stop on an unfinished one
{
  const { page, errors } = await phone({ consented: true });
  await page.getByRole('button', { name: 'Start recording' }).waitFor();
  await page.waitForFunction(() => !!window.__map?.loaded(), null, { timeout: 30000 });
  // The locator's dock slides up as the stack is measured: let it settle.
  await page.waitForTimeout(800);
  const box = await page.getByRole('button', { name: 'Map design' }).boundingBox();
  const locatorBox = await locate(page).boundingBox();
  const bars = await page.locator('section[aria-labelledby="ready-heading"]').boundingBox();
  check(
    "the map-style button sits on the locator button, the public map's 48 px pair, 12 px from the right",
    box &&
      locatorBox &&
      Math.abs(box.width - 48) < 0.5 &&
      Math.abs(393 - (box.x + box.width) - 12) < 0.5 &&
      Math.abs(locatorBox.x - box.x) < 0.5 &&
      box.y + box.height <= locatorBox.y + 0.5,
    JSON.stringify([box, locatorBox]),
  );
  check(
    '  and above the Start bar, not under it',
    bars && locatorBox && locatorBox.y + locatorBox.height <= bars.y + 0.5,
    JSON.stringify([locatorBox, bars]),
  );
  check(
    '  the credits are not in that corner: they are bottom right',
    (await page.locator('.maplibregl-ctrl-top-right .maplibregl-ctrl-attrib').count()) === 0 &&
      (await page.locator('.maplibregl-ctrl-bottom-right .maplibregl-ctrl-attrib').count()) === 1,
  );
  const stack = await page.locator('section[aria-labelledby="ready-heading"]').boundingBox();
  const credits = await page.locator('.maplibregl-ctrl-bottom-right').boundingBox();
  check(
    '  and above the Start bar, not under it',
    credits && stack && credits.y + credits.height <= stack.y + 0.5,
    JSON.stringify([credits, stack]),
  );

  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 500);
  await page.waitForTimeout(1500);
  // Two minutes standing 500 m out, the phone's position wandering by up to 8 m.
  let seed = 7;
  const wander = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 16;
  const headings = [];
  for (let s = 0; s < 120; s++) {
    const [lng, lat] = eastOf(500 + wander());
    await page.evaluate(
      ([a, b]) => window.__fix(a, b, window.__advance(1000)),
      [lng, lat + wander() / 111_000],
    );
    if (s % 4 === 0) headings.push(await bearing(page));
  }
  await page.waitForTimeout(1000);
  headings.push(await bearing(page));
  const turn = Math.max(...headings.map((h) => Math.abs(((h - headings[0] + 540) % 360) - 180)));
  check(
    'standing still two minutes with the phone wandering 8 m, the map keeps its heading',
    turn < 5,
    `heading ${headings[0].toFixed(1)}°, largest turn ${turn.toFixed(1)}°`,
  );
  console.log(`  standing-still max turn: ${turn.toFixed(2)} degrees`);

  await page.reload({ waitUntil: 'load' });
  await page
    .getByRole('heading', { name: 'A recording was left open' })
    .waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByRole('button', { name: 'Resume' }).waitFor();
  check(
    'Stop on a recording left open pauses it too: Resume and Save, no form',
    (await page.getByRole('heading', { name: 'About this route' }).count()) === 0 &&
      (await page.getByRole('button', { name: 'Save', exact: true }).count()) === 1,
  );
  check('no page errors', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ------------------------------------------- two minutes alone on the form
{
  const { page, errors } = await phone({ consented: true });
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 200);
  // Installed before the form opens, so the form's own timer runs on it.
  await page.clock.install();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: 'About this route' }).waitFor();
  await page.clock.runFor(61_000);
  const sixty = await page.locator('form').innerText();
  check(
    'the form shows the time left, quietly: Saving in 1:00 after a minute',
    /Saving in 0:59|Saving in 1:00/.test(sixty),
  );
  await page.getByLabel('Description').fill('Crowded');
  await page.clock.runFor(2_000);
  check(
    'a hand on the form starts the two minutes again',
    /Saving in (1:5\d|2:00)/.test(await page.locator('form').innerText()),
    (await page.locator('form').innerText()).match(/Saving in \d:\d\d/)?.[0],
  );
  await page.clock.runFor(116_000);
  check(
    'still on the form a couple of seconds before the time is up',
    (await page.getByRole('heading', { name: 'About this route' }).count()) === 1,
  );
  await page.clock.runFor(3_000);
  await page.getByRole('heading', { name: 'Successfully recorded' }).waitFor({ timeout: 5000 });
  check('left alone for two minutes, the form closes and saves', true);
  await page.clock.resume();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download last recording' }).click(),
  ]);
  const file = JSON.parse(
    await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'),
  );
  check(
    '  and it saved what was typed',
    file.description === 'Crowded' && file.savedAt !== null,
    file.description,
  );
  check('no page errors', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ------------------------------------------- saved recordings, still there after a reload
{
  const { page, errors } = await phone({ consented: true });
  check(
    'with nothing saved, Ready shows no History',
    (await page.getByRole('heading', { name: 'History' }).count()) === 0,
  );
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 100);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByLabel('Description').fill('Reload me');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Successfully recorded' }).waitFor();
  await page.getByRole('button', { name: 'Record again' }).click();
  await openHistory(page);
  await openCardMenus(page);
  const rowDownloads = page.getByRole('button', { name: /^Download, the recording of / });
  await rowDownloads.first().waitFor();
  check('the recording just saved is listed in History', (await rowDownloads.count()) === 1);
  await page.reload({ waitUntil: 'load' });
  await openHistory(page);
  await openCardMenus(page);
  check('after a reload it is still listed', (await rowDownloads.count()) === 1);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    rowDownloads.first().click(),
  ]);
  const file = JSON.parse(
    await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'),
  );
  check(
    '  and its Download hands over that recording, read back from the phone',
    file.description === 'Reload me' && file.savedAt !== null,
    file.description,
  );
  check(
    '  History has no Start bar',
    (await page.getByRole('button', { name: 'Start recording' }).count()) === 0,
  );
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Start recording' }).waitFor();
  check('no page errors', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// --------------------------------------- the phone refusing writes, and saving anyway
/** Makes IndexedDB refuse puts into a store while `window.__fail[store]` is set. */
const FAIL_WRITES = () => {
  const put = IDBObjectStore.prototype.put;
  window.__fail = {};
  IDBObjectStore.prototype.put = function (...args) {
    if (window.__fail[this.name]) throw new DOMException('Full', 'QuotaExceededError');
    return put.apply(this, args);
  };
};
/** The recordings and the number of fixes IndexedDB holds. */
const stored = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('parapo-contribute');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(['recordings', 'fixes']);
          const recordings = tx.objectStore('recordings').getAll();
          const fixes = tx.objectStore('fixes').count();
          tx.oncomplete = () => {
            open.result.close();
            resolve({
              recordings: recordings.result.map((r) => ({
                status: r.status,
                description: r.description,
                failedFixWrites: r.failedFixWrites ?? 0,
              })),
              fixes: fixes.result,
            });
          };
        };
      }),
  );
const setFail = (page, store, on) => page.evaluate(([s, v]) => (window.__fail[s] = v), [store, on]);
const STORE_PROBLEM = 'This phone could not keep the recording.';
{
  const { page, errors } = await phone({ consented: true });
  await page.addInitScript(FAIL_WRITES);
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 100);
  await setFail(page, 'fixes', true);
  await ride(page, 110, 150);
  await setFail(page, 'fixes', false);
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: 'About this route' }).waitFor();
  check(
    'fix writes that failed are counted on the form, which offers the download',
    (await page.getByRole('button', { name: 'Download this recording' }).count()) === 1,
  );
  for (
    let tries = 0;
    tries < 50 && (await stored(page)).recordings[0]?.status !== 'stopped';
    tries++
  ) {
    await page.waitForTimeout(100);
  }
  await setFail(page, 'recordings', true);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(800);
  const refused = await stored(page);
  check(
    'a save the phone refuses stays on the form, says so, and is not marked saved',
    (await page.getByRole('heading', { name: 'About this route' }).count()) === 1 &&
      (await page.getByText(STORE_PROBLEM).count()) > 0 &&
      refused.recordings[0]?.status === 'stopped',
    JSON.stringify(refused),
  );
  check(
    '  the failed fixes were written again on the way, all 16 now stored',
    refused.fixes === 16,
    refused.fixes,
  );
  check(
    '  so the form no longer warns of fixes it could not keep',
    (await page.getByRole('button', { name: 'Download this recording' }).count()) === 0,
  );
  await setFail(page, 'recordings', false);
  await page.getByLabel('Description').fill('Crowded');
  // A tap and the form's own timeout landing together: one save, the first.
  await page.evaluate(() => {
    const byText = (t) =>
      [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
    byText('Continue').click();
    byText('Skip').click();
  });
  await page.getByRole('heading', { name: 'Successfully recorded' }).waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
  const saved = await stored(page);
  check(
    'tried again, it saves once, with what was typed, every fix and no failures left',
    saved.recordings.length === 1 &&
      saved.recordings[0].status === 'saved' &&
      saved.recordings[0].description === 'Crowded' &&
      saved.recordings[0].failedFixWrites === 0 &&
      saved.fixes === 16,
    JSON.stringify(saved),
  );
  check('no page errors', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ------------------------------------------------------------- a second tab
{
  const { page, context, errors } = await phone({ consented: true });
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 50);
  const second = await context.newPage();
  await nodeFetch(second);
  await bareStyle(second);
  await second.addInitScript(GPS);
  await second.goto(`${BASE}/contribute/`, { waitUntil: 'load' });
  await second.getByText('ParaPo is open in another tab').waitFor({ timeout: 10000 });
  check(
    'a second tab does not reopen the ride the first is recording',
    (await second.getByRole('button', { name: 'Resume' }).count()) === 0,
  );
  await second.getByRole('button', { name: 'Start recording' }).click();
  await second.waitForTimeout(500);
  const both = await stored(page);
  check(
    '  and its Start records nothing: still one recording, and the warning stays',
    (await second.getByRole('group', { name: 'Recording so far' }).count()) === 0 &&
      (await second.getByText('ParaPo is open in another tab').count()) > 0 &&
      both.recordings.length === 1,
    JSON.stringify(both.recordings),
  );
  await openHistory(second);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByLabel('Description').fill('From the first tab');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Successfully recorded' }).waitFor();
  await second
    .getByRole('heading', { level: 1, name: 'History' })
    .waitFor({ timeout: 5000 })
    .catch(() => {});
  await openCardMenus(second);
  check(
    '  once the first tab saves, the second lists it without a reload',
    (await second
      .getByRole('button', { name: /^Download, the recording of .*, From the first tab$/ })
      .count()) === 1,
  );
  check('no page errors', errors.length === 0, errors.join('; '));
  await context.close();
}

// ------------------------------------------------- one wake lock, released on Stop
const WAKE = () => {
  window.__wake = { requests: 0, active: 0, pending: [] };
  let visible = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visible });
  window.__show = (state) => {
    visible = state;
    document.dispatchEvent(new Event('visibilitychange'));
  };
  window.__grant = () => window.__wake.pending.splice(0).forEach((grant) => grant());
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: {
      request: () => {
        window.__wake.requests++;
        return new Promise((resolve) =>
          window.__wake.pending.push(() => {
            const sentinel = new EventTarget();
            sentinel.released = false;
            sentinel.release = async () => {
              if (sentinel.released) return;
              sentinel.released = true;
              window.__wake.active--;
              sentinel.dispatchEvent(new Event('release'));
            };
            window.__wake.active++;
            resolve(sentinel);
          }),
        );
      },
    },
  });
};
{
  const { page, errors } = await phone({ consented: true });
  await page.addInitScript(WAKE);
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await page.evaluate(() => {
    window.__show('hidden');
    window.__show('visible');
  });
  await page.evaluate(() => window.__grant());
  await page.waitForTimeout(200);
  const held = await page.evaluate(() => ({ ...window.__wake, pending: undefined }));
  check(
    'the page shown again while the wake lock is being asked for asks no second time',
    held.requests === 1 && held.active === 1,
    JSON.stringify(held),
  );
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.waitForTimeout(200);
  check('  and Stop lets the one lock go', (await page.evaluate(() => window.__wake.active)) === 0);
  check('no page errors', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ------------------------------------------- Back to the map on every screen, and a ride kept
{
  const { page, errors } = await phone({ consented: true });
  const back = page.getByRole('button', { name: 'Back to the map' });
  const hasOneBack = async () => (await back.count()) === 1;
  await page.getByRole('button', { name: 'Start recording' }).waitFor();
  check('Ready has Back to the map', await hasOneBack());

  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 300);
  check('Recording has Back to the map', await hasOneBack());
  // Fixes are written as they arrive; Back waits for any still in flight.
  const distanceOf = async () =>
    (await page.getByRole('group', { name: 'Recording so far' }).innerText())
      .match(/Distance\s+(\S+\s*\S*)/)?.[1]
      .trim();
  const distanceBefore = await distanceOf();
  await back.click();
  await page.waitForURL((url) => url.pathname === '/');
  check('  pressing it leaves for the public map', new URL(page.url()).pathname === '/');

  await page.goto(`${BASE}/contribute/`, { waitUntil: 'load' });
  await page.getByRole('heading', { name: 'A recording was left open' }).waitFor();
  check(
    '  coming back shows the ride as left open, with the distance it had',
    Boolean(distanceBefore) && (await distanceOf()) === distanceBefore,
    `${distanceBefore} / ${await distanceOf()}`,
  );
  check('Unfinished has Back to the map', await hasOneBack());

  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('heading', { name: 'Successfully recorded' }).waitFor();
  check('Saved has Back to the map, in front of the screen', await hasOneBack());
  await back.click();
  await page.waitForURL((url) => url.pathname === '/');
  check('  and it leaves for the public map', new URL(page.url()).pathname === '/');
  check('no page errors', errors.length === 0, errors.join('; '));
  await page.context().close();
}

await browser.close();
tally();
