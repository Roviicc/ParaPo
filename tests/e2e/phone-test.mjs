// The public map at /, on a phone: 390×844, touch, a coarse pointer.
//
//   npm run dev                        (in another terminal)
//   node tests/e2e/phone-test.mjs
//
// Same rule as visitor-test: nothing is hard-coded about today's data. Every
// tap position is computed from the map's own sources — the script reads the
// route lines and hotspot rings out of `saved-routes` / `saved-stops`, finds a
// stretch of line no other route comes near, a vertex two routes share, and a
// hotspot edge with no line beside it, then projects those to screen pixels and
// taps them. A check today's data cannot support prints SKIP instead of failing.
//
// Covers: touch chrome — no zoom buttons, attribution moved to the top right,
// no horizontal scroll; the opening (the owner's Q1 and Q4, 2026-10-04) — the
// map made framed on the routes where their fit framed it and kept there,
// with the file still on its way the old opening and the routes framed as
// they come, unless a finger has moved the map first (or, at 1280×800, an
// arrow key or a shift-drag box zoom), the map file asked for by the page
// as it is read and that request taken by the app, and the page's own
// gray "Loading map…" before the app runs, taken over unchanged, and gone
// with the first frame that draws the routes, or at the map's 'load' when
// that comes first (the owner's answer to question A, 2026-10-06); the
// forgiving ±20 px tap, with a negative control well outside the box; the
// trip card a lone route opens (the owner's RouteTripDetail, 2026-09-29) —
// its ends, its fold (its rows drawn only once it is opened, 2026-10-04),
// SWITCH keeping its
// colour, ‹ only where another route sharing an end runs its way; the route list
// where two routes share a road ("N Routes", a card per place), the trip a
// row opens in its card's colour and ‹ back to the list, every card at rest; a tap
// just outside a hotspot, and the bottom sheet on a hotspot's card — tap and
// drag the handle, Middle → Max → Low → Middle → Low → gone; a trip opened
// by a tap on its own line (no ?r= link since the owner took trip links out,
// 2026-10-03), the view it frames, and its ‹ listing the routes sharing an
// end with its own; the fine-pointer desktop control (±5 px, no zoom
// buttons for a mouse either since 2026-09-29, attribution bottom right,
// the pointer a hand over a line); a first tap at the opening view
// compiling no GL program, and asking the map what it landed on once
// (2026-10-04); and housekeeping.
import { chromium } from 'playwright';
import { BASE, harness, nodeFetch, takeHeldReload, waitForSource } from './lib/harness.mjs';
import { centroidOf, pointInPolygon } from './lib/geo.mjs';
import { lookReaders, paintNow, programsAtRest, programsSince, rideLook } from './lib/looks.mjs';

const { check, skip, tally } = harness();

// ------------------------------------------------------------------ geometry
// Metres from degrees, flat-earth style. Everything here is within a few km of
// everything else, so a local equirectangular approximation is exact enough to
// decide "is another route within 60 m of this vertex".
const M_PER_DEG_LAT = 110_574;
const mPerDegLng = (lat) => 111_320 * Math.cos((lat * Math.PI) / 180);

/** Metres from point p to the segment a–b, in p's local metre frame. */
function distPointSegment(p, a, b, k) {
  const px = (p[0] - a[0]) * k;
  const py = (p[1] - a[1]) * M_PER_DEG_LAT;
  const bx = (b[0] - a[0]) * k;
  const by = (b[1] - a[1]) * M_PER_DEG_LAT;
  const len2 = bx * bx + by * by;
  let t = len2 ? (px * bx + py * by) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - bx * t, py - by * t);
}

/** Metres from point p to the nearest part of a polyline. */
function distToLine(p, coords, k) {
  let best = Infinity;
  for (let i = 1; i < coords.length; i++) {
    const d = distPointSegment(p, coords[i - 1], coords[i], k);
    if (d < best) best = d;
  }
  return best;
}

const bboxOf = (coords) => {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of coords) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
};

/** Rough metres from p to a bounding box; 0 when inside. Used only to skip work. */
function distToBbox(p, [w, s, e, n], k) {
  const dx = Math.max(w - p[0], 0, p[0] - e) * k;
  const dy = Math.max(s - p[1], 0, p[1] - n) * M_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

/** Metres from p to the nearest hotspot ring, 0 if p is inside one. */
function distToHotspots(p, polys, k) {
  let best = Infinity;
  for (const poly of polys) {
    if (pointInPolygon(p, poly.ring)) return 0;
    const d = distToLine(p, poly.ring, k);
    if (d < best) best = d;
  }
  return best;
}

/** Every route within `metres` of p, by variant id. */
function routesNear(p, routes, metres, k) {
  const near = [];
  for (const r of routes) {
    if (distToBbox(p, r.bbox, k) > metres) continue;
    if (distToLine(p, r.coords, k) <= metres) near.push(r);
  }
  return near;
}

/**
 * The nearest vertex on either side of `i` that is at least `metres` away, so
 * the direction of the line through vertex `i` can be measured without the
 * rounding noise between two points a metre apart. Null if the line is shorter.
 */
function neighbourAtLeast(coords, i, metres, k) {
  for (let step = 1; step < coords.length; step++) {
    for (const j of [i - step, i + step]) {
      if (j < 0 || j >= coords.length) continue;
      const d = Math.hypot(
        (coords[j][0] - coords[i][0]) * k,
        (coords[j][1] - coords[i][1]) * M_PER_DEG_LAT,
      );
      if (d >= metres) return coords[j];
    }
  }
  return null;
}

/**
 * Sample at most `max` vertices of a route, evenly. Metro Manila routes carry a
 * few thousand points each; we only need enough to find one good tap target.
 */
function sampleIndices(length, max) {
  const stride = Math.max(1, Math.ceil(length / max));
  const out = [];
  for (let i = 0; i < length; i += stride) out.push(i);
  return out;
}

// ---------------------------------------------------------------- the browser
const b = await chromium.launch();
const errors = [];
let osrmHit = false;
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 160));
  });
  p.on('request', (req) => {
    if (/router\.project-osrm\.org/.test(req.url())) osrmHit = true;
  });
};

const context = await b.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
watch(page);

await nodeFetch(page);
await page.addInitScript(() => {
  // Pointer presses the page has seen: on some GitHub runs Chromium stopped
  // making them from touches, and from the mouse, partway through the suite
  // (2026-09-29; see tapHandle).
  // What might have stopped them, and when the last one came: a long press's
  // context menu or drag, or a pointer the browser cancelled.
  window.__pointerdowns = 0;
  window.__lastDown = null;
  window.__odd = [];
  const tag = (e) =>
    e.target instanceof Element
      ? (e.target.closest('[data-testid]')?.getAttribute('data-testid') ??
        e.target.tagName.toLowerCase())
      : '';
  document.addEventListener(
    'pointerdown',
    (e) => {
      window.__pointerdowns++;
      if (e.isTrusted)
        window.__lastDown = `${Math.round(performance.now())} ${e.pointerType}@${tag(e)}`;
    },
    true,
  );
  for (const t of [
    'contextmenu',
    'dragstart',
    'dragend',
    'pointercancel',
    'touchcancel',
    'selectstart',
  ])
    document.addEventListener(
      t,
      (e) => window.__odd.push(`${Math.round(performance.now())} ${t}@${tag(e)}`),
      true,
    );
  window.__src = async (id) => {
    const s = window.__map?.getSource(id);
    return s ? await s.getData() : null;
  };
});
await page.addInitScript(lookReaders);

/**
 * In the page, before the app starts: the map from its making (MapView
 * hands it out as window.__mapEarly in dev, 2026-10-04) — the camera it was
 * made at, the camera at its 'load', and each move of it since, a
 * visitor's (`gesture`, one carrying the input that made it) or another.
 */
function openingRecorder() {
  let early = null;
  const cam = (m) => {
    const c = m.getCenter();
    return {
      lng: c.lng,
      lat: c.lat,
      zoom: m.getZoom(),
      bearing: m.getBearing(),
      pitch: m.getPitch(),
    };
  };
  window.__opening = { made: null, atLoad: null, moves: [] };
  Object.defineProperty(window, '__mapEarly', {
    configurable: true,
    get: () => early,
    set(m) {
      early = m;
      window.__opening.made = cam(m);
      m.on('movestart', (e) => window.__opening.moves.push(e?.originalEvent ? 'gesture' : 'other'));
      m.once('load', () => {
        window.__opening.atLoad = cam(m);
      });
    },
  });
}
await page.addInitScript(openingRecorder);

/**
 * In the page, before the app starts: the moment MapView's own "Loading
 * map…" goes, and the map then (the owner's answer to question A of the
 * cheap-phone report, 2026-10-06) — whether its 'load' had come
 * (window.__map, which MapView hands out at it) and how many of the routes
 * it drew on the screen (its resting line layer's rendered features).
 */
function liftRecorder() {
  window.__lift = null;
  let text = null;
  const look = () => {
    if (window.__lift) return;
    // MapView's own: index.html's, which has no class, goes as the app first renders.
    text ??=
      [...document.querySelectorAll('div.pointer-events-none > p')].find(
        (e) => e.textContent === 'Loading map…',
      ) ?? null;
    if (!text || text.isConnected) return;
    const m = window.__mapEarly;
    let drawn = null;
    try {
      drawn = m.getLayer('saved-routes-line')
        ? m.queryRenderedFeatures({ layers: ['saved-routes-line'] }).length
        : 0;
    } catch {}
    window.__lift = { at: Math.round(performance.now()), loaded: !!window.__map, drawn };
  };
  new MutationObserver(look).observe(document, { subtree: true, childList: true });
}

/**
 * In the page, before its own scripts: index.html's request for the map file
 * (the cheap-phone plan, step 20, 2026-10-04), left for the app as
 * window.__parapoMapFile — when the page's plain script left it, when the
 * app first read it, and how often (map-file.ts takes it once, and deletes it).
 */
function earlyFileRecorder() {
  let left;
  window.__earlyFile = { leftAt: null, takenAt: null, reads: 0 };
  Object.defineProperty(window, '__parapoMapFile', {
    configurable: true,
    get() {
      window.__earlyFile.reads++;
      window.__earlyFile.takenAt ??= Math.round(performance.now());
      return left;
    },
    set(v) {
      left = v;
      window.__earlyFile.leftAt ??= Math.round(performance.now());
    },
  });
}
await page.addInitScript(earlyFileRecorder);
/**
 * The map file as the page asked for it: every request of the page's but
 * the checks' own (x-parapo-test), each with how it ended, and the page's
 * loads, so a second request says whether the page was loaded again.
 */
const mapFileAsks = [];
let pageLoads = 0;
page.on('request', (req) => {
  if (/\/data\/index\.v4\.json/.test(req.url()) && !req.headers()['x-parapo-test'])
    mapFileAsks.push({ req, end: 'no answer yet' });
});
page.on('requestfinished', async (req) => {
  const ask = mapFileAsks.find((a) => a.req === req);
  if (ask) ask.end = `${(await req.response().catch(() => null))?.status() ?? 'no response'}`;
});
page.on('requestfailed', (req) => {
  const ask = mapFileAsks.find((a) => a.req === req);
  if (ask) ask.end = `failed: ${req.failure()?.errorText}`;
});
page.on('framenavigated', (f) => {
  if (f === page.mainFrame()) pageLoads++;
});

// ------------------------------------------------------------- 1. the pointer
// Everything below assumes the page believes it is being touched. Playwright's
// mobile emulation usually reports `pointer: coarse` on its own; where it does
// not, CDP's emulated media does it, and it has to be sent before the first
// navigation (an addInitScript cannot change what matchMedia reports).
const cdp = await context.newCDPSession(page);
const coarse = () => page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
let isCoarse = await coarse();
let coarseVia = 'Playwright emulation';
if (!isCoarse) {
  await cdp
    .send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }] })
    .catch(() => {});
  isCoarse = await coarse();
  coarseVia = 'CDP Emulation.setEmulatedMedia';
}
check(
  'the page reports a coarse pointer',
  isCoarse,
  isCoarse
    ? `via ${coarseVia}`
    : 'matchMedia("(pointer: coarse)") is false — every check below is meaningless',
);

// What the dev server holds for the next page to connect, taken first. A
// reload Tailwind's plugin sent for an edit made before this run began (to
// a README, say) loaded the page a second time the moment its client
// connected, and step 20's check below counts the page's requests for the
// map file and its loads (the owner's answer to question W of the
// cheap-phone report, 2026-10-06; harness.mjs).
const held = await takeHeldReload();
if (held.held)
  console.log(
    `(the dev server held a ${held.held.type} for the next page to connect, from before this run: taken first)`,
  );
else if (!held.socket)
  console.log(`(no dev server's socket at ${BASE}: nothing held for the page to take)`);
await page.goto(`${BASE}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 });
await waitForSource(page, 'saved-routes');
await page.waitForTimeout(1200);

/**
 * A finger on the map at page point (x, y). A real touch first; when the map
 * has seen no click from it within 1.5 s, a click the browser would have
 * made, sent by hand with `pointerType: 'touch'`, so the app still reads a
 * finger. On a GitHub runner the page draws so slowly at three device pixels
 * per CSS pixel that the touch's end came half a second and more after its
 * start, which Chromium takes for a long press and turns into no click at
 * all (the fourth CI run, 2026-09-25). How many taps needed the fallback is
 * reported at the end.
 */
let tapsByHand = 0;
await page.evaluate(() => {
  window.__clicks = 0;
  window.__map.on('click', () => window.__clicks++);
});
let lateClicks = 0;
/** A frame drawn after the input queue drained: the click a touch makes, if any, has been dispatched by now. */
const settled = () =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
const mapTap = async (x, y) => {
  // Counted afresh on a page loaded since (openAlone): without it the count
  // never moved, and every tap was sent a second time by hand, onto whatever
  // the first had brought under that point (the review of 2026-10-03).
  const before = await page.evaluate(() => {
    if (window.__clicks === undefined) {
      window.__clicks = 0;
      window.__map.on('click', () => window.__clicks++);
    }
    return window.__clicks;
  });
  await page.touchscreen.tap(x, y);
  // The page may be busy drawing for a while after the touch; only then does
  // the wait for its click start, or the click comes late, after the one
  // sent by hand, and two taps land where one was meant (a local run,
  // 2026-09-25: the second tap replaced the chooser the first had opened).
  await settled();
  const until = Date.now() + 1500;
  while ((await page.evaluate(() => window.__clicks)) === before && Date.now() < until)
    await page.waitForTimeout(100);
  if ((await page.evaluate(() => window.__clicks)) !== before) return;
  tapsByHand++;
  await page.evaluate(
    ([px, py]) => {
      const el = window.__map.getCanvasContainer();
      el.dispatchEvent(
        new PointerEvent('click', {
          pointerType: 'touch',
          clientX: px,
          clientY: py,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    [x, y],
  );
  await settled();
  if ((await page.evaluate(() => window.__clicks)) > before + 1) lateClicks++;
};
/**
 * A finger on a button (a chooser row): a real touch, and, when `done()` is
 * still false 1.5 s later, a click on the button, since the runner drops a
 * touch on a button the same way (the sixth CI run). False when there is no
 * such button.
 */
const buttonTap = async (locator, done) => {
  const b = (await locator.count())
    ? await locator
        .first()
        .boundingBox({ timeout: 2000 })
        .catch(() => null)
    : null;
  if (!b) return false;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await settled();
  const until = Date.now() + 1500;
  while (!(await done()) && Date.now() < until) await page.waitForTimeout(100);
  if (!(await done())) {
    tapsByHand++;
    // Sent straight to the button: Playwright's own click first waits for
    // the page to hold still, which a runner drawing a phone at three
    // device pixels per CSS pixel may not do in time (the seventh CI run).
    await locator.first().dispatchEvent('click');
    const again = Date.now() + 1500;
    while (!(await done()) && Date.now() < again) await page.waitForTimeout(100);
  }
  await page.waitForTimeout(600);
  return true;
};

/** Where the camera is: its centre and zoom. */
const camNow = () =>
  page.evaluate(() => {
    const m = window.__map;
    const c = m.getCenter();
    return { lng: c.lng, lat: c.lat, zoom: m.getZoom() };
  });

check(
  'no zoom buttons on a touch screen',
  (await page.locator('.maplibregl-ctrl-zoom-in').count()) === 0,
);
check(
  'the attribution control sits top right',
  (await page.locator('.maplibregl-ctrl-top-right .maplibregl-ctrl-attrib').count()) > 0,
  (await page.locator('.maplibregl-ctrl-bottom-right .maplibregl-ctrl-attrib').count()) > 0
    ? 'still bottom right'
    : '',
);
const noHScroll = (p) =>
  p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
check(
  'no horizontal scroll at load',
  await noHScroll(page),
  `scrollWidth ${await page.evaluate(() => document.documentElement.scrollWidth)} vs innerWidth ${await page.evaluate(() => window.innerWidth)}`,
);

// ----------------------------------- 1a. the opening: framed, and its gray
// The owner's Q1 and Q4 (2026-10-04). The map is made framed on the routes,
// where their fit put it after the map's 'load' until then — the box round
// every overview in the published file, 100 px clear of the edges, zoom 13
// at most — so its first tiles are those of the view it keeps; the fit
// itself no longer moves it. With the file still on its way it opens as it
// always did and the fit frames the routes as they come, unless a finger has
// moved the map by then. And before the app's script has run, the page
// itself shows the map's gray "Loading map…", which the app's own replaces
// unchanged; that goes at the first frame that draws the routes, before
// the map's 'load' while the basemap's tiles are on their way, or at the
// 'load' when no route is drawn by then (the owner's answer to question A
// of the cheap-phone report, 2026-10-06).
{
  /** The camera the routes' fit frames on page `p`'s map (useSavedRoutes, ROUTES_FRAMING). */
  const fitCamera = (p) =>
    p.evaluate(async () => {
      const f = await (
        await fetch('/data/index.v4.json', { headers: { 'x-parapo-test': '1' } })
      ).json();
      let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const v of f.variants) {
        for (const [x, y] of v.overview?.coordinates ?? []) {
          if (x < w) w = x;
          if (x > e) e = x;
          if (y < s) s = y;
          if (y > n) n = y;
        }
      }
      const c = window.__map.cameraForBounds(
        [
          [w, s],
          [e, n],
        ],
        { padding: 100, maxZoom: 13 },
      );
      return { lng: c.center.lng, lat: c.center.lat, zoom: c.zoom, bearing: 0, pitch: 0 };
    });
  const camOf = (p) =>
    p.evaluate(() => {
      const m = window.__map;
      const c = m.getCenter();
      return {
        lng: c.lng,
        lat: c.lat,
        zoom: m.getZoom(),
        bearing: m.getBearing(),
        pitch: m.getPitch(),
      };
    });
  /** The same camera, to a billionth of a degree and of a zoom level. */
  const sameCam = (a, b) =>
    !!a &&
    !!b &&
    ['lng', 'lat', 'zoom', 'bearing', 'pitch'].every((k) => Math.abs(a[k] - b[k]) < 1e-9);
  const showCam = (c) =>
    c ? `${c.lng.toFixed(5)},${c.lat.toFixed(5)} z${c.zoom.toFixed(4)}` : 'none';

  const want = await fitCamera(page);
  const opening = await page.evaluate(() => window.__opening);
  const now = await camOf(page);
  check(
    "the map is made framed on the routes, where their fit framed it: padding 100, zoom 13 at most (the owner's Q1)",
    sameCam(opening.made, want),
    `made at ${showCam(opening.made)}; the fit's ${showCam(want)}`,
  );
  check(
    "  and stays there: the same camera at its 'load' and at rest, never moved since",
    sameCam(opening.atLoad, want) && sameCam(now, want) && opening.moves.length === 0,
    `at 'load' ${showCam(opening.atLoad)}, now ${showCam(now)}; ${opening.moves.length} move(s)${opening.moves.length ? ': ' + opening.moves.join(', ') : ''}`,
  );

  // Step 20, which Q1's opening rests on: the page asks for the map file as
  // it is read, and the app takes that request rather than asking again.
  // Without the page's script the app asks once itself, and the map opens
  // as well, a little later: no other check would say so (review of Q1,
  // 2026-10-05).
  const early = await page.evaluate(() => ({
    ...window.__earlyFile,
    still: '__parapoMapFile' in window,
  }));
  check(
    '  the page asked for the map file as it was read, and the app took that request, once: the one request for it (step 20)',
    early.leftAt != null &&
      early.takenAt != null &&
      early.leftAt <= early.takenAt &&
      early.reads === 1 &&
      !early.still &&
      mapFileAsks.length === 1,
    `left by the page at ${early.leftAt ?? 'never'} ms, taken by the app at ${early.takenAt ?? 'never'} ms, read ${early.reads} time(s), ${early.still ? 'still there' : 'gone'}; ${mapFileAsks.length} request(s) for it (${mapFileAsks.map((a) => a.end).join(', ')}) in ${pageLoads} load(s) of the page`,
  );

  /** A fresh page on the phone (or in `ctx`) with the map file held back till `release()`: a first visit whose file is still on its way. */
  const heldBack = async (ctx = context) => {
    const p = await ctx.newPage();
    watch(p);
    await nodeFetch(p);
    await p.addInitScript(openingRecorder);
    await p.addInitScript(liftRecorder);
    let release;
    const held = new Promise((r) => (release = r));
    await p.route(/\/data\/index\.v4\.json/, async (route) => {
      await held;
      await route.fallback();
    });
    await p.goto(`${BASE}/`, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 });
    return { p, release };
  };
  /** Lets the file through, and waits for the routes on the map, then for anything their coming moves. */
  const routesCome = async (p, release) => {
    release();
    const until = Date.now() + 20000;
    while (Date.now() < until) {
      const on = await p.evaluate(
        async () =>
          ((await window.__map.getSource('saved-routes')?.getData())?.features.length ?? 0) > 0,
      );
      if (on) break;
      await p.waitForTimeout(100);
    }
    await p.waitForTimeout(1500);
    await p
      .waitForFunction(() => !window.__map.isMoving(), null, { timeout: 5000 })
      .catch(() => {});
  };

  // With no file to frame on, the old opening; the fit then frames the
  // routes as they come, and the camera ends where it always ended.
  {
    const { p, release } = await heldBack();
    const made = await p.evaluate(() => window.__opening.made);
    // Its 'load' before any route to draw: "Loading map…" goes at it, as it
    // always did (the owner's answer to question A, 2026-10-06).
    const lift = await p
      .waitForFunction(() => window.__lift, null, { timeout: 5000 })
      .then((h) => h.jsonValue())
      .catch(() => null);
    check(
      "  the file still on its way, the map's 'load' first: \"Loading map…\" goes at the 'load', with no route on the screen",
      !!lift && lift.loaded && lift.drawn === 0,
      lift
        ? `gone at ${lift.at} ms, ${lift.loaded ? "after the map's 'load'" : "before the map's 'load'"}, ${lift.drawn} route(s) drawn`
        : 'never gone',
    );
    await routesCome(p, release);
    const end = await camOf(p);
    const fit = await fitCamera(p);
    check(
      "  the file still on its way: the map opens as it did (zoom 11), and the routes are framed as they come, the fit's camera",
      made?.zoom === 11 && sameCam(end, fit),
      `made at ${showCam(made)}; ends at ${showCam(end)}; the fit's ${showCam(fit)}`,
    );
    await p.close();
  }

  // A finger on the map before they come keeps it where it took it.
  {
    const { p, release } = await heldBack();
    const before = await camOf(p);
    const x = 195;
    const y = 422;
    const pdc = await context.newCDPSession(p);
    let how = 'touch';
    try {
      await pdc.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 8; i++) {
        await pdc.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x - 15 * i, y: y - 20 * i }],
        });
        await p.waitForTimeout(16);
      }
      // Held still before letting go: no fling to carry it on.
      await p.waitForTimeout(250);
      await pdc.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } catch {}
    await p
      .waitForFunction(() => !window.__map.isMoving(), null, { timeout: 5000 })
      .catch(() => {});
    if (sameCam(await camOf(p), before)) {
      // The runner made no touch of it: the same drag with a mouse.
      how = 'mouse';
      await p.mouse.move(x, y);
      await p.mouse.down();
      for (let i = 1; i <= 8; i++) {
        await p.mouse.move(x - 15 * i, y - 20 * i);
        await p.waitForTimeout(16);
      }
      await p.waitForTimeout(250);
      await p.mouse.up();
      await p
        .waitForFunction(() => !window.__map.isMoving(), null, { timeout: 5000 })
        .catch(() => {});
    }
    const dragged = await camOf(p);
    await routesCome(p, release);
    const end = await camOf(p);
    const fit = await fitCamera(p);
    const moves = await p.evaluate(() => window.__opening.moves);
    check(
      '  a finger moving the map before they come keeps it where it took it: the fit does not take it back',
      !sameCam(dragged, before) &&
        sameCam(end, dragged) &&
        !sameCam(end, fit) &&
        moves.every((m) => m === 'gesture'),
      `dragged by ${how} from ${showCam(before)} to ${showCam(dragged)}; ends at ${showCam(end)}; the fit's ${showCam(fit)}; moves: ${moves.join(', ') || 'none'}`,
    );
    await p.close();
  }

  // On a desktop, the two inputs no drag, zoom, turn or tilt event carries
  // (review of the owner's Q1, 2026-10-05): an arrow key's pan, which
  // MapLibre eases with its zoom, bearing and pitch kept, so only its
  // 'movestart' carries the key; and a shift-drag's box, which it zooms to
  // with no input at all. Either, made before the routes come, keeps the map
  // where the visitor took it, as a finger does.
  {
    const wide = await b.newContext({ viewport: { width: 1280, height: 800 } });
    for (const input of ['an arrow key', 'a shift-drag box zoom']) {
      const { p, release } = await heldBack(wide);
      const before = await camOf(p);
      const canvas = p.locator('canvas.maplibregl-canvas');
      if (input === 'an arrow key') {
        // The map's canvas takes the keys once it has the focus, as a click on it gives it.
        await canvas.focus();
        await p.keyboard.press('ArrowRight');
      } else {
        const r = await canvas.boundingBox();
        await p.keyboard.down('Shift');
        await p.mouse.move(r.x + 500, r.y + 300);
        await p.mouse.down();
        await p.mouse.move(r.x + 600, r.y + 380, { steps: 6 });
        await p.mouse.up();
        await p.keyboard.up('Shift');
      }
      await p.waitForTimeout(600);
      await p
        .waitForFunction(() => !window.__map.isMoving(), null, { timeout: 5000 })
        .catch(() => {});
      const moved = await camOf(p);
      await routesCome(p, release);
      const end = await camOf(p);
      const fit = await fitCamera(p);
      const moves = await p.evaluate(() => window.__opening.moves);
      check(
        `  on a desktop, ${input} moving the map before they come keeps it where it took it`,
        !sameCam(moved, before) && sameCam(end, moved) && !sameCam(end, fit) && moves.length === 1,
        `from ${showCam(before)} to ${showCam(moved)}; ends at ${showCam(end)}; the fit's ${showCam(fit)}; moves: ${moves.join(', ') || 'none'}`,
      );
      await p.close();
    }
    await wide.close();
  }

  // The page before the app: its own gray "Loading map…", read with no
  // script at all, against the app's own while the map waits for its style;
  // then the app's, gone as the routes are drawn, the basemap's tiles held.
  /** "Loading map…" on page `p`: how many, and the first's text and the gray under it, as drawn. */
  const loadingLook = (p) =>
    p.evaluate(() => {
      const ps = [...document.querySelectorAll('p')].filter(
        (e) => e.textContent === 'Loading map…',
      );
      const el = ps[0];
      if (!el) return { count: 0 };
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      // The gray: the page's own screen, or MapView's wrapper under its map.
      const under = el.parentElement.style.backgroundColor
        ? el.parentElement
        : document.querySelector('.bg-surface-secondary');
      const g = under ? under.getBoundingClientRect() : null;
      return {
        count: ps.length,
        text: [s.fontFamily, s.fontSize, s.lineHeight, s.fontWeight, s.color].join(' / '),
        at: [r.x, r.y, r.width, r.height].map((v) => +v.toFixed(2)).join(','),
        gray: under
          ? `${getComputedStyle(under).backgroundColor} ${[g.x, g.y, g.width, g.height].join(',')}`
          : 'none',
        marks: document.querySelectorAll('[data-directions], [data-dock-host]').length,
      };
    });
  const still = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    javaScriptEnabled: false,
  });
  const sp = await still.newPage();
  await sp.goto(`${BASE}/`, { waitUntil: 'load' });
  const own = await loadingLook(sp);
  await still.close();
  check(
    'before the app runs, the page shows the map\'s gray "Loading map…", with no data-directions or data-dock-host (the owner\'s Q4)',
    own.count === 1 && own.marks === 0 && own.gray.startsWith('oklch(0.97 0 none) 0,0,390,844'),
    `${own.count} "Loading map…"; ${own.marks} marked; gray ${own.gray}`,
  );
  const ap = await context.newPage();
  watch(ap);
  await nodeFetch(ap);
  await ap.addInitScript(liftRecorder);
  // The basemap's style held till `styleIn()`; then a stand-in's gray and
  // one source of its own, whose tiles are held till `tilesIn()`, so the
  // map's 'load' waits for them as it waits for a real basemap's (the
  // owner's answer to question A, 2026-10-06).
  let styleIn;
  const styleHeld = new Promise((r) => (styleIn = r));
  let tilesIn;
  const tilesHeld = new Promise((r) => (tilesIn = r));
  let tilesAsked = 0;
  await ap.route(/tiles\.openfreemap\.org\/styles\//, async (route) => {
    await styleHeld;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: 8,
        sources: {
          held: {
            type: 'vector',
            tiles: ['https://tiles.openfreemap.org/held/{z}/{x}/{y}.pbf'],
            maxzoom: 14,
          },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#eee' } },
          { id: 'held', type: 'line', source: 'held', 'source-layer': 'transportation' },
        ],
      }),
    });
  });
  await ap.route(/tiles\.openfreemap\.org\/held\//, async (route) => {
    tilesAsked++;
    await tilesHeld;
    // An empty tile: nothing to draw, nothing to ask again.
    await route.fulfill({
      status: 200,
      contentType: 'application/x-protobuf',
      body: Buffer.alloc(0),
    });
  });
  await ap.goto(`${BASE}/`, { waitUntil: 'load' });
  await ap.waitForSelector('[data-directions]', { timeout: 30000 }).catch(() => {});
  const app = await loadingLook(ap);
  check(
    '  the app takes it over unchanged: its own, alone, the same gray, text and place',
    app.count === 1 && app.text === own.text && app.at === own.at && app.gray === own.gray,
    `page: ${own.text} at ${own.at} on ${own.gray} | app: ${app.count} of them, ${app.text} at ${app.at} on ${app.gray}`,
  );
  styleIn();
  const lift = await ap
    .waitForFunction(() => window.__lift, null, { timeout: 30000 })
    .then((h) => h.jsonValue())
    .catch(() => null);
  const asked = tilesAsked;
  check(
    "  and it goes at the first frame that draws the routes, the basemap's tiles still on their way: before the map's 'load' (the owner's answer to A)",
    !!lift && !lift.loaded && lift.drawn > 0 && asked > 0,
    lift
      ? `gone at ${lift.at} ms, ${lift.loaded ? "after the map's 'load'" : "before the map's 'load'"}, ${lift.drawn} route(s) drawn; ${asked} basemap tile(s) held`
      : `never gone; ${asked} basemap tile(s) held`,
  );
  tilesIn();
  await ap
    .waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
    .catch(() => {});
  const gone = await loadingLook(ap);
  const loaded = await ap.evaluate(() => !!window.__map);
  check(
    "  and stays gone through the map's 'load'",
    loaded && gone.count === 0,
    `'load' ${loaded ? 'came' : 'never came'}; ${gone.count} left`,
  );
  await ap.close();
}

// ------------------------------------------------------------------- the data
const snapshot = await page.evaluate(async () => {
  const routesFC = await window.__src('saved-routes');
  const hotspotsFC = await window.__src('saved-stops');
  // Each direction's full line, as the page reads it for a lit direction
  // (map-file.ts): the source holds overviews until then, and where two routes
  // share a road is found on the lines themselves, as before the index.
  const { fetchLine } = await import('/src/features/published-map/api/fetch-line.ts');
  const routes = [];
  for (const f of routesFC?.features ?? []) {
    if (f.geometry.type !== 'LineString' || f.geometry.coordinates.length < 2) continue;
    const full = await fetchLine(f.properties.id).catch(() => null);
    routes.push({
      id: f.properties.id,
      routeId: f.properties.route_id,
      signboard: f.properties.name ?? '',
      coords: full?.coordinates ?? f.geometry.coordinates,
    });
  }
  return {
    routes,
    polys: (hotspotsFC?.features ?? [])
      .filter((f) => f.geometry.type === 'Polygon')
      .map((f) => ({
        id: f.properties.id,
        kind: f.properties.kind,
        name: f.properties.name,
        ring: f.geometry.coordinates[0],
      })),
  };
});
for (const r of snapshot.routes) r.bbox = bboxOf(r.coords);
console.log(
  `\n(${snapshot.routes.length} route directions, ${snapshot.polys.length} hotspots on the map today)\n`,
);

// What the features do not carry — each direction's way round, its name and
// its route's two end hotspots — from the published index, through the page's
// own reader (overviews as the lines: only whether one is drawn is asked).
const published = await page.evaluate(() =>
  import('/src/features/published-map/api/fetch-index.ts')
    .then((f) => f.fetchIndex())
    .catch(() => null),
);
const fileDirections = published?.directions ?? [];
/**
 * What a trip on direction `id` lists behind its ‹ when it was opened on its
 * own (the owner's ask, 2026-09-29): the directions, drawn and the same way
 * round, of its route and of every route sharing its head or its tail — its
 * own included. The trip has ‹ when that is more than itself.
 */
const fanOf = (id) => {
  const v = fileDirections.find((d) => d.id === id);
  if (!v) return [];
  const { head_stop_id: head, tail_stop_id: tail } = v.route;
  const shares = (d) =>
    d.route_id === v.route_id ||
    (!!head && d.route.head_stop_id === head) ||
    (!!tail && d.route.tail_stop_id === tail);
  return fileDirections.filter(
    (d) => d.reversed === v.reversed && (d.shape?.coordinates?.length ?? 0) > 1 && shares(d),
  );
};

/** Every tap below is made at this zoom, so the map keeps one scale throughout. */
const ZOOM = 16;

// --------------------------------------------------------------- page helpers
const canvasBox = () => page.locator('canvas.maplibregl-canvas').boundingBox();
// A jump is done when the map is idle again, not half a second later: on a
// GitHub runner the zoom-18 tiles were still arriving 500 ms after the jump,
// and a tap then hit a route beside a hotspot instead of the hotspot (the
// second CI run, 2026-09-25). The desktop suite has always waited for `idle`.
const jumpTo = async (p, center, zoom = ZOOM) => {
  await p.evaluate(
    ([c, z]) =>
      new Promise((r) => {
        const m = window.__map;
        m.jumpTo({ center: c, zoom: z });
        m.once('idle', r);
        setTimeout(r, 10000);
      }),
    [center, zoom],
  );
  await p.waitForTimeout(300);
};
/**
 * How many features `layer` draws at canvas point `xy` once it draws any,
 * polled for up to `ms`; 0 if it never does, -1 if there is no such layer.
 * A tap is made on what is on the screen: on a GitHub runner, a phone at
 * three device pixels per CSS pixel draws so slowly that a hotspot's box was
 * not there yet when the finger came, and the tap hit only the route beside
 * it (the third CI run, 2026-09-25).
 */
const drawnAt = async (layer, xy, ms = 10000) => {
  const until = Date.now() + ms;
  for (;;) {
    const n = await page.evaluate(
      ([l, q]) =>
        window.__map.getLayer(l)
          ? window.__map.queryRenderedFeatures(q, { layers: [l] }).length
          : -1,
      [layer, xy],
    );
    if (n !== 0 || Date.now() > until) return n;
    await page.waitForTimeout(150);
  }
};
const project = (p, lngLat) =>
  p.evaluate((c) => {
    const q = window.__map.project(c);
    return [q.x, q.y];
  }, lngLat);
const unproject = (p, xy) =>
  p.evaluate((q) => {
    const c = window.__map.unproject(q);
    return [c.lng, c.lat];
  }, xy);
/**
 * Unit vector perpendicular to the line a→b, in screen pixels, pointing to the
 * side where a step of `away` px ends up farthest from the whole of `line`.
 * At a bend the route's own next stretch can lie a few pixels off one side, so
 * "20 px beside the line" would really be 10 px from it there.
 */
const perpendicular = (p, a, bPt, line = [a, bPt], away = 20) =>
  p.evaluate(
    ([u, v, coords, step]) => {
      const m = window.__map;
      const s = m.project(u);
      const t = m.project(v);
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const len = Math.hypot(dx, dy) || 1;
      const n = [-dy / len, dx / len];
      const pts = coords.map((c) => m.project(c));
      const segD = (q, e, f) => {
        const ex = f.x - e.x,
          ey = f.y - e.y;
        const k = Math.max(
          0,
          Math.min(1, ((q.x - e.x) * ex + (q.y - e.y) * ey) / (ex * ex + ey * ey || 1)),
        );
        return Math.hypot(q.x - e.x - k * ex, q.y - e.y - k * ey);
      };
      const clearance = (sign) => {
        const q = { x: s.x + n[0] * step * sign, y: s.y + n[1] * step * sign };
        let d = Infinity;
        for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, segD(q, pts[i], pts[i + 1]));
        return d;
      };
      const sign = clearance(1) >= clearance(-1) ? 1 : -1;
      return [n[0] * sign, n[1] * sign];
    },
    [a, bPt, line, away],
  );

const card = () => page.locator('[data-testid="card"]');
// Every sheet locator is scoped to the card — never to the page — so the
// route list, which is `chooser`, never answers for it. Every card is the
// one BottomSheet since the owner's ask of 2026-09-30 ("make it a universal
// rule as component"), a hotspot's and a trip's alike, with its handle,
// `dock-handle` — a trip's card with its rail of stops in it
// (RouteTripDetail, 2026-09-29), named for its direction, "Tala → Novaliches".
const handle = () => card().locator('button[data-testid="dock-handle"]');
const trip = () => card().locator('[data-testid="trip"]');
const tripLabel = async () =>
  (await trip().count()) ? ((await card().first().getAttribute('aria-label')) ?? '') : '';
const tripRow = async (id) => {
  const row = card().locator(`[data-testid="${id}"]`);
  return (await row.count()) ? (await row.first().innerText()).replace(/\s+/g, ' ').trim() : '';
};

/**
 * A trip card's own parts, on whichever trip is open: its Kilometer and
 * Expected fare tiles (the owner's 3778:3183), its hintuans folding into one
 * row that opens and folds again (a lone hintuan is shown as it is), and
 * SWITCH turning it round. Run where a trip opens — a lone route's tap, a row
 * of the route list — as today's data allows.
 */
const tripChecks = async () => {
  // Two tiles under the card: the whole ride's length and pesos, as the app's
  // own sums give them on the published line (read from the dev server's
  // modules; a server that cannot serve them skips the check). The pesos
  // left the rail for their tile with this set.
  const [tripId] = (await litIds(page)) ?? [];
  const want = await page.evaluate(async (id) => {
    try {
      const [{ rideFare }, { kmLabel, lineLength }, { directionLine }] = await Promise.all([
        import('/src/features/routes/model/fares.ts'),
        import('/src/shared/utils/geo.ts'),
        import('/src/features/routes/model/routes.ts'),
      ]);
      // The direction with its full line, as the page reads them (map-file.ts).
      const { fetchIndex } = await import('/src/features/published-map/api/fetch-index.ts');
      const { fetchLine } = await import('/src/features/published-map/api/fetch-line.ts');
      const found = (await fetchIndex()).directions.find((x) => x.id === id);
      const v = found && { ...found, shape: (await fetchLine(id)) ?? found.shape };
      const metres = v && lineLength(directionLine(v));
      return v ? { km: kmLabel(metres), fare: rideFare(v.route?.mode, metres) ?? null } : null;
    } catch {
      return null;
    }
  }, tripId);
  const tile = async (id) => {
    const t = card().locator(`[data-testid="${id}"]`);
    return (await t.count()) ? (await t.first().innerText()).trim() : null;
  };
  const [km, fare] = [await tile('trip-km'), await tile('trip-fare')];
  if (!want)
    skip(
      '  its tiles: the Kilometer and Expected fare of the whole ride',
      'the sums cannot be read from this server',
    );
  else
    check(
      '  its tiles: the Kilometer and Expected fare of the whole ride',
      km === want.km && fare === want.fare,
      `"${km}" / "${fare}", the sums "${want.km}" / "${want.fare}"`,
    );

  // The hintuans fold into one row, "N more hintuans"; opened, each is a row
  // of its own, and "View less" folds them again (the owner's 3762:3546,
  // with an s since 3778:3183). A lone hintuan is shown as it is, with
  // nothing to fold.
  const fold = card().locator('button[data-testid="trip-fold"]');
  // The rows in sight: folded ones stay in the card, invisible, so that they
  // can close in view (the fold's motion, 2026-09-29).
  const hintuanRows = () => card().locator('[data-testid="trip-hintuan"]:visible').count();
  /** The rows in sight once the fold has come to rest: it moves for 300 ms at most. */
  const restingRows = async () => {
    await page.waitForTimeout(450);
    return hintuanRows();
  };
  /** How long a row takes to open or fold, as it is now set to. */
  const rowMotion = () =>
    card()
      .locator('[data-testid="trip-hintuan"]')
      .first()
      .evaluate((e) => getComputedStyle(e).transitionDuration);
  if ((await fold.count()) === 0) {
    skip(
      '  its hintuans fold into one row, and open',
      (await hintuanRows()) === 0
        ? 'no hintuan on this direction yet'
        : 'one hintuan on the way, shown as it is: nothing to fold',
    );
  } else {
    const folded = (await fold.first().innerText()).trim();
    const n = Number(/^(\d+) more hintuans$/.exec(folded)?.[1] ?? NaN);
    // The rows' insides, drawn: none on a card just opened, folded, every
    // one from the first opening on (the cheap-phone plan, step 11, 2026-10-04).
    const drawnRows = () => card().locator('[data-testid="trip-hintuan-pick"]').count();
    const drawnFolded = await drawnRows();
    await buttonTap(
      fold,
      async () => (await fold.first().getAttribute('aria-expanded')) === 'true',
    );
    const opening = await rowMotion();
    const shown = await restingRows();
    check(
      '  its hintuans fold into one row, "N more hintuans", that opens to N rows',
      n > 1 && shown === n && (await fold.first().innerText()).includes('View less'),
      `"${folded}" opened to ${shown} row(s)`,
    );
    const drawnOpen = await drawnRows();
    await buttonTap(
      fold,
      async () => (await fold.first().getAttribute('aria-expanded')) === 'false',
    );
    const folding = await rowMotion();
    check(
      '  "View less" folds them again',
      (await restingRows()) === 0 && (await fold.first().innerText()).trim() === folded,
      await fold.first().innerText(),
    );
    // The Motion tokens: open over gentle, fold over base (the owner's "try it").
    check(
      '  the rows open over 300 ms and fold over 200 ms',
      opening.startsWith('0.3s') && folding.startsWith('0.2s'),
      `${opening} / ${folding}`,
    );
    const drawnAgain = await drawnRows();
    check(
      '  folded rows are drawn only once opened, and stay drawn to fold in view',
      drawnFolded === 0 && drawnOpen === n && drawnAgain === n,
      `${drawnFolded} drawn folded as the card opened, ${drawnOpen} opened, ${drawnAgain} folded again, of ${n}`,
    );
  }

  // A hintuan's row picks it (the owner's Timeline State=Selected,
  // 2026-09-29): that one row Selected, its name Black, a pill with the pesos
  // from where the trip leaves to there — the app's own sums over rideCut's
  // metres on the published line — in the card's own colours swapped; the
  // tiles keep the whole ride; the route left whole on the map, and a circle
  // popping up at the hintuan in the trip's rail colour (the owner's ask of
  // 2026-09-30: "now I don't want to cut the route"), no get-off circles,
  // the camera gliding the hintuan clear of the card, and no padding left
  // on the map; a second tap lets it go, circle and all. Checked
  // once, on the first trip with a hintuan; it is picked again after, for
  // SWITCH, ✕ or ‹ to let go.
  let picked = false;
  const rows = card().locator('[data-testid="trip-hintuan"]');
  if (!picksChecked && (await rows.count()) > 0) {
    picksChecked = true;
    if ((await fold.count()) > 0) {
      await buttonTap(
        fold,
        async () => (await fold.first().getAttribute('aria-expanded')) === 'true',
      );
      await page.waitForTimeout(450);
    }
    const row = rows.nth(Math.floor(((await rows.count()) - 1) / 2));
    const rowId = await row.getAttribute('data-hintuan');
    const pickWant = await page.evaluate(
      async ([id, rowId]) => {
        try {
          const [{ rideFare }, { rideCut }, { kmLabel }] = await Promise.all([
            import('/src/features/routes/model/fares.ts'),
            import('/src/features/routes/model/ride.ts'),
            import('/src/shared/utils/geo.ts'),
          ]);
          const { fetchIndex } = await import('/src/features/published-map/api/fetch-index.ts');
          const { fetchLine } = await import('/src/features/published-map/api/fetch-line.ts');
          const m = await fetchIndex();
          const found = m.directions.find((x) => x.id === id);
          const v = found && { ...found, shape: (await fetchLine(id)) ?? found.shape };
          const cut = v && rideCut(v, m.hotspots, rowId);
          return cut
            ? {
                fare: rideFare(v.route?.mode, cut.metres) ?? null,
                km: kmLabel(cut.metres),
                at: cut.at,
              }
            : null;
        } catch {
          return null;
        }
      },
      [tripId, rowId],
    );
    const pickButton = row.locator('button[data-testid="trip-hintuan-pick"]');
    const isPicked = async () => (await row.getAttribute('data-state')) === 'selected';
    await pickButton.scrollIntoViewIfNeeded();
    await page
      .waitForFunction(() => !window.__map.isMoving(), null, { timeout: 3000 })
      .catch(() => {});
    const camBeforePick = await camNow();
    await buttonTap(pickButton, isPicked);
    const selectedRows = await card()
      .locator('[data-testid="trip-hintuan"][data-state="selected"]')
      .count();
    const weight = await pickButton.evaluate(
      (b) => getComputedStyle(b.lastElementChild.firstElementChild).fontWeight,
    );
    check(
      '  a hintuan row picks it: that one row Selected, its name Black',
      (await isPicked()) &&
        selectedRows === 1 &&
        weight === '900' &&
        (await pickButton.getAttribute('aria-pressed')) === 'true',
      `${selectedRows} Selected, weight ${weight}`,
    );
    const pill = row.locator('[data-testid="trip-hintuan-fare"]');
    const pillText = (await pill.count()) ? (await pill.first().innerText()).trim() : null;
    // The pill and the fare tile both hold the pesos to there (the owner,
    // 2026-09-30: the pill's "Calculated Fare" gave way to its value).
    const pickedTile = await tile('trip-fare');
    if (!pickWant)
      skip(
        '  its pill and the fare tile the pesos from where the trip leaves to there',
        'the sums cannot be read from this server',
      );
    else if (pickWant.fare == null)
      skip(
        '  its pill and the fare tile the pesos from where the trip leaves to there',
        'an unpriced route shows no pill',
      );
    else
      check(
        '  its pill and the fare tile the pesos from where the trip leaves to there',
        pillText === pickWant.fare && pickedTile === pickWant.fare,
        `pill "${pillText}"; tile "${pickedTile}", the sums "${pickWant.fare}"`,
      );
    const colours = await page.evaluate(() => {
      const pill = document.querySelector('[data-testid="trip-hintuan-fare"]');
      const trip = document.querySelector('[data-testid="trip"]');
      if (!pill || !trip) return null;
      const [p, t] = [getComputedStyle(pill), getComputedStyle(trip)];
      return {
        swapped: p.backgroundColor === t.color && p.color === t.backgroundColor,
        detail: `${p.color} on ${p.backgroundColor}; the card ${t.color} on ${t.backgroundColor}`,
      };
    });
    if (pickWant && pickWant.fare == null)
      skip("  in the card's own colours, swapped", 'an unpriced route shows no pill');
    else
      check(
        "  in the card's own colours, swapped",
        !!colours?.swapped,
        colours?.detail ?? 'no pill',
      );
    // The Kilometer tile follows the pick too (the owner, 2026-09-30).
    const pickedKm = await tile('trip-km');
    if (!pickWant)
      skip(
        '  the Kilometer tile the ride from where the trip leaves to there',
        'the sums cannot be read from this server',
      );
    else
      check(
        '  the Kilometer tile the ride from where the trip leaves to there',
        pickedKm === pickWant.km,
        `"${pickedKm}", the sums "${pickWant.km}"`,
      );
    // The glide starts after the card has drawn the pick: let it start, then end.
    await page.waitForTimeout(200);
    await page
      .waitForFunction(() => !window.__map.isMoving(), null, { timeout: 3000 })
      .catch(() => {});
    const drawn = await page.evaluate(async (at) => {
      const m = window.__map;
      const pins = [...document.querySelectorAll('[data-testid="hintuan-pin"]')];
      const pin = pins[0];
      const trip = document.querySelector('[data-testid="trip"]');
      const ring = pin?.firstElementChild;
      // The circle's centre on the screen, and the hintuan's.
      const r = pin?.getBoundingClientRect();
      const c = m.getCanvas().getBoundingClientRect();
      const q = at && m.project(at);
      // The rail's colour: the card's Card/<livery>/Timeline/surface.
      // Its plain class: a row's Pressed carries the same name behind `active:`.
      const dot =
        trip &&
        [...trip.querySelectorAll('*')].find((e) =>
          [...e.classList].some((c) => /^bg-card-[a-z]+-timeline-surface$/.test(c)),
        );
      return {
        lit: (await window.__lit('saved-routes')) ?? [],
        rest: ((await window.__src('ride-rest'))?.features ?? []).length,
        restLayer: !!m.getLayer('ride-rest-line'),
        pins: pins.length,
        off:
          r && q
            ? Math.hypot(
                r.left + r.width / 2 - (c.left + q.x),
                r.top + r.height / 2 - (c.top + q.y),
              )
            : null,
        ring: ring ? getComputedStyle(ring).backgroundColor : null,
        rail: dot ? getComputedStyle(dot).backgroundColor : null,
        livery: pin?.dataset.livery ?? null,
        tripLivery: trip?.dataset.livery ?? null,
        taps: pin ? getComputedStyle(pin).pointerEvents : null,
        dots: document.querySelectorAll('[data-testid="ride-dot"]').length,
        padding: Object.values(m.getPadding()).every((v) => v === 0),
      };
    }, pickWant?.at ?? null);
    check(
      '  the map: the trip still lit and whole — nothing drawn at rest over it',
      drawn.lit.length === 1 && drawn.lit[0] === tripId && drawn.rest === 0 && !drawn.restLayer,
      `${drawn.lit.length} lit; ${drawn.rest} stretch(es) at rest; the rest layer ${drawn.restLayer ? 'there' : 'never added'}`,
    );
    check(
      "  a circle pops up at the hintuan, in the trip's rail colour, taking no taps",
      drawn.pins === 1 &&
        (!pickWant || (drawn.off !== null && drawn.off < 2)) &&
        drawn.livery === drawn.tripLivery &&
        !!drawn.ring &&
        (!drawn.rail || drawn.ring === drawn.rail) &&
        drawn.taps === 'none',
      `${drawn.pins} circle(s), ${drawn.off === null ? 'not measured' : Math.round(drawn.off) + ' px'} off the hintuan; ${drawn.livery} ring ${drawn.ring}, the rail ${drawn.rail}; pointer-events ${drawn.taps}`,
    );
    check('  no get-off circles on the public map', drawn.dots === 0, `${drawn.dots}`);
    // Beside the circle, the hintuan's name in the trip card's colours
    // (SelectedHintuanRouteTitle, Figma 3847:11777): 10px right of it and
    // centred on it.
    const rowName = (
      await pickButton.evaluate((b) => b.lastElementChild.firstElementChild.textContent)
    ).trim();
    const title = await page.evaluate(() => {
      const t = document.querySelector('[data-testid="hintuan-pin-title"]');
      const pin = document.querySelector('[data-testid="hintuan-pin"]');
      const trip = document.querySelector('[data-testid="trip"]');
      if (!t || !pin || !trip) return null;
      const [a, b] = [t.getBoundingClientRect(), pin.getBoundingClientRect()];
      const [ts, cs] = [getComputedStyle(t), getComputedStyle(trip)];
      return {
        text: t.textContent.trim(),
        colours: ts.backgroundColor === cs.backgroundColor && ts.color === cs.color,
        detail: `${ts.color} on ${ts.backgroundColor}; the card ${cs.color} on ${cs.backgroundColor}`,
        gap: a.left - b.right,
        drop: a.top + a.height / 2 - (b.top + b.height / 2),
      };
    });
    check(
      "  its name beside the circle, in the trip card's colours",
      !!title &&
        title.text === rowName &&
        title.colours &&
        Math.abs(title.gap - 10) < 1.5 &&
        Math.abs(title.drop) < 1.5,
      title
        ? `"${title.text}" for "${rowName}"; ${title.detail}; ${title.gap.toFixed(1)} px right, ${title.drop.toFixed(1)} px low`
        : 'no title',
    );
    // The ride ends at the hintuan now (SelectedHintuanRouteTitle, Figma
    // 3848:12135): End over its name, and the route's own tail keeps its
    // name without the word.
    const words = await page.evaluate(() => {
      const t = document.querySelector('[data-testid="hintuan-pin-title"]');
      const badge = t?.parentElement?.querySelector('[data-part="badge"]');
      const word = (end) =>
        document
          .querySelector(`[data-testid="end-title"][data-end="${end}"] [data-part="badge"]`)
          ?.textContent.trim() ?? null;
      const tails = document.querySelectorAll(
        '[data-testid="end-title"][data-end="tail"] [data-part="name"]',
      ).length;
      if (!t || !badge) return { pin: null, head: word('head'), tail: word('tail'), tails };
      const [a, b] = [badge.getBoundingClientRect(), t.getBoundingClientRect()];
      return {
        pin: badge.textContent.trim(),
        over: b.top - a.bottom,
        centred: a.left + a.width / 2 - (b.left + b.width / 2),
        head: word('head'),
        tail: word('tail'),
        tails,
      };
    });
    check(
      '  End over its name, Start still over the start, the tail named without End',
      words.pin === 'End' &&
        Math.abs(words.over - 4) < 1.5 &&
        Math.abs(words.centred) < 1.5 &&
        words.head === 'Start' &&
        words.tail === null &&
        words.tails > 0,
      `pin "${words.pin}" ${words.over?.toFixed(1)} px over, ${words.centred?.toFixed(1)} px off centre; head "${words.head}", tail "${words.tail}", ${words.tails} tail name(s)`,
    );
    if (pickWant) {
      const where = await page.evaluate((at) => {
        const m = window.__map;
        const c = m.getCanvas().getBoundingClientRect();
        const q = m.project(at);
        const d = document.querySelector('[data-testid="card"]').getBoundingClientRect();
        return {
          x: c.left + q.x,
          y: c.top + q.y,
          left: c.left,
          right: c.right,
          top: c.top,
          cardTop: d.top,
        };
      }, pickWant.at);
      check(
        '  the camera glides it into the map above the card',
        where.y > where.top + 16 &&
          where.y < where.cardTop - 16 &&
          where.x > where.left + 16 &&
          where.x < where.right - 16,
        `at ${Math.round(where.x)},${Math.round(where.y)}; the map ${Math.round(where.top)}–${Math.round(where.cardTop)} above the card`,
      );
    }
    check('  and leaves no padding on the map for later moves', drawn.padding);
    // In to where the scale bar reads 500 m; a second tap takes the camera
    // back where it was before the pick (the owner's ask, 2026-10-02).
    if (pickWant) {
      const zoomed = await camNow();
      const want = await page.evaluate(
        async (lat) => (await import('/src/shared/utils/geo.ts')).zoomForScale(500, lat),
        zoomed.lat,
      );
      check(
        '  zoomed in to 500 m on the scale bar',
        Math.abs(zoomed.zoom - want) < 0.05,
        `zoom ${zoomed.zoom.toFixed(2)}, want ${want.toFixed(2)}`,
      );
    }
    await buttonTap(pickButton, async () => !(await isPicked()));
    await page.waitForTimeout(300);
    await page
      .waitForFunction(() => !window.__map.isMoving(), null, { timeout: 3000 })
      .catch(() => {});
    const camAfterLetGo = await camNow();
    check(
      '  and let go, the camera back where it was before the pick',
      Math.abs(camAfterLetGo.zoom - camBeforePick.zoom) < 0.01 &&
        Math.abs(camAfterLetGo.lng - camBeforePick.lng) < 1e-6 &&
        Math.abs(camAfterLetGo.lat - camBeforePick.lat) < 1e-6,
      JSON.stringify({ camBeforePick, camAfterLetGo }),
    );
    const letGo = await page.evaluate(async () => ({
      pins: document.querySelectorAll('[data-testid="hintuan-pin"]').length,
      lit: (await window.__lit('saved-routes')) ?? [],
    }));
    check(
      '  a second tap lets it go: no pill, no circle, the trip still lit, both tiles the whole ride again',
      !(await isPicked()) &&
        (await pill.count()) === 0 &&
        letGo.pins === 0 &&
        letGo.lit.length === 1 &&
        (await tile('trip-fare')) === fare &&
        (await tile('trip-km')) === km,
      `${letGo.pins} circle(s), ${letGo.lit.length} lit; tiles "${await tile('trip-km')}", "${await tile('trip-fare')}", the whole "${km}", "${fare}"`,
    );
    // At Max the card stays at Max (the owner's ask, 2026-10-01: "since the
    // card can settle anywhere, don't move the bottomsheet to the middle"),
    // the hintuan landing above where Middle would be, there to see when the
    // card comes down. Let go again after, for the ends below.
    await buttonTap(handle(), async () => (await sheetState()) === 'max');
    if ((await sheetState()) !== 'max') {
      skip(
        '  picked at Max, the card stays at Max, the hintuan above where Middle would be',
        `the card would not rise to Max: data-snap=${await sheetState()}`,
      );
    } else {
      await pickButton.scrollIntoViewIfNeeded();
      await buttonTap(pickButton, isPicked);
      await page.waitForTimeout(200);
      await page
        .waitForFunction(() => !window.__map.isMoving(), null, { timeout: 3000 })
        .catch(() => {});
      const stayed = await sheetState();
      const spot = pickWant
        ? await page.evaluate((at) => {
            const m = window.__map;
            const c = m.getCanvas().getBoundingClientRect();
            const q = m.project(at);
            return { y: c.top + q.y, top: c.top, cardTop: c.bottom - Math.round(c.height * 0.45) };
          }, pickWant.at)
        : null;
      check(
        '  picked at Max, the card stays at Max, the hintuan above where Middle would be',
        (await isPicked()) &&
          stayed === 'max' &&
          (!spot || (spot.y > spot.top + 16 && spot.y < spot.cardTop - 16)),
        `data-snap=${stayed}; ${spot ? `the hintuan at ${Math.round(spot.y)}, the map ${Math.round(spot.top)}–${Math.round(spot.cardTop)} above Middle` : 'not measured'}`,
      );
      await pickButton.scrollIntoViewIfNeeded();
      await buttonTap(pickButton, async () => !(await isPicked()));
      // The card stays at Max now: back to Middle by its handle (round
      // through Low), for the ends below to glide into the map above it.
      if ((await sheetState()) === 'max')
        await buttonTap(handle(), async () => (await sheetState()) === 'low');
      if ((await sheetState()) === 'low')
        await buttonTap(handle(), async () => (await sheetState()) === 'middle');
    }
    // The ends are buttons too (the owner's asks, 2026-09-29): with a
    // hintuan picked, a tap on where the trip goes, then on where it leaves
    // from, picks that end in its place, its dot the Selected one — the hintuan's
    // circle gone, the trip still lit — and glides the map to that end of the
    // line, above the card. Picking the hintuan again lets the end go.
    const ends = await page.evaluate(async (id) => {
      try {
        const { travelLine } = await import('/src/features/routes/model/ride.ts');
        const { fetchIndex } = await import('/src/features/published-map/api/fetch-index.ts');
        const { fetchLine } = await import('/src/features/published-map/api/fetch-line.ts');
        const m = await fetchIndex();
        const found = m.directions.find((x) => x.id === id);
        const line = travelLine(
          { ...found, shape: (await fetchLine(id)) ?? found.shape },
          m.hotspots,
        );
        return line.length > 1 ? { from: line[0], to: line[line.length - 1] } : null;
      } catch {
        return null;
      }
    }, tripId);
    // The camera before the first pick below: a second tap on the end picked
    // last takes it back there, as a hintuan's does (the owner's ask, 2026-10-03).
    const camBeforeEnds = await camNow();
    const originRow = card().locator('[data-testid="trip-origin"] button');
    for (const [end, testId] of [
      ['to', 'trip-destination'],
      ['from', 'trip-origin'],
    ]) {
      const endButton = card().locator(`[data-testid="${testId}"] button`);
      // The last pass scrolled the card to its far end: back to the row first.
      await pickButton.scrollIntoViewIfNeeded();
      await buttonTap(pickButton, isPicked);
      const wasPicked = await isPicked();
      // On the second pass the destination was picked: the hintuan picked
      // again has let it go, before the origin is tapped.
      const destinationBefore = await card()
        .locator('[data-testid="trip-destination"]')
        .first()
        .getAttribute('data-state');
      await endButton.first().scrollIntoViewIfNeeded();
      await buttonTap(endButton, async () => !(await isPicked()));
      await page.waitForTimeout(200);
      await page
        .waitForFunction(() => !window.__map.isMoving(), null, { timeout: 3000 })
        .catch(() => {});
      const destination = await card()
        .locator('[data-testid="trip-destination"]')
        .first()
        .getAttribute('data-state');
      const origin = await card()
        .locator('[data-testid="trip-origin"]')
        .first()
        .getAttribute('data-state');
      // Where the camera brings the end in: above the card, or, with the card
      // left at Max (a runner can drop the handle taps that bring it down),
      // above where Middle would be, as for a hintuan picked at Max.
      const snapNow = await sheetState();
      const after = await page.evaluate(
        async ([at, snap]) => {
          const m = window.__map;
          const c = m.getCanvas().getBoundingClientRect();
          const d = document.querySelector('[data-testid="card"]').getBoundingClientRect();
          const floor = snap === 'max' ? c.bottom - Math.round(c.height * 0.45) : d.top;
          const q = at && m.project(at);
          return {
            pins: document.querySelectorAll('[data-testid="hintuan-pin"]').length,
            lit: (await window.__lit('saved-routes')) ?? [],
            above: q
              ? c.top + q.y > c.top + 16 &&
                c.top + q.y < floor - 16 &&
                q.x > 16 &&
                q.x < c.width - 16
              : null,
            padding: Object.values(m.getPadding()).every((v) => v === 0),
          };
        },
        [ends?.[end] ?? null, snapNow],
      );
      check(
        `  ${end === 'to' ? 'where the trip goes' : 'where it leaves from'}, tapped, is picked in the hintuan's place, its circle gone, the map gliding there above the card`,
        wasPicked &&
          destinationBefore === 'rest' &&
          !(await isPicked()) &&
          destination === (end === 'to' ? 'selected' : 'rest') &&
          origin === (end === 'from' ? 'selected' : 'rest') &&
          after.pins === 0 &&
          after.lit.length === 1 &&
          after.lit[0] === tripId &&
          after.above !== false &&
          after.padding,
        `picked first ${wasPicked}; the destination ${destinationBefore} → ${destination}, the origin ${origin}; ${after.pins} circle(s), ${after.lit.length} lit; in the map above the card ${after.above ?? 'not measured'} (data-snap=${snapNow})`,
      );
      if (ends?.[end]) {
        const zoomed = await camNow();
        const want = await page.evaluate(
          async (lat) => (await import('/src/shared/utils/geo.ts')).zoomForScale(500, lat),
          ends[end][1],
        );
        check(
          '    in to 500 m on the scale bar, as a hintuan is',
          Math.abs(zoomed.zoom - want) < 0.05,
          `zoom ${zoomed.zoom.toFixed(2)}, want ${want.toFixed(2)}`,
        );
      }
    }
    await originRow.first().scrollIntoViewIfNeeded();
    await buttonTap(
      originRow,
      async () =>
        (await card().locator('[data-testid="trip-origin"]').first().getAttribute('data-state')) ===
        'rest',
    );
    await page.waitForTimeout(300);
    await page
      .waitForFunction(() => !window.__map.isMoving(), null, { timeout: 3000 })
      .catch(() => {});
    const camAfterEnd = await camNow();
    check(
      '  where it leaves from, tapped again, lets go, the camera back where it was before the picks',
      (await card().locator('[data-testid="trip-origin"]').first().getAttribute('data-state')) ===
        'rest' &&
        Math.abs(camAfterEnd.zoom - camBeforeEnds.zoom) < 0.01 &&
        Math.abs(camAfterEnd.lng - camBeforeEnds.lng) < 1e-6 &&
        Math.abs(camAfterEnd.lat - camBeforeEnds.lat) < 1e-6,
      JSON.stringify({ camBeforeEnds, camAfterEnd }),
    );
    // Picked again, for SWITCH — or ✕ and ‹ — to let go.
    await pickButton.scrollIntoViewIfNeeded();
    await buttonTap(pickButton, isPicked);
    picked = await isPicked();
  }

  // SWITCH turns the trip round: the same route, the other way.
  const sw = card().locator('button[data-testid="card-switch"]');
  if ((await sw.count()) === 0 || (await sw.first().isDisabled())) {
    skip(
      '  SWITCH turns the trip round',
      (await sw.count()) === 0
        ? 'no SWITCH on the card'
        : "this route's other way is not drawn yet",
    );
  } else {
    const before = await tripLabel();
    const colour = await trip().first().getAttribute('data-livery');
    await buttonTap(sw, async () => (await tripLabel()) !== before);
    const after = await tripLabel();
    const same = (s) => s.split(' → ').sort().join(' | ');
    check(
      '  SWITCH turns the trip round',
      after !== before && same(after) === same(before),
      `"${before}" → "${after}"`,
    );
    // Turned round, it is the same card: its colour stays (the owner, 2026-09-29).
    const now = await trip().first().getAttribute('data-livery');
    check('  and keeps its colour', !!colour && now === colour, `${colour} → ${now}`);
    if (picked) {
      // Another direction is another ride: the pick does not come with it.
      const pins = await page.evaluate(
        () => document.querySelectorAll('[data-testid="hintuan-pin"]').length,
      );
      const still = await card()
        .locator('[data-testid="trip-hintuan"][data-state="selected"]')
        .count();
      check(
        '  and lets the picked hintuan go',
        pins === 0 && still === 0,
        `${still} Selected, ${pins} circle(s)`,
      );
      picked = false;
    }
  }
  // A hintuan picked on the trip as it is left, for the caller's ✕ or ‹ to
  // let go: SWITCH has let the checked one go.
  if (!picked && (await rows.count()) > 0) {
    if ((await fold.count()) > 0 && (await fold.first().getAttribute('aria-expanded')) !== 'true') {
      await buttonTap(
        fold,
        async () => (await fold.first().getAttribute('aria-expanded')) === 'true',
      );
      await page.waitForTimeout(450);
    }
    const any = card().locator('button[data-testid="trip-hintuan-pick"]:visible').first();
    if ((await any.count()) > 0) {
      const on = async () => (await any.getAttribute('aria-pressed')) === 'true';
      await buttonTap(any, on);
      picked = await on();
    }
  }
  return { picked };
};
/** Whether the hintuan pick has been checked: once, on the first trip with a hintuan. */
let picksChecked = false;
/** The picked hintuan's circle, gone — and no cut or get-off circle, which the public map never draws. */
const noPickLeft = async () =>
  page.evaluate(
    async () =>
      ((await window.__src('ride-rest'))?.features ?? []).length +
        document.querySelectorAll('[data-testid="ride-dot"], [data-testid="hintuan-pin"]')
          .length ===
      0,
  );
const cardText = async () => ((await card().count()) ? await card().first().innerText() : '');
/** The card's height: 'low', 'middle' or 'max' (BottomSheet's data-snap). */
const sheetState = async () =>
  (await card().count()) ? await card().first().getAttribute('data-snap') : null;
/**
 * How far to drag the handle for the sheet to come to rest at `to` from
 * where it is, by the heights BottomSheet gives it: Low 129, Middle 45% of
 * the map, Max all of it but its 24 px strip at the top. Negative is up.
 */
const dragTo = async (from, to) => {
  const h = await card()
    .first()
    .evaluate((el) => el.offsetHeight);
  const shown = { low: 129, middle: Math.round(h * 0.45), max: h - 24 };
  return shown[from] - shown[to];
};
const closeCard = async () => {
  await page
    .getByRole('button', { name: 'Close' })
    .first()
    .click({ timeout: 1500 })
    .catch(() => {});
  // The ✕ can be missed while the page is busy drawing; Escape closes a sheet too.
  for (let i = 0; i < 20 && (await card().count()) > 0; i++) {
    if (i === 5) await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(300);
};
/**
 * Where a route's box lands once the camera stops: a trip opening takes in
 * its whole route, clear of the card (the owner's ask, 2026-10-01). `inside`
 * is every corner on the map and above the card, 2 px either way.
 */
const framedAboveCard = async (bbox, sheet = 'card') =>
  page.evaluate(
    ([[w, s, e, n], sheet]) =>
      new Promise((done) => {
        const m = window.__map;
        const read = () => {
          const c = m.getCanvas().getBoundingClientRect();
          const d = document
            .querySelector(`[data-testid="${sheet}"]:not([hidden])`)
            ?.getBoundingClientRect();
          const nw = m.project([w, n]);
          const se = m.project([e, s]);
          const box = {
            left: c.left + nw.x,
            top: c.top + nw.y,
            right: c.left + se.x,
            bottom: c.top + se.y,
          };
          const floor = d && d.right >= c.right - 1 ? d.top : c.bottom;
          const inside =
            box.left >= c.left - 2 &&
            box.right <= c.right + 2 &&
            box.top >= c.top - 2 &&
            box.bottom <= floor + 2;
          done({
            inside,
            box: Object.fromEntries(Object.entries(box).map(([k, v]) => [k, Math.round(v)])),
            map: [Math.round(c.top), Math.round(c.bottom)],
            width: Math.round(c.width),
            floor: Math.round(floor),
            zoom: +m.getZoom().toFixed(2),
          });
        };
        if (m.isMoving()) m.once('moveend', () => setTimeout(read, 50));
        else read();
        setTimeout(read, 5000);
      }),
    [bbox, sheet],
  );
// The owner's two looks for the lines (2026-09-29): every one opaque in
// Map/RouteLine/surface-default, the lit ones drawn over them in
// …/surface-selected, and no layer shading a line. The hexes are
// map-colours.ts's, read from the dev server; a server that cannot serve it
// is held to two different colours.
const MAP = await page.evaluate(async () => {
  try {
    return (await import('/src/design-system/foundation/map-colours.ts')).MAP_COLOURS;
  } catch {
    return null;
  }
});
const twoLooks = (p, lit = MAP?.['Map/RouteLine/surface-selected']) =>
  !!p &&
  p.shaded.length === 0 &&
  (MAP
    ? p.rest === MAP['Map/RouteLine/surface-default'] && p.lit === lit
    : !!p.rest && p.rest !== p.lit);

// What is lit wears the colour of the card it answers — a picked RouteCard's,
// an open trip's — its chevrons in the card's words' colour and its end
// circles ringed in the line's; with no card picked, the selected blue (the
// owner's ask, 2026-09-29). The looks are livery-line.ts's, read from the dev
// server; a server that cannot serve it skips the colour.
const LOOKS = await page.evaluate(async () => {
  try {
    const m = await import('/src/features/routes/map/livery-line.ts');
    return { byLivery: m.LIVERY_LINE, lit: m.LIT_LINE };
  } catch {
    return null;
  }
});
/** Whether the lit line wears `want` (a LineLook), chevrons and rings too; true when the looks cannot be read. */
const wears = (seen, want) =>
  !LOOKS ||
  (!!want && seen.line === want.line && seen.arrow === want.arrow && seen.ends === want.line);
/** The directions lit now, by id. */
const litIds = (p) => p.evaluate(() => window.__lit('saved-routes'));

// ------------------------------------ 1b. a first tap compiles no GL program
// MapLibre compiles a GL program the first time it draws with it, on the
// main thread: 5-50 ms on a phone, a second and more in a runner's software
// GPU. The first tap that lit a route compiled two as its card came up, the
// end circles' and the orange stretches'. Since 2026-10-04 the stretches are
// drawn with the lit line's program, and the circles' is compiled while the
// map is idle (the cheap-phone plan, steps 2 and 3). So, on the view the map
// opened on with nothing tapped yet: the circles' program is there, and a
// finger on a route line, its card up and the map settled, adds none. Then
// the page is loaded again, for the sections below to start as they did.
{
  const rest = await programsAtRest(page);
  check(
    "at rest, before any tap, the end circles' GL program is compiled (warmPrograms)",
    rest.circle,
    rest.circle
      ? `after ${(rest.ms / 1000).toFixed(1)} s more`
      : `none in ${rest.ms / 1000} s: ${rest.keys.length} programs`,
  );
  // A vertex clear of every hotspot by more than a finger reaches, at the
  // opening view, and the farthest from any other route: a trip where the
  // map allows, else a list; the first that is on the open map.
  const view = await page.evaluate(() => ({
    zoom: window.__map.getZoom(),
    lat: window.__map.getCenter().lat,
  }));
  const reach =
    (20 * Math.SQRT2 + 9) *
    ((40075016.686 * Math.cos((view.lat * Math.PI) / 180)) / (512 * 2 ** view.zoom));
  const spots = [];
  for (const r of snapshot.routes) {
    for (const vi of sampleIndices(r.coords.length, 1500 / Math.max(1, snapshot.routes.length))) {
      const p = r.coords[vi];
      const k = mPerDegLng(p[1]);
      if (distToHotspots(p, snapshot.polys, k) < reach) continue;
      let clear = Infinity;
      for (const o of snapshot.routes) {
        if (o.routeId === r.routeId || distToBbox(p, o.bbox, k) > clear) continue;
        clear = Math.min(clear, distToLine(p, o.coords, k));
      }
      spots.push({ p, clear });
    }
  }
  spots.sort((a, b) => b.clear - a.clear);
  const at = await page.evaluate(
    (ps) => {
      const m = window.__map;
      const c = m.getCanvas().getBoundingClientRect();
      for (const p of ps) {
        const q = m.project(p);
        if (q.x < 40 || q.x > innerWidth - 40 || q.y < 160 || q.y > innerHeight - 160) continue;
        if (
          !document
            .elementFromPoint(c.left + q.x, c.top + q.y)
            ?.classList.contains('maplibregl-canvas')
        )
          continue;
        return [c.left + q.x, c.top + q.y];
      }
      return null;
    },
    spots.slice(0, 400).map((s) => s.p),
  );
  if (!at) {
    skip(
      'a first tap on a route at the opening view compiles no GL program',
      'no route vertex clear of the hotspots on the open map',
    );
    skip(
      "  and asks the map what it landed on once: no hover's queries, one answer for both hooks",
      'no tap',
    );
  } else {
    // Every query of the rendered features, until the click's last listener
    // (added after the app's two, so it hears the click after them). The
    // page is loaded again below, which puts the map's own back.
    await page.evaluate(() => {
      const m = window.__map;
      const query = m.queryRenderedFeatures;
      window.__queries = 0;
      window.__queriesByClick = null;
      m.queryRenderedFeatures = function (...args) {
        window.__queries++;
        return query.apply(this, args);
      };
      m.on('click', () => {
        window.__queriesByClick ??= window.__queries;
      });
    });
    await mapTap(at[0], at[1]);
    const shown = page.locator(
      '[data-testid="card"]:not([hidden]), [data-testid="chooser"]:not([hidden])',
    );
    await shown
      .first()
      .waitFor({ state: 'visible', timeout: 10000 })
      .catch(() => {});
    const opened = (await page.locator('[data-testid="chooser"]:not([hidden])').count())
      ? 'the route list'
      : (await trip().count())
        ? 'a trip'
        : (await card().count())
          ? 'a card'
          : 'nothing';
    const { added, standIn } = await programsSince(page, rest.keys);
    check(
      'a first tap on a route at the opening view compiles no GL program',
      opened !== 'nothing' && added.length === 0,
      `${opened} opened; ${added.length} added${added.length ? ': ' + added.join(', ') : ''}` +
        (standIn.length
          ? `; and ${standIn.length} a real basemap compiles at load, which the stand-in does not: ${standIn.map((k) => k.split('/')[0]).join(', ')}`
          : ''),
    );
    // A finger cannot hover, so the routes' and the hotspots' hooks ask
    // nothing as it moves (bindHover, tap.ts), and the tap's question —
    // inside a box? a route in the finger's box? a box near it? — is asked
    // once, by the first hook, and kept for the second (tap.ts): three
    // queries at most.
    // Until 2026-10-04 a tap on a route asked eight: four for the hover
    // pairs on the mousemove a touch makes, and two by each hook (the
    // cheap-phone plan, step 7).
    const queries = await page.evaluate(() => window.__queriesByClick);
    check(
      "  and asks the map what it landed on once: no hover's queries, one answer for both hooks",
      queries !== null && queries <= 3,
      queries === null
        ? 'the map heard no click'
        : `${queries} queries of the rendered features by the end of the click`,
    );
  }
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 });
  await waitForSource(page, 'saved-routes');
  await page.waitForTimeout(1200);
}

// How far a pixel reaches on the ground — measured off the map, not looked up.
// MapLibre serves 512 px tiles, so its zoom 16 is the scale a 256 px table calls
// 17: about 1.2 m per CSS pixel here, half what the table says. Every metre
// threshold below is written against this, so they stay right if ZOOM changes.
await jumpTo(page, snapshot.routes[0]?.coords[0] ?? [121.0244, 14.5995]);
const M_PER_PX = await page.evaluate(() => {
  const m = window.__map;
  const a = m.unproject([0, 0]);
  const c = m.unproject([100, 0]);
  const k = 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((c.lng - a.lng) * k, (c.lat - a.lat) * 110574) / 100;
});
/** How far the coarse ±20 px tap box reaches on the ground, in metres. */
const BOX_M = 20 * M_PER_PX;
/** Where the negative control taps: 40 px off the line. */
const FAR_M = 40 * M_PER_PX;
console.log(
  `(at zoom ${ZOOM} a pixel is ${M_PER_PX.toFixed(2)} m, so the ±20 px tap box reaches ${Math.round(BOX_M)} m)\n`,
);

/**
 * The direction an open trip card shows: with a trip open only it is lit.
 * Its name, the card's label, is the fallback; two directions can share a
 * name (a via is not in it), so it is not the first resort.
 */
const openedDirection = async () => {
  if (!(await trip().count())) return null;
  const lit = (await litIds(page)) ?? [];
  if (lit.length === 1) return fileDirections.find((d) => d.id === lit[0]) ?? null;
  const label = await tripLabel();
  return label ? (fileDirections.find((d) => d.direction_name === label) ?? null) : null;
};

/**
 * Opens direction `d`'s trip on its own from a fresh page, as a visitor would:
 * a tap on its line where nothing else runs — the vertex with the most room
 * from every other line and every box, more than a tap reaches (the box's
 * corner, 20√2 px, and half the hit line's width, at the suite's zoom). Its
 * own way back may share the road where `d` is the way out: a tap there opens
 * the way out (route-taps.ts, the outbound rule). The trip links that opened a
 * given trip went on 2026-10-03; false when no vertex has the room, or the
 * card opened is another.
 */
async function openAlone(d) {
  const r = snapshot.routes.find((o) => o.id === d.id);
  if (!r) return false;
  const reach = (20 * Math.SQRT2 + 9) * M_PER_PX;
  let best = null;
  for (const vi of sampleIndices(r.coords.length, 400)) {
    const p = r.coords[vi];
    const k = mPerDegLng(p[1]);
    if (distToHotspots(p, snapshot.polys, k) < reach) continue;
    let clear = Infinity;
    for (const o of snapshot.routes) {
      if (
        o.id === r.id ||
        (!d.reversed && o.routeId === r.routeId) ||
        distToBbox(p, o.bbox, k) > clear
      )
        continue;
      clear = Math.min(clear, distToLine(p, o.coords, k));
    }
    if (!best || clear > best.clear) best = { p, clear };
  }
  if (!best || best.clear < reach) return false;
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 });
  await waitForSource(page, 'saved-routes');
  await jumpTo(page, best.p);
  const at = await project(page, best.p);
  const box = await canvasBox();
  await mapTap(box.x + at[0], box.y + at[1]);
  await trip()
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => {});
  await page.waitForTimeout(2000);
  return (await openedDirection())?.id === d.id;
}

// ------------------------------------------------ 2. a forgiving tap, ±20 px
// Route A: the vertex with the most clearance from every other route's line,
// and clear of the hotspot polygons, so only one thing can possibly be there.
let routeA = null;
if (snapshot.routes.length === 0) {
  skip('a tap 14 px beside a lone route line selects it', 'no saved routes on the map today');
} else {
  let best = null;
  for (const [ri, r] of snapshot.routes.entries()) {
    for (const vi of sampleIndices(r.coords.length, 1500 / snapshot.routes.length)) {
      const p = r.coords[vi];
      const k = mPerDegLng(p[1]);
      let clear = Infinity;
      for (const [oi, o] of snapshot.routes.entries()) {
        if (oi === ri) continue;
        if (distToBbox(p, o.bbox, k) > clear) continue;
        const d = distToLine(p, o.coords, k);
        if (d < clear) clear = d;
      }
      if (clear < 60) continue;
      if (distToHotspots(p, snapshot.polys, k) < 60) continue;

      // Which way the line runs here. A route's vertices can be metres apart, so
      // the immediate neighbour gives a direction that is mostly rounding noise
      // — walk along the line until the neighbour is far enough to trust.
      const nb = neighbourAtLeast(r.coords, vi, 30, k);
      if (!nb) continue;

      // The negative control taps 40 px out along the perpendicular, so prefer a
      // vertex on a straight stretch: where the line bends back, its own
      // geometry is inside the tap box there and the control cannot run.
      const dx = (nb[0] - p[0]) * k;
      const dy = (nb[1] - p[1]) * M_PER_DEG_LAT;
      const len = Math.hypot(dx, dy) || 1;
      const straight = [1, -1].some((side) => {
        const off = [
          p[0] + ((-dy / len) * FAR_M * side) / k,
          p[1] + ((dx / len) * FAR_M * side) / M_PER_DEG_LAT,
        ];
        const ko = mPerDegLng(off[1]);
        const clearThere = Math.min(
          ...snapshot.routes.map((o) => distToLine(off, o.coords, ko)),
          distToHotspots(off, snapshot.polys, ko),
        );
        return clearThere > BOX_M + 10;
      });
      const score = clear + (straight ? 1e6 : 0);
      if (!best || score > best.score)
        best = { route: r, index: vi, point: p, neighbour: nb, clear, straight, score };
    }
  }
  routeA = best;
}

if (snapshot.routes.length > 0 && !routeA) {
  skip(
    'a tap 14 px beside a lone route line selects it',
    'no route vertex today is 60 m clear of every other route and hotspot',
  );
}

if (routeA) {
  const r = routeA.route;
  const neighbour = routeA.neighbour;
  const desc = `"${r.signboard}" (${Math.round(routeA.clear)} m clear)`;
  await jumpTo(page, routeA.point);
  const anchor = await project(page, routeA.point);
  const perp = await perpendicular(page, routeA.point, neighbour, routeA.route.coords, 40);
  const box = await canvasBox();
  const at = (px) => [box.x + anchor[0] + perp[0] * px, box.y + anchor[1] + perp[1] * px];

  const [tx, ty] = at(14);
  await mapTap(tx, ty);
  await page.waitForTimeout(500);

  const text = await cardText();
  check(
    `a tap 14 px beside a lone route line selects it`,
    (await card().count()) > 0,
    `${desc}; [data-testid="card"] count ${await card().count()}`,
  );
  // The owner's trip card (2026-09-29), named for its direction: it runs from
  // where that leaves (the top row, no pesos on it since 3778:3183) to where
  // it goes (the bottom row). Which way round is the tap's to decide, so the
  // route's two ends are checked, not their order.
  const label = await tripLabel();
  const [from = '', to = ''] = label.split(' → ');
  const origin = await tripRow('trip-origin');
  const end = await tripRow('trip-destination');
  check(
    '  it opens the trip card, from where its direction leaves to where it goes',
    !!from && !!to && origin === from && end === to,
    `"${label}": top "${origin}", bottom "${end}"`,
  );
  // Opened, the camera takes in the whole route, clear of the card.
  const framed = await framedAboveCard(r.bbox);
  check(
    '  the camera takes in the whole route, above the card',
    framed.inside,
    JSON.stringify(framed),
  );
  const routeEnds = r.signboard.split(' – ').map((e) => e.replace(/ via .*$/, ''));
  check(
    "  its ends are the route's two ends",
    routeEnds.length === 2 && routeEnds.every((e) => text.includes(e)),
    r.signboard,
  );
  // Dropped by the owner for now, to design later (2026-09-28). The words
  // signboard went with them; the boards uploaded in the studio came back
  // as pictures under their own heading (3919:11355), left out here.
  const extras = await card()
    .first()
    .evaluate((c) => {
      const k = c.cloneNode(true);
      k.querySelector('[data-testid="trip-signboards"]')?.remove();
      return k.textContent;
    });
  const gone = ['Length', 'Mode', 'Status', 'Share', 'Signboard'].filter((s) => extras.includes(s));
  check(
    "  the old card's extras are gone: no Length, Mode, Status, Share or signboard words",
    text !== '' && gone.length === 0,
    gone.join(', '),
  );

  // The tap opens the route's drawn outbound, whichever direction was under the finger (2026-09-22).
  const sameRoute = snapshot.routes.filter((o) => o.routeId === r.routeId).map((o) => o.id);
  const lit = (await litIds(page)) ?? [];
  check(
    '  one direction of that route is lit',
    lit.length === 1 && sameRoute.includes(lit[0]),
    JSON.stringify(lit),
  );
  // No list is behind it: ‹ only where another route sharing an end is drawn
  // its way round, to list them (the owner's ask, 2026-09-29).
  const fanned = fanOf(lit[0]).length > 1;
  const backShown = (await card().getByRole('button', { name: 'Back' }).count()) > 0;
  check(
    fanned
      ? '  another route sharing an end runs its way, so it has ‹'
      : '  no other route sharing an end runs its way, so no ‹',
    backShown === fanned,
    `‹ ${backShown ? 'shown' : 'not shown'}`,
  );
  const looks = await paintNow(page);
  const openColour = (await trip().count())
    ? await trip().first().getAttribute('data-livery')
    : null;
  check(
    "  the rest stay as they rest, opaque light blue, the trip's line in its card's colour: nothing fades (two looks)",
    twoLooks(looks, LOOKS?.byLivery[openColour]?.line ?? MAP?.['Map/RouteLine/surface-selected']),
    `${openColour}: ${JSON.stringify(looks)}`,
  );
  // Each end named in a pill over its circle, its pointer at the circle, in
  // the line's colour (End&TailRoute, Figma 3848:12135).
  const ends = await page.evaluate(async () => {
    const m = window.__map;
    const named = ((await window.__src('direction-ends'))?.features ?? []).filter(
      (f) => f.properties.named,
    );
    const pills = [...document.querySelectorAll('[data-testid="end-title"]')];
    const ring = m.getPaintProperty('direction-end-circles', 'circle-stroke-color');
    const probe = document.createElement('i');
    probe.style.color = ring;
    document.body.append(probe);
    const ringRgb = getComputedStyle(probe).color;
    probe.remove();
    const c = m.getCanvas().getBoundingClientRect();
    const rows = named.map((f) => {
      const pill = pills.find((p) => p.dataset.name === f.properties.name);
      if (!pill) return { name: f.properties.name, missing: true };
      const namePill = pill.querySelector('[data-part="name"]');
      const badge = pill.querySelector('[data-part="badge"]')?.textContent.trim();
      const box = namePill.getBoundingClientRect();
      const q = m.project(f.geometry.coordinates);
      return {
        name: f.properties.name,
        // Head Route where the ride starts; Tail Route where it goes, its circled arrow first.
        look:
          f.properties.end === 'from'
            ? pill.dataset.end === 'head' &&
              !pill.querySelector('[data-part="arrow"]') &&
              badge === 'Start'
            : pill.dataset.end === 'tail' &&
              !!pill.querySelector('[data-part="arrow"]') &&
              badge === 'End',
        colour: getComputedStyle(namePill).backgroundColor === ringRgb,
        across: box.left + box.width / 2 - (c.left + q.x),
        above: c.top + q.y - box.bottom,
      };
    });
    return { named: named.length, pills: pills.length, rows };
  });
  check(
    "  each end named once, in a pill over its circle in the line's colour, where it goes led by an arrow, Start or End over it",
    ends.named > 0 &&
      ends.pills === ends.named &&
      ends.rows.every(
        (r) =>
          !r.missing &&
          r.look &&
          r.colour &&
          Math.abs(r.across) < 1.5 &&
          r.above > 14 &&
          r.above < 40,
      ),
    JSON.stringify(ends),
  );

  // An end's name is a button (the owner's ask, 2026-10-01): its place's
  // card opens over the trip, the map flown in to it, and its ‹ brings the
  // trip back as it was.
  const named = await page.evaluate(async () =>
    ((await window.__src('direction-ends'))?.features ?? [])
      .filter((f) => f.properties.named)
      .map((f) => ({ name: f.properties.name, at: f.geometry.coordinates })),
  );
  const endButton = (name) => page.locator(`[data-testid="end-title"][data-name="${name}"] button`);
  const tappable = [];
  for (const n of named) if ((await endButton(n.name).count()) > 0) tappable.push(n);
  if (tappable.length === 0) {
    skip(
      "  a tap on an end's name opens its place over the trip, ‹ back to it",
      `no end of "${label}" names its hotspot`,
    );
  } else {
    const end = tappable[0];
    await jumpTo(page, end.at);
    await endButton(end.name).locator('[data-part="name"]').click();
    await page.waitForTimeout(300);
    await page
      .waitForFunction(() => !window.__map.isMoving(), null, { timeout: 4000 })
      .catch(() => {});
    const opened = await page.evaluate(() => {
      const shown = [...document.querySelectorAll('[data-testid="card"]')].filter((c) => !c.hidden);
      return {
        shown: shown.length,
        place: shown[0]?.querySelector('[data-testid="card-place"]')?.innerText.trim() ?? null,
        trip: shown.some((c) => c.querySelector('[data-testid="trip"]')),
        zoom: +window.__map.getZoom().toFixed(2),
      };
    });
    check(
      "  a tap on an end's name opens its place's card over the trip, the map flown in to it",
      opened.shown === 1 &&
        !opened.trip &&
        !!opened.place?.includes(end.name) &&
        opened.zoom >= 15.9,
      JSON.stringify({ end: end.name, ...opened }),
    );
    // A tap, as on the other buttons here: the runner may drop the touch.
    const tripShown = async () =>
      (await page.locator('[data-testid="card"]:not([hidden]) [data-testid="trip"]').count()) === 1;
    await buttonTap(card().getByRole('button', { name: 'Back' }), tripShown);
    check(
      '  its ‹ brings the trip back',
      (await tripLabel()) === label &&
        (await page.locator('[data-testid="card"]:not([hidden]) [data-testid="trip"]').count()) ===
          1,
      `"${await tripLabel()}", want "${label}"`,
    );
  }

  const trip2 = await tripChecks();

  // Negative control: 40 px out is twice as far as the box reaches — but only
  // where the line does not curve back and no hotspot sits on that side, so
  // both sides of the line are measured and the clearer one is tapped.
  await closeCard();
  if (trip2.picked) check('  ✕ lets the picked hintuan go', await noPickLeft());
  // A pick glides the camera: back where the tap was measured.
  await jumpTo(page, routeA.point);
  let far = null;
  for (const side of [1, -1]) {
    const [fx, fy] = at(40 * side);
    const at40 = await unproject(page, [fx - box.x, fy - box.y]);
    const kFar = mPerDegLng(at40[1]);
    const clear = Math.min(
      ...snapshot.routes.map((o) => distToLine(at40, o.coords, kFar)),
      distToHotspots(at40, snapshot.polys, kFar),
    );
    if (!far || clear > far.clear) far = { x: fx, y: fy, clear };
  }
  if (far.clear <= BOX_M) {
    skip(
      'a tap 40 px away from every line selects nothing',
      `neither side of the line is clear 40 px out — the nearest thing is ${Math.round(far.clear)} m away, inside the ${Math.round(BOX_M)} m box`,
    );
  } else {
    await mapTap(far.x, far.y);
    await page.waitForTimeout(500);
    check(
      'a tap 40 px away from every line selects nothing',
      (await card().count()) === 0,
      `${Math.round(far.clear)} m clear`,
    );
    const after = (await litIds(page)) ?? [];
    check('  nothing stays lit', after.length === 0, JSON.stringify(after));
  }
  await closeCard();
}

// ------------------------------------------------------------- 3. the chooser
// Two routes sharing a road: a vertex of one that lies within 15 m of another's
// line, with no third route inside the tap box.
let shared = null;
for (const [ri, r] of snapshot.routes.entries()) {
  if (shared) break;
  for (const vi of sampleIndices(r.coords.length, 2000 / Math.max(1, snapshot.routes.length))) {
    const p = r.coords[vi];
    const k = mPerDegLng(p[1]);
    const near = routesNear(p, snapshot.routes, BOX_M + 20, k);
    if (near.length !== 2) continue;
    const other = near.find((o) => o.id !== r.id);
    if (!other || !near.some((o) => o.id === r.id)) continue;
    if (distToLine(p, other.coords, k) > 15) continue;
    if (!other.signboard || !r.signboard || other.signboard === r.signboard) continue;
    shared = { a: r, b: other, point: p };
    break;
  }
}

if (!shared) {
  skip(
    'a tap where two routes share a road opens the chooser',
    'no two routes run within 15 m of each other today, on their own',
  );
} else {
  await jumpTo(page, shared.point);
  const anchor = await project(page, shared.point);
  const box = await canvasBox();
  await drawnAt('saved-routes-hit', anchor);
  await mapTap(box.x + anchor[0], box.y + anchor[1]);
  await page.waitForTimeout(600);

  const chooser = page.locator('[data-testid="chooser"]');
  const has = (await chooser.count()) > 0;
  check(
    'a tap where two routes share a road opens the chooser',
    has && (await card().count()) === 0,
    has ? '' : `[data-testid="chooser"] count 0; card count ${await card().count()}`,
  );
  const chooserText = has ? await chooser.first().innerText() : '';
  // The routes' rows, inside their cards: a hotspot under the tap would be a
  // row of the list too, above them.
  const items = chooser.locator(
    '[data-testid="chooser-origin"] button[data-testid="chooser-item"]',
  );
  const itemTexts = [];
  for (let i = 0; i < (await items.count()); i++) itemTexts.push(await items.nth(i).innerText());
  // Since 2026-09-25 the sheet lists the routes one way round under the
  // place they leave from — "Tala", then → SM Fairview — so a route's row is
  // its far end, under a heading that is where it leaves from. Outbound where
  // an outbound line was under the tap, the way back where only ways back
  // were (the rule of 2026-09-25): the shared stretch found may be the two
  // routes' ways back (their way home can take another road), as the
  // owner's Bagong Silang Kanan 5 routes of 2026-09-29 are, both coming home
  // from Philcoa and SM Fairview.
  const endsOf = (name) => name.replace(/ via .*$/, '').split(' – ');
  const wayBack = [shared.a, shared.b].every(
    (r) => fileDirections.find((d) => d.id === r.id)?.reversed === true,
  );
  /** Where a route leaves from and goes to, the way round the list shows it. */
  const shownWay = (r) => {
    const [head, tail] = endsOf(r.signboard);
    return wayBack ? { from: tail, to: head } : { from: head, to: tail };
  };
  // The owner's route list (2026-09-28) counts its cards, one per place the
  // routes leave from: two routes out of Tala are "1 Route".
  const places = new Set([shared.a, shared.b].map((r) => shownWay(r).from.toLowerCase())).size;
  const title = `${places} ${places === 1 ? 'Route' : 'Routes'}`;
  check(
    `  the list is headed "${title}", a card per place`,
    chooserText.split('\n').includes(title),
    chooserText.split('\n')[0] ?? '',
  );
  check(
    `  it lists both routes ${wayBack ? 'the way back' : 'outbound'}, one row each, under the place each leaves from`,
    itemTexts.length === 2 &&
      [shared.a, shared.b].every((r) => {
        const { from, to } = shownWay(r);
        return chooserText.includes(from) && itemTexts.some((t) => t.includes(to));
      }),
    `${itemTexts.length} row(s): ${itemTexts.map((t) => t.replace(/\n/g, ' / ')).join(' | ')}`,
  );
  // Its row, found in its card: the way back, both rows may read the same
  // place ("→ Bagong Silang Kanan 5"), each under its own card.
  const bWay = shownWay(shared.b);
  const wantedCard = chooser
    .locator('[data-testid="chooser-origin"]')
    .filter({ has: page.locator('[data-testid="chooser-select"]', { hasText: bWay.from }) })
    .first();
  const wanted = wantedCard
    .locator('button[data-testid="chooser-item"]')
    .filter({ hasText: bWay.to });
  const listShown = async () => (await chooser.count()) > 0 && (await chooser.first().isVisible());
  // The colour of the card the row sits on: the trip it opens wears it.
  const cardColour = (await wanted.count()) ? await wantedCard.getAttribute('data-livery') : null;
  // A list lights every route it lists. A tap on a card off its rows — its
  // name — narrows the lights to its routes, and a second lets it go; a row
  // opens its trip straight away, and ‹ comes back to every card at rest
  // (the owner, 2026-09-29).
  const sameSet = (a, b) => {
    const [x, y] = [[...new Set(a)], [...new Set(b)]];
    return x.length === y.length && x.every((id) => y.includes(id));
  };
  const directionsIn = (where) =>
    where
      .locator('button[data-testid="chooser-item"]')
      .evaluateAll((els) => els.map((e) => e.dataset.direction).filter(Boolean));
  const listedIds = has
    ? await directionsIn(chooser.first().locator('[data-testid="chooser-origin"]'))
    : [];
  const litOpen = (await litIds(page)) ?? [];
  check(
    '  it lights every route it lists',
    listedIds.length > 0 && sameSet(litOpen, listedIds),
    `${litOpen.length} lit, ${listedIds.length} listed`,
  );
  const isPicked = async () =>
    (await wanted.count()) > 0 && (await wantedCard.getAttribute('data-state')) === 'selected';
  const wantedName = wantedCard.locator('[data-testid="chooser-select"]');
  await buttonTap(wantedName, isPicked);
  const pickedIds = (await wanted.count()) ? await directionsIn(wantedCard) : [];
  const litPicked = (await litIds(page)) ?? [];
  check(
    '  a tap on a card off its rows selects it, opening no trip',
    (await isPicked()) && (await trip().count()) === 0,
    `Selected ${await isPicked()}; trip open ${(await trip().count()) > 0}`,
  );
  // The camera takes in its routes whole, as a trip's row does (the owner, 2026-10-01).
  const pickedLines = snapshot.routes.filter((r) => pickedIds.includes(r.id));
  if (pickedLines.length) {
    const framedPick = await framedAboveCard(
      bboxOf(pickedLines.flatMap((r) => r.coords)),
      'chooser',
    );
    check(
      '  and the camera takes in its routes whole, above the list',
      framedPick.inside,
      JSON.stringify(framedPick),
    );
  } else {
    skip(
      '  and the camera takes in its routes whole, above the list',
      'no line on the map for its routes today',
    );
  }
  const seenPicked = await rideLook(page);
  check(
    "  its routes in the card's colour, chevrons and end circles too",
    wears(seenPicked, LOOKS?.byLivery[cardColour]),
    `${cardColour}: ${JSON.stringify(seenPicked)}`,
  );
  // Narrower than the list only where the list has other cards.
  if (pickedIds.length > 0 && pickedIds.length < new Set(listedIds).size) {
    check(
      '  and lights just its routes',
      sameSet(litPicked, pickedIds),
      `${litPicked.length} lit for ${pickedIds.length} row(s) of ${listedIds.length}`,
    );
  } else {
    skip('  and lights just its routes', 'the picked card holds every route the list shows today');
  }
  await buttonTap(wantedName, async () => !(await isPicked()));
  const litLetGo = (await litIds(page)) ?? [];
  check(
    '  a second tap lets it go, every route it lists lit again',
    !(await isPicked()) && sameSet(litLetGo, listedIds),
    `Selected ${await isPicked()}; ${litLetGo.length} lit`,
  );
  // Picked again, its row opens the trip; ‹ will bring the list back at rest.
  await buttonTap(wantedName, isPicked);
  const pickedForTrip = await isPicked();
  await buttonTap(wanted, async () => (await trip().count()) > 0);
  // The trip card takes the list's place, and the list stays behind it,
  // hidden, for the trip's ‹ (the owner's frames, 2026-09-28).
  const [bHead, bTail] = endsOf(shared.b.signboard);
  const picked = await tripLabel();
  check(
    `  tapping "${shared.b.signboard}" opens its trip in the list's place`,
    picked.includes(bHead) && picked.includes(bTail) && !(await listShown()),
    `card "${picked}", list shown ${await listShown()}`,
  );
  const tripColour = (await trip().count())
    ? await trip().first().getAttribute('data-livery')
    : null;
  check(
    '  the trip wears the colour of the card it was picked from',
    !!cardColour && tripColour === cardColour,
    `card ${cardColour}, trip ${tripColour}`,
  );
  const seenTrip = await rideLook(page);
  check(
    '  and so does its line',
    wears(seenTrip, LOOKS?.byLivery[tripColour]),
    `${tripColour}: ${JSON.stringify(seenTrip)}`,
  );
  const trip3 = await tripChecks();
  const back = card().getByRole('button', { name: 'Back' });
  if ((await back.count()) === 0) {
    check(
      '  ‹ on the trip goes back to the list, as it was',
      false,
      'no ‹ on a trip picked from the list',
    );
  } else {
    await buttonTap(back, listShown);
    const again = (await listShown()) ? await chooser.first().innerText() : '';
    const litBack = (await litIds(page)) ?? [];
    check(
      '  ‹ on the trip, from a picked card, goes back to the list at rest: no card picked, every route it lists lit',
      again === chooserText &&
        (await card().count()) === 0 &&
        pickedForTrip &&
        !(await isPicked()) &&
        sameSet(litBack, listedIds),
      again
        ? `card count ${await card().count()}; picked before ${pickedForTrip}, now ${await isPicked()}; ${litBack.length} lit`
        : 'the list did not come back',
    );
    if (trip3.picked) check('  and lets the picked hintuan go', await noPickLeft());
    // A list of one card wears that card's colour; of several, the
    // selected blue (the owner's asks, 2026-09-29 and 2026-10-02).
    const listCards = chooser.first().locator('[data-testid="chooser-origin"]');
    const oneCard =
      (await listCards.count()) === 1 ? await listCards.first().getAttribute('data-livery') : null;
    const seenRest = await rideLook(page);
    check(
      oneCard
        ? "  and its lines are its one card's colour again"
        : '  and its lines are the selected blue again',
      wears(seenRest, oneCard ? LOOKS?.byLivery[oneCard] : LOOKS?.lit),
      `${oneCard ?? 'blue'}: ${JSON.stringify(seenRest)}`,
    );
    // A Tail Route one lit ride alone goes to opens that ride's trip, its
    // line lit (the owner's ask, 2026-10-01); ‹ back to the list. The card
    // picked first: the list's routes may all end at one place (the way
    // back), and a tail two rides share opens the place instead.
    // Start and End over the ends only in a card's colour: the list's routes
    // in the selected blue keep their plain names, a picked card's are
    // badged (the owner's ask, 2026-10-02).
    const badges = () =>
      page.evaluate(() => {
        const titles = [...document.querySelectorAll('[data-testid="end-title"]')];
        return {
          titles: titles.length,
          badged: titles.filter((t) => t.querySelector('[data-part="badge"]')).length,
        };
      });
    const inBlue = await badges();
    check(
      oneCard
        ? "  in its one card's colour, the ends wear Start or End"
        : '  in the selected blue, the ends are named without Start or End',
      inBlue.titles > 0 && inBlue.badged === (oneCard ? inBlue.titles : 0),
      JSON.stringify(inBlue),
    );
    await buttonTap(wantedName, isPicked);
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('[data-testid="end-title"]')].every((t) =>
            t.querySelector('[data-part="badge"]'),
          ),
        null,
        { timeout: 2000 },
      )
      .catch(() => {});
    const inCard = await badges();
    check(
      "  a picked card's ends wear Start or End, every one",
      inCard.titles > 0 && inCard.badged === inCard.titles,
      JSON.stringify(inCard),
    );
    const tails = page.locator('[data-testid="end-title"][data-opens="trip"] button');
    if ((await tails.count()) === 0) {
      skip(
        "  a tap on a tail's name opens its ride's trip",
        "no tail of the picked card is one ride's alone",
      );
    } else {
      const tail = tails.first();
      const tailName = await tail.evaluate(
        (b) => b.closest('[data-testid="end-title"]').dataset.name,
      );
      const tailAt = await page.evaluate(
        async (n) =>
          ((await window.__src('direction-ends'))?.features ?? []).find(
            (f) => f.properties.named && f.properties.name === n,
          )?.geometry.coordinates,
        tailName,
      );
      // Where a finger could tap it: a list left at Max (its handle's taps
      // dropped by a slow runner) covers the map, so it comes down first.
      const listHandle = page
        .locator('[data-testid="chooser"]')
        .first()
        .locator('button[data-testid="dock-handle"]');
      const listSnap = async () =>
        page.locator('[data-testid="chooser"]').first().getAttribute('data-snap');
      if ((await listSnap()) === 'max')
        await buttonTap(listHandle, async () => (await listSnap()) !== 'max');
      if (tailAt) await jumpTo(page, tailAt);
      const namePill = tail.locator('[data-part="name"]');
      const reachable = await namePill.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && el.contains(hit);
      });
      if (reachable) await namePill.click();
      await page
        .waitForFunction(
          () =>
            document.querySelectorAll('[data-testid="card"]:not([hidden]) [data-testid="trip"]')
              .length === 1,
          null,
          { timeout: 4000 },
        )
        .catch(() => {});
      const tripName = await tripLabel();
      const litTrip = (await litIds(page)) ?? [];
      check(
        "  a tap on a tail's name opens its ride's trip, its line alone lit",
        reachable &&
          tripName.includes(tailName) &&
          litTrip.length === 1 &&
          listedIds.includes(litTrip[0]) &&
          !(await listShown()),
        JSON.stringify({
          tail: tailName,
          reachable,
          list: await listSnap(),
          trip: tripName,
          lit: litTrip,
        }),
      );
      await buttonTap(card().getByRole('button', { name: 'Back' }), listShown);
      check('  and its ‹ goes back to the list', await listShown());
    }
    // Back at rest, nothing picked, for what follows.
    if (await isPicked()) await buttonTap(wantedName, async () => !(await isPicked()));
    // Picked, then a tap on the map where the list opened: a fresh list,
    // nothing Selected, every route it lists lit.
    await buttonTap(wantedName, isPicked);
    const repicked = await isPicked();
    await jumpTo(page, shared.point);
    const anchor2 = await project(page, shared.point);
    const box2 = await canvasBox();
    await mapTap(box2.x + anchor2[0], box2.y + anchor2[1]);
    await page.waitForTimeout(600);
    const litTapped = (await litIds(page)) ?? [];
    const pickedAfter = await chooser.locator('[data-state="selected"]').count();
    check(
      '  a map tap lets it go: nothing Selected, every route it lists lit',
      repicked && pickedAfter === 0 && (await listShown()) && sameSet(litTapped, listedIds),
      `picked ${repicked}; ${pickedAfter} Selected; ${litTapped.length} lit`,
    );
    // The list and the trip opened from it are one height (the owner's ask
    // of 2026-09-30: "if RouteDetail was in medium, if they go back, the
    // RouteCard is in medium too"): raised to Max here, through a pick and ‹.
    const listSnap = async () =>
      (await listShown()) ? await chooser.first().getAttribute('data-snap') : null;
    const listHandle = chooser.first().locator('button[data-testid="dock-handle"]');
    for (let i = 0; i < 2 && (await listSnap()) !== 'max'; i++)
      await buttonTap(listHandle, async () => (await listSnap()) === 'max');
    const listAtMax = (await listSnap()) === 'max';
    await buttonTap(wanted, async () => (await trip().count()) > 0);
    const tripSnap = await sheetState();
    check(
      '  a trip opened from the list at Max opens at Max too',
      listAtMax && tripSnap === 'max',
      `list at Max ${listAtMax}; trip ${tripSnap}`,
    );
    const backAgain = card().getByRole('button', { name: 'Back' });
    if (await backAgain.count()) await buttonTap(backAgain, listShown);
    check(
      '  and ‹ brings the list back at Max',
      (await listSnap()) === 'max',
      `list ${await listSnap()}`,
    );
  }
  await closeCard();
}

// -------------------------------------------------- 4. hotspots, forgivingly
// A route drawn right under the tapped pixel wins (the hit line is 18 px wide,
// so "under" reaches 9 px); a route merely inside the ±20 px box shares the
// route list with the hotspot; no route near, and the hotspot opens on its own.
// Hotspots are a few tens of metres across, so this section zooms to 18, where
// a person tapping a terminal would be, and scales its metres per pixel to match.
const Z_HOT = 18;
const M_HOT = M_PER_PX / 2 ** (Z_HOT - ZOOM);
const UNDER_M = 9 * M_HOT + 3 * M_HOT;
const NEAR_M = 20 * M_HOT + 9 * M_HOT;
/**
 * The box whose row the HintuanCard has Selected, pressed in (the owner's
 * 3854:12690, 2026-09-30): the one tapped. Its kind shows as the row's
 * colour and letter, where a badge said it before.
 */
const pressedBox = () =>
  page.evaluate(
    () =>
      document.querySelector('[data-testid="card"] [data-testid="card-box"][aria-pressed="true"]')
        ?.dataset.box ?? null,
  );

// 4a. Inside a hotspot, on a pixel no route covers, with a route or not in
// the finger's reach: the box's card opens straight away, alone — one tap,
// one kind of thing (the owner's ask, 2026-09-30: "select hintuan only show
// the card, then select route show the route"). Until then a route in reach
// made it a list, the hotspot first.
let inside = null;
for (const poly of snapshot.polys) {
  const c = centroidOf(poly.ring);
  const candidates = [
    c,
    ...poly.ring.map((v) => [c[0] + (v[0] - c[0]) * 0.5, c[1] + (v[1] - c[1]) * 0.5]),
  ];
  for (const p of candidates) {
    if (!pointInPolygon(p, poly.ring)) continue;
    const k = mPerDegLng(p[1]);
    const nearest = Math.min(...snapshot.routes.map((o) => distToLine(p, o.coords, k)), Infinity);
    if (nearest < UNDER_M) continue;
    if (snapshot.polys.some((o) => o.id !== poly.id && pointInPolygon(p, o.ring))) continue;
    const routesInBox = routesNear(p, snapshot.routes, NEAR_M, k);
    inside = { poly, point: p, routesInBox };
    break;
  }
  if (inside) break;
}

if (!inside) {
  skip(
    'a tap inside a hotspot opens its card alone',
    snapshot.polys.length
      ? `no point inside a hotspot today is ${Math.round(UNDER_M)} m clear of every route line`
      : 'no hotspots on the map today',
  );
} else {
  const { poly, point, routesInBox } = inside;
  await jumpTo(page, point, Z_HOT);
  const anchor = await project(page, point);
  const box = await canvasBox();
  await mapTap(box.x + anchor[0], box.y + anchor[1]);
  await page.waitForTimeout(600);
  const chooser = page.locator('[data-testid="chooser"]');
  const text = await cardText();
  check(
    `a tap inside "${poly.name}" opens its card alone${routesInBox.length ? `, its route in reach not listed` : ''}`,
    text.includes(poly.name) && (await pressedBox()) === poly.id && (await chooser.count()) === 0,
    `${text.split('\n')[0] || '(no card)'}; ${await chooser.count()} list(s); ${routesInBox.length} route(s) in reach`,
  );
  check(`  no chooser for one thing`, (await chooser.count()) === 0);
  // Its Selected row tapped again lets it go, and a tap picks it back (the
  // owner's ask, 2026-10-01): with none Selected, the card lists the routes
  // through every box of the place, at least as many as through this one.
  const ownRow = card().first().locator(`[data-testid="card-box"][data-box="${poly.id}"]`);
  const countOf = async () =>
    Number(
      (
        (await card()
          .first()
          .locator('[data-testid="card-count"]')
          .innerText()
          .catch(() => '0')) || '0'
      ).match(/\d+/)?.[0] ?? 0,
    );
  const boxCount = await countOf();
  await buttonTap(ownRow, async () => (await pressedBox()) === null);
  const letGo = { pressed: await pressedBox(), count: await countOf(), open: await card().count() };
  check(
    "  its Selected row tapped again lets it go: no row Selected, the card open, the whole place's routes",
    letGo.pressed === null && letGo.open > 0 && letGo.count >= boxCount,
    `${JSON.stringify(letGo)}; ${boxCount} through the box`,
  );
  await buttonTap(ownRow, async () => (await pressedBox()) === poly.id);
  await page
    .waitForFunction(() => !window.__map.isMoving(), null, { timeout: 4000 })
    .catch(() => {});
  check(
    '  and a tap on it picks it back',
    (await pressedBox()) === poly.id && (await countOf()) === boxCount,
    `${await pressedBox()} pressed; ${await countOf()} routes, ${boxCount} before`,
  );

  // Another box of its place, from its row: that row Selected, the card
  // staying at Max (the owner, 2026-10-01), and the map gone there, the box
  // above where Middle would be (the owner's HintuanCard, 2026-09-30).
  const otherRow = card().first().locator(`[data-testid="card-box"]:not([data-box="${poly.id}"])`);
  const otherId = (await otherRow.count()) ? await otherRow.first().getAttribute('data-box') : null;
  const otherPoly = otherId && snapshot.polys.find((o) => o.id === otherId);
  if (!otherPoly) {
    skip(
      '  another box from its row: Selected, the card staying at Max, the map there',
      `"${poly.name}" is its place's only box`,
    );
  } else {
    await buttonTap(handle(), async () => (await sheetState()) === 'max');
    const from = await sheetState();
    await buttonTap(otherRow.first(), async () => (await pressedBox()) === otherId);
    await page.waitForTimeout(200);
    await page
      .waitForFunction(() => !window.__map.isMoving(), null, { timeout: 4000 })
      .catch(() => {});
    const at = await project(page, centroidOf(otherPoly.ring));
    const edges = await page.evaluate(() => {
      const c = window.__map.getCanvas().getBoundingClientRect();
      return { top: c.top, cardTop: c.bottom - Math.round(c.height * 0.45) };
    });
    const y = edges.top + at[1];
    check(
      '  another box from its row: Selected, the card staying at Max, the map there above where Middle would be',
      (await pressedBox()) === otherId &&
        (await sheetState()) === from &&
        y > edges.top &&
        y < edges.cardTop,
      `from ${from}: ${await pressedBox()} pressed (want ${otherId}), data-snap=${await sheetState()}; the box at ${Math.round(y)}, Middle from ${Math.round(edges.cardTop)}`,
    );
  }
  await closeCard();
}

// 4b. 15 px outside the ring, with no route within reach of the tap at all.
const RING_CLEAR_M = 15 * M_HOT + NEAR_M + 3 * M_HOT;
let hotspot = null;
let bestRingClear = 0;
for (const poly of snapshot.polys) {
  const c = centroidOf(poly.ring);
  for (const v of poly.ring) {
    const k = mPerDegLng(v[1]);
    const clear = Math.min(...snapshot.routes.map((o) => distToLine(v, o.coords, k)), Infinity);
    if (clear > bestRingClear) bestRingClear = clear;
    if (clear < RING_CLEAR_M) continue;
    if (snapshot.polys.some((o) => o.id !== poly.id && distToLine(v, o.ring, k) < 80)) continue;
    hotspot = { poly, vertex: v, centre: c };
    break;
  }
  if (hotspot) break;
}

if (snapshot.polys.length === 0) {
  skip('a tap 15 px outside a hotspot edge still opens it', 'no hotspots on the map today');
} else if (!hotspot) {
  skip(
    'a tap 15 px outside a hotspot edge still opens it',
    `no hotspot ring vertex today is ${Math.round(RING_CLEAR_M)} m clear of every route line (the best manages ${Math.round(bestRingClear)} m)`,
  );
} else {
  const { poly, vertex, centre } = hotspot;
  await jumpTo(page, vertex, Z_HOT);
  const anchor = await project(page, vertex);
  const inward = await project(page, centre);
  const dx = anchor[0] - inward[0];
  const dy = anchor[1] - inward[1];
  const len = Math.hypot(dx, dy) || 1;
  const box = await canvasBox();
  const drawn = await drawnAt('saved-stops-fill', inward);
  await mapTap(box.x + anchor[0] + (dx / len) * 15, box.y + anchor[1] + (dy / len) * 15);
  await page.waitForTimeout(600);

  const text = await cardText();
  check(
    `a tap 15 px outside "${poly.name}" still opens it`,
    text.includes(poly.name),
    `${text.split('\n')[0] || '(no card)'}; the box drawn at its centre: ${drawn === 1 ? 'yes' : drawn}`,
  );
  check(
    `  the card has its row Selected`,
    (await pressedBox()) === poly.id,
    `${await pressedBox()}`,
  );
  await closeCard();
}

// ------------------------------------- 4c. the sheet, on a hotspot's card
// Every card is the one BottomSheet since 2026-09-30, a hotspot's and a
// trip's alike; these gestures are checked on a hotspot's.
/** Handle gestures the runner made no pointer events for, sent again by hand. */
let handleByHand = 0;
const pointerdowns = () => page.evaluate(() => window.__pointerdowns);
/**
 * A gesture on the handle sent by hand, as pointer events: down at (x, y),
 * a move to each of `ys`, up. The mouse's pointer, since a touch's id would
 * have to be a finger on the glass for the handle to capture it.
 */
const handGesture = (x, y, ys) =>
  page.evaluate(
    async ([x, y, ys]) => {
      const el = document.elementFromPoint(x, y);
      const at = (cy) => ({
        clientX: x,
        clientY: cy,
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      });
      el.dispatchEvent(new PointerEvent('pointerdown', at(y)));
      for (const cy of ys) el.dispatchEvent(new PointerEvent('pointermove', at(cy)));
      // Held still before letting go, as dragHandle does: a placement, not a flick.
      if (ys.length) await new Promise((r) => setTimeout(r, 150));
      el.dispatchEvent(new PointerEvent('pointerup', at(ys.at(-1) ?? y)));
    },
    [x, y, ys],
  );
/**
 * A finger's tap on the handle; when the page saw no pointer press from it,
 * the same tap as pointer events sent by hand. On some GitHub runs Chromium
 * stopped making pointer events from touches, and from the mouse, partway
 * through the suite: the page heard only touchstart and touchend, so the
 * sheet, which listens for pointers, heard nothing (the Philcoa card's
 * handle, 2026-09-29, pinned by the events sheetDiag lists). mapTap and
 * buttonTap send a dropped tap's click by hand for the same reason. How many
 * needed it is reported at the end.
 */
const tapHandle = async () => {
  if ((await handle().count()) === 0) return false;
  const hb = await handle().first().boundingBox();
  if (!hb) return false;
  const [x, y] = [hb.x + hb.width / 2, hb.y + hb.height / 2];
  const seen = await pointerdowns();
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(450);
  if ((await pointerdowns()) === seen) {
    handleByHand++;
    await handGesture(x, y, []);
    await page.waitForTimeout(450);
  }
  return true;
};
/**
 * Drag the handle by dy CSS px. Touch first (CDP), mouse as a fallback. Held
 * still for a moment before letting go, so the sheet settles on the height
 * nearest where it was left (BottomSheet's snapFor), not a flick's.
 */
const dragHandle = async (dy) => {
  if ((await handle().count()) === 0) return { ok: false, how: 'no handle' };
  const before = await sheetState();
  const hb = await handle().first().boundingBox();
  if (!hb) return { ok: false, how: 'handle not visible' };
  const x = hb.x + hb.width / 2;
  const y = hb.y + hb.height / 2;
  const steps = 8;
  const seen = await pointerdowns();
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y + (dy * i) / steps }],
      });
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(150);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } catch (e) {
    return { ok: false, how: `Input.dispatchTouchEvent threw: ${String(e).slice(0, 80)}` };
  }
  await page.waitForTimeout(450);
  if ((await sheetState()) !== before || (await card().count()) === 0)
    return { ok: true, how: 'touch' };
  // The sheet ignored the synthetic touch; try the same gesture with a mouse.
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x, y + (dy * i) / steps);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(450);
  // Neither made a pointer event: the runner's, as with tapHandle.
  if ((await pointerdowns()) === seen) {
    handleByHand++;
    await handGesture(
      x,
      y,
      Array.from({ length: steps }, (_, i) => y + (dy * (i + 1)) / steps),
    );
    await page.waitForTimeout(450);
    return {
      ok: true,
      how: 'by hand (the runner made no pointer events from the touch or the mouse)',
    };
  }
  return { ok: true, how: 'mouse (the sheet did not answer a synthetic touch drag)' };
};

/** Open that hotspot's card again, with the tap 15 px outside its ring that 4b checks. */
const openSheet = async () => {
  const { vertex, centre } = hotspot;
  await jumpTo(page, vertex, Z_HOT);
  const anchor = await project(page, vertex);
  const inward = await project(page, centre);
  const dx = anchor[0] - inward[0];
  const dy = anchor[1] - inward[1];
  const len = Math.hypot(dx, dy) || 1;
  const box = await canvasBox();
  await mapTap(box.x + anchor[0] + (dx / len) * 15, box.y + anchor[1] + (dy / len) * 15);
  await page.waitForTimeout(600);
};
/** Each gesture below is judged on its own, so put the sheet back if one broke it. */
const restore = async (want) => {
  if ((await card().count()) === 0) await openSheet();
  // The handle goes round, Low → Middle → Max: two taps at most.
  for (let i = 0; i < 2 && (await sheetState()) !== want; i++) await tapHandle();
  return (await sheetState()) === want;
};

/**
 * What the page held when a handle check failed: on some GitHub runs the
 * Philcoa card's first handle tap and drags answered nothing, touch or mouse,
 * and passed on others (2026-09-29) — every card on the page, what lies on
 * top of the handle, and the events the last gestures made there.
 */
const sheetDiag = () =>
  page.evaluate(() => {
    const name = (el) =>
      el instanceof Element
        ? (el.closest('[data-testid]')?.getAttribute('data-testid') ?? el.tagName.toLowerCase())
        : String(el);
    const cards = [...document.querySelectorAll('[data-testid="card"]')].map(
      (c) =>
        `${c.tagName.toLowerCase()}${c.hidden ? ' hidden' : ''} snap=${c.getAttribute('data-snap')} "${(c.textContent ?? '').trim().slice(0, 30)}"`,
    );
    const h = document.querySelector('[data-testid="card"] button[data-testid="dock-handle"]');
    const r = h?.getBoundingClientRect();
    const top = r
      ? name(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
      : '(no handle)';
    return `cards [${cards.join(' | ')}]; on the handle ${top}; chooser ${document.querySelectorAll('[data-testid="chooser"]').length}; events ${(window.__sheetEvents ?? []).slice(-14).join(', ')}; now ${Math.round(performance.now())}, the last real pointerdown ${window.__lastDown}; odd [${window.__odd.slice(-12).join(', ')}]`;
  });

if (!hotspot) {
  skip(
    "the sheet handle opens and closes a hotspot's card",
    'no hotspot clear of every route to open a card on (see 4b)',
  );
} else {
  await page.evaluate(() => {
    window.__sheetEvents = [];
    const t0 = performance.now();
    for (const t of [
      'pointerdown',
      'pointerup',
      'pointercancel',
      'click',
      'contextmenu',
      'touchstart',
      'touchend',
      'touchcancel',
    ])
      document.addEventListener(
        t,
        (e) => {
          const el =
            e.target instanceof Element
              ? (e.target.closest('[data-testid]')?.getAttribute('data-testid') ??
                e.target.tagName.toLowerCase())
              : '';
          window.__sheetEvents.push(`${Math.round(performance.now() - t0)} ${t}@${el}`);
        },
        true,
      );
  });
  await openSheet();
  // Every card opens at Middle (BottomSheet), a hotspot's too since the
  // owner's ask of 2026-09-30; before, it opened peeking.
  check(
    "a hotspot's card opens at Middle",
    (await sheetState()) === 'middle',
    `data-snap=${await sheetState()}`,
  );

  const hadHandle = await tapHandle();
  const firstTap = hadHandle && (await sheetState()) === 'max';
  check(
    "a tap on a hotspot card's handle raises it to Max",
    firstTap,
    hadHandle
      ? `data-snap=${await sheetState()}${firstTap ? '' : `; ${await sheetDiag()}`}`
      : 'no button[data-testid="dock-handle"]',
  );
  check('  no horizontal scroll with the sheet at Max', await noHScroll(page));

  await tapHandle();
  const afterSecond =
    (await card().count()) === 0 ? 'the whole card vanished' : `data-snap=${await sheetState()}`;
  check(
    'a second tap on the handle goes round to Low',
    (await sheetState()) === 'low',
    afterSecond,
  );

  // From here each gesture starts from a known height, so one broken gesture
  // does not report the next three as broken too. A start that cannot be
  // reached is itself a failure: the drag after it would prove nothing.
  const readyUp = await restore('low');
  const up = await dragHandle(await dragTo('low', 'middle'));
  const upOpened = readyUp && (await sheetState()) === 'middle';
  check(
    'dragging the handle up from Low settles at Middle',
    upOpened,
    `${readyUp ? '' : 'could not get to Low first; '}${up.how}; data-snap=${await sheetState()}${upOpened ? '' : `; ${await sheetDiag()}`}`,
  );

  const readyDown = await restore('middle');
  const down = await dragHandle(await dragTo('middle', 'low'));
  check(
    'dragging it down from Middle settles at Low',
    readyDown && (await sheetState()) === 'low',
    `${readyDown ? '' : 'could not get to Middle first; '}${down.how}; data-snap=${await sheetState()}`,
  );

  const readyLow = await restore('low');
  const down2 = await dragHandle(120);
  check(
    'dragging down past Low dismisses the card',
    readyLow && (await card().count()) === 0,
    `${readyLow ? '' : 'could not get to Low first; '}${down2.how}; [data-testid="card"] count ${await card().count()}`,
  );
  await closeCard();

  // A mouse's drag, on a narrow window: the browser then clicks the handle it
  // was held on, and that click toggled the sheet straight back — pulled up,
  // it fell to peek, as it was then (the reviewer's note, fixed on the owner's word,
  // 2026-09-29). The drags above go by touch whenever the page answers it.
  const mouseDrag = async (dy) => {
    const hb = await handle().first().boundingBox();
    if (!hb) return false;
    const [x, y] = [hb.x + hb.width / 2, hb.y + hb.height / 2];
    const seen = await pointerdowns();
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(x, y + (dy * i) / 8);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(450);
    // The mouse made no pointer event: the runner's, as with tapHandle. The
    // same drag by hand, then the click a mouse sends after one — on the
    // handle it was held on, where it let go — which is the click this check
    // is for.
    if ((await pointerdowns()) === seen) {
      handleByHand++;
      await handGesture(
        x,
        y,
        Array.from({ length: 8 }, (_, i) => y + (dy * (i + 1)) / 8),
      );
      await page.evaluate(
        ([x, y]) => {
          const h = document.querySelector(
            '[data-testid="card"] button[data-testid="dock-handle"]',
          );
          h?.dispatchEvent(
            new MouseEvent('click', {
              clientX: x,
              clientY: y,
              bubbles: true,
              cancelable: true,
              detail: 1,
            }),
          );
        },
        [x, y + dy],
      );
      await page.waitForTimeout(450);
    }
    return true;
  };
  const readyMouseUp = await restore('low');
  const mouseUp = await mouseDrag(await dragTo('low', 'middle'));
  const mouseOpened = readyMouseUp && mouseUp && (await sheetState()) === 'middle';
  check(
    'a mouse dragging the handle up from Low leaves the sheet at Middle',
    mouseOpened,
    `data-snap=${await sheetState()}${mouseOpened ? '' : `; ${await sheetDiag()}`}`,
  );
  const readyMouseDown = await restore('middle');
  const mouseDown = await mouseDrag(await dragTo('middle', 'low'));
  check(
    '  and dragging it down leaves it at Low',
    readyMouseDown && mouseDown && (await sheetState()) === 'low',
    `data-snap=${await sheetState()}`,
  );
  await closeCard();

  // The watch for the click the browser sends after a handle tap must end
  // with the next tap, or the ✕ pressed right after would be lost too.
  const readyClose = await restore('low');
  await tapHandle();
  const cb = await card().getByRole('button', { name: 'Close' }).first().boundingBox();
  if (cb) {
    const [cx, cy] = [cb.x + cb.width / 2, cb.y + cb.height / 2];
    const seen = await pointerdowns();
    await page.touchscreen.tap(cx, cy);
    await page.waitForTimeout(400);
    // The runner dropped the touch, as tapHandle allows for: the same tap by
    // hand — a press, which ends the watch, then its click — so what is
    // checked is still the watch, not a bare click. The mouse's pointer, as
    // handGesture's, since the sheet may capture it.
    if ((await card().count()) > 0 && (await pointerdowns()) === seen) {
      tapsByHand++;
      await page.evaluate(
        ([x, y]) => {
          const el = document.elementFromPoint(x, y);
          const at = {
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
          };
          el?.dispatchEvent(new PointerEvent('pointerdown', at));
          el?.dispatchEvent(new PointerEvent('pointerup', at));
          el?.dispatchEvent(new MouseEvent('click', { ...at, detail: 1 }));
        },
        [cx, cy],
      );
      await page.waitForTimeout(400);
    }
  }
  check(
    '✕ pressed right after a handle tap still closes the card',
    readyClose && !!cb && (await card().count()) === 0,
    `[data-testid="card"] count ${await card().count()}`,
  );
  await closeCard();
}

// ------------------------- 4d. the handle, on a hotspot's card with routes
// Raised, a hotspot's card shows its routes where the finger was, and the
// click that follows the tap on the handle must not open one (seen
// 2026-09-29: it did, with the old rows and the RouteCards alike). 4c's
// hotspot is chosen clear of every route, so it has none to fall on.
const drawnIds = new Set(
  fileDirections.filter((d) => (d.shape?.coordinates?.length ?? 0) > 1).map((d) => d.id),
);
const withRoutes = snapshot.polys.find((poly) =>
  (published?.links ?? []).some((l) => l.stop_id === poly.id && drawnIds.has(l.route_variant_id)),
);
if (!withRoutes) {
  skip(
    'a tap on the handle of a hotspot card with routes raises it, opening none',
    published
      ? 'no hotspot has a drawn route linked today'
      : 'the published file could not be read',
  );
} else {
  const c = centroidOf(withRoutes.ring);
  await jumpTo(page, c, Z_HOT);
  const at = await project(page, c);
  const box = await canvasBox();
  await mapTap(box.x + at[0], box.y + at[1]);
  await page.waitForTimeout(600);
  // A route under the finger shares the tap: the list asks, and its row opens the box.
  const chooser = page.locator('[data-testid="chooser"]');
  if ((await chooser.count()) > 0) {
    await buttonTap(
      chooser.locator('button[data-testid="chooser-item"]').filter({ hasText: withRoutes.name }),
      async () => (await chooser.count()) === 0,
    );
  }
  const atMiddle =
    (await cardText()).includes(withRoutes.name) && (await sheetState()) === 'middle';
  await tapHandle();
  check(
    `a tap on the handle of "${withRoutes.name}"'s card, with routes, raises it to Max, opening none`,
    atMiddle && (await sheetState()) === 'max' && (await trip().count()) === 0,
    `opened at Middle ${atMiddle}; now data-snap=${await sheetState()}, trip ${await trip().count()}`,
  );
  // On a busy page that click comes long after the finger lifts — a second on
  // GitHub's runners once the Philcoa card's routes flowed (2026-09-29), when
  // the sheet gave up on it after 300 ms — and is still the tap's: pulled down,
  // it would land on the map and close the card; pulled up, on a route.
  // Holding the page busy in the pointerup did not make it late here —
  // Chromium still sent the click before the overdue timer (2026-09-29) — so
  // this tap is sent by hand, its click a second after it, to whatever is
  // then under the finger. What that click would do there varies
  // (the hotspot under the finger opens the same card again; a RouteCard's
  // name only lights it), so the check is that it reached nothing at all.
  /** What the late click reached, '' if it was swallowed; null with no handle to tap. */
  const lateClickTap = async () => {
    const hb = (await handle().count()) ? await handle().first().boundingBox() : null;
    if (!hb) return null;
    const reached = await page.evaluate(
      async ([x, y]) => {
        // The mouse's pointer: a touch's id would have to be a finger on the glass for the handle to capture it.
        const at = {
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
        };
        const el = document.elementFromPoint(x, y);
        el.dispatchEvent(new PointerEvent('pointerdown', at));
        el.dispatchEvent(new PointerEvent('pointerup', at));
        await new Promise((r) => setTimeout(r, 1000));
        const under = document.elementFromPoint(x, y);
        if (!under) return '(nothing under the finger)';
        // Heard where it lands: the sheet swallows the tap's click on its way down, before it gets there.
        let through = false;
        const heard = () => (through = true);
        under.addEventListener('click', heard);
        under.dispatchEvent(
          new MouseEvent('click', {
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
            detail: 1,
          }),
        );
        under.removeEventListener('click', heard);
        return through
          ? (under.closest('[data-testid]')?.getAttribute('data-testid') ??
              under.tagName.toLowerCase())
          : '';
      },
      [hb.x + hb.width / 2, hb.y + hb.height / 2],
    );
    await settled();
    await page.waitForTimeout(300);
    return reached;
  };
  const lateDown = await lateClickTap();
  check(
    '  a tap whose click comes a second late takes it round to Low, the click reaching nothing',
    lateDown === '' && (await card().count()) === 1 && (await sheetState()) === 'low',
    `${lateDown === null ? 'no handle' : lateDown ? `the click reached ${lateDown}` : 'swallowed'}; data-snap=${await sheetState()}`,
  );
  const lateUp = await lateClickTap();
  check(
    '  and raises it again to Middle, the click reaching nothing',
    lateUp === '' && (await sheetState()) === 'middle' && (await trip().count()) === 0,
    `${lateUp === null ? 'no handle' : lateUp ? `the click reached ${lateUp}` : 'swallowed'}; data-snap=${await sheetState()}, trip ${await trip().count()}`,
  );
  await closeCard();
}

// Overlapping hotspots share the list; today's data has none.
const overlapping = snapshot.polys.some((a) =>
  snapshot.polys.some(
    (bPoly) => bPoly.id !== a.id && a.ring.some((v) => pointInPolygon(v, bPoly.ring)),
  ),
);
if (!overlapping)
  skip('two overlapping hotspots open the list', 'no two hotspot polygons overlap today');

// ---------------------------------------- 5. a trip opened by a tap, framed
// Trip links (?r=<id>) went on 2026-10-03, the owner's "remove that for
// now": the address stays as it was, and the view a trip frames is checked
// on a trip opened by a tap on its own line, as it was on one opened by a link.
if (!routeA) {
  skip('a trip opened by a tap leaves the address as it was', 'no lone route vertex to select');
} else {
  await jumpTo(page, routeA.point);
  const anchor = await project(page, routeA.point);
  const perp = await perpendicular(page, routeA.point, routeA.neighbour, routeA.route.coords, 40);
  const box = await canvasBox();
  await mapTap(box.x + anchor[0] + perp[0] * 14, box.y + anchor[1] + perp[1] * 14);
  await page.waitForTimeout(2000);
  check(
    'a trip opened by a tap leaves the address as it was: no trip link',
    new URL(page.url()).search === '',
    page.url().slice(BASE.length) || '/',
  );
  // The direction the card opened (the tap may open the route's other way).
  const opened = await openedDirection();
  const r = opened && snapshot.routes.find((o) => o.id === opened.id);
  if (!r)
    skip(
      '  it frames the whole route, above the card',
      `no direction named "${await tripLabel()}" on the map`,
    );
  else {
    const shareFramed = await framedAboveCard(r.bbox);
    check(
      '  it frames the whole route, above the card',
      shareFramed.inside,
      JSON.stringify(shareFramed),
    );
    // Framed, not merely shown: the route fills the room the card leaves along
    // one side or the other (its 48 px margins aside), however long it is.
    const { box: fb } = shareFramed;
    const fill = Math.max(
      (fb.right - fb.left) / (shareFramed.width - 96),
      (fb.bottom - fb.top) / (shareFramed.floor - shareFramed.map[0] - 96),
    );
    check(
      '  zoomed to fit it: the route fills the room along one side',
      fill > 0.8 && fill < 1.05,
      `${Math.round(fill * 100)}% at zoom ${shareFramed.zoom}`,
    );

    // The sheet at another height: the camera takes the route in again, in the
    // map it leaves (the owner's ask, 2026-10-01) — at Max, the whole screen on
    // a phone, as at Middle; in closer above Low; and back to the overview
    // after the visitor has moved the map. Going up, no further out than
    // 5 km on the scale bar (100 px; MapLibre's 512 px tiles), the owner's
    // "for scrolling up only": a long route is cut, not shrunk.
    const capZoom = Math.log2(
      (78271.51696 * Math.cos((((r.bbox[1] + r.bbox[3]) / 2) * Math.PI) / 180) * 100) / 5000,
    );
    const raised = Math.max(shareFramed.zoom, capZoom);
    const toMax = await buttonTap(handle(), async () => (await sheetState()) === 'max');
    const atMax = await framedAboveCard(r.bbox);
    const toLow = toMax && (await buttonTap(handle(), async () => (await sheetState()) === 'low'));
    const atLow = await framedAboveCard(r.bbox);
    if (!toLow)
      skip(
        '  the sheet at Max, then Low: the route taken in again in the map it leaves',
        `the handle would not go round: data-snap=${await sheetState()}`,
      );
    else {
      check(
        '  the sheet up to Max: framed as at Middle, no further out than 5 km on the scale bar',
        Math.abs(atMax.zoom - raised) < 0.05,
        `zoom ${atMax.zoom}; at Middle ${shareFramed.zoom}, 5 km at ${capZoom.toFixed(2)}`,
      );
      check(
        '  at Low: in closer, the whole route above the sheet',
        atLow.inside && atLow.zoom > shareFramed.zoom + 0.1,
        JSON.stringify(atLow),
      );
    }
    // Up to Middle from Low: with the sheet never brought down, it is at
    // Middle already, and no height change moves the camera (a runner that
    // dropped the handle's taps, 2026-10-01).
    if (!toLow)
      skip(
        '  moved away, then up to Middle: the overview again',
        `the sheet never came down to Low: data-snap=${await sheetState()}`,
      );
    else {
      await page.evaluate(() => {
        const c = window.__map.getCenter();
        window.__map.jumpTo({ center: [c.lng + 0.02, c.lat + 0.02], zoom: 16 });
      });
      await buttonTap(handle(), async () => (await sheetState()) === 'middle');
      const back = await framedAboveCard(r.bbox);
      check(
        '  moved away, then up to Middle: the overview again, 5 km on the bar at the farthest',
        Math.abs(back.zoom - raised) < 0.05 && (back.inside || capZoom > shareFramed.zoom),
        JSON.stringify(back),
      );
    }

    // Opened on its own, no list is behind the trip: ‹ only where another
    // route sharing an end is drawn its way round (the owner's ask, 2026-09-29).
    const fannedR = fanOf(r.id).length > 1;
    check(
      fannedR
        ? '  opened on its own, the trip has ‹: another route sharing an end runs its way'
        : '  opened on its own, the trip has no ‹: no other route sharing an end runs its way',
      (await trip().count()) > 0 &&
        (await card().getByRole('button', { name: 'Back' }).count()) > 0 === fannedR,
      `trip ${await trip().count()}`,
    );
  }
  await closeCard();
}

// ------------------------------------------ 5b. ‹ on a trip opened on its own
// A trip opened by a tap on its own line has no list behind it. Where other routes sharing
// its head or its tail are drawn its way round, ‹ lists them the way the trip
// goes, as a tap where they all run would: Tala → Novaliches ‹ to Tala's
// card, "1 Route", Novaliches and SM Fairview (the owner's ask, 2026-09-29).
// A drawn direction (a slot has no line to tap, and its fan would leave it
// out), one a tap can open alone: the first of up to ten that does.
const fannedCandidates = fileDirections.filter(
  (d) => (d.shape?.coordinates?.length ?? 0) > 1 && fanOf(d.id).length > 1,
);
let fannedOne = null;
for (const d of fannedCandidates.slice(0, 10))
  if (await openAlone(d)) {
    fannedOne = d;
    break;
  }
if (!fannedOne) {
  skip(
    'a trip opened on its own lists, behind its ‹, the routes sharing an end',
    !published
      ? 'the published file could not be read'
      : fannedCandidates.length
        ? 'none of those routes has a stretch of line a tap could open alone'
        : 'no two routes sharing an end are drawn the same way round today',
  );
} else {
  const fan = fanOf(fannedOne.id);
  const back = card().getByRole('button', { name: 'Back' });
  // The trip opens once its line is read: on a slow runner, after the map.
  await back
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => {});
  const opened = await tripLabel();
  const openedColour = (await trip().count())
    ? await trip().first().getAttribute('data-livery')
    : null;
  const chooser = page.locator('[data-testid="chooser"]');
  const listShown = async () => (await chooser.count()) > 0 && (await chooser.first().isVisible());
  const tapped = (await back.count()) > 0 && (await buttonTap(back, listShown));
  check(
    `a trip opened on its own, "${opened}", lists behind its ‹ the routes sharing an end`,
    tapped && (await listShown()) && (await trip().count()) === 0,
    tapped ? `list shown ${await listShown()}, trip ${await trip().count()}` : 'no ‹ on the trip',
  );
  if (await listShown()) {
    // A card per place they leave from, the way the trip went; a row for each.
    const ends = fan.map((d) => (d.direction_name ?? '').split(' → '));
    const places = new Set(ends.map(([from = '']) => from.toLowerCase())).size;
    const title = `${places} ${places === 1 ? 'Route' : 'Routes'}`;
    const text = await chooser.first().innerText();
    check(
      `  headed "${title}", a card per place`,
      text.split('\n').includes(title),
      text.split('\n')[0] ?? '',
    );
    const items = chooser.locator('button[data-testid="chooser-item"]');
    const rows = [];
    for (let i = 0; i < (await items.count()); i++)
      rows.push((await items.nth(i).innerText()).trim());
    check(
      "  a row for each, where it goes, the trip's own among them",
      rows.length === fan.length && ends.every(([, to = '']) => rows.some((t) => t.includes(to))),
      rows.join(' | '),
    );
    const lit = ((await litIds(page)) ?? []).sort();
    check(
      '  and lit, as a tap where they all run would light them',
      JSON.stringify(lit) === JSON.stringify(fan.map((d) => d.id).sort()),
      JSON.stringify(lit),
    );
    // One place, one card: it wears the colour the trip wore, its place's.
    if (places === 1) {
      const listColour = await chooser.locator('[data-livery]').first().getAttribute('data-livery');
      check(
        "  its card wears the trip's colour",
        !!openedColour && listColour === openedColour,
        `trip ${openedColour}, card ${listColour}`,
      );
    }
  }
  await closeCard();
}

// ------------------------------------------- 5c. "Other routes" under a trip
// The other drawn routes out of where a trip starts, one row each by where it
// goes; a tap opens that route's trip in the card's place, its line alone
// lit (the owner's RouteTripDetail, 3778:3183, 2026-10-01).
const startOf = (d) => (d.reversed ? d.route?.tail_stop_id : d.route?.head_stop_id) ?? null;
const drawnDirection = (d) => (d.shape?.coordinates?.length ?? 0) > 1;
const othersOf = (d) =>
  fileDirections.filter(
    (o) =>
      o.route_id !== d.route_id && drawnDirection(o) && !!startOf(d) && startOf(o) === startOf(d),
  );
// Opened by a tap on its own line: the first of up to ten that a tap can open alone.
const othersCandidates = fileDirections.filter((d) => drawnDirection(d) && othersOf(d).length > 0);
let withOthers = null;
for (const d of othersCandidates.slice(0, 10))
  if (await openAlone(d)) {
    withOthers = d;
    break;
  }
if (!withOthers) {
  skip(
    'a trip lists the other routes out of where it starts',
    !published
      ? 'the published file could not be read'
      : othersCandidates.length
        ? 'none of those routes has a stretch of line a tap could open alone'
        : 'no two drawn routes leave one hotspot today',
  );
} else {
  const others = othersOf(withOthers);
  const rows = card().locator('[data-testid="trip-other-route"]');
  const shown = await rows.evaluateAll((els) => els.map((e) => e.dataset.direction));
  check(
    `a trip, "${await tripLabel()}", lists the other routes out of where it starts`,
    shown.length === others.length && others.every((o) => shown.includes(o.id)),
    `${shown.length} row(s), want ${others.length}`,
  );
  const to = others[0];
  const toName = (to.direction_name ?? '').split(' → ')[1] ?? '';
  // Opened first: another route leaves the hintuans as they were, not folded
  // (the owner, 2026-10-01: "don't shrink it").
  const tripFold = card().locator('[data-testid="trip-fold"]');
  const openedFold =
    (await tripFold.count()) > 0 &&
    (await buttonTap(
      tripFold,
      async () => (await tripFold.first().getAttribute('aria-expanded')) === 'true',
    ));
  // At Max: another route brings the sheet down to Middle, the map showing it (the owner, 2026-10-01).
  const atMax = await buttonTap(handle(), async () => (await sheetState()) === 'max');
  await rows.first().scrollIntoViewIfNeeded();
  await buttonTap(
    card().locator(`[data-testid="trip-other-route"][data-direction="${to.id}"]`),
    async () => ((await litIds(page)) ?? []).join() === to.id,
  );
  const now = await tripLabel();
  const lit = (await litIds(page)) ?? [];
  check(
    "  a tap opens that route's trip in the card's place, its line alone lit",
    now.endsWith(toName) && lit.length === 1 && lit[0] === to.id,
    JSON.stringify({ trip: now, lit, want: to.id }),
  );
  if (!atMax)
    skip(
      '  from Max, the sheet comes down to Middle',
      `the card would not rise to Max: data-snap=${await sheetState()}`,
    );
  else
    check(
      '  from Max, the sheet comes down to Middle',
      (await sheetState()) === 'middle',
      `data-snap=${await sheetState()}`,
    );
  if (!openedFold || (await tripFold.count()) === 0) {
    skip(
      '  its hintuans left open, as they were',
      openedFold ? 'the other route has no hintuans to fold' : 'this trip has no hintuans to fold',
    );
  } else {
    check(
      '  its hintuans left open, as they were',
      (await tripFold.first().getAttribute('aria-expanded')) === 'true',
      `aria-expanded ${await tripFold.first().getAttribute('aria-expanded')}`,
    );
  }
  await closeCard();
}

// -------------------------------------------- 6. the desktop control, ±5 px
const desktop = await b.newContext({ viewport: { width: 1280, height: 800 } });
const dpage = await desktop.newPage();
watch(dpage);
await nodeFetch(dpage);
await dpage.addInitScript(() => {
  window.__src = async (id) => {
    const s = window.__map?.getSource(id);
    return s ? await s.getData() : null;
  };
});
await dpage.goto(`${BASE}/`, { waitUntil: 'load' });
await dpage.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 });
await dpage.waitForTimeout(1500);

// The public map has no +, − or compass for a mouse either since 2026-09-29
// (the owner: "annoying for users"); the studio keeps them.
check(
  'a fine pointer gets no zoom buttons either',
  (await dpage.locator('.maplibregl-ctrl-zoom-in, .maplibregl-ctrl-compass').count()) === 0,
);
check(
  'a fine pointer keeps the attribution bottom right',
  (await dpage.locator('.maplibregl-ctrl-bottom-right .maplibregl-ctrl-attrib').count()) > 0,
);

if (!routeA) {
  skip('a mouse click 4 px beside the line selects it', 'no lone route vertex to click');
} else {
  const r = routeA.route;
  const neighbour = routeA.neighbour;
  await jumpTo(dpage, routeA.point);
  const anchor = await project(dpage, routeA.point);
  const perp = await perpendicular(dpage, routeA.point, neighbour, routeA.route.coords, 20);
  const box = await dpage.locator('canvas.maplibregl-canvas').boundingBox();
  const dCard = dpage.locator('[data-testid="card"]');

  await dpage.mouse.click(box.x + anchor[0] + perp[0] * 4, box.y + anchor[1] + perp[1] * 4);
  await dpage.waitForTimeout(500);
  check(
    'a mouse click 4 px beside the line selects it',
    (await dCard.count()) > 0,
    `card count ${await dCard.count()}`,
  );
  // Its ✕, sent straight to the button: a pointer click waits for nothing
  // to lie over it, and the trip's framing can bring an end's name there.
  await dCard
    .getByRole('button', { name: 'Close', exact: true })
    .first()
    .dispatchEvent('click')
    .catch(() => {});
  const closed = await dpage
    .waitForFunction(() => document.querySelectorAll('[data-testid="card"]').length === 0, null, {
      timeout: 3000,
    })
    .then(() => true)
    .catch(() => false);

  // The box and the hit line add up: a ±5 px box around a line drawn 18 px wide
  // reaches 5 + 9 = 14 px from the centre — the mouse tolerance the map always
  // had, plus the box. 20 px must be outside it.
  const hitWidth = await dpage.evaluate(() =>
    window.__map.getLayer('saved-routes-hit')
      ? window.__map.getPaintProperty('saved-routes-hit', 'line-width')
      : null,
  );
  // The trip the first click opened moved the camera to take it in: back to
  // the vertex, measured again, so the 20 px are 20 px from the line.
  await jumpTo(dpage, routeA.point);
  const anchor2 = await project(dpage, routeA.point);
  const perp2 = await perpendicular(dpage, routeA.point, neighbour, routeA.route.coords, 20);
  await dpage.mouse.click(box.x + anchor2[0] + perp2[0] * 20, box.y + anchor2[1] + perp2[1] * 20);
  await dpage.waitForTimeout(500);
  check(
    'a mouse click 20 px away does not — the fine box is ±5 px on an 18 px hit line',
    (await dCard.count()) === 0,
    `card count ${await dCard.count()} (the first one closed: ${closed}); saved-routes-hit is ${hitWidth} px wide, so a ±5 px box reaches ${5 + Number(hitWidth) / 2} px`,
  );

  // A mouse can hover: over the line the pointer is a hand, and off it, where
  // the click above found nothing, it is not. A phone's finger gets no hover
  // listeners since 2026-10-04 (bindHover, tap.ts); a desktop keeps them.
  const cursor = () => dpage.evaluate(() => window.__map.getCanvas().style.cursor);
  await dpage.mouse.move(box.x + anchor2[0], box.y + anchor2[1], { steps: 4 });
  await dpage.waitForTimeout(300);
  const over = await cursor();
  await dpage.mouse.move(box.x + anchor2[0] + perp2[0] * 20, box.y + anchor2[1] + perp2[1] * 20, {
    steps: 4,
  });
  await dpage.waitForTimeout(300);
  const off = await cursor();
  check(
    'a mouse over the line turns the pointer to a hand, and off it back',
    over === 'pointer' && off === '',
    `over "${over}", 20 px off "${off}"`,
  );
}

// --------------------------------------------------------- 7. housekeeping
if (tapsByHand)
  console.log(
    `\n(${tapsByHand} tap(s) needed the click sent by hand: the runner dropped the touch${lateClicks ? `; ${lateClicks} of those got the touch's own click afterwards too` : ''})\n`,
  );
const odd = await page.evaluate(() => window.__odd ?? []).catch(() => []);
if (odd.length)
  console.log(`
(context menus, drags and cancelled pointers the page saw: ${odd.slice(-20).join(', ')})
`);
if (handleByHand)
  console.log(
    `\n(${handleByHand} gesture(s) on the sheet handle sent by hand as pointer events: the runner made none from the touch)\n`,
  );
check('no request to router.project-osrm.org', !osrmHit);
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await b.close();
tally();
