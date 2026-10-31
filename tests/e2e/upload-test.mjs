// The contributor page's uploads, driven by a phone: a saved recording goes to
// Para on its own, waits out no signal, survives a lost answer and a double
// tap without being stored twice, and its upload can be removed while the
// phone keeps its copy. Supabase is the in-memory stand-in
// (lib/fake-contributions.mjs): nothing reaches a real project.
//
//   cp .env.production .env.local && echo VITE_CONTRIBUTIONS=1 >> .env.local
//                                        (a project URL to stand in for, and uploads on)
//   npm run dev                          (in another terminal)
//   node tests/e2e/upload-test.mjs
//
// PARA_SHOTS=dir keeps screenshots of the list's states at 393×852.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

import { fakeContributions, session } from './lib/fake-contributions.mjs';
import { BASE, bareStyle, harness, nodeFetch } from './lib/harness.mjs';

const { check, tally } = harness();
const SHOTS = process.env.PARA_SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : null);

const T0 = Date.UTC(2026, 9, 19, 0, 0, 0);
const ACCOUNT_ID = 'cccccccc-0000-4000-8000-000000000001';
const STUDIO_KEY = 'sb-smzwbqxttdyvohuizynl-auth-token';

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
  window.__fix = (lng, lat, t) =>
    watchers.forEach((ok) =>
      ok({
        timestamp: t,
        coords: { longitude: lng, latitude: lat, accuracy: 5, heading: null, speed: null },
      }),
    );
};

const browser = await chromium.launch();

/**
 * A phone with the stand-in GPS and Supabase; `studioSession` is an editor signed in on the same
 * site. The page is waited on until Start shows. The phone is already signed in to an account:
 * the page shows nothing else until one is, and having it is the agreement.
 */
async function phone({ studioSession = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await nodeFetch(page);
  await bareStyle(page);
  const fake = await fakeContributions(page);
  // The seeded account is in the database with its name stored: the page opens on Ready.
  fake.users.set(ACCOUNT_ID, {
    email: 'tester@example.com',
    password: 'hunter2hunter2',
    isAccount: true,
    profile: { name: 'Tester', phone: '+639171234567' },
  });
  // Cloudflare's Turnstile, standing in: the check passes at once. CI builds this suite with a site key.
  await page.route(/^https:\/\/challenges\.cloudflare\.com\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: 'window.turnstile={render(e,o){setTimeout(()=>o.callback("turnstile-token"),50);return "w"},remove(){}}',
    }),
  );
  await page.addInitScript(GPS);
  await page.addInitScript(
    ([key, signedIn]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(signedIn));
    },
    [
      'para.contributor-auth',
      session(ACCOUNT_ID, { email: 'tester@example.com', isAccount: true }),
    ],
  );
  if (studioSession) {
    await page.addInitScript(
      ([key]) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, '{"access_token":"editor"}');
      },
      [STUDIO_KEY],
    );
  }
  const errors = [];
  const asked = watchDatabase(page);
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/contribute/`, { waitUntil: 'load' });
  await SCREENS.start(page).waitFor({ timeout: 30000 });
  return { page, context, fake, errors, asked };
}

/**
 * Counts every request the page makes to the database (sign-in, identity, reads or sends), but not
 * the account's own profile read: the page asks that first, to know the account is done.
 */
function watchDatabase(page) {
  const watch = { count: 0 };
  page.on('request', (request) => {
    const url = request.url();
    if (/\/(auth|rest)\/v1\//.test(url) && !/\/rpc\/get_profile/.test(url)) watch.count += 1;
  });
  return watch;
}

const SCREENS = {
  start: (page) => page.getByRole('button', { name: 'Start Tracking' }),
  earlier: (page) => page.getByRole('heading', { name: /earlier recordings? too\?/ }),
};

/** Puts saved recordings straight into the phone's database, as an earlier visit would have left them. */
async function seed(page, recordings) {
  await page.evaluate(
    (rows) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('para-contribute');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(['recordings', 'fixes'], 'readwrite');
          for (const { recording, fixes } of rows) {
            tx.objectStore('recordings').put(recording);
            for (const fix of fixes) tx.objectStore('fixes').put(fix);
          }
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    recordings,
  );
}

/** A saved recording of `count` fixes heading north from Fairview, a fix a second, 8 m apart. */
function savedRide(
  id,
  startedAt,
  { count = 30, upload, name = 'Fairview', isEarlier = false, consentVersion = 3 } = {},
) {
  const fixes = Array.from({ length: count }, (_, seq) => ({
    recordingId: id,
    seq,
    time: startedAt + seq * 1000,
    lng: 121.05,
    lat: 14.7 + (seq * 8) / 111_320,
    accuracyM: 5,
  }));
  const end = startedAt + count * 1000;
  const recording = {
    version: 1,
    id,
    status: 'saved',
    startedAt,
    stoppedAt: end,
    savedAt: end + 5000,
    gaps: [],
    startPointName: name,
    endPointName: 'Cubao',
    description: '',
    rideKind: 'Jeep',
    // A recording carries the version of the terms it was made under; one from the first text has none.
    ...(isEarlier ? {} : { consentVersion }),
    ...(upload ? { upload } : {}),
  };
  return { recording, fixes };
}

/** What the phone's database holds for a recording: its upload mark, or 'gone'. */
const storedUpload = (page, id) =>
  page.evaluate(
    (key) =>
      new Promise((resolve) => {
        const open = indexedDB.open('para-contribute');
        open.onsuccess = () => {
          const get = open.result.transaction('recordings').objectStore('recordings').get(key);
          get.onsuccess = () => {
            open.result.close();
            resolve(get.result ? (get.result.upload?.state ?? 'none') : 'gone');
          };
        };
      }),
    id,
  );

const row = (page, name) => page.getByRole('listitem').filter({ hasText: name });
const statusOf = (page, name) => row(page, name).locator('[aria-live]').innerText();
/** The History screen, opened by Ready's History tab unless it is already showing. */
const openHistory = async (page) => {
  const heading = page.getByRole('heading', { level: 1, name: 'History' });
  const tab = page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'History' });
  // A reload on #history lands on the screen itself; otherwise the tab opens it.
  await heading.or(tab).waitFor({ timeout: 10000 });
  if (await heading.isVisible()) return;
  await tab.click();
  await heading.waitFor();
};
/** A card's ⋮ menu, opened unless it is open, then the item named by `pattern`. */
const openMenu = async (page, name) => {
  const more = row(page, name).getByRole('button', { name: /^More actions/ });
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
};
const act = async (page, name, pattern) => {
  await openMenu(page, name);
  await row(page, name).getByRole('button', { name: pattern }).click();
};
const countOf = async (page, name, pattern) => {
  await openMenu(page, name);
  return row(page, name).getByRole('button', { name: pattern }).count();
};
/** Waits for the card named `name` whose status line, the one under its date, matches `pattern`. */
const waitForStatus = async (page, name, pattern) => {
  await openHistory(page);
  return page.waitForFunction(
    ([n, p]) =>
      [...document.querySelectorAll('li')].some(
        (li) =>
          li.textContent.includes(n) &&
          new RegExp(p).test(li.querySelector('[aria-live]')?.textContent ?? ''),
      ),
    [name, pattern.source],
    { timeout: 15000 },
  );
};
const UPLOADED = /^Uploaded$/;
const NO_SIGNAL = /^Waiting for signal$/;
const ON_PHONE_ONLY = /^Only on this phone$/;
/** A true failure's status line, which is its retry button. */
const retryButton = (page, name) =>
  row(page, name).getByRole('button', { name: /^Tap retry upload, / });

// ------------------------------------------------- record, save, uploaded
{
  const { page, fake, errors } = await phone({ studioSession: true });
  const studioBefore = await page.evaluate((k) => localStorage.getItem(k), STUDIO_KEY);
  await page.getByRole('button', { name: 'Start Tracking' }).click();
  for (let s = 0; s < 20; s += 1) {
    await page.evaluate(
      ([t, lat]) => window.__fix(121.05, lat, t),
      [T0 + s * 1000, 14.7 + (s * 8) / 111_320],
    );
  }
  await page.getByRole('button', { name: 'Flag a stop' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.getByLabel('Start point name').fill('SM Fairview');
  await page.getByRole('button', { name: 'Save recording' }).click();
  await page.getByRole('heading', { name: 'Successfully recorded' }).waitFor();
  await page.getByText('Uploaded to Para').waitFor({ timeout: 15000 });
  const [stored] = [...fake.rows.values()];
  check(
    'a saved recording is uploaded on its own, under the current terms (4), and Successfully recorded says so',
    fake.rows.size === 1 &&
      fake.saveRequests === 1 &&
      stored.recording.start_name === 'SM Fairview' &&
      stored.recording.consent_version === 4,
    `${fake.rows.size} stored, ${fake.saveRequests} sends`,
  );
  const markEvents = stored.recording.events.filter((e) => e.kind === 'mark');
  check(
    'the upload carries the mark as a mark event: a time and no position, between start and stop',
    markEvents.length === 1 &&
      Object.keys(markEvents[0]).sort().join() === 'at,kind' &&
      stored.recording.events.map((e) => e.kind).join() === 'start,mode,mark,stop,save',
    JSON.stringify(stored.recording.events),
  );
  const [startEvent, modeEvent] = stored.recording.events;
  check(
    '  and the mode it started on: Lakad, at the start',
    modeEvent.to === 'walk' && modeEvent.at === startEvent.at,
    JSON.stringify(modeEvent),
  );
  check(
    '  it went whole: its points, in batches, and the ride kind left blank',
    stored.recording.point_count === 20 &&
      stored.recording.batches.length === 1 &&
      stored.recording.vehicle === null,
    `${stored.recording.point_count} points`,
  );
  check(
    '  the phone keeps its copy, marked uploaded',
    (await storedUpload(page, stored.recording.id)) === 'uploaded',
  );
  check(
    "  the phone sent as its account, under its own key; the editor's studio session is untouched",
    fake.signIns === 0 &&
      (await page.evaluate((k) => localStorage.getItem(k), STUDIO_KEY)) === studioBefore &&
      (await page.evaluate(() => localStorage.getItem('para.contributor-auth'))) !== null,
  );
  await page.getByRole('button', { name: 'Record again' }).click();
  await waitForStatus(page, 'SM Fairview', UPLOADED);
  await shot(page, '1-uploaded');
  await page.reload({ waitUntil: 'load' });
  await waitForStatus(page, 'SM Fairview', UPLOADED);
  await page.waitForTimeout(500);
  check(
    'after a reload it still reads as uploaded and is not sent again',
    fake.saveRequests === 1 && fake.signIns === 0,
    `${fake.saveRequests} sends`,
  );
  check(
    '  no request left for anything the stand-in does not know',
    fake.unknown.length === 0,
    fake.unknown.join(', '),
  );
  check('  no page errors', errors.length === 0, errors.join(' | '));
}

// --------------------------------------- no signal, then back online
{
  const { page, fake } = await phone();
  fake.next.save = 'offline';
  await seed(page, [
    savedRide('aaaaaaaa-0000-4000-8000-000000000001', T0, { name: 'Offline ride' }),
  ]);
  await page.reload({ waitUntil: 'load' });
  await waitForStatus(page, 'Offline ride', NO_SIGNAL);
  await shot(page, '2-no-signal');
  check(
    'with no signal it says it waits for signal, keeps the copy, and offers no retry: it goes on its own',
    fake.rows.size === 0 && (await retryButton(page, 'Offline ride').count()) === 0,
  );
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitForStatus(page, 'Offline ride', UPLOADED);
  check(
    '  back online, it is sent on its own, once',
    fake.rows.size === 1 && fake.saveRequests === 2,
  );
}

// ------------------------------------ the answer lost after storing
{
  const { page, fake } = await phone();
  fake.next.save = 'lostAnswer';
  await seed(page, [
    savedRide('aaaaaaaa-0000-4000-8000-000000000002', T0, { name: 'Lost answer' }),
  ]);
  await page.reload({ waitUntil: 'load' });
  await waitForStatus(page, 'Lost answer', NO_SIGNAL);
  check(
    'an answer lost on the way back reads as not uploaded, though Para has it',
    fake.rows.size === 1 &&
      (await storedUpload(page, 'aaaaaaaa-0000-4000-8000-000000000002')) === 'none',
  );
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitForStatus(page, 'Lost answer', UPLOADED);
  check(
    '  sent again once back online, it is answered "already saved": uploaded, and stored once',
    fake.rows.size === 1 && fake.saveRequests === 2,
    `${fake.rows.size} stored`,
  );
}

// ----------------------------------- one send at a time, whatever the taps
{
  const { page, fake } = await phone();
  fake.next.save = 'hold';
  await seed(page, [savedRide('aaaaaaaa-0000-4000-8000-000000000003', T0, { name: 'Held ride' })]);
  await page.reload({ waitUntil: 'load' });
  await waitForStatus(page, 'Held ride', /^Sending…$/);
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate(() => {
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }
  await page.waitForTimeout(500);
  check(
    'while an upload is in flight, coming online or to the front sends nothing more; no retry, and no ⋮: nothing to upload or remove',
    fake.saveRequests === 1 &&
      (await retryButton(page, 'Held ride').count()) === 0 &&
      (await row(page, 'Held ride')
        .getByRole('button', { name: /^More actions/ })
        .count()) === 0 &&
      (await row(page, 'Held ride')
        .getByRole('button', { name: /^(Upload to Para|Remove from this phone)/ })
        .count()) === 0,
    `${fake.saveRequests} sends`,
  );
  fake.release();
  await waitForStatus(page, 'Held ride', UPLOADED);
  check('  released, it is uploaded once', fake.rows.size === 1 && fake.saveRequests === 1);
}

// ------------------------------------------------- refused, and day cap
{
  const { page, fake } = await phone();
  fake.next.save = 'bad_points';
  await seed(page, [
    savedRide('aaaaaaaa-0000-4000-8000-000000000004', T0, { name: 'Refused ride' }),
  ]);
  await page.reload({ waitUntil: 'load' });
  await waitForStatus(page, 'Refused ride', /^Tap retry upload$/);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(500);
  check(
    'a refused recording says so, stays on the phone, and is not sent again on its own',
    fake.saveRequests === 1 &&
      (await storedUpload(page, 'aaaaaaaa-0000-4000-8000-000000000004')) === 'none',
    await statusOf(page, 'Refused ride'),
  );
  check(
    '  its status line is the retry button, and its ⋮ still offers Remove from this phone',
    (await retryButton(page, 'Refused ride').count()) === 1 &&
      (await countOf(page, 'Refused ride', /^Remove from this phone/)) === 1,
  );
  fake.next.save = 'day_cap';
  await page.keyboard.press('Escape');
  await retryButton(page, 'Refused ride').click();
  await waitForStatus(page, 'Refused ride', /20 recordings sent today/);
  check('  the day cap says it tries again later', fake.rows.size === 0);
}

// -------------------------------------- remove the upload, keep the copy
{
  const id = 'aaaaaaaa-0000-4000-8000-000000000005';
  const { page, fake } = await phone();
  await seed(page, [savedRide(id, T0, { name: 'Remove me' })]);
  await page.reload({ waitUntil: 'load' });
  await waitForStatus(page, 'Remove me', UPLOADED);
  await act(page, 'Remove me', /^Delete from Para/);
  const question = await row(page, 'Remove me').getByRole('group').innerText();
  check(
    'Delete from Para asks first, says the phone keeps its copy, and focuses Keep it',
    question.includes('Delete this recording from Para? The copy on this phone stays.') &&
      (await page.evaluate(() => document.activeElement?.textContent)) === 'Keep it',
  );
  await shot(page, '3-remove-question');
  await row(page, 'Remove me').getByRole('button', { name: 'Keep it' }).click();
  check('  Keep it removes nothing', fake.rows.size === 1 && fake.deleteRequests === 0);
  fake.next.remove = 'removeOffline';
  await act(page, 'Remove me', /^Delete from Para/);
  await row(page, 'Remove me').getByRole('button', { name: 'Delete', exact: true }).click();
  await waitForStatus(page, 'Remove me', /Not removed/);
  check('  with no signal it says it was not removed', fake.rows.size === 1);
  await act(page, 'Remove me', /^Delete from Para/);
  await row(page, 'Remove me').getByRole('button', { name: 'Delete', exact: true }).click();
  await waitForStatus(page, 'Remove me', ON_PHONE_ONLY);
  check(
    '  removed from Para; the phone keeps its copy, marked removed',
    fake.rows.size === 0 && (await storedUpload(page, id)) === 'removed',
  );
  await page.reload({ waitUntil: 'load' });
  await waitForStatus(page, 'Remove me', ON_PHONE_ONLY);
  await page.waitForTimeout(500);
  const sendsBefore = fake.saveRequests;
  check('  a reload does not send it again on its own', fake.rows.size === 0 && sendsBefore === 1);
  await act(page, 'Remove me', /^Upload to Para/);
  await waitForStatus(page, 'Remove me', UPLOADED);
  check('  Upload to Para, in its menu, sends it back', fake.rows.size === 1);
}

// ------------------------------------------- delete the phone's copy
{
  const uploaded = 'aaaaaaaa-0000-4000-8000-000000000006';
  const local = 'aaaaaaaa-0000-4000-8000-000000000007';
  const { page, fake } = await phone();
  fake.next.save = 'offline';
  await seed(page, [
    savedRide(uploaded, T0, { name: 'Uploaded one' }),
    savedRide(local, T0 + 3_600_000, { name: 'Local one' }),
  ]);
  await page.reload({ waitUntil: 'load' });
  await waitForStatus(page, 'Uploaded one', /^(Uploaded|Waiting for signal)$/);
  await waitForStatus(page, 'Local one', /^(Uploaded|Waiting for signal)$/);
  // Whichever went first met no signal; that one is the one not uploaded.
  const [upName, localName, upId, localId] = fake.rows.has(uploaded)
    ? ['Uploaded one', 'Local one', uploaded, local]
    : ['Local one', 'Uploaded one', local, uploaded];
  await act(page, upName, /^Remove from this phone/);
  check(
    "Remove from this phone on an uploaded recording says Para's copy stays",
    (await row(page, upName).getByRole('group').innerText()).includes(
      'Remove this recording from this phone? The copy uploaded to Para stays.',
    ),
  );
  await shot(page, '4-delete-question');
  await row(page, upName).getByRole('button', { name: 'Remove', exact: true }).click();
  // Para's copy is still the account's, so its card stays, now without a copy on this phone.
  await page.waitForFunction(
    (n) =>
      [...document.querySelectorAll('li')].some(
        (li) => li.textContent.includes(n) && !li.textContent.includes('Remove this recording'),
      ),
    upName,
  );
  check(
    "  and its card stays as the account's upload, with only Delete from Para in its menu",
    (await countOf(page, upName, /^Remove from this phone/)) === 0 &&
      (await countOf(page, upName, /^Delete from Para/)) === 1,
  );
  check(
    '  two recordings waiting at once sent as the account, with no sign-in of their own',
    fake.signIns === 0,
    `${fake.signIns} sign-ins`,
  );
  check(
    "  the phone's copy is gone; Para's is not",
    (await storedUpload(page, upId)) === 'gone' && fake.rows.has(upId),
  );
  await page.keyboard.press('Escape');
  await act(page, localName, /^Remove from this phone/);
  const localQuestion = await row(page, localName).getByRole('group').innerText();
  check(
    '  on one never uploaded, it says it will be gone for good',
    localQuestion.includes('It has not been uploaded, so it will be gone for good.') &&
      !fake.rows.has(localId),
    localQuestion,
  );
  await row(page, localName).getByRole('button', { name: 'Remove', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('li').length === 1);
  check(
    "  focus lands on History's heading, not the page",
    (await page.evaluate(() => document.activeElement?.textContent)) === 'History',
  );
  check('  deleted from the phone', (await storedUpload(page, localId)) === 'gone');
}

// ------------------------------------- an upload an editor has deleted
{
  const id = 'aaaaaaaa-0000-4000-8000-000000000009';
  const { page, fake } = await phone();
  await seed(page, [savedRide(id, T0, { name: 'Editor deleted' })]);
  await page.reload({ waitUntil: 'load' });
  await waitForStatus(page, 'Editor deleted', UPLOADED);
  fake.rows.delete(id);
  await page.reload({ waitUntil: 'load' });
  await waitForStatus(page, 'Editor deleted', /Removed by an editor/);
  await page.waitForTimeout(500);
  check(
    'an upload an editor deleted reads so on reopening, stays on the phone, and is not sent again',
    fake.saveRequests === 1 && (await storedUpload(page, id)) === 'removed',
  );
}

// ---------------------------------- an upload from an earlier identity
{
  const id = 'aaaaaaaa-0000-4000-8000-000000000008';
  const { page } = await phone();
  await seed(page, [
    savedRide(id, T0, {
      name: 'Old identity',
      upload: { state: 'uploaded', at: T0, by: 'ffffffff-0000-4000-8000-000000000000' },
    }),
  ]);
  await page.reload({ waitUntil: 'load' });
  await waitForStatus(page, 'Old identity', /^Uploaded from an earlier sign-in$/);
  check(
    'an upload made by an earlier identity on this phone offers no Delete from Para, and says why',
    (await countOf(page, 'Old identity', /^Delete from Para/)) === 0 &&
      (await statusOf(page, 'Old identity')).includes('Uploaded from an earlier sign-in'),
  );
  await page.keyboard.press('Escape');
  check(
    "  Escape closes the card's menu and puts focus back on its ⋮",
    (await row(page, 'Old identity')
      .getByRole('button', { name: /^More actions/ })
      .getAttribute('aria-expanded')) === 'false' &&
      (
        await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
      ).startsWith('More actions'),
  );
}

// ----------------- no consent step: signed in, a recording waiting goes
{
  const { page, fake } = await phone();
  const id = 'aaaaaaaa-0000-4000-8000-000000000011';
  await seed(page, [savedRide(id, T0, { name: 'Waiting' })]);
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor();
  await waitForStatus(page, 'Waiting', UPLOADED);
  check(
    'signed in, a recording waiting on the phone goes with no consent step, under the terms it was made with (3)',
    (await page.getByRole('heading', { name: 'Before you record' }).count()) === 0 &&
      fake.rows.size === 1 &&
      [...fake.rows.values()][0].recording.consent_version === 3,
  );
  const other = 'cccccccc-0000-4000-8000-000000000002';
  fake.users.set(other, {
    email: 'second@example.com',
    password: 'hunter2hunter2',
    isAccount: true,
    profile: { name: 'Second', phone: '+639181234567' },
  });
  await page.evaluate(
    ([key, signedIn]) => localStorage.setItem(key, JSON.stringify(signedIn)),
    ['para.contributor-auth', session(other, { email: 'second@example.com', isAccount: true })],
  );
  // Back on Ready: a reload on #history would land on History instead.
  await page.evaluate(() => {
    location.hash = '';
  });
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor({ timeout: 30000 });
  check(
    '  a second account on the same phone opens on Start too, with no consent step',
    (await page.getByRole('heading', { name: 'Before you record' }).count()) === 0,
  );
}

// ---------- a phone from before: its recordings go under their own terms
{
  const { page, fake } = await phone();
  const earlier = 'aaaaaaaa-0000-4000-8000-000000000012';
  const stamped = 'aaaaaaaa-0000-4000-8000-000000000013';
  const underTwo = 'aaaaaaaa-0000-4000-8000-000000000019';
  // The first consent screen's agreement, as a phone from before kept it: the page no longer reads it.
  await page.evaluate(() => localStorage.setItem('para.contribute.consent', 'yes'));
  await seed(page, [
    savedRide(earlier, T0, { name: 'Under one', isEarlier: true }),
    savedRide(stamped, T0 + 600_000, { name: 'Stamped' }),
    savedRide(underTwo, T0 + 900_000, { name: 'Under two', consentVersion: 2 }),
  ]);
  await page.reload({ waitUntil: 'load' });
  await SCREENS.earlier(page).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const versions = Object.fromEntries(
    [...fake.rows.entries()].map(([id, row]) => [id, row.recording.consent_version]),
  );
  check(
    'with no consent step, the recordings made under text 2 or 3 go, stamped 2 and 3; the one under text 1 is asked about',
    (await page.getByRole('heading', { name: 'Before you record' }).count()) === 0 &&
      fake.rows.size === 2 &&
      versions[stamped] === 3 &&
      versions[underTwo] === 2 &&
      (await storedUpload(page, earlier)) === 'none' &&
      (await page.getByRole('button', { name: 'Start Tracking' }).count()) === 0,
    JSON.stringify(versions),
  );
}

// ------------- earlier recordings asked about: Account and Logout still there
{
  const { page, fake } = await phone();
  await seed(page, [
    savedRide('aaaaaaaa-0000-4000-8000-000000000020', T0, { name: 'Unasked', isEarlier: true }),
  ]);
  await page.reload({ waitUntil: 'load' });
  await SCREENS.earlier(page).waitFor();
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'Account' })
    .click();
  await page.getByRole('heading', { level: 1, name: 'Account' }).waitFor();
  await page.getByRole('button', { name: 'Logout' }).click();
  await page
    .getByRole('alertdialog', { name: 'Are you sure you want to logout?' })
    .getByRole('button', { name: 'Logout' })
    .click();
  await page
    .getByRole('heading', { name: 'Welcome Contributor', level: 1 })
    .waitFor({ timeout: 15000 });
  check(
    'with the earlier-recordings question open, the Account tab reaches Account and Logout works',
    fake.saveRequests === 0,
    `${fake.saveRequests} sends`,
  );
}

// ------------------------ earlier recordings: asked about, Keep on phone
{
  const a = 'aaaaaaaa-0000-4000-8000-000000000014';
  const b = 'aaaaaaaa-0000-4000-8000-000000000015';
  const { page, fake } = await phone();
  await seed(page, [
    savedRide(a, T0, { name: 'Earlier one', isEarlier: true }),
    savedRide(b, T0 + 600_000, { name: 'Earlier two', isEarlier: true }),
  ]);
  await page.reload({ waitUntil: 'load' });
  await SCREENS.earlier(page).waitFor();
  await page.waitForTimeout(1500);
  await shot(page, 'earlier-question');
  check(
    'earlier recordings are asked about once, by number, and nothing is sent meanwhile',
    (await page.getByRole('heading', { name: 'Send your 2 earlier recordings too?' }).count()) ===
      1 &&
      (await page.getByRole('button', { name: 'Send', exact: true }).count()) === 1 &&
      (await page.getByRole('button', { name: 'Keep on phone' }).count()) === 1 &&
      fake.saveRequests === 0,
  );
  await page.getByRole('button', { name: 'Keep on phone' }).click();
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor();
  await openHistory(page);
  await page.waitForTimeout(1500);
  check(
    '  Keep on phone sends nothing, and History says it is only on this phone',
    fake.saveRequests === 0 &&
      (await storedUpload(page, a)) === 'none' &&
      (await statusOf(page, 'Earlier one')) === 'Only on this phone',
  );
  // Back on Ready: a reload on #history would land on History instead.
  await page.evaluate(() => {
    location.hash = '';
  });
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor();
  await page.waitForTimeout(1000);
  check(
    '  after a reload it is not asked again and still not sent',
    (await SCREENS.earlier(page).count()) === 0 && fake.saveRequests === 0,
  );
  await openHistory(page);
  await act(page, 'Earlier one', /^Upload to Para,/);
  await waitForStatus(page, 'Earlier one', UPLOADED);
  check(
    '  it can still be sent from History, one at a time, from its menu',
    fake.rows.size === 1 &&
      fake.rows.has(a) &&
      (await statusOf(page, 'Earlier two')) === 'Only on this phone',
  );
}

// ------------------------------- earlier recordings: Send goes through
{
  const a = 'aaaaaaaa-0000-4000-8000-000000000016';
  const b = 'aaaaaaaa-0000-4000-8000-000000000017';
  const { page, fake } = await phone();
  await seed(page, [
    savedRide(a, T0, { name: 'Sent one', isEarlier: true }),
    savedRide(b, T0 + 600_000, { name: 'Sent two', isEarlier: true }),
  ]);
  await page.reload({ waitUntil: 'load' });
  await SCREENS.earlier(page).waitFor();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor();
  await waitForStatus(page, 'Sent two', UPLOADED);
  await waitForStatus(page, 'Sent one', UPLOADED);
  check(
    'Send uploads the earlier recordings, each under the current terms (4)',
    fake.rows.size === 2 && [...fake.rows.values()].every((r) => r.recording.consent_version === 4),
  );
  await page.evaluate(() => {
    location.hash = '';
  });
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Start Tracking' }).waitFor();
  check('  and it is not asked again', (await SCREENS.earlier(page).count()) === 0);
}

// ------------------- the ride and the fare go up as the database names them; a bad fare never does
{
  const { page, fake, errors } = await phone();
  for (const [kind, label, vehicle, fareText, farePhp] of [
    ['E-Jeep', 'E-Jeep', 'e_jeep', '13.50', 13.5],
    ['UV Express', 'UV Express', 'uv_express', '', null],
    ['Others', 'Others', 'other', '2500', null],
  ]) {
    const before = fake.rows.size;
    await page.getByRole('button', { name: 'Start Tracking' }).click();
    for (let s = 0; s < 20; s += 1) {
      await page.evaluate(
        ([t, lat]) => window.__fix(121.05, lat, t),
        [T0 + 3_600_000 * (before + 1) + s * 1000, 14.7 + (s * 8) / 111_320],
      );
    }
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await page.getByLabel('Start point name').fill(`On a ${kind}`);
    await page.getByRole('button', { name: 'What did you ride?' }).click();
    await page.getByRole('radio', { name: label }).click();
    if (fareText) await page.getByLabel('Fare').fill(fareText);
    await page.getByRole('button', { name: 'Save recording' }).click();
    if (fareText === '2500') {
      // A fare out of range is not saved: the form stays, says what it takes, and the field is
      // put right (here, emptied) before the ride goes.
      await page.getByText('Enter an amount from ₱0 to ₱2,000').waitFor();
      check(
        '  a fare over ₱2,000 keeps the form open with the field in error, focus on it, nothing sent',
        (await page.getByRole('heading', { name: 'Save Recording' }).count()) === 1 &&
          (await page.evaluate(() => document.activeElement?.getAttribute('inputmode'))) ===
            'decimal' &&
          fake.rows.size === before,
      );
      await page.getByLabel('Fare').fill('');
      await page.getByRole('button', { name: 'Save recording' }).click();
    }
    await page.getByRole('heading', { name: 'Successfully recorded' }).waitFor();
    const isUploaded = await page
      .getByText('Uploaded to Para')
      .waitFor({ timeout: 15000 })
      .then(
        () => true,
        () => false,
      );
    const stored = [...fake.rows.values()].find(
      (row) => row.recording.start_name === `On a ${kind}`,
    );
    check(
      `a ride on ${label} is picked in the sheet and uploads as '${vehicle}', its fare as ${farePhp}`,
      isUploaded &&
        stored?.recording.vehicle === vehicle &&
        (stored?.recording.fare_php ?? null) === farePhp,
      JSON.stringify([stored?.recording.vehicle, stored?.recording.fare_php]),
    );
    await page.getByRole('button', { name: 'Record again' }).click();
  }
  check('  no page errors', errors.length === 0, errors.join(' | '));
}

await browser.close();
tally();
