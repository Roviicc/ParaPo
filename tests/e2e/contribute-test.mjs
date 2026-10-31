// The contributor page /contribute/, driven by a phone: a mocked GPS walks the
// whole loop and the screens answer it.
//
//   npm run dev                          (in another terminal)
//   node tests/e2e/contribute-test.mjs
//
// PARA_SHOTS=dir keeps screenshots of Ready, Recording (Lakad, then
// Sakay), the Save form and Successfully recorded at 393×852.
//
// The GPS is a stand-in navigator.geolocation the suite feeds fix by fix, with
// timestamps of its own (a second apart), so a kilometre out and back takes
// no time. The 2-minute form timeout runs on Playwright's fake clock.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { fakeContributions } from './lib/fake-contributions.mjs';
import { BASE, bareStyle, harness, nodeFetch } from './lib/harness.mjs';
import { checkLocationLabels } from './lib/location-labels.mjs';

const { check, tally } = harness();
const SHOTS = process.env.PARA_SHOTS;
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
 * A phone-sized page with the stand-in GPS. `earlierConsent` stores the first consent screen's
 * agreement, as a phone from before kept it. `granted` is a browser that already lets the page
 * read the location.
 */
async function phone({ earlierConsent = false, granted = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  // The browser already lets the page read the location, as it does after a first visit's yes.
  if (granted) await context.grantPermissions(['geolocation']);
  const page = await context.newPage();
  // PARA_CPU_THROTTLE=4 runs the page at a quarter of the container's speed, as a slow CI runner is.
  if (process.env.PARA_CPU_THROTTLE) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', {
      rate: Number(process.env.PARA_CPU_THROTTLE),
    });
  }
  await nodeFetch(page);
  await bareStyle(page);
  // Saved recordings upload: to the stand-in, never to a real project (upload-test covers it).
  await fakeContributions(page);
  await page.addInitScript(GPS);
  if (earlierConsent) {
    await page.addInitScript(() => localStorage.setItem('para.contribute.consent', 'yes'));
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
/** Ready's History tab, in the toolbar under Start tracking. */
const historyTab = (page) =>
  page.getByRole('navigation', { name: 'Screens' }).getByRole('button', { name: 'History' });
/** The Record tab, in the toolbar at the foot of History: back to Start. */
const recordTab = (page) =>
  page.getByRole('navigation', { name: 'Screens' }).getByRole('button', { name: 'Record' });
/** The History screen, opened by Ready's History tab unless it is already showing. */
const openHistory = async (page) => {
  const heading = page.getByRole('heading', { level: 1, name: 'History' });
  const history = historyTab(page);
  // A reload on #history lands on the screen itself; otherwise Ready's History tab opens it.
  await heading.or(history).waitFor({ timeout: 10000 });
  if (await heading.isVisible()) return;
  await history.click();
  await heading.waitFor();
};
/** The first card's ⋮ menu opened, so its Remove from this phone is there to press. */
const openCardMenu = async (page) => {
  const more = page.getByRole('button', { name: /^More actions/ }).first();
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
};
/**
 * The newest saved recording on this phone, read back from IndexedDB as History reads it, with
 * how many fixes it keeps: what the contributor's phone holds, in place of a file handed over.
 */
const lastSavedRide = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('para-contribute');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(['recordings', 'fixes']);
          const recordings = tx.objectStore('recordings').getAll();
          const fixes = tx.objectStore('fixes').getAll();
          tx.oncomplete = () => {
            open.result.close();
            const saved = recordings.result
              .filter((r) => r.status === 'saved')
              .sort((a, b) => b.savedAt - a.savedAt);
            const ride = saved[0] ?? null;
            resolve(
              ride && {
                ...ride,
                fixes: fixes.result.filter((f) => f.recordingId === ride.id).length,
              },
            );
          };
        };
      }),
  );
/** The card's Time in seconds, whether it reads "42 sec" or "12 min". */
const recordedSeconds = (stats) => {
  const [, value, unit] = stats.match(/Time\s+(\d+) (sec|min)/) ?? [];
  return Number(value) * (unit === 'min' ? 60 : 1);
};
/** Pause, then Finish: how a recording ends and opens the Save form. */
const finishRecording = async (page) => {
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  if (await pause.count()) await pause.click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
};
/** Start's ⓘ, which opens the map's credits as the Map Data Source sheet. */
const creditsButton = (page) => page.getByRole('button', { name: 'Map data sources' });
/** Flag a stop, at the top of the right-hand column while recording. */
const flagButton = (page) => page.getByRole('button', { name: 'Flag a stop' });
/** The tint's state and its edges' colour: "lakad:from-blue-700/10". */
const tintOf = (page) =>
  page.evaluate(() => {
    const tint = document.querySelector('[data-tint]');
    const from = tint?.firstElementChild?.className.match(/from-\S+/)?.[0];
    return `${tint?.getAttribute('data-tint')}:${from}`;
  });
/** The fold: the chevron at the left over the card, or at the foot with it folded away. */
const foldButton = (page) => page.getByRole('button', { name: /^(Hide|Show) the recording card$/ });
const buttons = (page) =>
  page
    .getByRole('button')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent));

// ----------------------------------- no consent screen, whatever the phone kept
{
  const { page, errors } = await phone({ earlierConsent: true });
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor({ timeout: 20000 });
  check(
    'a phone that agreed to the first consent screen opens on Start: no consent screen is shown',
    (await page.getByRole('heading', { name: 'Before you record' }).count()) === 0 &&
      (await page.getByRole('button', { name: 'Okay, I understand' }).count()) === 0 &&
      errors.length === 0,
    errors.join(' | '),
  );
  check(
    '  the web page never shows the Android app’s permissions screen: the browser asks at Start',
    (await page.getByRole('heading', { name: 'Para needs some permissions' }).count()) === 0 &&
      (await page.getByRole('switch').count()) === 0,
  );
}

// ---------------------------------------------------------------- the loop
{
  const { page, errors } = await phone();
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor({ timeout: 20000 });
  check(
    'a first visit opens on Start, with no consent screen and focus on the heading',
    (await page.getByRole('heading', { name: 'Before you record' }).count()) === 0 &&
      (await page.evaluate(() => document.activeElement?.id === 'ready-heading')),
  );
  await page.waitForFunction(() => !!window.__map?.loaded(), null, { timeout: 30000 });
  {
    const start = await page.getByRole('button', { name: 'Start Tracking' }).boundingBox();
    const info = await creditsButton(page).boundingBox();
    check(
      "on a first visit the map's ⓘ sits at the bottom left, under Start tracking, and MapLibre's credits are gone",
      start &&
        info &&
        info.y >= start.y + start.height - 0.5 &&
        !(await page.locator('.maplibregl-ctrl-attrib').isVisible()),
      JSON.stringify([info, start]),
    );
  }
  await page.waitForFunction(() => !!window.__map?.loaded());
  check(
    'Ready: Start, the top left empty until there is a tutorial (no ?, no Back to the map), no saved-recordings list',
    (await page.getByRole('button', { name: 'Back to the map' }).count()) === 0 &&
      (await page.getByRole('button', { name: 'How to record' }).count()) === 0 &&
      (await page.getByText('Saved on this phone').count()) === 0 &&
      (await page.getByText('No saved recordings yet.').count()) === 0,
  );
  {
    const history = historyTab(page);
    check(
      '  with no accounts in the build the tabs under Start tracking are Record and History, no Account; the top right empty, nothing of History shows',
      (await history.count()) === 1 &&
        (await page.getByRole('button', { name: 'History' }).count()) === 1 &&
        (await page.getByRole('button', { name: 'Account' }).count()) === 0 &&
        (await page.getByRole('heading', { name: 'History' }).count()) === 0 &&
        (await page.getByRole('button', { name: 'Start Tracking' }).count()) === 1 &&
        (await page.getByText('Start Tracking').count()) === 1,
    );
    const start = await page.getByRole('button', { name: 'Start Tracking' }).boundingBox();
    const tabs = await page.getByRole('navigation', { name: 'Screens' }).boundingBox();
    const stack = await page.locator('section[aria-labelledby="ready-heading"]').boundingBox();
    check(
      "  as Figma's Record has it: Start tracking 32 in each side and 48 tall, the tabs 12 under it, 32 over the foot",
      !!start &&
        !!tabs &&
        !!stack &&
        Math.abs(stack.y - start.y) <= 1 &&
        Math.abs(start.x - 32) <= 0.5 &&
        Math.abs(start.width - (393 - 64)) <= 0.5 &&
        Math.abs(start.height - 48) <= 0.5 &&
        Math.abs(tabs.y - (start.y + start.height) - 12) <= 0.5 &&
        Math.abs(stack.y + stack.height - (tabs.y + tabs.height) - 32) <= 0.5,
      JSON.stringify([stack, tabs, start]),
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
      starts: await page.getByRole('button', { name: 'Start Tracking' }).count(),
      // History is a tab like Account: the toolbar at its foot, History marked, Record beside it.
      tabs: await page.getByRole('navigation', { name: 'Screens' }).count(),
      marked: await page
        .getByRole('navigation', { name: 'Screens' })
        .locator('[aria-current="page"]')
        .textContent(),
      records: await recordTab(page).count(),
      accounts: await page.getByRole('button', { name: 'Account' }).count(),
      backs: await page.getByRole('button', { name: 'Back', exact: true }).count(),
      // Inert, not removed: the map stays mounted, but nothing in it can be focused or pressed.
      isMapInert: await page.evaluate(
        () => !!document.querySelector('button[aria-label="Map design"]')?.closest('[inert]'),
      ),
      empty: await page.getByText('No recordings yet.').count(),
    };
    check(
      '  History opens at #history, focus on its heading, no Start, no Back, the toolbar with History marked and Record (no Account in this build), no map controls reachable',
      opened.hash === '#history' &&
        opened.focus === 'History' &&
        opened.starts === 0 &&
        opened.tabs === 1 &&
        opened.marked === 'History' &&
        opened.records === 1 &&
        opened.accounts === 0 &&
        opened.backs === 0 &&
        opened.isMapInert &&
        opened.empty === 1,
      JSON.stringify(opened),
    );
    await page.reload({ waitUntil: 'load' });
    await page.getByRole('heading', { level: 1, name: 'History' }).waitFor({ timeout: 10000 });
    check('  a reload stays on History', (await page.evaluate(() => location.hash)) === '#history');
    await recordTab(page).click();
    await page.getByRole('button', { name: 'Start Tracking' }).waitFor();
    check(
      '  its Record tab returns to Ready, and the hash is gone',
      (await page.evaluate(() => location.hash)) === '',
    );
    await historyTab(page).click();
    await page.getByRole('heading', { level: 1, name: 'History' }).waitFor();
    await recordTab(page).click();
    await page.getByRole('button', { name: 'Start Tracking' }).waitFor();
    check(
      '  opened from the History tab, Record hands focus back to the History tab',
      await page
        .waitForFunction(
          () =>
            document.activeElement?.textContent === 'History' &&
            !!document.activeElement.closest('nav[aria-label="Screens"]'),
          null,
          { timeout: 5000 },
        )
        .then(() => true)
        .catch(() => false),
    );
    await historyTab(page).click();
    await page.getByRole('heading', { level: 1, name: 'History' }).waitFor();
    await page.goBack();
    await page.getByRole('button', { name: 'Start Tracking' }).waitFor();
    check(
      "  the browser's Back returns to Ready with focus back on the tab too",
      (await page.getByRole('heading', { name: 'History' }).count()) === 0 &&
        (await page
          .waitForFunction(
            () =>
              document.activeElement?.textContent === 'History' &&
              !!document.activeElement.closest('nav[aria-label="Screens"]'),
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

  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  check(
    'Start begins on Lakad: the stats say so, and the mode button offers Sakay',
    (await page.getByRole('group', { name: 'Recording so far' }).innerText()).includes('Lakad') &&
      (await page.getByRole('group', { name: 'Recording so far' }).innerText()).includes(
        'Recording',
      ) &&
      (await buttons(page)).join('|').includes('Switch to Sakay'),
  );
  check(
    '  Pause, Switch to Sakay and ✕ (Discard recording) are buttons, and nothing else ends it',
    (await page.getByRole('button', { name: 'Finish', exact: true }).count()) === 0 &&
      (
        await Promise.all(
          ['Pause', 'Switch to Sakay', 'Discard recording'].map((n) =>
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
    'the trail is drawn live: one walked line, and the start leaves no switch dot',
    outData?.features.filter((f) => f.properties.mode === 'walk').length === 1 &&
      outData.features.filter((f) => f.properties.kind === 'switch').length === 0,
  );
  const paint = await page.evaluate(() => {
    const paintOf = (id, name) => window.__map.getPaintProperty(id, name);
    return JSON.stringify({
      ride: paintOf('recording-trail-line', 'line-color'),
      walk: paintOf('recording-trail-walk', 'line-color'),
      dashes: paintOf('recording-trail-walk', 'line-dasharray'),
      cap: window.__map.getLayoutProperty('recording-trail-walk', 'line-cap'),
      foot: window.__map.getLayoutProperty('recording-trail-feet', 'icon-image'),
      hasFoot: window.__map.hasImage('recording-trail-foot'),
    });
  });
  check(
    "  walked in round dashes with a foot along it in blue/700, ridden solid in green/700, the tint's Lakad and Sakay from map-colours",
    paint ===
      JSON.stringify({
        ride: '#008236',
        walk: '#1447e6',
        dashes: [0.5, 2],
        cap: 'round',
        foot: 'recording-trail-foot',
        hasFoot: true,
      }),
    paint,
  );
  await shot(page, '2-recording-lakad');
  check(
    "  Lakad tints the map's edges blue/700 at 10%, Figma's OverlayIndicator",
    (await tintOf(page)) === 'lakad:from-blue-700/10',
  );

  // Pause, and Resume carries on.
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Resume' }).waitFor();
  check(
    '  Paused tints them neutral/900, and Flag a stop shows, disabled',
    (await tintOf(page)) === 'paused:from-neutral-900/10' && (await flagButton(page).isDisabled()),
  );
  const pausedCard = await page.getByRole('group', { name: 'Recording so far' }).innerText();
  check(
    'Pause: Resume and Finish replace Pause and the mode button, and the card says Paused and --',
    (await page.getByRole('button', { name: 'Pause', exact: true }).count()) === 0 &&
      (await page.getByRole('button', { name: /^Switch to/ }).count()) === 0 &&
      (await page.getByRole('button', { name: 'Finish', exact: true }).count()) === 1 &&
      (await page.getByRole('button', { name: 'Discard recording' }).count()) === 1 &&
      pausedCard.includes('Paused') &&
      pausedCard.includes('--'),
    pausedCard.replace(/\n/g, ' '),
  );
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();

  // The mode button.
  await page.getByRole('button', { name: 'Switch to Sakay' }).click();
  await page.getByRole('button', { name: 'Switch to Lakad' }).waitFor();
  check(
    'the mode switch is announced once, politely, and the stats now say Sakay',
    (await page.getByRole('status').innerText()) === 'Switched to Sakay' &&
      (await page.getByRole('group', { name: 'Recording so far' }).innerText()).includes('Sakay'),
    `${await page.getByRole('status').innerText()} / ${(await page.getByRole('group', { name: 'Recording so far' }).innerText()).replace(/\n/g, ' ')}`,
  );
  const afterSwitch = await mapSource(page);
  check(
    'a dot is left at the switch',
    afterSwitch?.features.filter((f) => f.properties.kind === 'switch').length === 1,
  );
  await ride(page, 1190, 700);
  await page.waitForTimeout(1200);
  const sakayData = await mapSource(page);
  const lineOf = (mode) =>
    sakayData.features.filter(
      (f) => f.geometry.type === 'LineString' && f.properties.mode === mode,
    );
  check(
    'a walked line and a ridden line, joined at the switch',
    lineOf('ride').length === 1 &&
      lineOf('walk').length === 1 &&
      JSON.stringify(lineOf('ride')[0].geometry.coordinates[0]) ===
        JSON.stringify(lineOf('walk')[0].geometry.coordinates.at(-1)),
  );
  check(
    '  no dot of the recording is drawn: the locator is the one dot',
    sakayData.features.every((f) => f.properties.kind !== 'here'),
  );
  await shot(page, '3-recording-sakay');

  check(
    "  Sakay tints the map's edges green/700 at 10%",
    (await tintOf(page)) === 'sakay:from-green-700/10',
  );

  // Flag a stop: Figma's flagstop pin where the trail is, a polite "Flagged", nothing to answer.
  const flagBox = await flagButton(page).boundingBox();
  const locatorBox = await locate(page).boundingBox();
  const styleBox = await page.getByRole('button', { name: 'Map design' }).boundingBox();
  check(
    'while recording, Flag a stop is a 48 px button at the top of the right-hand column, 16 over the map-style button',
    flagBox?.width === 48 &&
      flagBox.height === 48 &&
      Math.abs(flagBox.x - locatorBox.x) < 1 &&
      Math.abs(styleBox.y - (flagBox.y + flagBox.height) - 16) < 0.5 &&
      Math.abs(393 - (locatorBox.x + locatorBox.width) - 20) < 0.5,
    JSON.stringify([flagBox, styleBox, locatorBox]),
  );
  await flagButton(page).click();
  await page.getByTestId('flagged-note').waitFor();
  check(
    '  on Sakay a tap says "Flagged" on the screen and politely in the status line, with no dialog',
    (await page.getByTestId('flagged-note').innerText()) === 'Flagged' &&
      (await page.getByRole('status').filter({ hasText: 'Flagged, 1' }).count()) === 1 &&
      (await page.getByRole('dialog').count()) === 0,
  );
  await shot(page, '3b-flagged');
  const marked = await mapSource(page);
  check(
    "  Figma's flagstop pin is left on the trail, its point on the place, above the line",
    marked?.features.filter((f) => f.properties.kind === 'mark').length === 1 &&
      (await page.evaluate(() => {
        const m = window.__map;
        const layer = m.getLayer('recording-trail-marks');
        const ids = m.getStyle().layers.map((l) => l.id);
        return (
          layer?.type === 'symbol' &&
          m.getLayoutProperty('recording-trail-marks', 'icon-image') === 'recording-trail-flag' &&
          m.getLayoutProperty('recording-trail-marks', 'icon-anchor') === 'bottom-left' &&
          m.hasImage('recording-trail-flag') &&
          ids.indexOf('recording-trail-marks') > ids.indexOf('recording-trail-line')
        );
      })),
  );
  await page.getByTestId('flagged-note').waitFor({ state: 'detached', timeout: 5000 });
  check('  "Flagged" goes away by itself', true);

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

  // Back near the start, the recording goes on: it ends only when the contributor saves it.
  await ride(page, 630, 150);
  await page.waitForTimeout(1500);
  check(
    'back within 300 m of the start after a kilometre, the recording goes on: it never stops itself',
    (await page.getByRole('button', { name: 'Pause', exact: true }).count()) === 1 &&
      (await page.getByRole('heading', { name: 'About this route' }).count()) === 0,
  );
  await finishRecording(page);
  await page.getByRole('heading', { name: 'About this route' }).waitFor({ timeout: 10000 });
  check(
    'Pause and Finish open the Save form, focus on its heading',
    await page.evaluate(() => document.activeElement?.textContent === 'About this route'),
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
  check(
    'Successfully recorded offers no Download: the ride is kept on the phone, nothing handed over',
    (await page.getByRole('button', { name: /download/i }).count()) === 0,
  );
  const file = await lastSavedRide(page);
  check(
    'the phone keeps the ride: its start on Lakad and its switch to Sakay, no details, many fixes',
    JSON.stringify(file.modes.map((m) => m.to)) === '["walk","ride"]' &&
      file.startPointName === '' &&
      file.rideKind === null &&
      file.fixes > 20 &&
      file.savedAt !== null,
    `${file.modes.length} modes, ${file.fixes} fixes`,
  );
  check('  and its mark', file.marks.length === 1 && Number.isFinite(file.marks[0].time));
  await page.getByRole('button', { name: 'Record again' }).click();
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor();
  check(
    'Record again is Ready, with nothing kept on the screen, and no Flag a stop',
    (await flagButton(page).count()) === 0,
  );
  check('no page errors on the loop', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ----------------------------------------------- Finish by hand, and ✕
{
  const { page, errors } = await phone();
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 300);

  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Resume' }).waitFor();
  await page.evaluate(() => window.__advance(600_000));
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  check(
    'after ten minutes stopped, Resume shows no time for the pause before the first new fix',
    /Time\s+\d+ sec/.test(await page.getByRole('group', { name: 'Recording so far' }).innerText()),
    (await page.getByRole('group', { name: 'Recording so far' }).innerText()).replace(/\n/g, ' '),
  );
  await ride(page, 310, 330);
  // ✕ pauses the recording and asks over the whole screen.
  const stopScreen = page.getByRole('alertdialog', { name: 'Stop and delete this ride?' });
  const distanceShown = (await page.getByRole('group', { name: 'Recording so far' }).innerText())
    .match(/Distance\s+(\S+ \S+)|(\S+ (?:m|km))\s+Distance/)
    ?.slice(1)
    .find(Boolean);
  await page.getByRole('button', { name: 'Discard recording' }).click();
  await stopScreen.waitFor();
  check(
    '✕ pauses the recording and asks on a screen of its own, with the distance so far, focus on Keep recording',
    (await page.evaluate(() => window.__watchers())) === 0 &&
      (await stopScreen.getAttribute('aria-modal')) === 'true' &&
      (
        await page.evaluate(() => {
          const screen = document.querySelector('[role="alertdialog"]');
          const text = document.getElementById(screen?.getAttribute('aria-describedby') ?? '');
          return text?.textContent ?? '';
        })
      ).startsWith('You’ve recorded ') &&
      (await stopScreen.innerText()).includes('Recording Paused') &&
      (await page.evaluate(() => document.activeElement?.textContent === 'Keep recording')) &&
      (await page.evaluate(
        () => !!document.querySelector('[aria-label="Discard recording"]')?.closest('[inert]'),
      )),
    distanceShown,
  );
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Tab');
  check(
    '  Tab goes round its two buttons',
    await page.evaluate(() => !!document.activeElement?.closest('[role="alertdialog"]')),
  );
  // Where the question and the figures stand, and whether the screen scrolls to reach them.
  const stopLayout = () =>
    page.evaluate(() => {
      const screen = document.querySelector('[role="alertdialog"]');
      const box = (testId) =>
        screen.querySelector(`[data-testid="${testId}"]`).getBoundingClientRect();
      const question = box('stop-question');
      const paused = box('stop-paused');
      return {
        middle: question.top + question.height / 2,
        questionBottom: question.bottom,
        pausedTop: paused.top,
        pausedBottom: paused.bottom,
        height: screen.clientHeight,
        isScrolling: screen.scrollHeight > screen.clientHeight,
      };
    });
  {
    const layout = await stopLayout();
    check(
      "  as the frame has it: the question's middle 40 over the screen's, the figures at its foot, no scroll",
      Math.abs(layout.middle - (layout.height / 2 - 40)) < 1 &&
        Math.abs(layout.pausedBottom - layout.height) < 1 &&
        layout.questionBottom <= layout.pausedTop &&
        !layout.isScrolling,
      JSON.stringify(layout),
    );
  }
  // A short phone, or one on its side: the whole screen scrolls, the figures last, nothing overlaps.
  await page.setViewportSize({ width: 360, height: 480 });
  await page.waitForTimeout(200);
  {
    const layout = await stopLayout();
    const keep = stopScreen.getByRole('button', { name: 'Keep recording' });
    const stop = stopScreen.getByRole('button', { name: 'Stop without saving' });
    await stop.scrollIntoViewIfNeeded();
    const isStopInView = await stop.evaluate((button) => {
      const { top, bottom } = button.getBoundingClientRect();
      return top >= 0 && bottom <= window.innerHeight;
    });
    // Scrolled to the end, the figures are whole on the screen.
    const isPausedInView = await stopScreen.evaluate((screen) => {
      screen.scrollTop = screen.scrollHeight;
      const paused = screen.querySelector('[data-testid="stop-paused"]').getBoundingClientRect();
      return paused.top >= 0 && paused.bottom <= window.innerHeight + 0.5;
    });
    await keep.scrollIntoViewIfNeeded();
    const isKeepInView = await keep.evaluate((button) => {
      const { top, bottom } = button.getBoundingClientRect();
      return top >= 0 && bottom <= window.innerHeight;
    });
    check(
      '  at 360×480 the screen scrolls: both answers and the figures are reached, none over another',
      layout.isScrolling &&
        layout.questionBottom + 24 <= layout.pausedTop + 0.5 &&
        isStopInView &&
        isPausedInView &&
        isKeepInView,
      JSON.stringify({ ...layout, isStopInView, isPausedInView, isKeepInView }),
    );
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await stopScreen.getByRole('button', { name: 'Keep recording' }).click();
  await stopScreen.waitFor({ state: 'detached' });
  check(
    '  Keep recording resumes the recording it paused, and puts focus back on ✕',
    (await page.getByRole('button', { name: 'Pause', exact: true }).count()) === 1 &&
      (await page.evaluate(() => window.__watchers())) === 1 &&
      (await page.evaluate(
        () => document.activeElement?.getAttribute('aria-label') === 'Discard recording',
      )),
  );
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Resume' }).waitFor();
  await page.getByRole('button', { name: 'Discard recording' }).click();
  await stopScreen.waitFor();
  await page.keyboard.press('Escape');
  await stopScreen.waitFor({ state: 'detached' });
  check(
    '  paused before ✕, Escape keeps recording and it stays paused',
    (await page.getByRole('button', { name: 'Resume' }).count()) === 1 &&
      (await page.evaluate(
        () => document.activeElement?.getAttribute('aria-label') === 'Discard recording',
      )),
  );
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  await finishRecording(page);
  await page.getByRole('heading', { name: 'About this route' }).waitFor();
  check(
    'Pause and Finish by hand stop the recording and show the same form',
    (await page.evaluate(() => window.__watchers())) === 0 &&
      (await page.getByRole('button', { name: 'Continue' }).count()) === 1,
  );
  await page.getByLabel('Start point name').fill('Tala');
  await page.getByLabel('End point name').fill('Cubao');
  await page.getByLabel('What did you ride?').selectOption('Jeep');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Successfully recorded' }).waitFor();
  const file = await lastSavedRide(page);
  check(
    'Continue saves with the details',
    file.startPointName === 'Tala' && file.endPointName === 'Cubao' && file.rideKind === 'Jeep',
    JSON.stringify([file.startPointName, file.endPointName, file.rideKind]),
  );
  await page.getByRole('button', { name: 'Record again' }).click();
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await page.getByRole('button', { name: 'Discard recording' }).waitFor();
  await page.getByRole('button', { name: 'Discard recording' }).click();
  await page.getByRole('button', { name: 'Stop without saving' }).click();
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor();
  check(
    '✕ then Stop without saving throws the recording away and lands on Start',
    (await page.getByRole('alertdialog').count()) === 0 &&
      (await page.evaluate(() => window.__watchers())) === 0,
  );
  check('no page errors', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ------------------------------------------- Flag a stop on Lakad, and the card folded away
{
  const { page, errors } = await phone();
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 60);
  await flagButton(page).click();
  check(
    'on Lakad, Flag a stop is enabled and flags the place',
    (await page.getByRole('status').filter({ hasText: 'Flagged, 1' }).count()) === 1 &&
      (await mapSource(page))?.features.filter((f) => f.properties.kind === 'mark').length === 1,
  );
  // The column's tooltips run past the screen's edge: the page must not slide to them, even from
  // code, as focus and scrollIntoView do (once seen on CI: every control 72 in and 16 up).
  check(
    '  the page cannot be scrolled, even from code: nothing slides',
    await page.evaluate(() => {
      const main = document.querySelector('main');
      main.scrollLeft = 1000;
      main.scrollTop = 1000;
      document.querySelector('[aria-label="Flag a stop"]').scrollIntoView({ inline: 'end' });
      return main.scrollLeft === 0 && main.scrollTop === 0;
    }),
  );

  const discard = await page.getByRole('button', { name: 'Discard recording' }).boundingBox();
  check(
    "✕ stands 20 in and 17 under the safe area's top, as the recording frames have it",
    Math.abs(discard.x - 20) < 0.5 && Math.abs(discard.y - 17) < 0.5,
    JSON.stringify(discard),
  );

  const card = page.getByRole('group', { name: 'Recording so far' });
  const open = {
    fold: await foldButton(page).boundingBox(),
    locator: await locate(page).boundingBox(),
    card: await card.boundingBox(),
  };
  check(
    'open, the chevron is at the left, 20 in, level with the column, both 16 over the card',
    (await foldButton(page).getAttribute('aria-label')) === 'Hide the recording card' &&
      (await foldButton(page).getAttribute('aria-expanded')) === 'true' &&
      Math.abs(open.fold.x - 20) < 0.5 &&
      Math.abs(open.fold.y + open.fold.height - (open.locator.y + open.locator.height)) < 0.5,
    JSON.stringify(open),
  );
  // The ⓘ under the card opens the credits, and has the focus back once they close.
  const sheet = page.getByRole('dialog', { name: 'Map Data Source' });
  await creditsButton(page).click();
  await sheet.waitFor();
  check(
    'while recording, the ⓘ under the card opens Map Data Source, the screen inert under it',
    await page.evaluate(
      () => !!document.querySelector('[aria-label="Discard recording"]')?.closest('[inert]'),
    ),
  );
  await page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  check(
    '  Escape closes it, focus back on the ⓘ',
    await page.evaluate(
      () => document.activeElement?.getAttribute('aria-label') === 'Map data sources',
    ),
  );
  await foldButton(page).click();
  await card.waitFor({ state: 'hidden' });
  // The column and the chevron slide down together (duration/sheet).
  await page.waitForTimeout(800);
  const folded = {
    fold: await foldButton(page).boundingBox(),
    locator: await locate(page).boundingBox(),
    stack: await page.locator('section[aria-labelledby="recording-heading"]').boundingBox(),
    isAwakeNoteShown: (await page.getByText('The screen could not be kept awake').count()) > 0,
  };
  // Folded, the stack is Figma's 40 under the column, less the column's 16 over it; here the
  // headless browser's note that the screen may sleep stands in it too.
  const foldedFoot = 852 - (folded.locator.y + folded.locator.height);
  check(
    '  folded: the card hides, and the column and the chevron, turned up, slide down to 16 over what is left of the stack',
    (await foldButton(page).getAttribute('aria-label')) === 'Show the recording card' &&
      (await foldButton(page).getAttribute('aria-expanded')) === 'false' &&
      folded.locator.y + folded.locator.height > open.locator.y + open.locator.height + 100 &&
      Math.abs(folded.stack.y - (folded.locator.y + folded.locator.height) - 16) < 0.5 &&
      (folded.isAwakeNoteShown || Math.abs(foldedFoot - 40) < 0.5) &&
      Math.abs(folded.fold.y + folded.fold.height - (folded.locator.y + folded.locator.height)) <
        0.5 &&
      (await page.evaluate(() => document.activeElement?.getAttribute('aria-expanded'))) ===
        'false',
    JSON.stringify(folded),
  );
  await creditsButton(page).click();
  await sheet.waitFor();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await sheet.waitFor({ state: 'detached' });
  check('  folded, the ⓘ opens it too', true);
  const fixesBefore = (await mapSource(page))?.features.find(
    (f) => f.geometry.type === 'LineString',
  )?.geometry.coordinates.length;
  await ride(page, 61, 90);
  // The trail is redrawn after React has the fixes, not as each one is emitted: wait for it.
  const fixesAfter = await page
    .waitForFunction(
      (before) => {
        const length = window.__map
          .getSource('recording-trail')
          ?.serialize()
          .data?.features.find((f) => f.geometry.type === 'LineString')?.geometry
          .coordinates.length;
        return length > before ? length : false;
      },
      fixesBefore,
      { timeout: 5000 },
    )
    .then((handle) => handle.jsonValue())
    .catch(() => fixesBefore);
  check(
    '  the recording goes on while folded: the trail grows, and the flag still works',
    fixesAfter > fixesBefore && (await flagButton(page).isEnabled()),
    `${fixesBefore} → ${fixesAfter}`,
  );
  await foldButton(page).click();
  await card.waitFor();
  check(
    '  Show brings the card back, with the time and the distance gone on',
    /Time\s+\d+ (sec|min)/.test(await card.innerText()) &&
      (await foldButton(page).getAttribute('aria-expanded')) === 'true',
  );
  await page.getByRole('button', { name: 'Switch to Sakay' }).click();
  await page.getByRole('button', { name: 'Switch to Lakad' }).waitFor();
  await foldButton(page).click();
  await card.waitFor({ state: 'hidden' });
  await ride(page, 91, 100);
  check(
    '  folded on Sakay, it stays folded as the fixes come',
    (await card.isHidden()) &&
      (await foldButton(page).getAttribute('aria-label')) === 'Show the recording card',
  );
  // ✕ is still there with the card folded: discard, and the next recording opens with its card.
  await page.getByRole('button', { name: 'Discard recording' }).click();
  await page.getByRole('button', { name: 'Stop without saving' }).click();
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await card.waitFor();
  check(
    'the next recording starts with its card out',
    (await foldButton(page).getAttribute('aria-expanded')) === 'true',
  );
  check('no page errors', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ------------------------- Flag a stop not fetched (offline before the worker kept it): the ride goes on
{
  const { page, errors } = await phone();
  // Its code fails to arrive, before Ready fetches it ahead and again when the ride asks for it.
  await page.route(/flag-stop-button/, (route) => route.abort('internetdisconnected'));
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 60);
  await page.waitForTimeout(300);
  check(
    'Flag a stop not fetched: the recording screen still shows, and records, with no Flag a stop',
    (await page.getByRole('button', { name: 'Pause', exact: true }).count()) === 1 &&
      (await page.getByRole('button', { name: 'Discard recording' }).count()) === 1 &&
      (await flagButton(page).count()) === 0 &&
      /Distance\s+\d+ m/.test(
        await page.getByRole('group', { name: 'Recording so far' }).innerText(),
      ),
    (await page.getByRole('group', { name: 'Recording so far' }).innerText()).replace(/\n/g, ' '),
  );
  check('  and no page error', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ------------- a screen that fails: the page says recording is paused, and Try again brings the ride back
{
  const { page, errors } = await phone();
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 300);
  const distanceOf = async () =>
    (await page.getByRole('group', { name: 'Recording so far' }).innerText())
      .match(/Distance\s+(\S+\s*\S*)/)?.[1]
      .trim();
  const distanceBefore = await distanceOf();
  // Fixes are written as they arrive; a moment lets the last ones land before the page goes.
  await page.waitForTimeout(1000);
  // The recording screen's code no longer arrives, as with no signal before the worker kept it.
  await page.route(/\/screens\/recording-screen\.tsx/, (route) =>
    route.abort('internetdisconnected'),
  );
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('heading', { name: 'A recording was left open' }).waitFor();
  await page.getByRole('button', { name: 'Resume' }).click();
  const failed = page.getByRole('heading', { name: 'Para couldn’t open this screen' });
  await failed.waitFor();
  check(
    'a screen that fails shows what happened, focus on it, that recording is paused and what was recorded is safe, with Try again',
    (await page.evaluate(() => document.activeElement?.tagName === 'H1')) &&
      (await page
        .getByText(/^Recording is paused\. What you’ve recorded so far is safe/)
        .count()) === 1 &&
      (await page.getByRole('button', { name: 'Try again' }).count()) === 1,
  );
  // The ride goes on while the error shows: the words must not promise these are kept.
  await ride(page, 310, 600);
  await page.unroute(/\/screens\/recording-screen\.tsx/);
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByRole('heading', { name: 'A recording was left open' }).waitFor();
  check(
    '  Try again reloads, and the ride comes back left open at the distance it had before the error: nothing recorded while it showed',
    Boolean(distanceBefore) && (await distanceOf()) === distanceBefore,
    `${distanceBefore} / ${await distanceOf()}`,
  );
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  // On from where the kept ride stopped, the page's clock (started afresh by the reload) moved
  // past the fixes it kept.
  await page.evaluate(() => window.__advance(10 * 60 * 1000));
  await ride(page, 300, 600);
  await page.waitForTimeout(500);
  const distanceAfter = await distanceOf();
  check(
    '  and Resume carries on recording it',
    distanceAfter !== undefined && distanceAfter !== distanceBefore,
    `${distanceBefore} / ${distanceAfter}`,
  );
  check('  with no page error', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// -------- the save screens not fetched ahead (offline on Ready), then the signal back: the ride saves
{
  const { page, errors } = await phone();
  // Chromium keeps a failed dynamic import failed for the page's life: Ready's fetch ahead must
  // not leave the form unreachable once the signal is back.
  const warnings = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  const SAVE_SCREENS = /screens\/(save-form|saved-screen)/;
  await page.route(SAVE_SCREENS, (route) => route.abort('internetdisconnected'));
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor();
  for (let i = 0; i < 50 && !warnings.some((w) => w.includes('fetched ahead')); i += 1) {
    await page.waitForTimeout(100);
  }
  const isFetchAheadFailed = warnings.some((w) => w.includes('fetched ahead'));
  await page.unroute(SAVE_SCREENS);
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 100);
  await finishRecording(page);
  const description = page.getByLabel('Description');
  const isFormShown = await description
    .waitFor({ timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  check(
    'the save screens not fetched ahead on Ready: with the signal back, Finish still opens the form',
    isFetchAheadFailed && isFormShown,
    JSON.stringify({ isFetchAheadFailed, isFormShown }),
  );
  if (isFormShown) {
    await description.fill('Fetched again');
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  check(
    '  and Continue saves it, Successfully recorded',
    await page
      .getByRole('heading', { name: 'Successfully recorded' })
      .waitFor({ timeout: 10000 })
      .then(() => true)
      .catch(() => false),
  );
  check('  and no page error', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ------------------- History's picture: the whole trail, taken as the form opens, kept and deleted with it
{
  const { page, errors } = await phone();
  const thumbnails = () =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          const open = indexedDB.open('para-contribute');
          open.onsuccess = () => {
            const get = open.result.transaction('thumbnails').objectStore('thumbnails').getAll();
            get.onsuccess = () =>
              resolve(get.result.map((row) => ({ id: row.recordingId, url: row.dataUrl })));
          };
        }),
    );
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 600);
  await finishRecording(page);
  await page.getByLabel('Description').waitFor();
  await page
    .waitForFunction(
      () =>
        new Promise((resolve) => {
          const open = indexedDB.open('para-contribute');
          open.onsuccess = () => {
            const count = open.result.transaction('thumbnails').objectStore('thumbnails').count();
            count.onsuccess = () => resolve(count.result > 0);
          };
        }),
      null,
      { timeout: 15000 },
    )
    .catch(() => {});
  const [picture] = await thumbnails();
  const size = picture ? Buffer.from(picture.url.split(',')[1], 'base64').length : 0;
  check(
    'as the form opens, a picture of the trail is kept for History: small, a WebP or JPEG',
    !!picture && /^data:image\/(webp|jpeg);base64,/.test(picture.url) && size > 0 && size < 40_000,
    `${picture?.url.slice(0, 22)} ${size} bytes`,
  );
  // The locator keeps the map on the rider under the form; the picture's framing is put back.
  const centre = await page.evaluate(() => window.__map.getCenter().toArray());
  check(
    '  the map under the form is back on the rider, not on the picture’s frame',
    Math.abs(centre[0] - eastOf(600)[0]) < 1e-5 && Math.abs(centre[1] - START[1]) < 0.01,
    JSON.stringify(centre),
  );
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('heading', { name: 'Successfully recorded' }).waitFor();
  await page.getByRole('button', { name: 'Record again' }).click();
  await openHistory(page);
  const card = page.getByRole('listitem').first();
  await card.locator('img').waitFor({ timeout: 10000 });
  const shown = {
    src: await card.locator('img').getAttribute('src'),
    text: (await card.innerText()).replace(/\n/g, ' '),
  };
  check(
    "  History's card shows that picture, and its day, time and distance in Figma's order",
    shown.src === picture?.url &&
      /\w{3} \d{1,2}, \d{4} 0h \dm \d{3} m/.test(shown.text) &&
      shown.text.includes('Only on this phone'),
    shown.text,
  );
  // With no picture kept (no tiles when the form opened), the card draws the trail itself.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('para-contribute');
        open.onsuccess = () => {
          const tx = open.result.transaction('thumbnails', 'readwrite');
          tx.objectStore('thumbnails').clear();
          tx.oncomplete = resolve;
        };
      }),
  );
  await page.reload({ waitUntil: 'load' });
  await openHistory(page);
  // Attached, not visible: this trail runs due east, a line with no height.
  await card.locator('path[stroke]').first().waitFor({ state: 'attached', timeout: 10000 });
  check(
    '  with no picture, the card draws the trail from its fixes instead',
    (await card.locator('img').count()) === 0 && (await card.locator('path[stroke]').count()) > 0,
  );
  // Kept again, so removing the recording below has a picture to take with it.
  await page.evaluate(
    (row) =>
      new Promise((resolve) => {
        const open = indexedDB.open('para-contribute');
        open.onsuccess = () => {
          const tx = open.result.transaction('thumbnails', 'readwrite');
          tx.objectStore('thumbnails').put(row);
          tx.oncomplete = resolve;
        };
      }),
    { recordingId: picture?.id, dataUrl: picture?.url },
  );
  check('  (its picture kept again)', (await thumbnails()).length === 1);
  await openCardMenu(page);
  await page.getByRole('button', { name: /^Remove from this phone, / }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByText('No recordings yet.').waitFor();
  check('  deleting the recording deletes its picture', (await thumbnails()).length === 0);
  check('  no page error', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// --------- the form closed while its picture is on its way: no picture, and the camera stays on the rider
{
  const { page, errors } = await phone();
  const thumbnailCount = () =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          const open = indexedDB.open('para-contribute');
          open.onsuccess = () => {
            const count = open.result.transaction('thumbnails').objectStore('thumbnails').count();
            count.onsuccess = () => resolve(count.result);
          };
        }),
    );
  // The capture's code held back 3 s: the form closes before it can start.
  let releaseCapture = () => {};
  const isCaptureHeld = new Promise((resolve) => {
    page.route('**/capture-trail-picture*', async (route) => {
      resolve(true);
      await new Promise((release) => (releaseCapture = release));
      await route.continue();
    });
  });
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 300);
  await finishRecording(page);
  await page.getByRole('heading', { name: 'About this route' }).waitFor();
  await isCaptureHeld;
  await page.getByRole('button', { name: 'Keep recording' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  releaseCapture();
  // The rider rides on; the locator follows. A capture that ran now would frame the whole trail,
  // then put the camera back where the rider was when the form opened.
  await ride(page, 310, 600);
  await page.waitForTimeout(3000);
  const off = await centreOff(page, 600);
  check(
    'Keep recording while the picture is on its way: none is taken, and the camera stays on the moving rider',
    off < 30 && (await thumbnailCount()) === 0,
    `${Math.round(off)} m off`,
  );
  check('  no page error', errors.length === 0, errors.join('; '));
  await page.context().close();
}
{
  // The same, but the recording thrown away before the held capture's code arrives.
  const { page, errors } = await phone();
  let releaseCapture = () => {};
  const isCaptureHeld = new Promise((resolve) => {
    page.route('**/capture-trail-picture*', async (route) => {
      resolve(true);
      await new Promise((release) => (releaseCapture = release));
      await route.continue();
    });
  });
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 300);
  await finishRecording(page);
  await page.getByRole('heading', { name: 'About this route' }).waitFor();
  await isCaptureHeld;
  await page.getByRole('button', { name: 'Keep recording' }).click();
  await page.getByRole('button', { name: 'Discard recording' }).click();
  await page.getByRole('button', { name: 'Stop without saving' }).click();
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor();
  releaseCapture();
  await page.waitForTimeout(3000);
  const left = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('para-contribute');
        open.onsuccess = () => {
          const count = open.result.transaction('thumbnails').objectStore('thumbnails').count();
          count.onsuccess = () => resolve(count.result);
        };
      }),
  );
  check(
    '  Stop without saving before it arrives leaves no picture behind',
    left === 0,
    String(left),
  );
  check('  no page error', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ------------- a page older than the phone's database (an update rolled back) still records and saves
{
  const { page, errors } = await phone();
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor();
  // A newer page took the database to 3; this page's code asks for 2.
  const version = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('para-contribute', 3);
        open.onsuccess = () => {
          const { version: opened } = open.result;
          open.result.close();
          resolve(opened);
        };
        open.onerror = () => reject(open.error);
      }),
  );
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 200);
  await finishRecording(page);
  await page.getByRole('button', { name: 'Skip' }).click();
  const isSaved = await page
    .getByRole('heading', { name: 'Successfully recorded' })
    .waitFor({ timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  const kept = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('para-contribute');
        open.onsuccess = () => {
          const count = open.result.transaction('recordings').objectStore('recordings').count();
          count.onsuccess = () => resolve([open.result.version, count.result]);
        };
      }),
  );
  check(
    "a page whose code is older than the phone's database opens it at the phone's version, and records and saves",
    version === 3 && isSaved && kept[0] === 3 && kept[1] === 1,
    JSON.stringify({ version, isSaved, kept }),
  );
  check('  no page error', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ------------------------------------------------------- Keep recording on the form
{
  const { page, errors } = await phone();
  const stats = async () =>
    (await page.getByRole('group', { name: 'Recording so far' }).innerText()).replace(/\n/g, ' ');
  const activeName = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label'));

  // (a) a Save after a switch, ten minutes on the form, and back.
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 1200);
  await page.getByRole('button', { name: 'Switch to Sakay' }).click();
  await ride(page, 1190, 200);
  await finishRecording(page);
  await page.getByRole('heading', { name: 'About this route' }).waitFor({ timeout: 30000 });
  await page.evaluate(() => window.__advance(600_000));
  await page.getByRole('button', { name: 'Keep recording' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  check(
    'Keep recording after a Save: back on the recording screen, Pause focused, "Recording again" said',
    (await activeName()) === 'Pause' &&
      (await page.getByRole('status').innerText()) === 'Recording again',
    `${await activeName()} / ${await page.getByRole('status').innerText()}`,
  );
  const seconds = recordedSeconds(await stats());
  check(
    '  Time does not count the ten minutes on the form',
    seconds < 8 * 60,
    `${seconds} s; ${await stats()}`,
  );
  await ride(page, 190, 50);
  await page.waitForTimeout(500);
  check(
    '  a fix near the start does not stop it, and the modes are kept',
    (await page.getByRole('heading', { name: 'About this route' }).count()) === 0 &&
      (await stats()).includes('Sakay') &&
      (await mapSource(page)).features.filter((f) => f.properties.kind === 'switch').length === 1,
    await stats(),
  );

  // (c) then Pause, Finish and Skip save it once, as one contribution.
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await finishRecording(page);
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('heading', { name: 'Successfully recorded' }).waitFor();
  const counts = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('para-contribute');
        open.onsuccess = () => {
          const all = open.result.transaction('recordings').objectStore('recordings').getAll();
          all.onsuccess = () => resolve(all.result.map((r) => r.status));
        };
      }),
  );
  check(
    'after Keep recording, Pause, Finish and Skip save it once, as one contribution',
    counts.length === 1 && counts[0] === 'saved',
    JSON.stringify(counts),
  );
  await page.getByRole('button', { name: 'Record again' }).click();

  // (b) a Save by hand, then Keep recording.
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 300);
  await finishRecording(page);
  await page.getByRole('heading', { name: 'About this route' }).waitFor();
  await page.evaluate(() => window.__advance(600_000));
  await page.getByRole('button', { name: 'Keep recording' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  check(
    'Keep recording after a Save by hand: recording again, Pause focused, no time for the form',
    (await activeName()) === 'Pause' &&
      recordedSeconds(await stats()) < 8 * 60 &&
      (await page.evaluate(() => window.__watchers())) === 1,
    await stats(),
  );
  await ride(page, 310, 340);
  check('  and the fixes after it count', /Distance\s+3\d\d m/.test(await stats()), await stats());
  check('no page errors', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ----------------- the locator before Start: on its own when the browser allows it, else on a tap
{
  const { page, errors } = await phone({ granted: true });
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor();
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
  await page.getByRole('button', { name: 'Start Tracking' }).click();
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
  const { page, errors } = await phone();
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor();
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
  await page.getByRole('button', { name: 'Start Tracking' }).click();
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
  const { page, errors } = await phone();
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor();
  await page.waitForFunction(() => !!window.__map?.loaded(), null, { timeout: 30000 });
  // The locator's dock slides up as the stack is measured: let it settle.
  await page.waitForTimeout(800);
  const box = await page.getByRole('button', { name: 'Map design' }).boundingBox();
  const locatorBox = await locate(page).boundingBox();
  const bars = await page.locator('section[aria-labelledby="ready-heading"]').boundingBox();
  check(
    "the map-style button sits on the locator button, the public map's 48 px pair, 20 px from the right as Figma has it",
    box &&
      locatorBox &&
      Math.abs(box.width - 48) < 0.5 &&
      Math.abs(393 - (box.x + box.width) - 20) < 0.5 &&
      Math.abs(locatorBox.x - box.x) < 0.5 &&
      box.y + box.height <= locatorBox.y + 0.5,
    JSON.stringify([box, locatorBox]),
  );
  check(
    '  and 24 px over Start tracking as Figma has it',
    bars && locatorBox && Math.abs(bars.y - (locatorBox.y + locatorBox.height) - 24) < 0.5,
    JSON.stringify([locatorBox, bars]),
  );
  {
    const info = await creditsButton(page).boundingBox();
    const bar = await page.getByRole('button', { name: 'Start Tracking' }).boundingBox();
    check(
      "  the map's ⓘ is 32 px, at the bottom left, 12 px in and 12 px over the screen's foot",
      info &&
        bar &&
        Math.abs(info.width - 32) < 0.5 &&
        Math.abs(info.x - 12) < 0.5 &&
        Math.abs(852 - (info.y + info.height) - 12) < 0.5,
      JSON.stringify([info, bar]),
    );
  }

  await page.getByRole('button', { name: 'Start Tracking' }).click();
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
    'Stop on a recording left open pauses it too: Resume and Finish, no form',
    (await page.getByRole('heading', { name: 'About this route' }).count()) === 0 &&
      (await page.getByRole('button', { name: 'Finish', exact: true }).count()) === 1,
  );
  check('no page errors', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ------------------------------------------- two minutes alone on the form
{
  const { page, errors } = await phone();
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 200);
  // Installed before the form opens, so the form's own timer runs on it.
  await page.clock.install();
  await finishRecording(page);
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
  const file = await lastSavedRide(page);
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
  const { page, errors } = await phone();
  check(
    'with nothing saved, Ready shows no History',
    (await page.getByRole('heading', { name: 'History' }).count()) === 0,
  );
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 100);
  await finishRecording(page);
  await page.getByLabel('Description').fill('Reload me');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Successfully recorded' }).waitFor();
  await page.getByRole('button', { name: 'Record again' }).click();
  await openHistory(page);
  await openCardMenu(page);
  const rowRemoves = page.getByRole('button', {
    name: /^Remove from this phone, the recording of .*, Reload me$/,
  });
  await rowRemoves.first().waitFor();
  check('the recording just saved is listed in History', (await rowRemoves.count()) === 1);
  check(
    '  and its ⋮ offers no Download',
    (await page.getByRole('button', { name: /^Download recording/ }).count()) === 0,
  );
  await page.reload({ waitUntil: 'load' });
  await openHistory(page);
  await openCardMenu(page);
  check('after a reload it is still listed', (await rowRemoves.count()) === 1);
  const file = await lastSavedRide(page);
  check(
    '  and the phone still holds that recording',
    file?.description === 'Reload me' && file.savedAt !== null,
    file?.description,
  );
  check(
    '  History has no Start tracking',
    (await page.getByRole('button', { name: 'Start Tracking' }).count()) === 0,
  );
  await recordTab(page).click();
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor();
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
        const open = indexedDB.open('para-contribute');
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
  const { page, errors } = await phone();
  await page.addInitScript(FAIL_WRITES);
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 100);
  await setFail(page, 'fixes', true);
  await ride(page, 110, 150);
  await setFail(page, 'fixes', false);
  await page.waitForTimeout(300);
  await finishRecording(page);
  await page.getByRole('heading', { name: 'About this route' }).waitFor();
  const ROOM_WARNING = 'Your phone ran out of room for part of this recording.';
  check(
    'fix writes that failed are noted on the form in one line, with no Download',
    (await page.getByRole('alert').filter({ hasText: ROOM_WARNING }).count()) === 1 &&
      (await page.getByRole('button', { name: /download/i }).count()) === 0,
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
    (await page.getByText(ROOM_WARNING).count()) === 0,
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

// ------------------------------------- Start tracking becomes the recording card, never holding it up
/** Every animate() the page starts, with its timing and whether it is the morph's ghost's. */
const ANIMATIONS = () => {
  window.__animations = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    window.__animations.push({
      isGhost: this.hasAttribute('data-start-morph'),
      isCard: this.hasAttribute('data-recording-card'),
      duration: typeof options === 'object' ? options.duration : options,
      easing: typeof options === 'object' ? (options.easing ?? 'linear') : 'linear',
      props: Object.keys(Array.isArray(keyframes) ? (keyframes[0] ?? {}) : keyframes),
      at: performance.now(),
    });
    return animate.call(this, keyframes, options);
  };
  window.__ghostSeen = false;
  new MutationObserver(() => {
    if (document.querySelector('[data-start-morph]')) window.__ghostSeen = true;
  }).observe(document, { childList: true, subtree: true });
};
{
  const { page, context, errors } = await phone();
  await page.addInitScript(ANIMATIONS);
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor({ timeout: 20000 });
  await page.waitForFunction(() => !!window.__map?.loaded(), null, { timeout: 30000 });
  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const read = (name) => style.getPropertyValue(name).trim();
    return {
      quick: parseFloat(read('--transition-duration-quick')),
      gentle: parseFloat(read('--transition-duration-gentle')),
      exit: read('--ease-exit'),
      move: read('--ease-move'),
    };
  });
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  const atTap = await page.evaluate(() => ({
    watchers: window.__watchers(),
    ghost: !!document.querySelector('[data-start-morph]'),
  }));
  check(
    'Start tracking starts the recording on the tap: the watch is on while the morph has only begun',
    atTap.watchers === 1 && atTap.ghost,
    JSON.stringify(atTap),
  );
  await page.waitForFunction(() => !document.querySelector('[data-start-morph]'), null, {
    timeout: 5000,
  });
  const ghostAnimations = await page.evaluate(() => window.__animations.filter((a) => a.isGhost));
  const fold = ghostAnimations[0];
  const open = ghostAnimations[1];
  check(
    '  it folds into a pill on duration-quick and ease-exit, then opens into the card on duration-gentle and ease-move',
    !!fold &&
      !!open &&
      fold.duration === tokens.quick &&
      fold.easing === tokens.exit &&
      open.duration === tokens.gentle &&
      open.easing === tokens.move &&
      fold.props.join() === 'clipPath' &&
      open.props.join() === 'clipPath',
    JSON.stringify({ tokens, ghostAnimations }),
  );
  check(
    '  about 450 ms in all, and only clip-path and opacity move',
    tokens.quick + tokens.gentle >= 400 &&
      tokens.quick + tokens.gentle <= 450 &&
      (await page.evaluate(() =>
        window.__animations.every((a) => a.props.every((p) => ['clipPath', 'opacity'].includes(p))),
      )),
  );
  check(
    '  then the card stands in its own place, the ghost gone',
    (await page.getByRole('group', { name: 'Recording so far' }).isVisible()) &&
      (await page.locator('[data-start-morph]').count()) === 0 &&
      (await page.evaluate(
        () => getComputedStyle(document.querySelector('[data-recording-card]')).opacity,
      )) === '1',
  );

  // Pause mid-morph: what the ghost covers takes the tap.
  await page.getByRole('button', { name: 'Discard recording' }).click();
  await page.getByRole('button', { name: 'Stop without saving' }).click();
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  const isMorphing = await page.evaluate(() => !!document.querySelector('[data-start-morph]'));
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Resume' }).waitFor({ timeout: 5000 });
  check(
    '  a tap on Pause mid-morph pauses the recording',
    isMorphing && (await page.getByRole('button', { name: 'Finish', exact: true }).count()) === 1,
  );
  await page.waitForFunction(() => !document.querySelector('[data-start-morph]'), null, {
    timeout: 5000,
  });
  await page.getByRole('button', { name: 'Discard recording' }).click();
  await page.getByRole('button', { name: 'Stop without saving' }).click();
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor();

  // A start that fails (a second tab, which records nothing): the card never comes, the button does.
  const second = await context.newPage();
  await nodeFetch(second);
  await bareStyle(second);
  await second.addInitScript(GPS);
  await second.addInitScript(ANIMATIONS);
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await second.goto(`${BASE}/contribute/`, { waitUntil: 'load' });
  await second.getByText('Para is open in another tab').waitFor({ timeout: 10000 });
  await second.getByRole('button', { name: 'Start Tracking' }).click();
  const secondMorphed = await second.evaluate(() => !!document.querySelector('[data-start-morph]'));
  await second.waitForFunction(() => !document.querySelector('[data-start-morph]'), null, {
    timeout: 5000,
  });
  await second.waitForTimeout(100);
  check(
    '  a start that fails: the pill opens back into Start tracking, shown again, and no card comes',
    secondMorphed &&
      (await second.getByRole('group', { name: 'Recording so far' }).count()) === 0 &&
      (await second.getByRole('button', { name: 'Start Tracking' }).isVisible()) &&
      (await second.evaluate(
        () => getComputedStyle(document.querySelector('[data-start-tracking]')).opacity,
      )) === '1',
  );
  await second.close();
  await page.getByRole('button', { name: 'Discard recording' }).click();
  await page.getByRole('button', { name: 'Stop without saving' }).click();

  // Reduced motion: no ghost, the card only fades in, quickly.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    window.__animations = [];
    window.__ghostSeen = false;
  });
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await page.waitForTimeout(400);
  const reduced = await page.evaluate(() => ({
    ghostSeen: window.__ghostSeen,
    card: window.__animations.filter((a) => a.isCard),
  }));
  check(
    '  with reduced motion: no fold and no opening, only a quick crossfade of the card',
    !reduced.ghostSeen &&
      reduced.card.some((a) => a.duration === tokens.quick && a.props.join() === 'opacity') &&
      reduced.card.every((a) => a.duration <= tokens.quick && a.props.join() === 'opacity'),
    JSON.stringify(reduced),
  );
  check('  no page errors', errors.length === 0, errors.join('; '));
  await context.close();
}

// ------------------------------------------------------------- a second tab
{
  const { page, context, errors } = await phone();
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 50);
  const second = await context.newPage();
  await nodeFetch(second);
  await bareStyle(second);
  await second.addInitScript(GPS);
  await second.goto(`${BASE}/contribute/`, { waitUntil: 'load' });
  await second.getByText('Para is open in another tab').waitFor({ timeout: 10000 });
  check(
    'a second tab does not reopen the ride the first is recording',
    (await second.getByRole('button', { name: 'Resume' }).count()) === 0,
  );
  await second.getByRole('button', { name: 'Start Tracking' }).click();
  await second.waitForTimeout(500);
  const both = await stored(page);
  check(
    '  and its Start records nothing: still one recording, and the warning stays',
    (await second.getByRole('group', { name: 'Recording so far' }).count()) === 0 &&
      (await second.getByText('Para is open in another tab').count()) > 0 &&
      both.recordings.length === 1,
    JSON.stringify(both.recordings),
  );
  await openHistory(second);
  await finishRecording(page);
  await page.getByLabel('Description').fill('From the first tab');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Successfully recorded' }).waitFor();
  await second
    .getByRole('heading', { level: 1, name: 'History' })
    .waitFor({ timeout: 5000 })
    .catch(() => {});
  await openCardMenu(second);
  check(
    '  once the first tab saves, the second lists it without a reload',
    (await second
      .getByRole('button', {
        name: /^Remove from this phone, the recording of .*, From the first tab$/,
      })
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
  const { page, errors } = await phone();
  await page.addInitScript(WAKE);
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Start Tracking' }).click();
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
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForTimeout(200);
  check(
    '  and Pause lets the one lock go',
    (await page.evaluate(() => window.__wake.active)) === 0,
  );
  check('no page errors', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ------------------- Back to the map on Unfinished and Saved, not on Start or Recording; a ride kept
{
  const { page, errors } = await phone();
  const back = page.getByRole('button', { name: 'Back to the map' });
  const hasOneBack = async () => (await back.count()) === 1;
  // Off Start, the licences' credit is MapLibre's corner ⓘ, at the bottom right, with the
  // OpenStreetMap credit among its links.
  const hasCornerCredits = async () =>
    (await page
      .locator('.maplibregl-ctrl-bottom-right .maplibregl-ctrl-attrib-button')
      .isVisible()) &&
    (await page
      .locator('.maplibregl-ctrl-attrib a[href="https://www.openstreetmap.org/copyright"]')
      .count()) === 1;
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor();
  check(
    "Ready has no Back to the map (the browser goes back), no scale bar, and the map's credits behind its ⓘ",
    (await back.count()) === 0 &&
      (await page.locator('.maplibregl-ctrl-scale').isVisible()) === false &&
      !(await page.locator('.maplibregl-ctrl-attrib').isVisible()) &&
      (await creditsButton(page).count()) === 1,
  );

  await page.getByRole('button', { name: 'Start Tracking' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor();
  await ride(page, 0, 300);
  check(
    'Recording has ✕ where Back to the map was, and no way back of its own',
    (await back.count()) === 0 &&
      (await page.getByRole('button', { name: 'Discard recording' }).count()) === 1,
  );
  // Recording keeps the credits behind its own ⓘ, as Start does: no corner one beside it.
  const hasOwnCredits = async () =>
    (await creditsButton(page).isVisible()) &&
    !(await page.locator('.maplibregl-ctrl-attrib').isVisible());
  check("  and the map's credits behind its own ⓘ while recording", await hasOwnCredits());
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Resume' }).waitFor();
  check('  and while paused', await hasOwnCredits());
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  // Fixes are written as they arrive; a moment lets the last ones land before the page goes.
  const distanceOf = async () =>
    (await page.getByRole('group', { name: 'Recording so far' }).innerText())
      .match(/Distance\s+(\S+\s*\S*)/)?.[1]
      .trim();
  const distanceBefore = await distanceOf();
  await page.waitForTimeout(3000);
  await page.goto(`${BASE}/`, { waitUntil: 'load' });

  await page.goto(`${BASE}/contribute/`, { waitUntil: 'load' });
  await page.getByRole('heading', { name: 'A recording was left open' }).waitFor();
  check(
    '  coming back shows the ride as left open, with the distance it had',
    Boolean(distanceBefore) && (await distanceOf()) === distanceBefore,
    `${distanceBefore} / ${await distanceOf()}`,
  );
  check('Unfinished has Back to the map', await hasOneBack());
  check("  and the map's corner ⓘ for its credits", await hasCornerCredits());

  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await finishRecording(page);
  await page.getByRole('button', { name: 'Skip' }).waitFor();
  check("the Save form keeps the map's corner ⓘ for its credits", await hasCornerCredits());
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('heading', { name: 'Successfully recorded' }).waitFor();
  check('Saved has Back to the map, in front of the screen', await hasOneBack());
  check("  and the map's corner ⓘ for its credits", await hasCornerCredits());
  await back.click();
  await page.waitForURL((url) => url.pathname === '/');
  check('  and it leaves for the public map', new URL(page.url()).pathname === '/');
  check('no page errors', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ------------------------------------------------ the map's credits: the Map Data Source sheet
{
  const { page, errors } = await phone();
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor({ timeout: 20000 });
  await page.waitForFunction(() => !!window.__map?.loaded(), null, { timeout: 30000 });
  const sheet = page.getByRole('dialog', { name: 'Map Data Source' });
  const isMapInert = () =>
    page.evaluate(
      () => !!document.querySelector('button[aria-label="Map design"]')?.closest('[inert]'),
    );
  const focusIsOnInfo = () =>
    page
      .waitForFunction(
        () => document.activeElement?.getAttribute('aria-label') === 'Map data sources',
        null,
        { timeout: 5000 },
      )
      .then(() => true)
      .catch(() => false);

  await creditsButton(page).click();
  await sheet.waitFor();
  // Which tiles this build draws, from the style it asked for: VITE_BASEMAP_HOST, OpenFreeMap when unset.
  const isOpenFreeMap = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .some((entry) => /^https:\/\/tiles\.openfreemap\.org\/styles\//.test(entry.name)),
  );
  const rows = await sheet.getByRole('link').evaluateAll((links) =>
    links.map((a) => ({
      text: a.textContent,
      href: a.getAttribute('href'),
      target: a.getAttribute('target'),
      rel: a.getAttribute('rel'),
    })),
  );
  const tiles = isOpenFreeMap
    ? ['OpenFreeMap', 'https://openfreemap.org']
    : ['© OpenMapTiles', 'https://openmaptiles.org'];
  const expected = [
    ['© Para contributors · ODbL', 'https://github.com/ParaOrg/Para#data-and-licence'],
    ['© OpenStreetMap contributors', 'https://www.openstreetmap.org/copyright'],
    tiles,
    ['OSRM', 'https://project-osrm.org'],
    ['Improve map', 'https://www.openstreetmap.org/fixthemap'],
  ];
  check(
    `the ⓘ opens Map Data Source: five rows, each a link out in a new tab (${isOpenFreeMap ? 'OpenFreeMap' : 'our tiles'})`,
    rows.length === 5 &&
      rows.every(
        (row, i) =>
          row.text.startsWith(expected[i][0]) &&
          row.href === expected[i][1] &&
          row.target === '_blank' &&
          row.rel === 'noreferrer',
      ),
    JSON.stringify(rows),
  );
  check(
    '  the map under it is dimmed and inert, the scrim hidden from screen readers, focus in the sheet',
    (await isMapInert()) &&
      (await page.locator('.bg-surface-transparent[aria-hidden="true"]').count()) === 1 &&
      (await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))),
  );
  for (let i = 0; i < 8; i += 1) await page.keyboard.press('Tab');
  const isStillIn = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  await page.keyboard.press('Shift+Tab');
  check(
    '  Tab and Shift+Tab go round inside it',
    isStillIn && (await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))),
  );
  await page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  check(
    '  Escape closes it, focus back on the ⓘ, the map live again',
    (await focusIsOnInfo()) && !(await isMapInert()),
  );

  await creditsButton(page).click();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await sheet.waitFor({ state: 'detached' });
  check('  ✕ closes it, focus back on the ⓘ', await focusIsOnInfo());

  // A tap on the dimmed map over a control of Start's: it closes the sheet and presses nothing.
  // Over the top right's Account button where Start has one, else over bare map.
  const person = page.locator('button[aria-label="Account"]');
  const target = (await person.count()) ? await person.boundingBox() : null;
  await creditsButton(page).click();
  await sheet.waitFor();
  check(
    '  Start under it is inert too: its bar and tabs are not reached behind the sheet',
    await page.evaluate(
      () =>
        !!document.querySelector('section[aria-labelledby="ready-heading"]')?.closest('[inert]'),
    ),
  );
  await page.touchscreen.tap(
    target ? target.x + target.width / 2 : 200,
    target ? target.y + target.height / 2 : 120,
  );
  await sheet.waitFor({ state: 'detached' });
  await page.waitForTimeout(500);
  check(
    `  a tap on the dimmed map${target ? " over Start's Account button" : ''} closes it, and presses nothing under it`,
    (await page.getByRole('button', { name: 'Start Tracking' }).count()) === 1 &&
      (await page.evaluate(() => location.hash)) === '',
  );
  check('  no page errors', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ------------------------------------------------- Location Labels on the Map Style card
{
  const { page, errors } = await phone();
  // A stand-in for each design with labels of its own, from a vector source whose tiles are
  // empty, over the bare style: the switch is read off the layers, never off the tiles.
  await page.route(/tiles\.openfreemap\.org/, (route) => {
    const url = route.request().url();
    const design = url.match(/\/styles\/([a-z]+)/)?.[1];
    if (!design) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: 8,
        sources: {
          openmaptiles: {
            type: 'vector',
            tiles: ['https://tiles.openfreemap.org/stand-in/{z}/{x}/{y}.pbf'],
          },
        },
        layers: [
          { id: `${design}-bg`, type: 'background', paint: { 'background-color': '#eeeeee' } },
          {
            id: `${design}-place`,
            type: 'symbol',
            source: 'openmaptiles',
            'source-layer': 'place',
          },
          { id: `${design}-road`, type: 'symbol', source: 'openmaptiles', 'source-layer': 'road' },
          // Coloured draws its places, train stations among them, by an icon and a name, as
          // Liberty's poi_r1 does.
          ...(design === 'liberty'
            ? [
                {
                  id: 'liberty-poi',
                  type: 'symbol',
                  source: 'openmaptiles',
                  'source-layer': 'poi',
                  filter: ['>=', ['get', 'rank'], 1],
                  layout: { 'icon-image': '{class}', 'text-field': '{name}' },
                },
              ]
            : []),
        ],
      }),
    });
  });
  const waitForMap = (p) =>
    p.waitForFunction(() => !!window.__map?.loaded(), null, { timeout: 30000 });
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor({ timeout: 20000 });
  await waitForMap(page);
  await checkLocationLabels(page, { check, prefix: 'contributor page', waitForMap });
  check('  no page errors', errors.length === 0, errors.join('; '));
  await page.context().close();
}

await browser.close();
tally();
