// Proves, from the production build, that the public page carries no editor.
// Runs as the last step of `npm run build`, so a deploy that would leak fails.
//
// 1. Modules. Walks Vite's manifest from each HTML entry through every chunk it
//    imports, statically or dynamically, and reads which source files went
//    into those chunks (.vite/modules.json, written by the chunkModules plugin
//    in vite.config.ts). No file from src/app/studio/ or src/features/studio/
//    may reach the public page, whatever it contains.
//
// 2. Strings, as a second net: the public chunks may not contain words only
//    the editor has —
//      router.project-osrm.org   the route snapper
//      parapo.draft              the drawing-draft key
//      Sign in to save, Forgot password?, + New Route, Draw the return trip
//      .supabase.co              the database's address: visitors read the
//                                published file and never call it
//
// 3. No Supabase client: since step 5 the public page reads the published
//    file (/data/index.v4.json and the lines; the index since 2026-09-29), so
//    no module from @supabase may reach it — 54 kB gzipped a visitor does not
//    download (the shared chunk went 375 → 321 kB), and a database the public
//    never touches. The live-table readers live in src/features/studio/data/live.ts, which
//    ESLint (import-x/no-restricted-paths) keeps out of the public shell and its features by
//    construction; these two checks are the backstop.
//
// Each check has a positive control on the studio side — its chunks must hold
// studio modules, every marker and the Supabase client — or the search itself
// is broken and a pass would mean nothing. No built file may mention the `e2e`
// test switch, which exists only in development builds, nor hand the map out
// as window.__map, which only development builds and the cheap-phone timer's
// own build do (VITE_EXPOSE_MAP=1, scripts/research/phone-speed.mjs).
//
// 4. The installable app (step 6) belongs to / only: the manifest link is in
//    index.html and not in studio/index.html; the worker's precache holds the
//    public page's chunks, the MapLibre worker and the icons, and no studio
//    chunk, nothing from .vite/ or data/, and not _headers; the studio is on
//    the worker's navigation denylist; a new version waits to be asked.
//
// 5. Weight (stage 6 of the clean-up, 2026-09-29): the fonts are under
//    120 kB together, and what both pages share — MapLibre, React and the
//    shared code — is under 400 kB gzipped, so neither creeps back
//    unnoticed. The fonts are precached. Since the cheap-phone plan's steps
//    12 and 14 (2026-10-05) that is four chunks, named in vite.config.ts,
//    each with a ceiling of its own: `maplibre`, `maplibre-gl-shared` and
//    `react` hold only their packages and import none of our code, and
//    `shared` holds our code; one in the wrong group is too heavy for its
//    ceiling. So a deploy of ours leaves React's name alone, and
//    MapLibre's two unless it starts or stops importing one of MapLibre's
//    exports: Rolldown keeps of MapLibre only what our code imports
//    (vite.config.ts says more), and no check here can tell.
//
// 6. Stylesheet order (step 12 too): on each page, the last rule that places
//    one of MapLibre's four corners is global.css's, inside the safe area, so
//    the attribution the licence asks for is never under a home indicator.
//    And each page asks for its stylesheets before its scripts, so over
//    HTTP/1.1 the first paint does not wait behind them (2026-10-05).
//
// 7. MapLibre's worker (the cheap-phone plan, step 14, 2026-10-05) is a
//    chunk of the page's build, a few kB, that imports MapLibre's shared
//    code from the page's own chunk and nothing else but Vite's preload
//    helper and Rolldown's runtime, all of which the public page loads too.
//    Our shared chunk in its imports would run React and the app in the
//    worker, and the map would not draw.
//
// 8. The map file asked for as the root page is read (the cheap-phone plan,
//    step 20, 2026-10-04; vite.config.ts, mapFileEarly): index.html carries
//    the plain script that asks for MAP_FILE_URL and leaves the request
//    under EARLY_MAP_FILE (both read from map-file.ts), ahead of its module
//    script, preloads and stylesheets; the studio's page has none. Without
//    it the app asks for the file itself, once, and the map opens all the
//    same, only later: no suite would say so (review of the owner's Q1,
//    2026-10-05).
//
//   npm run build        (runs this at the end, with --experimental-strip-types
//                         for the one .ts module it imports)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapFileConstants } from '../node/map-file-constants.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = join(root, 'dist');
const manifestPath = join(dist, '.vite', 'manifest.json');
const modulesPath = join(dist, '.vite', 'modules.json');

const EDITOR_ONLY = [
  'router.project-osrm.org',
  'parapo.draft',
  'Sign in to save',
  'Forgot password?',
  '+ New Route',
  'Draw the return trip',
  '.supabase.co',
];

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

for (const path of [manifestPath, modulesPath]) {
  if (!existsSync(path)) {
    console.log(`FAIL  missing ${path.slice(root.length + 1)} — run vite build first`);
    process.exit(1);
  }
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const modules = JSON.parse(readFileSync(modulesPath, 'utf8'));

/** Every JS file an entry loads, following imports and dynamic imports. */
function chunksOf(entryKey) {
  const seen = new Set();
  const files = new Set();
  const visit = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`manifest has no entry "${key}"`);
    if (chunk.file.endsWith('.js')) files.add(chunk.file);
    for (const k of [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])]) visit(k);
  };
  visit(entryKey);
  return [...files];
}

const commuterFiles = chunksOf('index.html');
const studioFiles = chunksOf('studio/index.html');

// ------------------------------------------------------------------ modules

/** Source modules of ours (under src/) inside the given chunks, relative to the repo. */
function sourceModules(files) {
  const out = new Set();
  for (const file of files) {
    for (const id of modules[file] ?? []) {
      const at = id.indexOf('/src/');
      if (at >= 0 && !id.includes('/node_modules/')) out.add(id.slice(at + 1).replace(/\?.*$/, ''));
    }
  }
  return [...out].sort();
}

const commuterModules = sourceModules(commuterFiles);
const studioModules = sourceModules(studioFiles);

// The design system is domain-free and imports only itself, so it is the
// public page's as much as the studio's: the route list brought its first
// primitives there on 2026-09-28.
const PUBLIC_AREAS = [
  'src/app/public-map/',
  'src/features/routes/',
  'src/features/locator/',
  'src/features/published-map/',
  'src/shared/',
  'src/styles/',
  'src/design-system/',
];
const leakedModules = commuterModules.filter((m) => !PUBLIC_AREAS.some((a) => m.startsWith(a)));
check(
  `public page (${commuterFiles.length} chunk(s), ${commuterModules.length} of our modules) holds only the public shell, routes, locator, published-map, shared, styles and design-system code`,
  commuterModules.length > 0 && leakedModules.length === 0,
  leakedModules.join(', '),
);
const STUDIO_AREAS = ['src/app/studio/', 'src/features/studio/'];
check(
  'studio chunks hold src/app/studio/ and src/features/studio/ modules — the module search works',
  STUDIO_AREAS.every((a) => studioModules.some((m) => m.startsWith(a))),
);

/** Package modules (under node_modules/) inside the given chunks. */
function packageModules(files) {
  const out = new Set();
  for (const file of files) {
    for (const id of modules[file] ?? []) {
      const m = /\/node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(id);
      if (m) out.add(m[1]);
    }
  }
  return [...out].sort();
}
const supabaseInCommuter = packageModules(commuterFiles).filter((p) => p.startsWith('@supabase/'));
check(
  'public page carries no Supabase client',
  supabaseInCommuter.length === 0,
  supabaseInCommuter.join(', '),
);
check(
  'studio chunks carry the Supabase client — the package search works',
  packageModules(studioFiles).some((p) => p.startsWith('@supabase/')),
);

// ------------------------------------------------------------------ strings

const text = (files) => files.map((f) => readFileSync(join(dist, f), 'utf8')).join('\n');
// The worker too: it runs on every visit, and the database's address in
// it would be the public page asking the database (2026-10-03).
const commuter = text([...commuterFiles, ...(existsSync(join(dist, 'sw.js')) ? ['sw.js'] : [])]);
const studio = text(studioFiles);

const leaked = EDITOR_ONLY.filter((s) => commuter.includes(s));
check('public page contains no editor-only string', leaked.length === 0, leaked.join(', '));

const missing = EDITOR_ONLY.filter((s) => !studio.includes(s));
check(
  'studio contains every marker — the string search works',
  missing.length === 0,
  missing.length ? 'missing: ' + missing.join(', ') : '',
);

// --------------------------------------------------------------------- e2e

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}
const E2E = /["'`]e2e["'`]/;
const mentions = [...walk(dist)]
  .filter((f) => /\.(js|html)$/.test(f))
  .filter((f) => E2E.test(readFileSync(f, 'utf8')))
  .map((f) => f.slice(dist.length + 1));
check(
  'no production file mentions the e2e test switch',
  mentions.length === 0,
  mentions.join(', '),
);

// The map object is the suites' and the timer's (2026-10-04): a build made
// with VITE_EXPOSE_MAP=1 hands it to the page as window.__map, from its
// making as window.__mapEarly, and its GL programs as window.__programs (the
// cheap-phone plan, Step 0), and such a build must never be what a deploy
// carries.
const exposing = [...walk(dist)]
  .filter((f) => /\.(js|html)$/.test(f))
  .filter((f) => /__(map|mapEarly|programs)\b/.test(readFileSync(f, 'utf8')))
  .map((f) => f.slice(dist.length + 1));
check(
  "no production file hands out the map as window.__map (VITE_EXPOSE_MAP is the timer's only)",
  exposing.length === 0,
  exposing.join(', '),
);

// --------------------------------------------------------------------- pwa

const html = (f) => readFileSync(join(dist, f), 'utf8');
check(
  'index.html links the manifest',
  /<link rel="manifest" href="\/manifest\.webmanifest">/.test(html('index.html')),
);
check(
  'studio/index.html links no manifest — /studio/ is not installable',
  !/rel="manifest"/.test(html('studio/index.html')),
);
check(
  'neither page carries a registration script',
  !/registerSW|vite-plugin-pwa:/.test(html('index.html') + html('studio/index.html')),
);
// Over HTTP/1.1 the scripts ahead of a stylesheet can take all six of a
// host's connections, and the first paint waits a round trip
// (vite.config.ts, stylesheetsBeforeScripts, 2026-10-05).
for (const page of ['index.html', 'studio/index.html']) {
  const head = html(page).slice(0, html(page).indexOf('</head>'));
  const sheets = [...head.matchAll(/<link rel="stylesheet"/g)].map((m) => m.index);
  const scripts = [...head.matchAll(/<script type="module"|<link rel="modulepreload"/g)].map(
    (m) => m.index,
  );
  check(
    `${page} asks for its ${sheets.length} stylesheet(s) before its module script and its ${scripts.length - 1} preload(s)`,
    sheets.length > 0 && scripts.length > 0 && Math.max(...sheets) < Math.min(...scripts),
  );
}

// --------------------------------------------------- the early map file (8)

// Read off the file's text by the reader vite.config.ts uses (scripts/node/
// map-file-constants.ts), which throws naming what is missing.
let MAP_FILE_URL = null;
let EARLY_MAP_FILE = null;
let constantsError = '';
try {
  ({ MAP_FILE_URL, EARLY_MAP_FILE } = mapFileConstants(
    readFileSync(join(root, 'src', 'features', 'published-map', 'map-file.ts'), 'utf8'),
  ));
} catch (e) {
  constantsError = e instanceof Error ? e.message : String(e);
}
check(
  'map-file.ts names the map file and where the root page leaves its request for it — the search below works',
  !!MAP_FILE_URL && !!EARLY_MAP_FILE,
  constantsError || `MAP_FILE_URL ${MAP_FILE_URL}, EARLY_MAP_FILE ${EARLY_MAP_FILE}`,
);
if (MAP_FILE_URL && EARLY_MAP_FILE) {
  const head = html('index.html').slice(0, html('index.html').indexOf('</head>'));
  const early = [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)].find((m) =>
    m[1].includes(`window.${EARLY_MAP_FILE}=`),
  );
  const after = [
    ...head.matchAll(/<script type="module"|<link rel="modulepreload"|<link rel="stylesheet"/g),
  ].map((m) => m.index);
  check(
    `index.html asks for ${MAP_FILE_URL} as it is read: a plain script in its head, ahead of its module script, preloads and stylesheets, leaving the request as window.${EARLY_MAP_FILE}`,
    !!early &&
      early[1].includes(`fetch(${JSON.stringify(MAP_FILE_URL)},`) &&
      after.length > 0 &&
      early.index < Math.min(...after),
    early
      ? `at ${early.index}, the first script or stylesheet at ${Math.min(...after)}`
      : 'no such script',
  );
  const studioPage = html('studio/index.html');
  check(
    'studio/index.html asks for no map file',
    !studioPage.includes(EARLY_MAP_FILE) && !studioPage.includes(MAP_FILE_URL),
  );
}

const manifestFile = join(dist, 'manifest.webmanifest');
let webManifest = null;
try {
  webManifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
} catch {}
check('manifest.webmanifest is valid JSON', webManifest !== null);
if (webManifest) {
  const icons = webManifest.icons ?? [];
  const hasIcon = (size, purpose) =>
    icons.some(
      (i) =>
        i.sizes === size &&
        (purpose ? i.purpose === purpose : !i.purpose) &&
        existsSync(join(dist, i.src)),
    );
  check(
    'manifest: name, id/start_url/scope /, standalone, colours',
    webManifest.name === 'Para Po' &&
      webManifest.short_name === 'Para Po' &&
      webManifest.id === '/' &&
      webManifest.start_url === '/' &&
      webManifest.scope === '/' &&
      webManifest.display === 'standalone' &&
      /^#[0-9a-f]{6}$/.test(webManifest.theme_color) &&
      /^#[0-9a-f]{6}$/.test(webManifest.background_color),
  );
  check(
    'manifest: icons 192, 512 and 512 maskable, all present on disk',
    hasIcon('192x192') && hasIcon('512x512') && hasIcon('512x512', 'maskable'),
  );
  const themeMeta = /<meta name="theme-color" content="([^"]+)"/.exec(html('index.html'))?.[1];
  check(
    'index.html theme-color matches the manifest',
    themeMeta === webManifest.theme_color,
    `${themeMeta} vs ${webManifest.theme_color}`,
  );
}

const swPath = join(dist, 'sw.js');
check('sw.js exists', existsSync(swPath));
if (existsSync(swPath)) {
  const sw = readFileSync(swPath, 'utf8');
  const precached = [...sw.matchAll(/"?url"?:\s*"([^"]+)"/g)].map((m) => m[1]);
  const expected = ['index.html', 'manifest.webmanifest', ...commuterFiles];
  const cssOf = (files) =>
    files.flatMap((f) => Object.values(manifest).find((c) => c.file === f)?.css ?? []);
  expected.push(...cssOf(commuterFiles));
  const missingPrecache = expected.filter((f) => !precached.includes(f));
  check(
    `precache holds the public page, its ${commuterFiles.length} chunk(s) and CSS (${precached.length} entries)`,
    missingPrecache.length === 0,
    missingPrecache.length ? 'missing: ' + missingPrecache.join(', ') : '',
  );
  check(
    'precache holds the MapLibre worker',
    precached.some((u) => /^assets\/maplibre-gl-worker-.*\.js$/.test(u)),
  );
  const fonts = readdirSync(join(dist, 'assets'))
    .filter((f) => f.endsWith('.woff2'))
    .map((f) => `assets/${f}`);
  check(
    `precache holds the ${fonts.length} font files`,
    fonts.length > 0 && fonts.every((f) => precached.includes(f)),
    fonts.filter((f) => !precached.includes(f)).join(', '),
  );
  check(
    'precache holds the three icons',
    ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png'].every((u) =>
      precached.includes(u),
    ),
  );
  const studioOnly = studioFiles.filter((f) => !commuterFiles.includes(f));
  const leakedPrecache = precached.filter(
    (u) => studioOnly.includes(u) || /^(studio\/|\.vite\/|data\/|branding\/|_headers)/.test(u),
  );
  check(
    `precache holds no studio chunk (${studioOnly.length} to keep out), nothing from studio/, .vite/, data/, branding/, no _headers`,
    studioOnly.length > 0 && leakedPrecache.length === 0,
    leakedPrecache.join(', '),
  );
  check(
    'sw.js answers only / from the stored page, and never /studio',
    sw.includes('/^\\/(\\?.*)?$/') && sw.includes('/^\\/studio(\\/|$)/'),
  );
  check(
    'sw.js caches /data/index.v4.json NetworkFirst (stamping what it serves from the store), the lines under /data/lines/, the signboards under /data/signboards/, and OpenFreeMap tiles CacheFirst',
    sw.includes('/data/index.v4.json') &&
      sw.includes('/data/lines/') &&
      sw.includes('map-lines') &&
      sw.includes('/data/signboards/') &&
      sw.includes('x-parapo-served-from') &&
      sw.includes('tiles.openfreemap.org') &&
      sw.includes('map-file') &&
      sw.includes('basemap-tiles'),
  );
  // With `skipWaiting: false` Workbox calls skipWaiting() once, inside the
  // handler for the page's SKIP_WAITING message — never on its own.
  const msgAt = sw.indexOf('SKIP_WAITING');
  const skipAt = sw.indexOf('skipWaiting()');
  // A missing file is the map's page, 200 (wrangler.jsonc): each store keeps
  // only its own type, or that page was kept as the map (2026-10-03).
  check(
    'sw.js keeps only JSON as the map and its lines, and only SVG as a signboard',
    (sw.match(/startsWith\("application\/json"\)/g) ?? []).length >= 2 &&
      sw.includes('startsWith("image/svg+xml")'),
  );
  check(
    'sw.js waits to be told to update (one skipWaiting(), inside the SKIP_WAITING handler)',
    msgAt >= 0 && skipAt > msgAt && sw.indexOf('skipWaiting()', skipAt + 1) === -1,
  );
}

// 5. Weight.
const FONTS_MAX_KB = 120;
const assetFiles = readdirSync(join(dist, 'assets'));
const fontBytes = assetFiles
  .filter((f) => f.endsWith('.woff2'))
  .reduce((n, f) => n + statSync(join(dist, 'assets', f)).size, 0);
check(
  `the fonts weigh under ${FONTS_MAX_KB} kB together`,
  fontBytes > 0 && fontBytes < FONTS_MAX_KB * 1024,
  `${(fontBytes / 1024).toFixed(1)} kB`,
);

// What both pages share, gzipped, in kB on 2026-10-05: MapLibre's page
// file 137.4 and the code it shares with its worker 134.8 (step 14; one
// chunk of 249.7 at step 12, the worker's share being in the worker then),
// React 57.6 and our shared code 41.0, 370.8 together (the one chunk it was
// weighed 348.4). Each ceiling leaves some headroom and none for another
// group's package: React in `shared` is +58, a half of MapLibre +135.
// `packages` is what the chunk may hold from node_modules, `only` the files
// it may hold; `vendor` chunks may import no chunk of ours.
const SHARED_MAX_GZ_KB = 400;
const MAPLIBRE_FILE = (name) => new RegExp(`/node_modules/maplibre-gl/dist/${name}\\.mjs$`);
const GROUPS = [
  {
    name: 'maplibre',
    maxGzKb: 160,
    vendor: true,
    packages: ['maplibre-gl'],
    only: MAPLIBRE_FILE('maplibre-gl'),
    holds: 'maplibre-gl.mjs alone, and imports none of our code',
  },
  {
    name: 'maplibre-gl-shared',
    maxGzKb: 160,
    vendor: true,
    packages: ['maplibre-gl'],
    only: MAPLIBRE_FILE('maplibre-gl-shared'),
    holds: 'maplibre-gl-shared.mjs alone, and imports none of our code',
  },
  {
    name: 'react',
    maxGzKb: 70,
    vendor: true,
    packages: ['react', 'react-dom', 'scheduler'],
    holds: 'react, react-dom and scheduler, none of our code, and imports none of it',
  },
  // From maplibre-gl, its stylesheet and the worker's address (map-view.tsx);
  // its JavaScript here would be over the ceiling.
  {
    name: 'shared',
    maxGzKb: 80,
    vendor: false,
    packages: ['maplibre-gl'],
    holds: 'our shared code and no package but maplibre-gl',
  },
];
// A group's chunk is the one Vite's manifest names after it.
const chunksNamed = (name) =>
  Object.values(manifest).filter((c) => c.name === name && c.file.endsWith('.js'));
const vendorFiles = GROUPS.filter((g) => g.vendor).flatMap((g) =>
  chunksNamed(g.name).map((c) => c.file),
);
let groupsGz = 0;
for (const { name, maxGzKb, vendor, packages, only, holds } of GROUPS) {
  const chunks = chunksNamed(name);
  const files = chunks.map((c) => c.file);
  const gz = files.reduce((n, f) => n + gzipSync(readFileSync(join(dist, f))).length, 0);
  groupsGz += gz;
  check(
    `the ${name} chunk is named, loaded by the public page, and under ${maxGzKb} kB gzipped`,
    files.length === 1 && commuterFiles.includes(files[0]) && gz < maxGzKb * 1024,
    `${files.join(', ') || `no chunk named ${name}`}: ${(gz / 1024).toFixed(1)} kB`,
  );
  const strays = [
    ...packageModules(files).filter((p) => !packages.includes(p)),
    ...(only ? files.flatMap((f) => modules[f] ?? []).filter((id) => !only.test(id)) : []),
  ];
  const ours = vendor ? sourceModules(files) : [];
  // Rolldown's runtime and Vite's preload helper (vite-preload, which a
  // package's dynamic import would bring) are a few helpers each, the same
  // whatever we write.
  const imports = vendor
    ? chunks
        .flatMap((c) => c.imports ?? [])
        .map((k) => manifest[k].file)
        .filter(
          (f) =>
            !vendorFiles.includes(f) &&
            !/^assets\/(rolldown-runtime|vite-preload)-[\w-]+\.js$/.test(f),
        )
    : [];
  check(
    `the ${name} chunk holds ${holds}`,
    files.length === 1 &&
      packageModules(files).length > 0 &&
      strays.length === 0 &&
      (vendor ? ours.length === 0 && imports.length === 0 : sourceModules(files).length > 0),
    [...strays, ...ours, ...imports].join(', '),
  );
}
check(
  `MapLibre, React and the shared code are under ${SHARED_MAX_GZ_KB} kB gzipped together`,
  groupsGz < SHARED_MAX_GZ_KB * 1024,
  `${(groupsGz / 1024).toFixed(1)} kB`,
);

// 6. Stylesheet order. The rules each page's stylesheets hold, in the order
// the page links them; a rule inside an at-rule is read as if outside it.
const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
for (const page of ['index.html', 'studio/index.html']) {
  const sheets = [...html(page).matchAll(/<link rel="stylesheet"[^>]*href="\/([^"]+)"/g)].map(
    (m) => m[1],
  );
  const css = sheets.map((f) => readFileSync(join(dist, f), 'utf8')).join('\n');
  const last = {};
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const corner of CORNERS) {
      const places = body.split(';').some((p) => /^\s*(top|bottom|left|right)\s*:/.test(p));
      if (places && selectors.split(',').some((s) => s.trim() === `.maplibregl-ctrl-${corner}`))
        last[corner] = body;
    }
  }
  const outside = CORNERS.filter((c) => !/env\(safe-area-inset-/.test(last[c] ?? ''));
  check(
    `${page}: MapLibre's stylesheet is linked, and the last rule placing each of its corners is inside the safe area`,
    css.includes('.maplibregl-map{') && outside.length === 0,
    outside.map((c) => `${c}: ${last[c] ?? 'no rule'}`).join('; '),
  );
}

// 7. MapLibre's worker: its chunk, and every chunk it imports, all the way
// down, read from Vite's manifest and from what went into each.
const WORKER_MAX_GZ_KB = 20;
const workerChunks = chunksNamed('maplibre-gl-worker');
const workerFile = workerChunks[0]?.file;
const workerGz = workerFile ? gzipSync(readFileSync(join(dist, workerFile))).length : 0;
check(
  `MapLibre's worker is a chunk of the build, its own file alone, under ${WORKER_MAX_GZ_KB} kB gzipped`,
  workerChunks.length === 1 &&
    /^assets\/maplibre-gl-worker-[\w-]+\.js$/.test(workerFile) &&
    (modules[workerFile] ?? []).length === 1 &&
    MAPLIBRE_FILE('maplibre-gl-worker').test(modules[workerFile][0]) &&
    workerGz < WORKER_MAX_GZ_KB * 1024,
  `${workerFile ?? 'no chunk named maplibre-gl-worker'}: ${(workerGz / 1024).toFixed(1)} kB`,
);
const workerImports = new Set();
const importsOf = (chunk) => {
  for (const key of [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])]) {
    const c = manifest[key];
    if (c && !workerImports.has(c.file)) {
      workerImports.add(c.file);
      importsOf(c);
    }
  }
};
workerChunks.forEach(importsOf);
const WORKER_MAY_IMPORT = [
  MAPLIBRE_FILE('maplibre-gl-shared'),
  /^\0vite\/preload-helper\.js$/,
  /^\0rolldown\/runtime\.js$/,
];
const strayInWorker = [...workerImports].flatMap((f) =>
  (modules[f] ?? ['(no modules listed)'])
    .filter((id) => !WORKER_MAY_IMPORT.some((re) => re.test(id)))
    .map((id) => `${f}: ${id.replace('\0', '\\0')}`),
);
check(
  "the worker imports MapLibre's shared code from the page's own chunk, and nothing else but Vite's preload helper and Rolldown's runtime: no React, none of our code",
  workerImports.has(chunksNamed('maplibre-gl-shared')[0]?.file) && strayInWorker.length === 0,
  strayInWorker.slice(0, 5).join(', ') || [...workerImports].join(', '),
);
const unloaded = [...workerImports].filter((f) => !commuterFiles.includes(f));
check(
  'the public page loads every chunk the worker imports, so the worker finds each one already downloaded',
  workerImports.size > 0 && unloaded.length === 0,
  unloaded.join(', '),
);

process.exit(failed ? 1 : 0);
