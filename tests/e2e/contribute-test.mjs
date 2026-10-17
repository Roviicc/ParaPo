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
      watchPosition: (ok) => {
        watchers.set(++nextId, ok);
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
    watchers.forEach((ok) =>
      ok({
        timestamp: t,
        coords: { longitude: lng, latitude: lat, accuracy: 5, heading: null, speed: null },
      }),
    );
  window.__watchers = () => watchers.size;
};

const browser = await chromium.launch();

/** A phone-sized page with the stand-in GPS; `consented` skips the first-visit question. */
async function phone({ consented }) {
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    acceptDownloads: true,
  });
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
  await page.addInitScript(GPS);
  if (consented) {
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
const bearing = (page) => page.evaluate(() => (window.__map.getBearing() + 360) % 360);
const buttons = (page) =>
  page
    .getByRole('button')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent));

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
  await page.getByRole('button', { name: 'Okay, I understand' }).click();
  await page.getByRole('button', { name: 'Start recording' }).waitFor();
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
  check(
    "  the map-style button is the map's own, top right",
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
  check(
    'the map follows: course-up turns east, the way the ride goes',
    Math.abs((await bearing(page)) - 90) < 10,
    String(await bearing(page)),
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
    '  the map turned with the ride: course-up now heads west',
    Math.abs((await bearing(page)) - 270) < 10,
    String(await bearing(page)),
  );
  await shot(page, '3-recording-pabalik');

  // North-up, a pan that lets the camera go, and the recentre.
  await page.getByRole('button', { name: 'Keep north at the top' }).click();
  await page.waitForFunction(
    () => Math.abs(window.__map.getBearing()) < 1 || Math.abs(window.__map.getBearing()) > 359,
  );
  check('the north-up button turns the map north and offers the way back', true);
  check(
    '  its label has become "Turn the map with your direction"',
    (await page.getByRole('button', { name: 'Turn the map with your direction' }).count()) === 1,
  );
  await page.getByRole('button', { name: 'Turn the map with your direction' }).click();
  await page.waitForFunction(() => Math.abs(((window.__map.getBearing() + 360) % 360) - 270) < 10);
  check(
    'a pan lets the camera go until a recentre',
    (await page.getByRole('button', { name: 'Follow me again' }).count()) === 0,
  );
  await page.mouse.move(200, 300);
  await page.mouse.down();
  await page.mouse.move(120, 360, { steps: 6 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Follow me again' }).waitFor();
  // The drag's glide has to be over before the centre is read; then a fix arrives, and
  // the check waits for the map to have it (the trail's dot is there) before looking.
  await page.waitForFunction(() => !window.__map.isMoving(), null, { timeout: 30000 });
  const centreBefore = await page.evaluate(() => window.__map.getCenter().lng);
  await ride(page, 690, 640);
  await page.waitForFunction(
    (lng) =>
      window.__map
        .getSource('recording-trail')
        ?.serialize()
        .data.features.some(
          (f) => f.properties.kind === 'here' && Math.abs(f.geometry.coordinates[0] - lng) < 1e-7,
        ),
    eastOf(640)[0],
    { timeout: 30000 },
  );
  await page.waitForTimeout(1500);
  check(
    '  a new fix does not move a map the finger took',
    Math.abs((await page.evaluate(() => window.__map.getCenter().lng)) - centreBefore) < 1e-6,
  );
  await page.getByRole('button', { name: 'Follow me again' }).click();
  await page.waitForFunction(
    (lng) => Math.abs(window.__map.getCenter().lng - lng) < 1e-4 && !window.__map.isMoving(),
    eastOf(640)[0],
    { timeout: 30000 },
  );
  check(
    '  Follow me again brings the camera back to the ride',
    (await page.getByRole('button', { name: 'Follow me again' }).count()) === 0,
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
  await page.getByRole('button', { name: 'Record again' }).click();
  await page.getByRole('button', { name: 'Start recording' }).waitFor();
  check('Record again is Ready, with nothing kept on the screen', true);
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

// ----------------- where the buttons are, standing still, and Stop on an unfinished one
{
  const { page, errors } = await phone({ consented: true });
  await page.getByRole('button', { name: 'Start recording' }).waitFor();
  await page.waitForFunction(() => !!window.__map?.loaded(), null, { timeout: 30000 });
  const box = await page.getByRole('button', { name: 'Map design' }).boundingBox();
  check(
    "the map-style button is Figma's 40 px IconButton, 16 px from the top and right",
    box &&
      Math.abs(box.width - 40) < 0.5 &&
      Math.abs(box.y - 16) < 0.5 &&
      Math.abs(393 - (box.x + box.width) - 16) < 0.5,
    JSON.stringify(box),
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

await browser.close();
tally();
