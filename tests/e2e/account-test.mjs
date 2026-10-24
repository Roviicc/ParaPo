// The contributor page's accounts, driven by a phone: with no account the page shows only Sign in
// and Create account; Create account turns the phone's anonymous user into an account with the
// same id and stores the name and number; Sign in takes an account made elsewhere, refuses a wrong
// password in one line, and says so when there is no signal. Supabase is the in-memory stand-in
// (lib/fake-contributions.mjs): every request to *.supabase.co lands there, and one it does not
// know fails the run, so nothing reaches a real project.
//
//   cp .env.production .env.local && echo VITE_CONTRIBUTIONS=1 >> .env.local
//                                        (a project URL to stand in for, and uploads on)
//   npm run dev                          (in another terminal)
//   node tests/e2e/account-test.mjs
//
// PARAPO_SHOTS=dir keeps screenshots of the screens at 393×852.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

import { fakeContributions } from './lib/fake-contributions.mjs';
import { fakeTurnstile } from './lib/fake-turnstile.mjs';
import { BASE, bareStyle, harness, nodeFetch } from './lib/harness.mjs';

const { check, tally } = harness();
const SHOTS = process.env.PARAPO_SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : null);

const AUTH_KEY = 'parapo.contributor-auth';
const browser = await chromium.launch();

/** A phone with nothing stored but its consent to the current text, and the stand-in Supabase. */
async function phone({ fake: shared } = {}) {
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
  // A second phone shares the first's accounts: the database is one.
  if (shared) fake.users = shared.users;
  await fakeTurnstile(page);
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('parapo.contribute.consent', '3');
      sessionStorage.setItem('seeded', 'yes');
    }
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/contribute/`, { waitUntil: 'load' });
  return { page, context, fake, errors };
}

const SCREENS = {
  signIn: (page) => page.getByRole('heading', { name: 'Sign in', level: 1 }),
  createAccount: (page) => page.getByRole('heading', { name: 'Create account', level: 1 }),
  start: (page) => page.getByRole('button', { name: 'Start recording' }),
};
const field = (page, name) => page.getByLabel(name, { exact: true });
const alertText = (page) => page.getByRole('alert').innerText();

async function fillCreateAccount(page, values) {
  for (const [name, value] of Object.entries(values)) await field(page, name).fill(value);
}

const TESTER = {
  Name: 'Juan dela Cruz',
  Email: 'juan@example.com',
  Number: '0917 123 4567',
  Password: 'hunter2hunter2',
};

/** No signal: the browser says it is offline, and the stand-in drops what the page sends. */
async function setOffline(context, fake, isOffline) {
  fake.isOffline = isOffline;
  await context.setOffline(isOffline);
}

/**
 * Signs out through the page's own signOut (the dev server serves its module, the one the page
 * uses), then reloads: there is no Sign out button until the profile screen has one.
 */
async function signOut(page) {
  await page.evaluate(() =>
    import('/src/features/contribute/api/account.ts').then((account) => account.signOut()),
  );
  await page.reload({ waitUntil: 'load' });
}

// ------------------------------------------------ no account: only Sign in
{
  const { page, fake, errors } = await phone();
  await SCREENS.signIn(page).waitFor({ timeout: 30000 });
  await shot(page, '1-sign-in');
  check(
    'with no account the page shows Sign in, Create account and the way back, and no Start',
    (await field(page, 'Email').count()) === 1 &&
      (await field(page, 'Password').count()) === 1 &&
      (await page.getByRole('button', { name: 'Sign in', exact: true }).count()) === 1 &&
      (await page.getByRole('button', { name: 'Create account' }).count()) === 1 &&
      (await page.getByRole('button', { name: 'Back to the map' }).count()) === 1 &&
      (await SCREENS.start(page).count()) === 0,
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  check(
    '  Sign in with nothing typed names what is missing and sends nothing',
    (await page.getByText('Enter a valid email').count()) === 1 &&
      (await page.getByText('Enter your password').count()) === 1 &&
      fake.passwordSignIns === 0,
  );
  check(
    '  and the page has asked the database for nothing yet',
    fake.signIns === 0 && fake.unknown.length === 0,
    fake.unknown.join(', '),
  );
  check('  no page errors', errors.length === 0, errors.join(' | '));
}

// --------------------------------------------- create an account
const shared = {};
{
  const { page, fake, errors } = await phone();
  await SCREENS.signIn(page).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Create account' }).click();
  await SCREENS.createAccount(page).waitFor();
  await shot(page, '2-create-account');
  check(
    'Create account asks for Name, Email, Number and Password, and for nothing else',
    (await page.locator('input').count()) === 4 &&
      (await field(page, 'Name').count()) === 1 &&
      (await field(page, 'Number').count()) === 1,
  );
  await fillCreateAccount(page, { ...TESTER, Number: '12345', Password: 'short' });
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Use at least 8 characters').waitFor();
  check(
    '  a bad number and a short password are named, field by field, and nothing is sent',
    (await page.getByText('Enter a mobile number like 09171234567').count()) === 1 &&
      fake.signIns === 0 &&
      fake.profileRequests === 0,
  );
  await shot(page, '3-create-account-errors');
  await field(page, 'Number').fill(TESTER.Number);
  await field(page, 'Password').fill(TESTER.Password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await SCREENS.start(page).waitFor({ timeout: 15000 });
  const [[id, account]] = [...fake.users];
  check(
    'a valid form makes the account and opens Ready',
    fake.users.size === 1 &&
      account.isAccount &&
      account.email === 'juan@example.com' &&
      account.password === TESTER.Password,
    JSON.stringify([...fake.users]),
  );
  check(
    "  the phone's anonymous user became the account: one user, one sign-in",
    fake.signIns === 1 && fake.users.size === 1,
    `${fake.signIns} sign-ins, ${fake.users.size} users`,
  );
  check(
    '  the name and number were stored, the number as +639XXXXXXXXX, by a renewed token',
    fake.profileRequests === 1 &&
      account.profile?.name === 'Juan dela Cruz' &&
      account.profile?.phone === '+639171234567',
    JSON.stringify(account.profile),
  );
  check(
    '  the first sign-in carried the bot check when the build has a site key',
    !process.env.PARAPO_TURNSTILE || /^token-/.test(String(fake.captchaTokens[0])),
    String(fake.captchaTokens[0]),
  );
  await page.reload({ waitUntil: 'load' });
  await SCREENS.start(page).waitFor({ timeout: 15000 });
  check(
    '  after a reload the phone is still signed in, with no new request for it',
    (await SCREENS.signIn(page).count()) === 0 && fake.signIns === 1 && fake.passwordSignIns === 0,
  );
  shared.users = fake.users;
  shared.id = id;
  check('  no request the stand-in does not know', fake.unknown.length === 0, fake.unknown.join());
  check('  no page errors', errors.length === 0, errors.join(' | '));
}

// ---------------------------------------- sign out, then sign in
{
  const { page, fake, errors } = await phone({ fake: shared });
  await SCREENS.signIn(page).waitFor({ timeout: 30000 });
  await field(page, 'Email').fill('juan@example.com');
  await field(page, 'Password').fill(TESTER.Password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await SCREENS.start(page).waitFor({ timeout: 15000 });
  await signOut(page);
  await SCREENS.signIn(page).waitFor({ timeout: 15000 });
  check(
    'signed out, the page asks for Sign in again',
    (await SCREENS.start(page).count()) === 0 &&
      (await page.evaluate((key) => localStorage.getItem(key), AUTH_KEY)) === null,
  );
  check(
    '  it signed out this phone only: the call carried the local scope',
    fake.logouts.join() === 'local',
    fake.logouts.join(),
  );

  await field(page, 'Email').fill('juan@example.com');
  await field(page, 'Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('alert').waitFor();
  check(
    'a wrong password is refused in one line, and the page stays on Sign in',
    (await alertText(page)) === 'Wrong email or password' &&
      (await SCREENS.start(page).count()) === 0 &&
      fake.passwordSignIns === 2,
    await alertText(page),
  );
  await shot(page, '4-wrong-password');

  await field(page, 'Password').fill(TESTER.Password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await SCREENS.start(page).waitFor({ timeout: 15000 });
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), AUTH_KEY);
  check(
    'the right password signs in to the same account and opens Ready',
    fake.passwordSignIns === 3 &&
      stored.user.id === shared.id &&
      stored.user.is_anonymous === false,
    `${fake.passwordSignIns} tries, ${stored.user.id}`,
  );
  check('  no request the stand-in does not know', fake.unknown.length === 0, fake.unknown.join());
  check('  no page errors', errors.length === 0, errors.join(' | '));
}

// ---------------------------------------- refused and offline tries
{
  const { page, context, fake } = await phone({ fake: shared });
  await SCREENS.signIn(page).waitFor({ timeout: 30000 });
  await field(page, 'Email').fill('juan@example.com');
  await field(page, 'Password').fill(TESTER.Password);
  const signInButton = page.getByRole('button', { name: 'Sign in', exact: true });
  await signInButton.waitFor();
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('button')].find((b) => b.textContent === 'Sign in')?.disabled,
  );
  await setOffline(context, fake, true);
  await signInButton.click();
  await page.getByRole('alert').waitFor({ timeout: 15000 });
  // A new bot check is drawn after each try; the button is usable once it passes.
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('button')].find((b) => b.textContent === 'Sign in')?.disabled,
    undefined,
    { timeout: 5000 },
  );
  check(
    'with the browser offline, Sign in says so in one line, and its buttons are usable again',
    (await alertText(page)) === "No signal — try again when you're online" &&
      (await signInButton.isEnabled()) &&
      (await field(page, 'Email').inputValue()) === 'juan@example.com',
    await alertText(page),
  );
  await shot(page, '5-sign-in-offline');
  await setOffline(context, fake, false);
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('button')].find((b) => b.textContent === 'Sign in')?.disabled,
  );
  await signInButton.click();
  await SCREENS.start(page).waitFor({ timeout: 15000 });
  check('  trying again, back online, signs in', true);
  await setOffline(context, fake, true);
  const signedOut = await page.evaluate(() =>
    import('/src/features/contribute/api/account.ts')
      .then((account) => account.signOut())
      .then(
        () => true,
        () => false,
      ),
  );
  check(
    '  signing out with no signal still works: the phone forgets the account',
    signedOut && (await page.evaluate((key) => localStorage.getItem(key), AUTH_KEY)) === null,
  );
}

{
  const { page, fake } = await phone({ fake: shared });
  await SCREENS.signIn(page).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Create account' }).click();
  await SCREENS.createAccount(page).waitFor();
  await fillCreateAccount(page, TESTER);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('alert').waitFor();
  check(
    'an email that already has an account is refused in one line, with no second profile stored',
    (await alertText(page)) === 'That email already has an account' &&
      (await SCREENS.start(page).count()) === 0 &&
      fake.profileRequests === 0,
    await alertText(page),
  );
  await shot(page, '6-email-taken');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await SCREENS.signIn(page).waitFor();
  check('  Sign in from there clears the line', (await page.getByRole('alert').count()) === 0);
}

// ------------------- the profile fails after the account is made, then goes
{
  const { page, fake } = await phone();
  await SCREENS.signIn(page).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Create account' }).click();
  await SCREENS.createAccount(page).waitFor();
  await fillCreateAccount(page, { ...TESTER, Email: 'ana@example.com' });
  fake.next.profile = 'offline';
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('alert').waitFor();
  check(
    'if only the name and number fail to save, the page asks for just those two, and says why',
    (await alertText(page)).startsWith('No signal') &&
      (await SCREENS.start(page).count()) === 0 &&
      (await page.locator('input').count()) === 2 &&
      (await field(page, 'Email').count()) === 0,
    await alertText(page),
  );
  await shot(page, '7-profile-step');
  await page.reload({ waitUntil: 'load' });
  await field(page, 'Name').waitFor({ timeout: 15000 });
  check(
    '  a reload lands on the same step: the account is not let in without its name',
    (await SCREENS.start(page).count()) === 0 && (await field(page, 'Number').count()) === 1,
  );
  await field(page, 'Name').fill('Ana Reyes');
  await field(page, 'Number').fill('09181234567');
  await page.getByRole('button', { name: 'Save' }).click();
  await SCREENS.start(page).waitFor({ timeout: 15000 });
  const mine = [...fake.users.values()].find((user) => user.email === 'ana@example.com');
  check(
    '  saving them finishes it on the same user: one account, only the profile sent again',
    fake.profileRequests === 2 &&
      fake.users.size === 1 &&
      mine?.profile?.name === 'Ana Reyes' &&
      mine?.profile?.phone === '+639181234567',
    JSON.stringify(mine),
  );
  check('  no request the stand-in does not know', fake.unknown.length === 0, fake.unknown.join());
}

await browser.close();
tally();
