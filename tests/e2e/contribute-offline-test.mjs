// The contributor page /contribute/ with no signal, checked against the production
// build in `vite preview` (its worker is off under `npm run dev`). Run `npm run build` first.
//
//   node tests/e2e/contribute-offline-test.mjs
//
// Starts its own preview server on :4174 (or uses PARAPO_BASE), then:
//   - one visit: the page's own worker registers under /contribute/ and no other, stores the
//     page, and the page links no manifest (it is not installable)
//   - the browser is asked to keep the page's data
//   - with the network off, a new page opens /contribute/ and records: Start, then fixes
//     from a stand-in GPS reach IndexedDB, and Stop and Save still work
//   - the phone is signed in to an account (the page shows nothing else without one), stored
//     with its name; offline with no account, the page shows Sign in, not a broken page
//   - an update (a changed worker) found with a recording open waits, and the page is not
//     reloaded; once the recording is saved it takes over and the page reloads once
//
// A stand-in GPS is fed with Playwright's setGeolocation, the way the browser reports it.
// Each check prints PASS/FAIL and the script exits non-zero on any failure.
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeContributions, session } from './lib/fake-contributions.mjs';
import { harness } from './lib/harness.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(root, 'package.json'));
const { chromium } = require('playwright');

const { check, tally } = harness();

const workerFile = join(root, 'dist', 'contribute', 'sw.js');
if (!existsSync(workerFile)) {
  console.log('FAIL  dist/contribute/sw.js missing — run npm run build first');
  process.exit(1);
}

const workerSource = readFileSync(workerFile, 'utf8');
let server = null;
let base = process.env.PARAPO_BASE;
if (!base) {
  const { preview } = await import('vite');
  server = await preview({ preview: { port: 4174, strictPort: true }, logLevel: 'silent' });
  base = server.resolvedUrls.local[0].replace(/\/$/, '');
}
console.log(`preview at ${base}`);

const ACCOUNT_ID = 'cccccccc-0000-4000-8000-000000000001';
const AUTH_KEY = 'parapo.contributor-auth';

/** Supabase, in memory: the account's session is stored on the phone and its name is in the database. */
async function standInDatabase(page) {
  const fake = await fakeContributions(page);
  fake.users.set(ACCOUNT_ID, {
    email: 'tester@example.com',
    password: 'hunter2hunter2',
    isAccount: true,
    profile: { name: 'Tester', phone: '+639171234567' },
  });
  return fake;
}

/** No signal for the browser and for the stand-in, which Playwright's offline mode does not stop. */
async function setOffline(context, fake, isOffline) {
  fake.isOffline = isOffline;
  await context.setOffline(isOffline);
}

const START = { latitude: 14.6, longitude: 121.0 };
/** One fix of the ride, `metres` east of the start. */
const eastOf = (metres) => ({
  ...START,
  longitude: START.longitude + metres / (111320 * Math.cos((START.latitude * Math.PI) / 180)),
  accuracy: 5,
});
/** A fix every 10 m from the start, a moment apart, as a jeepney's phone reports them. */
const ride = async (context, page, count) => {
  for (let i = 0; i < count; i++) {
    await context.setGeolocation(eastOf(i * 10));
    await page.waitForTimeout(150);
  }
};
const storedFixes = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('parapo-contribute');
        open.onerror = () => resolve(-1);
        open.onsuccess = () => {
          const count = open.result.transaction('fixes').objectStore('fixes').count();
          count.onsuccess = () => {
            open.result.close();
            resolve(count.result);
          };
        };
      }),
  );
const storeNames = (page) =>
  page.evaluate(async () =>
    (await caches.keys()).filter((n) => n.startsWith('parapo-contribute-')),
  );

const browser = await chromium.launch();
const phone = {
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  permissions: ['geolocation'],
  geolocation: eastOf(0),
};

try {
  const context = await browser.newContext(phone);
  await context.addInitScript(
    ([key, signedIn]) => {
      // Once only: the end of the suite signs the phone out, and a reload must not sign it back in.
      if (localStorage.getItem('seeded')) return;
      localStorage.setItem('seeded', 'yes');
      localStorage.setItem(key, JSON.stringify(signedIn));
    },
    [AUTH_KEY, session(ACCOUNT_ID, { email: 'tester@example.com', isAccount: true })],
  );
  await context.addInitScript(() => {
    localStorage.setItem('parapo.contribute.consent', '3');
    window.__persistAsked = false;
    const persist = StorageManager.prototype.persist;
    StorageManager.prototype.persist = function () {
      window.__persistAsked = true;
      return persist.call(this);
    };
  });
  const errors = [];
  // Errors from Cloudflare's own Turnstile frame are not the page's: its script throws now and then
  // under this suite's fake clock (also on staging), and the page cannot catch an error in a frame it embeds.
  const watch = (p) =>
    p.on('pageerror', (e) => {
      const frames = String(e.stack)
        .split('\n')
        .filter((line) => line.trim().startsWith('at '));
      const isCloudflareOnly =
        frames.length > 0 && frames.every((line) => line.includes('challenges.cloudflare.com'));
      if (!isCloudflareOnly) errors.push(String(e));
    });

  // ------------------------------------------------------------- one visit
  const first = await context.newPage();
  await standInDatabase(first);
  watch(first);
  await first.goto(`${base}/contribute/`, { waitUntil: 'load' });
  await first.getByRole('button', { name: 'Start recording' }).waitFor({ timeout: 20000 });
  const worker = await first.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    const all = await navigator.serviceWorker.getRegistrations();
    return {
      scope: new URL(ready.scope).pathname,
      scripts: all.map((r) => new URL(r.active?.scriptURL ?? 'none').pathname),
      hasManifestLink: !!document.querySelector('link[rel="manifest"]'),
    };
  });
  check(
    "the page's own worker registers, scoped to /contribute/, and no worker at /",
    worker.scope === '/contribute/' &&
      worker.scripts.length === 1 &&
      worker.scripts[0] === '/contribute/sw.js',
    JSON.stringify(worker),
  );
  check('the page links no manifest — it is not installable', !worker.hasManifestLink);
  // The worker claims the page once it is active, and has stored the page by then.
  await first.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  const stored = await first.evaluate(async () => {
    const [name] = (await caches.keys()).filter((n) => n.startsWith('parapo-contribute-'));
    const keys = name ? await (await caches.open(name)).keys() : [];
    return keys.map((r) => new URL(r.url).pathname);
  });
  check(
    'the worker stored the page, the page icon and its chunks',
    stored.includes('/contribute/') &&
      stored.includes('/icons/favicon.png') &&
      stored.some((u) => /^\/assets\/contribute-.*\.js$/.test(u)) &&
      stored.some((u) => /^\/assets\/maplibre-gl-worker-.*\.js$/.test(u)),
    `${stored.length} files`,
  );
  check(
    'it holds none of the studio and none of the map file',
    !stored.some((u) => /^\/(studio\/|data\/)/.test(u) || /\/studio-/.test(u)),
  );
  check(
    'the browser was asked to keep the data',
    await first
      .waitForFunction(() => window.__persistAsked === true, null, { timeout: 5000 })
      .then(
        () => true,
        () => false,
      ),
  );
  const firstStores = await storeNames(first);
  await first.close();

  // ---------------------------------------------------- no signal: record
  await context.setOffline(true);
  const page = await context.newPage();
  const fake = await standInDatabase(page);
  fake.isOffline = true;
  watch(page);
  await page.goto(`${base}/contribute/`, { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Start recording' }).waitFor({ timeout: 20000 });
  check(
    'with the network off, /contribute/ opens from the worker',
    await page.evaluate(
      async () =>
        !!navigator.serviceWorker.controller &&
        (await fetch('/data/index.v5.json').then(
          () => false,
          () => true,
        )),
    ),
  );
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('group', { name: 'Recording so far' }).waitFor({ timeout: 10000 });
  await ride(context, page, 6);
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('parapo-contribute');
        open.onsuccess = () => {
          const count = open.result.transaction('fixes').objectStore('fixes').count();
          count.onsuccess = () => {
            open.result.close();
            resolve(count.result >= 3);
          };
        };
      }),
    null,
    { timeout: 10000 },
  );
  const fixes = await storedFixes(page);
  check(
    'and it records: the stand-in GPS fixes reach IndexedDB',
    fixes >= 3,
    `${fixes} fixes stored`,
  );
  check(
    '  with a Stop button on the screen',
    (await page.getByRole('button', { name: 'Stop', exact: true }).count()) === 1,
  );

  // ----------------------------------------- an update waits for the ride
  await setOffline(context, fake, false);
  await page.clock.install();
  await page.evaluate(() => {
    window.__marker = 'same page';
  });
  // The same worker with one more line: the browser sees a changed file, and its store
  // is named for the file's bytes. The file is put back when the suite ends.
  writeFileSync(
    workerFile,
    `${workerSource.replace(/parapo-contribute-[0-9a-f]+/, 'parapo-contribute-update')}\n// a new version\n`,
  );
  await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
  const hasWaiting = () =>
    page.evaluate(
      async () => !!(await navigator.serviceWorker.getRegistration('/contribute/'))?.waiting,
    );
  for (let i = 0; i < 100 && !(await hasWaiting()); i++) await page.waitForTimeout(200);
  await page.clock.fastForward(95_000);
  await page.waitForTimeout(1500);
  const waiting = await page.evaluate(async () => ({
    hasWaiting: !!(await navigator.serviceWorker.getRegistration('/contribute/'))?.waiting,
    marker: window.__marker,
  }));
  check(
    'an update found with a recording open waits, and the page is not reloaded',
    waiting.hasWaiting && waiting.marker === 'same page',
    JSON.stringify(waiting),
  );
  check(
    '  the old files are still stored under it',
    (await storeNames(page)).includes(firstStores[0]),
  );

  // Stop and Save by hand (Skip: no details), then the update takes over.
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Record again' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  const reloaded = page.waitForEvent('load', { timeout: 20000 }).then(
    () => true,
    () => false,
  );
  await page.clock.fastForward(95_000);
  check('once the recording is saved, the update takes over and the page reloads', await reloaded);
  await page.getByRole('button', { name: 'Start recording' }).waitFor({ timeout: 20000 });
  const after = await page.evaluate(() => window.__marker ?? null);
  const stores = await storeNames(page);
  check(
    '  the new version is the only store left, and the recording is kept on the phone',
    after === null &&
      stores.length === 1 &&
      stores[0] !== firstStores[0] &&
      (await storedFixes(page)) >= 3,
    JSON.stringify({ stores, firstStores }),
  );

  // ------------------------------------------ no signal, and no account
  await setOffline(context, fake, true);
  await page.evaluate((key) => localStorage.removeItem(key), AUTH_KEY);
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('heading', { name: 'Sign in', level: 1 }).waitFor({ timeout: 20000 });
  check(
    'with no signal and no account, the page opens on Sign in, with no Start and no page error',
    (await page.getByRole('button', { name: 'Start recording' }).count()) === 0 &&
      (await page.getByRole('button', { name: 'Create account' }).count()) === 1 &&
      errors.length === 0,
    errors.slice(0, 3).join(' | '),
  );

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
} finally {
  writeFileSync(workerFile, workerSource);
  await browser.close();
  await server?.close();
}
tally();
