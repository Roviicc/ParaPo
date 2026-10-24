// The contributor page's Profile and History, driven by a phone signed in to an account: Profile
// sits beside History on Ready at the same size; it shows the email, changes the name and number
// through set_profile, and signs this phone out only. History lists the account's uploads from the
// database, whichever phone sent them, merged with this phone's own, and Remove works on any the
// account owns. Supabase is the in-memory stand-in (lib/fake-contributions.mjs): every request to
// *.supabase.co lands there, and one it does not know fails the run, so nothing reaches a real
// project.
//
//   cp .env.production .env.local && echo VITE_CONTRIBUTIONS=1 >> .env.local
//                                        (a project URL to stand in for, and uploads on)
//   npm run dev                          (in another terminal)
//   node tests/e2e/profile-test.mjs
//
// PARAPO_SHOTS=dir keeps screenshots of the screens at 393×852.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

import { fakeContributions, session } from './lib/fake-contributions.mjs';
import { fakeTurnstile } from './lib/fake-turnstile.mjs';
import { BASE, bareStyle, harness, nodeFetch } from './lib/harness.mjs';

const { check, tally } = harness();
const SHOTS = process.env.PARAPO_SHOTS;
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
const AUTH_KEY = 'parapo.contributor-auth';
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
 * `userId` signs in as another user (the editor), and `consent: null` has never been asked.
 */
async function phone({ signedIn = true, userId = ACCOUNT_ID, consent = '2' } = {}) {
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
    ([key, stored, agreed]) => {
      if (stored && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(stored));
      if (agreed && !sessionStorage.getItem('seeded')) {
        localStorage.setItem('parapo.contribute.consent', agreed);
        sessionStorage.setItem('seeded', 'yes');
      }
    },
    [
      AUTH_KEY,
      signedIn
        ? session(userId, { email: database.users.get(userId).email, isAccount: true })
        : null,
      consent,
    ],
  );
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/contribute/`, { waitUntil: 'load' });
  return { page, fake, errors };
}

const button = (page, name) => page.getByRole('button', { name, exact: true });
const field = (page, name) => page.getByLabel(name, { exact: true });
const start = (page) => page.getByRole('button', { name: 'Start recording' });
const row = (page, name) => page.getByRole('listitem').filter({ hasText: name });
const moreOf = (page, name) => row(page, name).getByRole('button', { name: /^More actions/ });
const actionsOf = async (page, name) => {
  await moreOf(page, name).click();
  return row(page, name).getByRole('button');
};
const groupOf = (page, name) =>
  row(page, name).evaluate((item) => item.closest('section')?.querySelector('h2')?.textContent);

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
    consentVersion: 2,
    ...(upload ? { upload } : {}),
  };
  await page.evaluate(
    (stored) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('parapo-contribute');
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

// ------------------------------------------------ Profile beside History
{
  const { page, fake, errors } = await phone();
  await start(page).waitFor({ timeout: 30000 });
  const profile = await button(page, 'Profile').boundingBox();
  const history = await button(page, 'History').boundingBox();
  check(
    'Ready has a 48×48 Profile button beside History, the same size and on the same line',
    profile.width === 48 &&
      profile.height === 48 &&
      history.width === 48 &&
      history.height === 48 &&
      profile.y === history.y &&
      profile.x < history.x,
    JSON.stringify({ profile, history }),
  );
  await shot(page, '1-ready');

  await button(page, 'Profile').click();
  await page.getByRole('heading', { level: 1, name: 'Profile' }).waitFor();
  await button(page, 'Back').click();
  await start(page).waitFor();
  check(
    'Back from Profile returns to Ready with focus on the Profile button',
    (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Profile',
  );

  await button(page, 'Profile').click();
  await page.getByRole('heading', { level: 1, name: 'Profile' }).waitFor();
  await field(page, 'Name').waitFor();
  check(
    'Profile shows the email as it is, and only the name and number to change',
    (await page.getByText(ACCOUNT.email, { exact: true }).count()) === 1 &&
      (await page.locator('input').count()) === 2 &&
      (await field(page, 'Name').inputValue()) === 'Tester' &&
      (await field(page, 'Number').inputValue()) === '+639171234567',
  );
  check(
    '  its heading has focus, and Save waits for a change',
    (await page.evaluate(() => document.activeElement?.textContent)) === 'Profile' &&
      (await button(page, 'Save').isDisabled()),
  );
  await shot(page, '2-profile');

  await field(page, 'Number').fill('12345');
  await button(page, 'Save').click();
  await page.getByText('Enter a mobile number like 09171234567').waitFor();
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
    '  a reload stays on Profile, with the saved values',
    (await field(page, 'Name').inputValue()) === 'Tester Two' &&
      (await field(page, 'Number').inputValue()) === '+639187654321',
  );

  check('  no request the stand-in does not know', fake.unknown.length === 0, fake.unknown.join());
  check('  no page errors', errors.length === 0, errors.join(' | '));
  database.users.get(ACCOUNT_ID).profile = { ...ACCOUNT.profile };
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
  await button(page, 'History').click();
  await row(page, 'From phone A').waitFor({ timeout: 15000 });
  await shot(page, '3-history');
  check(
    'History lists uploads another phone sent, merged with this phone, in the existing groups',
    (await groupOf(page, 'From phone A')) === 'Uploaded' &&
      (await groupOf(page, 'Also phone A')) === 'Uploaded' &&
      (await groupOf(page, 'Here and there')) === 'Uploaded' &&
      (await page.getByRole('listitem').filter({ hasText: 'Here and there' }).count()) === 1,
  );
  check(
    '  an upload this phone also holds is one card, not two',
    (await page.getByRole('listitem').count()) === 4,
    String(await page.getByRole('listitem').count()),
  );
  const buttons = await actionsOf(page, 'From phone A');
  const names = await buttons.evaluateAll((all) =>
    all.map((b) => b.getAttribute('aria-label') ?? b.textContent),
  );
  check(
    '  an upload from another phone can be removed, and offers no Download or Delete from phone',
    names.some((name) => name.startsWith('Remove upload')) &&
      !names.some((name) => name.startsWith('Download')) &&
      !names.some((name) => name.startsWith('Delete from phone')),
    names.join(' | '),
  );
  await row(page, 'From phone A')
    .getByRole('button', { name: /^Remove upload/ })
    .click();
  await row(page, 'From phone A').getByRole('button', { name: 'Remove', exact: true }).click();
  await row(page, 'From phone A').waitFor({ state: 'detached' });
  check(
    '  Remove takes it out of ParaPo and off the list',
    !database.rows.has('dddddddd-0000-4000-8000-000000000001') && fake.deleteRequests === 1,
  );

  const here = await actionsOf(page, 'Here and there');
  check(
    "  an upload this phone sent under an earlier sign-in is the account's: it can be removed",
    await here.evaluateAll((all) =>
      all.some((b) => b.getAttribute('aria-label')?.startsWith('Remove upload')),
    ),
  );
  await row(page, 'Here and there')
    .getByRole('button', { name: /^Remove upload/ })
    .click();
  await row(page, 'Here and there').getByRole('button', { name: 'Remove', exact: true }).click();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('li')]
        .find((li) => li.textContent.includes('Here and there'))
        ?.closest('section')
        ?.querySelector('h2')?.textContent === 'Only on this phone',
  );
  check(
    '  and goes to Only on this phone, kept, once it is removed from ParaPo',
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
  await button(page, 'History').click();
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
  await page.getByRole('heading', { name: 'Sign in', level: 1 }).waitFor({ timeout: 30000 });
  await field(page, 'Email').fill(ACCOUNT.email);
  await field(page, 'Password').fill(ACCOUNT.password);
  await button(page, 'Sign in').click();
  await start(page).waitFor({ timeout: 15000 });
  await button(page, 'History').click();
  await row(page, 'Also phone A').waitFor({ timeout: 15000 });
  check(
    'another phone signed in to the account sees its uploads, with none of its own',
    (await page.getByRole('listitem').count()) === 2 &&
      (await groupOf(page, 'Also phone A')) === 'Uploaded' &&
      (await groupOf(page, 'Only here')) === 'Uploaded',
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
    },
  });
  const { page, errors } = await phone({ userId: EDITOR_ID });
  await start(page).waitFor({ timeout: 30000 });
  await button(page, 'History').click();
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

// ---------- a new account can reach Profile before agreeing to anything
{
  const { page } = await phone({ consent: null });
  await page.getByRole('heading', { name: 'Before you record' }).waitFor({ timeout: 30000 });
  await button(page, 'Profile').click();
  await button(page, 'Sign out').click();
  await page.getByRole('heading', { name: 'Sign in', level: 1 }).waitFor({ timeout: 15000 });
  check('before consent, Profile is there and signs the account out', true);
}

// ----------------------------------------------------- Sign out
{
  const { page, fake } = await phone();
  await start(page).waitFor({ timeout: 30000 });
  await seed(page, 'eeeeeeee-0000-4000-8000-000000000004', 'Only here');
  await page.reload({ waitUntil: 'load' });
  await button(page, 'Profile').click();
  await button(page, 'Sign out').click();
  await page.getByRole('heading', { name: 'Sign in', level: 1 }).waitFor({ timeout: 15000 });
  check(
    'Sign out signs this phone only, and the page asks for Sign in',
    fake.logouts.join() === 'local' &&
      (await page.evaluate((key) => localStorage.getItem(key), AUTH_KEY)) === null &&
      (await start(page).count()) === 0,
    fake.logouts.join(),
  );
  const kept = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('parapo-contribute');
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
    '  signing in again lands on Ready, not on Profile',
    (await page.getByRole('heading', { name: 'Profile', level: 1 }).count()) === 0 &&
      !page.url().includes('#profile'),
    page.url(),
  );
  check('  no request the stand-in does not know', fake.unknown.length === 0, fake.unknown.join());
}

await browser.close();
tally();
