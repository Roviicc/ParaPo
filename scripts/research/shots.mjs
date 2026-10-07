// Screens for UX research: the public map and the studio, phone and desktop.
//
//   npm run dev                                  (in another terminal, on :5173)
//   node scripts/research/shots.mjs [outDir]     (default ./research-shots)
//
// Reads today's published file for a route and a hintuan to open, so nothing
// here is hard-coded about the data. Each screen waits real time for tiles.
// Uses window.__map, which only development builds expose.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BASE = (process.env.PARAPO_BASE ?? 'http://localhost:5173').replace(/\/$/, '');
const OUT = resolve(process.argv[2] ?? 'research-shots');
mkdirSync(OUT, { recursive: true });

/** The published map with every line in full: the index, each line from lines/<id>.json beside it. */
const readPublished = () => {
  const at = (name) =>
    JSON.parse(readFileSync(new URL(`../../public/data/${name}`, import.meta.url), 'utf8'));
  const index = at('index.v4.json');
  return {
    ...index,
    variants: index.variants.map(({ overview, ...v }) => ({
      ...v,
      shape: overview ? at(`lines/${v.id}.json`).shape : null,
    })),
  };
};
const file = readPublished();
const route = file.variants.find((v) => v.shape?.coordinates?.length > 1);
const stop = file.stops.find((s) => s.kind === 'hintuan') ?? file.stops[0];

const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
};
const desk = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();

async function shot(ctxOpts, url, name, { before, after } = {}) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  try {
    if (before) await before(page);
    await page.goto(BASE + url);
    await page
      .waitForFunction(() => window.__map?.loaded?.(), null, { timeout: 30000 })
      .catch(() => {});
    await wait(6000);
    if (after) await after(page);
    await page.screenshot({ path: join(OUT, name + '.png') });
    console.log('ok  ', name);
  } catch (e) {
    console.log('FAIL', name, e.message.split('\n')[0]);
  } finally {
    await ctx.close();
  }
}

/** Open the trip card's folded hintuans, when it has some to fold. */
const openFold = async (p) => {
  const fold = p.locator('[data-testid="trip-fold"]');
  if (await fold.count()) await fold.first().tap();
  await wait(1500);
};

/**
 * Open the route's trip as a visitor does, by a tap on its line (trip links,
 * ?r=<id>, went on 2026-10-03): centred on a point a third of the way along
 * it. Where routes share that road this opens the list; its first row then.
 */
const openRoute = async (p) => {
  const line = route.shape.coordinates;
  const c = line[Math.floor(line.length / 3)];
  await p.evaluate((c) => window.__map.jumpTo({ center: c, zoom: 15 }), c);
  await wait(3000);
  const pt = await p.evaluate((c) => window.__map.project(c), c);
  if (await p.evaluate(() => matchMedia('(pointer: coarse)').matches))
    await p.touchscreen.tap(pt.x, pt.y);
  else await p.mouse.click(pt.x, pt.y);
  await wait(1500);
  const row = p.locator('[data-testid="chooser-item"]');
  if (!(await p.locator('[data-testid="trip"]').count()) && (await row.count()))
    await row.first().click();
  await wait(2500);
};

/** Centre the map on the hintuan's box and tap its middle. Near a line this opens the chooser. */
const tapStop = async (p) => {
  const ring = stop.area.coordinates[0];
  const c = [
    ring.reduce((a, q) => a + q[0], 0) / ring.length,
    ring.reduce((a, q) => a + q[1], 0) / ring.length,
  ];
  await p.evaluate((c) => window.__map.jumpTo({ center: c, zoom: 17 }), c);
  await wait(3000);
  const pt = await p.evaluate((c) => window.__map.project(c), c);
  await p.touchscreen.tap(pt.x, pt.y);
  await wait(1500);
};

await shot(phone, '/', '01-phone-map');
if (route) {
  await shot(phone, '/', '02-phone-trip', { after: openRoute });
  await shot(phone, '/', '03-phone-trip-open', {
    after: async (p) => {
      await openRoute(p);
      await openFold(p);
    },
  });
}
if (stop) {
  await shot(phone, '/', '04-phone-chooser', { after: tapStop });
  await shot(phone, '/', '04b-phone-hotspot', {
    after: async (p) => {
      await tapStop(p);
      const item = p.locator('[data-testid="chooser-item"]');
      if (await item.count()) await item.first().tap();
      await wait(1500);
    },
  });
}
await shot(phone, '/', '05-phone-load-error', {
  before: (p) => p.route('**/data/index.v4.json*', (r) => r.abort()),
});
await shot(desk, '/', '06-desktop-map');
if (route) await shot(desk, '/', '07-desktop-route', { after: openRoute });
await shot(desk, '/studio/', '08-studio-signin');
await shot(desk, '/studio/?e2e=1', '09-studio-editor');

await browser.close();
