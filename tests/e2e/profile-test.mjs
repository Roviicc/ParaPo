// The contributor page's Account and History, driven by a phone signed in to an account: Account,
// opened from the Account tab on Ready, shows the name, the email and the Commute Statistics
// (get_my_stats), with Account settings inside it, and History is a tab of its own; Account settings changes the name
// and number through set_profile, and Logout asks first and signs this phone out only. History lists
// the account's uploads from the database, whichever phone sent them, merged with this phone's
// own, and Remove works on any the account owns. Supabase is the in-memory stand-in
// (lib/fake-contributions.mjs): every request to *.supabase.co lands there, and one it does not
// know fails the run, so nothing reaches a real project.
//
//   cp .env.production .env.local && echo VITE_CONTRIBUTIONS=1 >> .env.local
//                                        (a project URL to stand in for, and uploads on)
//   npm run dev                          (in another terminal)
//   node tests/e2e/profile-test.mjs
//
// PARA_SHOTS=dir keeps screenshots of the screens at 393×852.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

import { fakeContributions, session } from './lib/fake-contributions.mjs';
import { fakeTurnstile } from './lib/fake-turnstile.mjs';
import { BASE, bareStyle, harness, nodeFetch } from './lib/harness.mjs';

const { check, tally } = harness();
const SHOTS = process.env.PARA_SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : null);

const T0 = Date.UTC(2026, 9, 19, 0, 0, 0);
const ACCOUNT_ID = 'cccccccc-0000-4000-8000-000000000001';
const ACCOUNT = {
  email: 'tester@example.com',
  password: 'hunter2hunter2',
  isAccount: true,
  profile: { name: 'Tester', phone: '+639171234567' },
};
const AUTH_KEY = 'para.contributor-auth';
const browser = await chromium.launch();

/** The database both phones share: the account, and the uploads each of its phones sent. */
const database = { users: new Map([[ACCOUNT_ID, { ...ACCOUNT }]]), rows: new Map() };

/** A recording the account uploaded from some phone, as the database holds it. */
function uploadedRow(id, hoursIn, startName) {
  const start = T0 + hoursIn * 3_600_000;
  database.rows.set(id, {
    by: ACCOUNT_ID,
    recording: {
      id,
      started_at: new Date(start).toISOString(),
      ended_at: new Date(start + 600_000).toISOString(),
      start_name: startName,
      end_name: 'Cubao',
      description: '',
      vehicle: 'jeep',
      distance_m: 4_200,
      walk_m: 300,
      ride_m: 3_900,
    },
  });
}

const EDITOR_ID = 'eeeeeeee-0000-4000-8000-0000000000ee';
database.users.set(EDITOR_ID, {
  email: 'editor@example.com',
  password: 'hunter2hunter2',
  isAccount: true,
  isEditor: true,
  profile: { name: 'Editor', phone: '+639170000000' },
});

/**
 * A phone signed in to the account, on the shared database; `signedIn: false` has no session,
 * and `userId` signs in as another user (the editor).
 */
async function phone({ signedIn = true, userId = ACCOUNT_ID } = {}) {
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
  fake.users = database.users;
  fake.rows = database.rows;
  await fakeTurnstile(page);
  await page.addInitScript(
    ([key, stored]) => {
      if (stored && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(stored));
    },
    [
      AUTH_KEY,
      signedIn
        ? session(userId, { email: database.users.get(userId).email, isAccount: true })
        : null,
    ],
  );
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/contribute/`, { waitUntil: 'load' });
  return { page, fake, errors };
}

const button = (page, name) => page.getByRole('button', { name, exact: true });
/** Ready's Account tab, in the toolbar under Start tracking: the way into Account. */
const accountTab = (page) =>
  page.getByRole('navigation', { name: 'Screens' }).getByRole('button', { name: 'Account' });
/** The History tab, on Ready or on Account. */
const historyTab = (page) =>
  page.getByRole('navigation', { name: 'Screens' }).getByRole('button', { name: 'History' });
/** History, from Ready's History tab. */
const openHistory = async (page) => {
  await historyTab(page).click();
};
/** The tab focus is on, if focus is on one. */
const focusedTab = (page) =>
  page.evaluate(() =>
    document.activeElement?.closest('nav[aria-label="Screens"]')
      ? document.activeElement.textContent
      : null,
  );
const field = (page, name) => page.getByLabel(name, { exact: true });
/** Account's toolbar: Record, back to Start. */
const toolbarRecord = (page) =>
  page.getByRole('navigation', { name: 'Screens' }).getByRole('button', { name: 'Record' });
/** Account's Logout question (4521:3500). */
const logoutQuestion = (page) =>
  page.getByRole('alertdialog', { name: 'Are you sure you want to logout?' });
/** Account's Logout, then the question's Logout. */
const logout = async (page) => {
  await button(page, 'Logout').click();
  await logoutQuestion(page).getByRole('button', { name: 'Logout' }).click();
};
const start = (page) => page.getByRole('button', { name: 'Start Tracking' });
/** The Sakay or Lakad row of the Commute Statistics' legend. */
const legendRow = (stats, word) => stats.getByRole('listitem').filter({ hasText: word });
const row = (page, name) => page.getByRole('listitem').filter({ hasText: name });
const moreOf = (page, name) => row(page, name).getByRole('button', { name: /^More actions/ });
const actionsOf = async (page, name) => {
  await moreOf(page, name).click();
  return row(page, name).getByRole('button');
};
/** A card's status line, the one under its date: Uploaded, Only on this phone, … */
const statusOf = (page, name) => row(page, name).locator('[aria-live]').innerText();

/** A saved recording of this phone, put straight into its database as an earlier visit would. */
async function seed(page, id, name, upload) {
  const recording = {
    version: 1,
    id,
    status: 'saved',
    startedAt: T0,
    stoppedAt: T0 + 30_000,
    savedAt: T0 + 35_000,
    gaps: [],
    startPointName: name,
    endPointName: 'Cubao',
    description: '',
    rideKind: 'Jeep',
    consentVersion: 3,
    ...(upload ? { upload } : {}),
  };
  await page.evaluate(
    (stored) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('para-contribute');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(['recordings'], 'readwrite');
          tx.objectStore('recordings').put(stored);
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    recording,
  );
}

// ------------------------------------------------ Account: the tab is the way in
{
  const { page, fake, errors } = await phone();
  await start(page).waitFor({ timeout: 30000 });
  const tab = await accountTab(page).boundingBox();
  check(
    'Ready has the History and Account tabs over Start, and no Account or History button elsewhere',
    !!tab &&
      (await page.getByRole('button', { name: 'Account' }).count()) === 1 &&
      (await button(page, 'History').count()) === 1 &&
      (await historyTab(page).count()) === 1,
    JSON.stringify({ tab }),
  );
  await shot(page, '1-ready');

  await accountTab(page).click();
  await page.getByRole('heading', { level: 1, name: 'Account' }).waitFor();
  await toolbarRecord(page).click();
  await start(page).waitFor();
  check(
    "Account's Record tab returns to Ready with focus on the Account tab",
    await page.evaluate(
      () =>
        document.activeElement?.textContent === 'Account' &&
        !!document.activeElement.closest('nav[aria-label="Screens"]'),
    ),
  );

  await openHistory(page);
  await page.getByRole('heading', { level: 1, name: 'History' }).waitFor();
  check(
    'History is a tab like Account: no Back, the toolbar with History marked, Record and Account beside it',
    (await button(page, 'Back').count()) === 0 &&
      (await page
        .getByRole('navigation', { name: 'Screens' })
        .locator('[aria-current="page"]')
        .textContent()) === 'History' &&
      (await toolbarRecord(page).count()) === 1 &&
      (await accountTab(page).count()) === 1,
  );
  await toolbarRecord(page).click();
  await start(page).waitFor();
  await page
    .waitForFunction(() => document.activeElement?.textContent === 'History', null, {
      timeout: 5000,
    })
    .catch(() => {});
  check(
    "Ready's History tab opens History; its Record tab returns to Ready, focus on the History tab",
    (await page.evaluate(() => location.hash)) === '' && (await focusedTab(page)) === 'History',
  );

  const isOnAccount = async () =>
    (await page.getByRole('heading', { level: 1, name: 'Account' }).count()) === 1 &&
    (await page.evaluate(() => location.hash)) === '#profile';
  await accountTab(page).click();
  await page.getByRole('heading', { level: 1, name: 'Account' }).waitFor();
  await historyTab(page).click();
  await page.getByRole('heading', { level: 1, name: 'History' }).waitFor();
  await accountTab(page).click();
  await page.getByRole('heading', { level: 1, name: 'Account' }).waitFor();
  check(
    "  Account's History tab opens History; History's Account tab returns to Account",
    await isOnAccount(),
  );
  await historyTab(page).click();
  await page.getByRole('heading', { level: 1, name: 'History' }).waitFor();
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('heading', { level: 1, name: 'History' }).waitFor({ timeout: 30000 });
  await toolbarRecord(page).click();
  await start(page).waitFor();
  check(
    '  after a reload on #history, Record returns to Ready',
    (await page.evaluate(() => location.hash)) === '',
  );
  await openHistory(page);
  await page.getByText('No recordings yet.').waitFor({ timeout: 15000 });
  await button(page, 'Record a route').click();
  await start(page).waitFor();
  check(
    "  an empty History's Record a route goes to Start",
    (await page.evaluate(() => location.hash)) === '' &&
      (await page.getByRole('heading', { level: 1, name: 'History' }).count()) === 0,
  );

  await accountTab(page).click();
  await page.getByRole('heading', { level: 1, name: 'Account' }).waitFor();
  await button(page, 'Account settings').click();
  await page.getByRole('heading', { level: 1, name: 'Account settings' }).waitFor();
  await field(page, 'Name').waitFor();
  check(
    'Account settings shows the email as it is, the name and number to change, and a new password',
    (await page.getByText(ACCOUNT.email, { exact: true }).count()) === 1 &&
      (await page.locator('input').count()) === 5 &&
      (await page.evaluate(() => location.hash)) === '#account-settings' &&
      (await field(page, 'Name').inputValue()) === 'Tester' &&
      (await field(page, 'Number').inputValue()) === '+639171234567',
  );
  check(
    '  its heading has focus, and Save waits for a change',
    (await page.evaluate(() => document.activeElement?.textContent)) === 'Account settings' &&
      (await button(page, 'Save').isDisabled()),
  );
  await shot(page, '2-account');

  await field(page, 'Number').fill('12345');
  await button(page, 'Save').click();
  await page.getByText('Enter a mobile number like 917 123 4567').waitFor();
  check('  a bad number is named and nothing is sent', fake.profileRequests === 0);

  await field(page, 'Name').fill('Tester Two');
  await field(page, 'Number').fill('0918 765 4321');
  fake.next.profile = 'offline';
  await button(page, 'Save').click();
  await page.getByRole('alert').waitFor();
  check(
    '  with no signal Save says so in one line and keeps what was typed',
    (await page.getByRole('alert').innerText()).startsWith('No signal') &&
      (await field(page, 'Name').inputValue()) === 'Tester Two' &&
      (await button(page, 'Save').isEnabled()),
  );

  await button(page, 'Save').click();
  await page.waitForFunction(() => document.querySelector('input')?.value === 'Tester Two');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some((b) => b.textContent === 'Save' && b.disabled),
  );
  const stored = database.users.get(ACCOUNT_ID).profile;
  check(
    '  saving stores the number as +639XXXXXXXXX, and Save is spent again',
    stored.name === 'Tester Two' && stored.phone === '+639187654321',
    JSON.stringify(stored),
  );
  await page.reload({ waitUntil: 'load' });
  await field(page, 'Name').waitFor({ timeout: 15000 });
  check(
    '  a reload stays on Account settings, with the saved values',
    (await field(page, 'Name').inputValue()) === 'Tester Two' &&
      (await field(page, 'Number').inputValue()) === '+639187654321',
  );

  // Change password asks for the current one: a phone left unlocked cannot change it.
  await field(page, 'Current password').fill('not-it-123');
  await field(page, 'New password').fill('n3wpassword');
  await field(page, 'Confirm password').fill('n3wpassword');
  await button(page, 'Change password').click();
  await page.getByText('That’s not your current password').waitFor();
  check(
    '  Change password: a wrong current password is said on its field, and nothing changes',
    database.users.get(ACCOUNT_ID).password === ACCOUNT.password &&
      !fake.order.includes('update_password'),
  );
  await field(page, 'Current password').fill(ACCOUNT.password);
  await button(page, 'Change password').click();
  await page.getByText('Your password is changed.').waitFor();
  check(
    '  the right current password changes it, checked first by signing in with it',
    database.users.get(ACCOUNT_ID).password === 'n3wpassword' &&
      fake.order.includes('update_password'),
  );
  database.users.get(ACCOUNT_ID).password = ACCOUNT.password;

  check('  no request the stand-in does not know', fake.unknown.length === 0, fake.unknown.join());
  check('  no page errors', errors.length === 0, errors.join(' | '));
  database.users.get(ACCOUNT_ID).profile = { ...ACCOUNT.profile };
}

// ------------------------- motion between the tabs: the way the tabs run, and never in the way
{
  const { page, errors } = await phone();
  await start(page).waitFor({ timeout: 30000 });
  const heading = (name) => page.getByRole('heading', { level: 1, name });
  // Each screen's code fetched once, so the moves below are the moves a phone makes after its first.
  await historyTab(page).click();
  await heading('History').waitFor();
  await accountTab(page).click();
  await heading('Account').waitFor();
  await toolbarRecord(page).click();
  await start(page).waitFor();
  await page.waitForTimeout(600);

  /** What is moving 60 ms into a move: the view transition's parts and the toolbar's pill. */
  const midMove = async (tap) => {
    await tap.click();
    await page.waitForTimeout(60);
    return page.evaluate(() => ({
      direction: document.documentElement.dataset.tabMotion ?? null,
      parts: document
        .getAnimations()
        .map((a) => a.effect?.pseudoElement)
        .filter(Boolean),
      pill: document
        .getAnimations()
        .some(
          (a) =>
            a.effect?.target?.getAttribute?.('aria-hidden') === 'true' &&
            a.effect.target.parentElement?.classList.contains('tab-toolbar'),
        ),
    }));
  };
  const toHistory = await midMove(historyTab(page));
  check(
    'Record to History: History slides in from the right over the map, and the pill slides to its tab',
    toHistory.direction === 'forward' &&
      toHistory.parts.includes('::view-transition-new(tab-screen)') &&
      !toHistory.parts.includes('::view-transition-old(tab-screen)') &&
      toHistory.pill,
    JSON.stringify(toHistory),
  );
  check(
    '  focus is on its heading at once, not after the move',
    (await page.evaluate(() => document.activeElement?.textContent)) === 'History',
  );
  await page.waitForTimeout(400);
  const toAccount = await midMove(accountTab(page));
  check(
    '  History to Account: Account comes in from the right as History goes out to the left',
    toAccount.direction === 'forward' &&
      toAccount.parts.includes('::view-transition-new(tab-screen)') &&
      toAccount.parts.includes('::view-transition-old(tab-screen)'),
    JSON.stringify(toAccount),
  );
  await page.waitForTimeout(400);
  const toSettings = await midMove(button(page, 'Account settings'));
  check(
    '  Account settings pushes in from the right, inside Account',
    toSettings.direction === 'forward' &&
      toSettings.parts.includes('::view-transition-new(tab-screen)'),
    JSON.stringify(toSettings),
  );
  check(
    '  the toolbar, which Account settings has none of, fades out with Account rather than snapping off',
    toSettings.parts.includes('::view-transition-old(tab-toolbar)') &&
      !toSettings.parts.includes('::view-transition-new(tab-toolbar)'),
    JSON.stringify(toSettings),
  );
  await page.waitForTimeout(400);
  const back = await midMove(button(page, 'Back'));
  check('  and its Back goes the other way', back.direction === 'back', JSON.stringify(back));
  await heading('Account').waitFor();
  await page.waitForTimeout(400);
  const toRecord = await midMove(toolbarRecord(page));
  check(
    '  Account to Record goes left: Account slides away to the right, off the map',
    toRecord.direction === 'back' &&
      toRecord.parts.includes('::view-transition-old(tab-screen)') &&
      !toRecord.parts.includes('::view-transition-new(tab-screen)'),
    JSON.stringify(toRecord),
  );
  await start(page).waitFor();
  await page.waitForTimeout(400);

  // Every value is the owner's Motion token, read by the script's fallbacks from the same place.
  const timing = await page.evaluate(() =>
    import('/src/features/contribute/common/tab-motion.ts').then((motion) => ({
      arrive: motion.motionOf('arrive'),
      move: motion.motionOf('move'),
      shift: motion.tabShift(1),
    })),
  );
  check(
    "the moves' timings are the owner's Motion tokens: base on ease-enter, gentle on ease-move, a 7-step shift",
    timing.arrive.duration === 200 &&
      timing.arrive.easing === 'cubic-bezier(0.22, 1, 0.36, 1)' &&
      timing.move.duration === 300 &&
      timing.move.easing === 'cubic-bezier(0.65, 0, 0.35, 1)' &&
      /calc\(1 \* calc\(.*\* 7\)\)/.test(timing.shift),
    JSON.stringify(timing),
  );

  // A move to where the phone already is (a second tap) shows nothing: no slide replayed.
  const noMove = await page.evaluate(() =>
    import('/src/features/contribute/common/tab-motion.ts').then((motion) => {
      motion.moveBetweenScreens(
        () => false,
        () => {},
      );
      return {
        direction: document.documentElement.dataset.tabMotion ?? null,
        moving: document.getAnimations().filter((a) => a.effect?.pseudoElement).length,
      };
    }),
  );
  check(
    '  a move to the screen already showing shows nothing, and leaves no slide set',
    noMove.direction === null && noMove.moving === 0,
    JSON.stringify(noMove),
  );

  // Three taps faster than a move: each lands, and the last one is where the phone ends up.
  await historyTab(page).click();
  await page.waitForTimeout(40);
  await accountTab(page).click();
  await page.waitForTimeout(40);
  await historyTab(page).click();
  await page.waitForTimeout(600);
  check(
    'taps faster than the moves land where the last one points: History, nothing else on top',
    (await page.evaluate(() => location.hash)) === '#history' &&
      (await heading('History').count()) === 1 &&
      (await heading('Account').count()) === 0 &&
      (await page.evaluate(
        () => document.getAnimations().filter((a) => a.effect?.pseudoElement).length,
      )) === 0,
  );

  // Less motion asked for: the screens and the pill just switch.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await accountTab(page).click();
  await page.waitForTimeout(40);
  const reduced = await page.evaluate(() =>
    document
      .getAnimations()
      .filter(
        (a) => a.effect?.pseudoElement || a.effect?.target?.closest?.('.tab-toolbar, .tab-screen'),
      )
      .map((a) => a.effect?.pseudoElement || a.effect?.target?.tagName),
  );
  await heading('Account').waitFor();
  check(
    'with less motion asked for, nothing slides or fades: Account just shows',
    reduced.length === 0,
    JSON.stringify(reduced),
  );
  check('  no page errors', errors.length === 0, errors.join(' | '));
  await page.context().close();
}

// ------------------------------------------- Account: the Commute Statistics
{
  const { page, fake, errors } = await phone();
  await start(page).waitFor({ timeout: 30000 });
  await accountTab(page).click();
  await page.getByRole('heading', { level: 1, name: 'Account' }).waitFor();
  await page.getByText(ACCOUNT.email, { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[aria-busy="true"]') === null);
  check(
    'Account shows the name and email; with no get_my_stats yet, the statistics are left out quietly',
    (await page.getByText(ACCOUNT.profile.name, { exact: true }).count()) === 1 &&
      fake.statsRequests > 0 &&
      (await page.getByRole('heading', { name: 'Commute Statistics' }).count()) === 0 &&
      (await page.getByRole('alert').count()) === 0,
  );
  const general = page.locator('section[aria-labelledby="general-heading"]').getByRole('button');
  check(
    '  General: Account settings and Logout',
    (await general.allInnerTexts()).join('|') === 'Account settings|Logout',
    (await general.allInnerTexts()).join('|'),
  );

  // 62 hours, 1,240 km in 6 recordings, 40% of it walked.
  fake.stats = {
    rides: 6,
    distanceM: 1_240_500,
    movingS: 50 * 3600,
    standingS: 12 * 3600 + 1200,
    walkM: 496_200,
    rideM: 700_000,
    jeepRides: 3,
    eJeepRides: 2,
    busRides: 1_204,
    trainRides: 1,
    tricycleRides: 1,
    farePhpTotal: 1_240.5,
    fareRecordings: 31,
  };
  await toolbarRecord(page).click();
  await accountTab(page).click();
  const stats = page.getByRole('region', { name: 'Commute Statistics' });
  // The region shows placeholders first: read it once the numbers are in.
  await stats.getByText('Total time').waitFor();
  const statsText = await stats.innerText();
  await shot(page, '2-account-stats');
  check(
    '  with stats: total time in hours, distance in km with separators, the routes recorded counted',
    /Total time\s*62\s*hr/.test(statsText) &&
      /Total distance\s*1,240\s*km/.test(statsText) &&
      /Routes recorded\s*6/.test(statsText),
    statsText.replace(/\n/g, ' '),
  );
  check(
    '  the total fare in pesos with its centavos, said in pesos, between the cards and the vehicles',
    /Total fare\s*₱1,240\.50\s*1,240\.50 pesos/.test(statsText) &&
      statsText.indexOf('Total fare') > statsText.indexOf('Lakad') &&
      statsText.indexOf('Total fare') < statsText.indexOf('Jeep'),
    statsText.replace(/\n/g, ' '),
  );
  const vehicles = await stats
    .getByRole('list', { name: 'Rides by vehicle' })
    .getByRole('listitem')
    .allInnerTexts();
  check(
    "  rides by vehicle, the frame's six: -- for none, no Tricycle",
    vehicles.map((cell) => cell.replace(/\s+/g, ' ').trim()).join(' | ') ===
      'Jeep 3 | E-Jeep 2 | UV Express -- none | Bus 1,204 | Train 1 | Ferry -- none',
    vehicles.map((cell) => cell.replace(/\s+/g, ' ').trim()).join(' | '),
  );
  check(
    '  and Sakay and Lakad by distance, each share under its end, and said with its word',
    /^Sakay\s*60%$/.test(await legendRow(stats, 'Sakay').innerText()) &&
      /^Lakad\s*40%$/.test(await legendRow(stats, 'Lakad').innerText()),
  );

  // Asked again offline: the last numbers stay.
  fake.next.stats = 'offline';
  await toolbarRecord(page).click();
  await accountTab(page).click();
  await stats.waitFor();
  await page.waitForTimeout(500);
  check(
    '  asked again with no signal, the last numbers stay',
    /62\s*hr/.test(await stats.innerText()) && fake.next.stats === undefined,
  );
  check('  no request the stand-in does not know', fake.unknown.length === 0, fake.unknown.join());
  check('  no page errors', errors.length === 0, errors.join(' | '));
}
{
  // None had yet, and no signal: one short line in their place.
  const { page, fake } = await phone();
  fake.stats = { rides: 1, distanceM: 1000 };
  fake.next.stats = 'offline';
  await start(page).waitFor({ timeout: 30000 });
  await accountTab(page).click();
  const stats = page.getByRole('region', { name: 'Commute Statistics' });
  await stats.getByText('Your statistics show when you’re online.').waitFor();
  check('Commute Statistics with no signal and none kept: one short line', true);
  // No recordings yet: zeros and an empty bar.
  fake.stats = {};
  await toolbarRecord(page).click();
  await accountTab(page).click();
  // Read once the numbers are in, not the placeholders.
  await stats.getByText('Sakay', { exact: true }).waitFor();
  const zeroText = await stats.innerText();
  check(
    '  with no recordings: zeros, Sakay and Lakad with no shares, and no fare known: --, not ₱0',
    /Total time\s*0\s*min/.test(zeroText) &&
      /Routes recorded\s*0/.test(zeroText) &&
      /Total fare\s*--\s*none/.test(zeroText) &&
      !zeroText.includes('₱'),
    zeroText.replace(/\n/g, ' '),
  );
}

// --------------------------------- History: the account's uploads, any phone
uploadedRow('dddddddd-0000-4000-8000-000000000001', 1, 'From phone A');
uploadedRow('dddddddd-0000-4000-8000-000000000002', 2, 'Also phone A');
uploadedRow('dddddddd-0000-4000-8000-000000000003', 3, 'Here and there');
{
  const { page, fake, errors } = await phone();
  await start(page).waitFor({ timeout: 30000 });
  await seed(page, 'dddddddd-0000-4000-8000-000000000003', 'Here and there', {
    state: 'uploaded',
    at: T0,
    by: 'ffffffff-0000-4000-8000-000000000000',
  });
  await seed(page, 'eeeeeeee-0000-4000-8000-000000000004', 'Only here');
  await page.reload({ waitUntil: 'load' });
  await openHistory(page);
  await row(page, 'From phone A').waitFor({ timeout: 15000 });
  await shot(page, '3-history');
  check(
    'History lists uploads another phone sent, merged with this phone, each Uploaded',
    (await statusOf(page, 'From phone A')) === 'Uploaded' &&
      (await statusOf(page, 'Also phone A')) === 'Uploaded' &&
      (await statusOf(page, 'Here and there')) === 'Uploaded' &&
      (await page.getByRole('listitem').filter({ hasText: 'Here and there' }).count()) === 1,
  );
  check(
    '  an upload this phone also holds is one card, not two',
    (await page.getByRole('listitem').count()) === 4,
    String(await page.getByRole('listitem').count()),
  );
  const fromA = (await row(page, 'From phone A').innerText()).replace(/\n/g, ' ');
  check(
    "  another phone's upload shows what the database keeps of it: the jeep, and its distance",
    fromA.includes('Jeep,') && fromA.includes('4.2 km') && fromA.includes('0h 10m'),
    fromA,
  );
  const buttons = await actionsOf(page, 'From phone A');
  const names = await buttons.evaluateAll((all) =>
    all.map((b) => b.getAttribute('aria-label') ?? b.textContent),
  );
  check(
    '  an upload from another phone can be deleted from Para, and offers no Remove from this phone',
    names.some((name) => name.startsWith('Delete from Para')) &&
      !names.some((name) => name.startsWith('Remove from this phone')),
    names.join(' | '),
  );
  await row(page, 'From phone A')
    .getByRole('button', { name: /^Delete from Para/ })
    .click();
  await row(page, 'From phone A').getByRole('button', { name: 'Delete', exact: true }).click();
  await row(page, 'From phone A').waitFor({ state: 'detached' });
  check(
    '  Delete takes it out of Para and off the list',
    !database.rows.has('dddddddd-0000-4000-8000-000000000001') && fake.deleteRequests === 1,
  );

  const here = await actionsOf(page, 'Here and there');
  check(
    "  an upload this phone sent under an earlier sign-in is the account's: it can be deleted from Para",
    await here.evaluateAll((all) =>
      all.some((b) => b.getAttribute('aria-label')?.startsWith('Delete from Para')),
    ),
  );
  await row(page, 'Here and there')
    .getByRole('button', { name: /^Delete from Para/ })
    .click();
  await row(page, 'Here and there').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('li')]
        .find((li) => li.textContent.includes('Here and there'))
        ?.querySelector('[aria-live]')?.textContent === 'Only on this phone',
  );
  check(
    '  and reads Only on this phone, kept, once it is deleted from Para',
    !database.rows.has('dddddddd-0000-4000-8000-000000000003') &&
      (await page.getByRole('listitem').filter({ hasText: 'Here and there' }).count()) === 1,
  );
  check('  no request the stand-in does not know', fake.unknown.length === 0, fake.unknown.join());
  check('  no page errors', errors.length === 0, errors.join(' | '));
}

// ---------------------- loading, failure and the other phone's view
{
  const { page, fake } = await phone();
  await start(page).waitFor({ timeout: 30000 });
  await seed(page, 'eeeeeeee-0000-4000-8000-000000000004', 'Only here');
  await page.reload({ waitUntil: 'load' });
  fake.next.list = 'hold';
  await openHistory(page);
  await page.getByRole('status').filter({ hasText: 'Loading…' }).waitFor();
  check(
    "while the account's uploads load, this phone's own are already listed",
    (await row(page, 'Only here').count()) === 1,
  );
  await shot(page, '4-history-loading');
  fake.release();
  await row(page, 'Also phone A').waitFor();
  check('  and the rest arrive', (await page.getByText('Loading…').count()) === 0);

  // The page stays on #history through the reload, and asks for the list as it opens.
  fake.next.list = 'offline';
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('alert').filter({ hasText: "can't load your uploads" }).waitFor();
  check(
    "with no signal History says so in one line with Try again, and still lists this phone's own",
    (await row(page, 'Only here').count()) === 1 &&
      (await button(page, 'Try again').count()) === 1 &&
      (await row(page, 'Also phone A').count()) === 0,
  );
  await shot(page, '5-history-error');
  delete fake.next.list;
  await button(page, 'Try again').click();
  await row(page, 'Also phone A').waitFor();
  check('  Try again loads them', (await page.getByRole('alert').count()) === 0);
}

{
  const { page, errors } = await phone({ signedIn: false });
  await page
    .getByRole('heading', { name: 'Welcome Contributor', level: 1 })
    .waitFor({ timeout: 30000 });
  await field(page, 'Email').fill(ACCOUNT.email);
  await field(page, 'Password').fill(ACCOUNT.password);
  await button(page, 'Sign in').click();
  await start(page).waitFor({ timeout: 15000 });
  await openHistory(page);
  await row(page, 'Also phone A').waitFor({ timeout: 15000 });
  check(
    'another phone signed in to the account sees its uploads, with none of its own',
    (await page.getByRole('listitem').count()) === 2 &&
      (await statusOf(page, 'Also phone A')) === 'Uploaded' &&
      (await statusOf(page, 'Only here')) === 'Uploaded',
  );
  check('  no page errors', errors.length === 0, errors.join(' | '));
}

// ------------------- an editor's session sees and removes only its own
{
  const mine = 'dddddddd-0000-4000-8000-0000000000ed';
  database.rows.set(mine, {
    by: EDITOR_ID,
    recording: {
      id: mine,
      started_at: new Date(T0).toISOString(),
      ended_at: new Date(T0 + 600_000).toISOString(),
      start_name: 'Editor ride',
      end_name: 'Cubao',
      description: '',
      vehicle: null,
      distance_m: 900,
      walk_m: 900,
      ride_m: 0,
    },
  });
  const { page, errors } = await phone({ userId: EDITOR_ID });
  await start(page).waitFor({ timeout: 30000 });
  await openHistory(page);
  await row(page, 'Editor ride').waitFor({ timeout: 15000 });
  check(
    "an editor signed in here sees only its own uploads in History, not everyone's",
    (await page.getByRole('listitem').count()) === 1,
    String(await page.getByRole('listitem').count()),
  );
  const others = [...database.rows.keys()].filter((id) => id !== mine);
  await page.evaluate(
    (ids) =>
      import('/src/features/contribute/api/upload-contribution.ts').then((upload) =>
        Promise.all(ids.map((id) => upload.removeUpload(id))),
      ),
    others,
  );
  check(
    "  and removing someone else's upload does nothing, though the session could delete it",
    others.length > 0 && others.every((id) => database.rows.has(id)),
    `${others.length} others`,
  );
  check('  no page errors', errors.length === 0, errors.join(' | '));
}

// ---------- right after sign-in, Account is there and Logout works
{
  const { page } = await phone({ signedIn: false });
  await page
    .getByRole('heading', { name: 'Welcome Contributor', level: 1 })
    .waitFor({ timeout: 30000 });
  // A #history kept from before sign-in must not open History once the account is in.
  await page.evaluate(() => {
    location.hash = 'history';
  });
  await page.reload({ waitUntil: 'load' });
  await page
    .getByRole('heading', { name: 'Welcome Contributor', level: 1 })
    .waitFor({ timeout: 30000 });
  await field(page, 'Email').fill(ACCOUNT.email);
  await field(page, 'Password').fill(ACCOUNT.password);
  await button(page, 'Sign in').click();
  await start(page).waitFor({ timeout: 15000 });
  check(
    'a stale #history from before sign-in is dropped: the account lands on Start, not History',
    (await page.evaluate(() => location.hash)) === '' &&
      (await page.getByRole('heading', { level: 1, name: 'History' }).count()) === 0,
  );
  const isConsentShown =
    (await page.getByRole('heading', { name: 'Before you record' }).count()) > 0;
  await accountTab(page).click();
  await page.getByRole('heading', { level: 1, name: 'Account' }).waitFor();
  await logout(page);
  await page
    .getByRole('heading', { name: 'Welcome Contributor', level: 1 })
    .waitFor({ timeout: 15000 });
  check(
    'right after sign-in, with no consent step, the Account tab opens Account, and Logout works',
    !isConsentShown,
  );
}

// ------------- a claim that moves uploads in refreshes an open History
{
  const claimed = 'dddddddd-0000-4000-8000-0000000000c1';
  const earlier = 'bbbbbbbb-0000-4000-8000-0000000000b1';
  const token = 'cccccccc-1111-4000-8000-0000000000c1';
  const { page, fake } = await phone();
  await start(page).waitFor({ timeout: 30000 });
  // An earlier anonymous identity of this phone holds an upload, and its claim is waiting.
  database.users.set(earlier, { email: null, password: null, isAccount: false, profile: null });
  database.rows.set(claimed, {
    by: earlier,
    recording: {
      id: claimed,
      started_at: new Date(T0).toISOString(),
      ended_at: new Date(T0 + 600_000).toISOString(),
      start_name: 'Claimed ride',
      end_name: 'Cubao',
      description: '',
      vehicle: 'bus',
      distance_m: 2_000,
      walk_m: null,
      ride_m: null,
    },
  });
  fake.tokens.set(token, { anonymousId: earlier, usedBy: null });
  await openHistory(page);
  await row(page, 'Also phone A').waitFor({ timeout: 15000 });
  check(
    "before the claim, History does not list the earlier identity's upload",
    (await row(page, 'Claimed ride').count()) === 0,
  );
  await page.evaluate(
    ([id, claim]) =>
      localStorage.setItem(
        'para.contributor-claim',
        JSON.stringify({ token: claim, accountId: id, wasTried: false }),
      ),
    [ACCOUNT_ID, token],
  );
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await row(page, 'Claimed ride').waitFor({ timeout: 15000 });
  check(
    '  a claim finished while History is open adds the moved upload to it',
    fake.claims.includes('finish_claim') && (await statusOf(page, 'Claimed ride')) === 'Uploaded',
    fake.claims.join(),
  );
  database.rows.delete(claimed);
  database.users.delete(earlier);
}

// ------------ signing out leaves a claim waiting for its own account
{
  const { page, fake } = await phone();
  await start(page).waitFor({ timeout: 30000 });
  await page.evaluate(
    ([id]) =>
      localStorage.setItem(
        'para.contributor-claim',
        JSON.stringify({
          token: 'cccccccc-2222-4000-8000-0000000000c2',
          accountId: id,
          wasTried: true,
        }),
      ),
    [ACCOUNT_ID],
  );
  await accountTab(page).click();
  await logout(page);
  await page
    .getByRole('heading', { name: 'Welcome Contributor', level: 1 })
    .waitFor({ timeout: 15000 });
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(500);
  const kept = JSON.parse(
    await page.evaluate(() => localStorage.getItem('para.contributor-claim')),
  );
  check(
    'Logout keeps a waiting claim, still bound to its account, and finishes nothing',
    kept?.accountId === ACCOUNT_ID && !fake.claims.includes('finish_claim'),
    JSON.stringify(kept),
  );
}

// ----------------------------------------------------- Logout
{
  const { page, fake } = await phone();
  await start(page).waitFor({ timeout: 30000 });
  await seed(page, 'eeeeeeee-0000-4000-8000-000000000004', 'Only here');
  // Its upload fails, as with no signal: it is still on the phone, not sent, when Logout asks.
  fake.next.save = 'offline';
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.readyState === 'complete');
  await accountTab(page).click();
  await button(page, 'Logout').click();
  const sheet = logoutQuestion(page);
  await sheet.waitFor();
  check(
    'Logout asks first over the frosted page, focus on Cancel, and says the recording not sent stays on this phone',
    (await page.evaluate(() => document.activeElement?.textContent)) === 'Cancel' &&
      (await sheet
        .getByText('1 recording not sent yet will be left behind on this phone')
        .count()) === 1 &&
      (await sheet.getByRole('img').count()) === 0 &&
      (await sheet.locator('img[alt=""]').count()) === 1,
    await sheet.innerText(),
  );
  await page.keyboard.press('Shift+Tab');
  const wentRound = await page.evaluate(() => document.activeElement?.textContent);
  await page.keyboard.press('Tab');
  check(
    '  Tab goes round its two buttons and stays inside',
    wentRound === 'Logout' &&
      (await page.evaluate(() => document.activeElement?.textContent)) === 'Cancel',
    String(wentRound),
  );
  await page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  check(
    '  Escape keeps the account signed in, focus back on Logout',
    fake.logouts.length === 0 &&
      (await page.evaluate(() => document.activeElement?.textContent)) === 'Logout',
  );
  await button(page, 'Logout').click();
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await sheet.waitFor({ state: 'detached' });
  check('  Cancel keeps it signed in too', fake.logouts.length === 0);
  // While the Logout is on its way nothing cancels it, and focus stays in the question.
  fake.next.logout = 'hold';
  await logout(page);
  await sheet.getByRole('button', { name: 'Logging out…' }).waitFor();
  await page.keyboard.press('Escape');
  check(
    '  while logging out it says so: Cancel waits, Escape does nothing, focus stays inside',
    (await sheet.count()) === 1 &&
      (await sheet.getByRole('button', { name: 'Cancel' }).isDisabled()) &&
      (await sheet.getByRole('button', { name: 'Logging out…' }).isDisabled()) &&
      (await page.evaluate(() => !!document.activeElement?.closest('[role="alertdialog"]'))),
  );
  fake.release();
  await page
    .getByRole('heading', { name: 'Welcome Contributor', level: 1 })
    .waitFor({ timeout: 15000 });
  check(
    'Logout signs this phone only, and the page asks for Sign in',
    fake.logouts.join() === 'local' &&
      (await page.evaluate((key) => localStorage.getItem(key), AUTH_KEY)) === null &&
      (await start(page).count()) === 0,
    fake.logouts.join(),
  );
  const kept = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('para-contribute');
        open.onsuccess = () => {
          const get = open.result.transaction('recordings').objectStore('recordings').getAll();
          get.onsuccess = () => resolve(get.result.length);
        };
      }),
  );
  check("  the phone's own recording stays", kept === 1, String(kept));
  await field(page, 'Email').fill(ACCOUNT.email);
  await field(page, 'Password').fill(ACCOUNT.password);
  await button(page, 'Sign in').click();
  await start(page).waitFor({ timeout: 15000 });
  check(
    '  signing in again lands on Ready, not on Account',
    (await page.getByRole('heading', { name: 'Account', level: 1 }).count()) === 0 &&
      !page.url().includes('#profile'),
    page.url(),
  );
  check('  no request the stand-in does not know', fake.unknown.length === 0, fake.unknown.join());
}

// ------------- a shared phone: the next account never sees the last one's statistics
{
  const OTHER_ID = 'dddddddd-0000-4000-8000-000000000002';
  database.users.set(OTHER_ID, {
    email: 'other@example.com',
    password: 'hunter2hunter2',
    isAccount: true,
    profile: { name: 'Other', phone: '+639170000002' },
  });
  const { page, fake, errors } = await phone();
  fake.stats = { rides: 6, distanceM: 1_240_500, movingS: 62 * 3600 };
  await start(page).waitFor({ timeout: 30000 });
  await accountTab(page).click();
  const stats = page.getByRole('region', { name: 'Commute Statistics' });
  await stats.getByText('Total time').waitFor();
  await logout(page);
  await page
    .getByRole('heading', { name: 'Welcome Contributor', level: 1 })
    .waitFor({ timeout: 15000 });
  await field(page, 'Email').fill('other@example.com');
  await field(page, 'Password').fill('hunter2hunter2');
  await button(page, 'Sign in').click();
  await start(page).waitFor({ timeout: 15000 });
  // The next account's numbers cannot be had: no signal.
  fake.next.stats = 'offline';
  await accountTab(page).click();
  await page.getByText('other@example.com', { exact: true }).waitFor();
  const isOfflineLine = await stats
    .getByText('Your statistics show when you’re online.')
    .waitFor({ timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  check(
    "Logout, then another account signs in with no signal: none of the last account's statistics show",
    isOfflineLine &&
      (await stats.getByText('62', { exact: false }).count()) === 0 &&
      (await page.getByText('Tester', { exact: true }).count()) === 0,
    (await stats.innerText()).replace(/\n/g, ' '),
  );
  check('  no page errors', errors.length === 0, errors.join(' | '));
}

// ------------------------- Delete account: asks first, and leaves nothing of it, in Para or here
{
  const LEAVER_ID = 'ffffffff-0000-4000-8000-000000000003';
  database.users.set(LEAVER_ID, {
    email: 'leaver@example.com',
    password: 'hunter2hunter2',
    isAccount: true,
    profile: { name: 'Leaver', phone: '+639170000003' },
  });
  database.rows.set('ffffffff-1111-4000-8000-000000000001', {
    by: LEAVER_ID,
    recording: {
      id: 'ffffffff-1111-4000-8000-000000000001',
      started_at: new Date(T0).toISOString(),
      ended_at: new Date(T0 + 600_000).toISOString(),
      start_name: 'Leaving',
      end_name: 'Cubao',
      description: '',
    },
  });
  const { page, fake, errors } = await phone({ userId: LEAVER_ID });
  await start(page).waitFor({ timeout: 30000 });
  // A recording kept on the phone, not sent: it goes with the account.
  await seed(page, 'ffffffff-2222-4000-8000-000000000002', 'Only on the phone');
  fake.next.save = 'offline';
  await page.reload({ waitUntil: 'load' });
  await start(page).waitFor({ timeout: 30000 });
  await accountTab(page).click();
  await button(page, 'Account settings').click();
  await page.getByRole('heading', { level: 1, name: 'Account settings' }).waitFor();
  await button(page, 'Delete account').click();
  const sheet = page.getByRole('alertdialog', { name: 'Delete your account?' });
  await sheet.waitFor();
  check(
    'Delete account asks first, focus on Cancel, and says what goes, the phone’s recordings too',
    (await page.evaluate(() => document.activeElement?.textContent)) === 'Cancel' &&
      /sent or not/.test(await sheet.innerText()) &&
      /can’t be undone/.test(await sheet.innerText()),
    await sheet.innerText(),
  );
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await sheet.waitFor({ state: 'detached' });
  check(
    '  Cancel deletes nothing, focus back on Delete account',
    fake.deleteAccountRequests === 0 &&
      (await page.evaluate(() => document.activeElement?.textContent)) === 'Delete account',
  );

  await button(page, 'Delete account').click();
  fake.next.deleteAccount = 'offline';
  await sheet.getByRole('button', { name: 'Delete account' }).click();
  await sheet.getByRole('alert').waitFor();
  check(
    '  with no signal the question says so in one line, and the account stays',
    (await sheet.getByRole('alert').innerText()).startsWith('No signal') &&
      database.users.has(LEAVER_ID),
    await sheet.getByRole('alert').innerText(),
  );
  check(
    '  and the phone keeps no deletion from it: Para never said yes, so nothing may later clear the phone',
    (await page.evaluate(() => localStorage.getItem('para.contributor-deletion'))) === null,
  );

  // While the delete is on its way, nothing cancels it: Cancel, Escape and the dimmed page wait.
  fake.next.deleteAccount = 'hold';
  await sheet.getByRole('button', { name: 'Delete account' }).click();
  await sheet.getByRole('button', { name: 'Deleting…' }).waitFor();
  await page.keyboard.press('Escape');
  await page.mouse.click(196, 100);
  check(
    '  while it is on its way it says so, and Cancel, Escape and a tap on the page do not close it',
    (await sheet.count()) === 1 &&
      (await sheet.getByRole('button', { name: 'Cancel' }).isDisabled()) &&
      (await sheet.getByRole('button', { name: 'Deleting…' }).isDisabled()),
  );
  fake.release();
  await page
    .getByRole('heading', { name: 'Welcome Contributor', level: 1 })
    .waitFor({ timeout: 15000 });
  const keptRecordings = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('para-contribute');
        open.onsuccess = () => {
          const get = open.result.transaction('recordings').objectStore('recordings').getAll();
          get.onsuccess = () => resolve(get.result.length);
        };
      }),
  );
  check(
    '  deleting it ends on Sign in: the account, its uploads and the phone’s recordings are gone',
    fake.deletedAccounts.join() === LEAVER_ID &&
      !database.users.has(LEAVER_ID) &&
      ![...database.rows.values()].some((row) => row.by === LEAVER_ID) &&
      (await page.evaluate((key) => localStorage.getItem(key), AUTH_KEY)) === null &&
      keptRecordings === 0,
    JSON.stringify({ deleted: fake.deletedAccounts, keptRecordings }),
  );

  // Another account signs in on the same tab: none of the deleted account's recordings show.
  const NEXT_ID = 'ffffffff-0000-4000-8000-000000000004';
  database.users.set(NEXT_ID, {
    email: 'next@example.com',
    password: 'hunter2hunter2',
    isAccount: true,
    profile: { name: 'Next', phone: '+639170000004' },
  });
  await field(page, 'Email').fill('next@example.com');
  await field(page, 'Password').fill('hunter2hunter2');
  await button(page, 'Sign in').click();
  await start(page).waitFor({ timeout: 15000 });
  await openHistory(page);
  await page.getByRole('heading', { level: 1, name: 'History' }).waitFor();
  await page.getByText('No recordings yet.').waitFor({ timeout: 15000 });
  check(
    '  the next account signed in on the same tab sees none of its recordings',
    (await row(page, 'Only on the phone').count()) === 0,
  );
  check('  no request the stand-in does not know', fake.unknown.length === 0, fake.unknown.join());
  check('  no page errors', errors.length === 0, errors.join(' | '));
}
{
  // An editor's account is not deleted from the contributor page: it says where to go.
  const { page, fake } = await phone({ userId: EDITOR_ID });
  await start(page).waitFor({ timeout: 30000 });
  await accountTab(page).click();
  await button(page, 'Account settings').click();
  await button(page, 'Delete account').click();
  const sheet = page.getByRole('alertdialog', { name: 'Delete your account?' });
  await sheet.getByRole('button', { name: 'Delete account' }).click();
  await sheet.getByRole('alert').waitFor();
  check(
    'Delete account for an editor is refused in one line, and the account stays',
    (await sheet.getByRole('alert').innerText()) ===
      "This account can't be deleted here. Ask Para's team to remove it." &&
      database.users.has(EDITOR_ID) &&
      fake.deletedAccounts.length === 0,
    await sheet.getByRole('alert').innerText(),
  );
}

await browser.close();
tally();
