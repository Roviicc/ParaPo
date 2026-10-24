// Linking earlier recordings to an account, driven by a phone. A phone that already has its own
// anonymous user and signs in to an account made elsewhere asks begin_claim before signing in and
// finish_claim after, so its uploads become the account's; a claim that cannot finish is kept and
// finished on the next start. Create account on the same phone claims nothing: the upgrade keeps
// the user id, so the uploads were the account's all along. Recordings still unsent on the phone
// upload under the account after sign-in, under the consent they were made with. Supabase is the
// in-memory stand-in (lib/fake-contributions.mjs); nothing reaches a real project.
//
//   cp .env.production .env.local && echo VITE_CONTRIBUTIONS=1 >> .env.local
//   npm run dev                          (in another terminal)
//   node tests/e2e/claim-test.mjs
import { chromium } from 'playwright';

import { fakeContributions, session } from './lib/fake-contributions.mjs';
import { fakeTurnstile } from './lib/fake-turnstile.mjs';
import { BASE, bareStyle, harness, nodeFetch } from './lib/harness.mjs';

const { check, tally } = harness();
const AUTH_KEY = 'parapo.contributor-auth';
const CLAIM_KEY = 'parapo.contributor-claim';
const T0 = Date.UTC(2026, 9, 19, 0, 0, 0);
const ACCOUNT_ID = 'cccccccc-0000-4000-8000-000000000001';
const ANON_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const ACCOUNT = { email: 'juan@example.com', password: 'hunter2hunter2' };

const browser = await chromium.launch();

/** A database with the account made on another phone. */
const database = () => ({
  users: new Map([
    [
      ACCOUNT_ID,
      { ...ACCOUNT, isAccount: true, profile: { name: 'Juan', phone: '+639171234567' } },
    ],
  ]),
});

/** A saved recording of 30 fixes, in the shape the phone stores it, and its fixes. */
function savedRide(id, startedAt, { upload, consentVersion } = {}) {
  const fixes = Array.from({ length: 30 }, (_, seq) => ({
    recordingId: id,
    seq,
    time: startedAt + seq * 1000,
    lng: 121.05,
    lat: 14.7 + (seq * 8) / 111_320,
    accuracyM: 5,
  }));
  const end = startedAt + 30_000;
  const recording = {
    version: 1,
    id,
    status: 'saved',
    startedAt,
    stoppedAt: end,
    savedAt: end + 5000,
    gaps: [],
    startPointName: 'Fairview',
    endPointName: 'Cubao',
    description: '',
    rideKind: 'Jeep',
    ...(consentVersion ? { consentVersion } : {}),
    ...(upload ? { upload } : {}),
  };
  return { recording, fixes };
}

async function seed(page, rides) {
  await page.evaluate(
    (rows) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('parapo-contribute');
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
    rides,
  );
}

/**
 * A phone that has its own anonymous user, `uploaded` recordings it already sent as that user
 * (they are in the database too) and `unsent` ones that wait on it. Without `isAnonymous` it has
 * no user at all.
 */
async function phone({ shared = database(), isAnonymous = true, uploaded = [], unsent = [] } = {}) {
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
  fake.users = shared.users;
  await fakeTurnstile(page);
  if (isAnonymous) {
    fake.users.set(ANON_ID, { email: null, password: null, isAccount: false, profile: null });
    await page.addInitScript(
      ([key, anonymous]) => {
        // Only a first load seeds it, so a sign-out then a reload leaves the phone with no user.
        if (sessionStorage.getItem('seeded-user')) return;
        sessionStorage.setItem('seeded-user', 'yes');
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(anonymous));
      },
      [AUTH_KEY, session(ANON_ID)],
    );
  }
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('parapo.contribute.consent', '2');
      sessionStorage.setItem('seeded', 'yes');
    }
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/contribute/`, { waitUntil: 'load' });
  await page.getByRole('heading', { name: 'Sign in', level: 1 }).waitFor({ timeout: 30000 });
  const rides = [
    ...uploaded.map((id, i) =>
      savedRide(id, T0 + i * 3_600_000, {
        consentVersion: 2,
        upload: { state: 'uploaded', at: T0, by: ANON_ID },
      }),
    ),
    ...unsent.map(({ id, consentVersion }, i) =>
      savedRide(id, T0 + (10 + i) * 3_600_000, { consentVersion }),
    ),
  ];
  uploaded.forEach((id) => fake.rows.set(id, { by: ANON_ID, recording: { id } }));
  if (rides.length) {
    await seed(page, rides);
    await page.reload({ waitUntil: 'load' });
    await page.getByRole('heading', { name: 'Sign in', level: 1 }).waitFor({ timeout: 30000 });
  }
  return { page, context, fake, errors };
}

const start = (page) => page.getByRole('button', { name: 'Start recording' });
const field = (page, name) => page.getByLabel(name, { exact: true });
const claimOf = (page) => page.evaluate((key) => localStorage.getItem(key), CLAIM_KEY);
const owners = (fake) => [...fake.rows.values()].map((row) => row.by);

async function signInAs(page) {
  await field(page, 'Email').fill(ACCOUNT.email);
  await field(page, 'Password').fill(ACCOUNT.password);
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('button')].find((b) => b.textContent === 'Sign in')?.disabled,
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

// --------------------------- sign in on a phone with uploads of its own
{
  const { page, fake, errors } = await phone({ uploaded: ['up-1', 'up-2'] });
  await signInAs(page);
  await start(page).waitFor({ timeout: 15000 });
  check(
    'signing in asks begin_claim while anonymous, signs in, then finish_claim',
    fake.claims.join() === 'begin_claim,password,finish_claim',
    fake.claims.join(),
  );
  check(
    "  the phone's two uploads are now the account's, and none stays on the anonymous user",
    owners(fake).length === 2 && owners(fake).every((by) => by === ACCOUNT_ID),
    owners(fake).join(),
  );
  check('  the finished claim leaves no token on the phone', (await claimOf(page)) === null);
  check('  no request the stand-in does not know', fake.unknown.length === 0, fake.unknown.join());
  check('  no page errors', errors.length === 0, errors.join(' | '));
}

// ----------------------------------- a wrong password claims nothing
{
  const { page, fake } = await phone({ uploaded: ['up-1'] });
  await field(page, 'Email').fill(ACCOUNT.email);
  await field(page, 'Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('alert').waitFor();
  check(
    'a wrong password leaves the upload on the anonymous user and keeps no token',
    owners(fake)[0] === ANON_ID &&
      (await claimOf(page)) === null &&
      !fake.claims.includes('finish_claim'),
    fake.claims.join(),
  );
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('button')].find((b) => b.textContent === 'Sign in')?.disabled,
  );
  await field(page, 'Password').fill(ACCOUNT.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await start(page).waitFor({ timeout: 15000 });
  check(
    '  trying again with the right one asks for a fresh token and claims',
    fake.claims.filter((c) => c === 'begin_claim').length === 2 && owners(fake)[0] === ACCOUNT_ID,
    fake.claims.join(),
  );
}

// ------------------------- finish_claim without signal: kept, finished on the next start
{
  const { page, fake, errors } = await phone({ uploaded: ['up-1'] });
  fake.next.finishClaim = 'offline';
  await signInAs(page);
  await start(page).waitFor({ timeout: 15000 });
  check(
    'a claim that fails after signing in does not fail the sign-in, and the phone keeps its token',
    owners(fake)[0] === ANON_ID && (await claimOf(page)) !== null,
    String(await claimOf(page)),
  );
  await page.reload({ waitUntil: 'load' });
  await start(page).waitFor({ timeout: 15000 });
  await page.waitForFunction((key) => localStorage.getItem(key) === null, CLAIM_KEY);
  check(
    "  the next start finishes it: the upload is the account's and the token is gone",
    owners(fake)[0] === ACCOUNT_ID && fake.claims.filter((c) => c === 'finish_claim').length === 2,
    fake.claims.join(),
  );
  check('  no page errors', errors.length === 0, errors.join(' | '));
}

// ------------------- the answer lost after the server moved them, a day later
{
  const { page, fake } = await phone({ uploaded: ['up-1'] });
  fake.next.finishClaim = 'lostAnswer';
  await signInAs(page);
  await start(page).waitFor({ timeout: 15000 });
  check(
    'a lost answer keeps the token although the server already moved the uploads',
    owners(fake)[0] === ACCOUNT_ID && (await claimOf(page)) !== null,
  );
  // The server deletes used tokens after a day: the repeat is answered bad_token.
  fake.next.finishClaim = 'forgotten';
  await page.reload({ waitUntil: 'load' });
  await start(page).waitFor({ timeout: 15000 });
  await page.waitForFunction((key) => localStorage.getItem(key) === null, CLAIM_KEY);
  check(
    '  bad_token after that earlier try is done: the token is dropped and nothing is undone',
    owners(fake)[0] === ACCOUNT_ID,
  );
}

// ------------------------------------ an expired token is dropped
{
  const { page, fake } = await phone({ uploaded: ['up-1'] });
  fake.next.finishClaim = 'expired';
  await signInAs(page);
  await start(page).waitFor({ timeout: 15000 });
  await page.waitForFunction((key) => localStorage.getItem(key) === null, CLAIM_KEY);
  check(
    'token_expired means nothing to claim: the token is dropped, not retried',
    fake.claims.filter((c) => c === 'finish_claim').length === 1 && owners(fake)[0] === ANON_ID,
    fake.claims.join(),
  );
}

// ---------- a claim is the account's that signed in, never another's; retried when online
{
  const shared = database();
  shared.users.set('bbbbbbbb-0000-4000-8000-000000000002', {
    email: 'ana@example.com',
    password: 'hunter2hunter2',
    isAccount: true,
    profile: { name: 'Ana', phone: '+639181234567' },
  });
  const { page, fake } = await phone({ shared, uploaded: ['up-1'] });
  const signOut = async () => {
    await page.evaluate(() =>
      import('/src/features/contribute/api/account.ts').then((account) => account.signOut()),
    );
    await page.reload({ waitUntil: 'load' });
    await page.getByRole('heading', { name: 'Sign in', level: 1 }).waitFor({ timeout: 15000 });
  };
  fake.next.finishClaim = 'offline';
  await signInAs(page);
  await start(page).waitFor({ timeout: 15000 });
  await signOut();
  await field(page, 'Email').fill('ana@example.com');
  await field(page, 'Password').fill(ACCOUNT.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await start(page).waitFor({ timeout: 15000 });
  await page.reload({ waitUntil: 'load' });
  await start(page).waitFor({ timeout: 15000 });
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(1000);
  check(
    "another account signing in never finishes the first account's claim, not at sign-in, a start or online",
    owners(fake)[0] === ANON_ID &&
      fake.claims.filter((c) => c === 'finish_claim').length === 1 &&
      (await claimOf(page)) !== null,
    fake.claims.join(),
  );
  await signOut();
  await signInAs(page);
  await start(page).waitFor({ timeout: 15000 });
  await page.waitForFunction((key) => localStorage.getItem(key) === null, CLAIM_KEY);
  check(
    '  signing in again as the first account finishes it for that account',
    owners(fake)[0] === ACCOUNT_ID,
    owners(fake).join(),
  );
}

// ------------------------------ the page retries a kept claim when the phone is back online
{
  const { page, fake } = await phone({ uploaded: ['up-1'] });
  fake.next.finishClaim = 'offline';
  await signInAs(page);
  await start(page).waitFor({ timeout: 15000 });
  check('a claim kept after a failure waits', owners(fake)[0] === ANON_ID);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction((key) => localStorage.getItem(key) === null, CLAIM_KEY);
  check(
    '  coming back online finishes it without a reload',
    owners(fake)[0] === ACCOUNT_ID && fake.claims.filter((c) => c === 'finish_claim').length === 2,
    fake.claims.join(),
  );
}

// ------------------- a stale session: begin_claim says not_anonymous, the sign-in goes on
{
  const { page, fake } = await phone({ uploaded: ['up-1'] });
  fake.next.beginClaim = 'notAnonymous';
  await signInAs(page);
  await start(page).waitFor({ timeout: 15000 });
  check(
    'a begin_claim refused with 42501 does not stop the sign-in, and nothing is kept',
    fake.claims.join() === 'begin_claim,password' && (await claimOf(page)) === null,
    fake.claims.join(),
  );
}

// ----------------- Create account on the same phone: the id stays, nothing is claimed
{
  const { page, fake, errors } = await phone({ shared: { users: new Map() }, uploaded: ['up-1'] });
  await page.getByRole('button', { name: 'Create account' }).click();
  await field(page, 'Name').fill('Juan dela Cruz');
  await field(page, 'Email').fill('new@example.com');
  await field(page, 'Number').fill('09171234567');
  await field(page, 'Password').fill('hunter2hunter2');
  await page.getByRole('button', { name: 'Create account' }).click();
  await start(page).waitFor({ timeout: 15000 });
  const [[id, user]] = [...fake.users];
  check(
    'creating an account on this phone claims nothing: no claim call, no token',
    fake.claims.length === 0 && (await claimOf(page)) === null && fake.tokens.size === 0,
    fake.claims.join(),
  );
  check(
    '  the anonymous user became the account, and the earlier upload is still its own',
    fake.users.size === 1 && id === ANON_ID && user.isAccount && owners(fake)[0] === ANON_ID,
    `${fake.users.size} users, owners ${owners(fake).join()}`,
  );
  check('  no page errors', errors.length === 0, errors.join(' | '));
}

// ---------------- unsent recordings go up under the account, under their own consent
{
  const { page, fake } = await phone({
    unsent: [{ id: 'unsent-v2', consentVersion: 2 }, { id: 'unsent-v1' }],
  });
  await page.waitForTimeout(500);
  check('before signing in nothing is sent', fake.saveRequests === 0 && fake.rows.size === 0);
  await signInAs(page);
  await page
    .getByRole('heading', { name: /earlier recordings? too\?/ })
    .waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  const sent = fake.rows.get('unsent-v2');
  check(
    'a recording made under consent 2 uploads under the account, stamped 2',
    sent?.by === ACCOUNT_ID && sent.recording.consent_version === 2,
    JSON.stringify(sent?.by),
  );
  check(
    '  one made before accounts waits for the answer to the earlier question, never sent unasked',
    !fake.rows.has('unsent-v1'),
  );
}

await browser.close();
tally();
