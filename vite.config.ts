import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

import { basemapCacheRules } from './scripts/node/basemap-offline.ts';
import { contributeWorker } from './scripts/node/contribute-worker.ts';
import { mapFileConstants } from './scripts/node/map-file-constants.ts';
import { offlineWorker } from './scripts/node/offline-worker.ts';
import { basemapPreconnect } from './scripts/node/vite-plugins/basemap-preconnect.ts';
import { chunkModules } from './scripts/node/vite-plugins/chunk-modules.ts';
import { mapFileEarly } from './scripts/node/vite-plugins/map-file-early.ts';
import { maplibreWorkerWithThePage } from './scripts/node/vite-plugins/maplibre-worker.ts';
import { onlyTheMapHasAManifest } from './scripts/node/vite-plugins/only-the-map-has-a-manifest.ts';
import { stylesheetsFirst } from './scripts/node/vite-plugins/stylesheets-first.ts';
import { parseBasemapHost } from './src/shared/config/basemap-host.ts';

// The map file's address and the early request's name, read from map-file.ts's
// text rather than imported: Vite bundles this config before any alias exists,
// and map-file.ts reaches the rest of the app through `@/`. The same reader
// guards the build in check-build.mjs.
const { MAP_FILE_URL, EARLY_MAP_FILE } = mapFileConstants(
  readFileSync(new URL('./src/features/routes/published/map-file.ts', import.meta.url), 'utf8'),
);

// The basemap host the offline worker caches from, read the way the app reads it
// (shared/config/env.ts). A worker is only built by `vite build`, so its mode is
// production; the same value reaches scripts/checks/check-build.mjs.
const BASEMAP_HOST = parseBasemapHost(
  loadEnv('production', process.cwd(), 'VITE_').VITE_BASEMAP_HOST,
);

export default defineConfig({
  plugins: [
    maplibreWorkerWithThePage(),
    react(),
    tailwindcss(),
    chunkModules(),
    mapFileEarly(MAP_FILE_URL, EARLY_MAP_FILE),
    basemapPreconnect(BASEMAP_HOST),
    // The public map's manifest and offline worker: dist/sw.js.
    offlineWorker(basemapCacheRules(BASEMAP_HOST)),
    onlyTheMapHasAManifest(),
    stylesheetsFirst(),
    // The contributor page's own worker, apart from the one above: dist/contribute/sw.js.
    contributeWorker(),
  ],
  resolve: {
    // `@/x` is src/x, for any import that leaves its own folder. tsconfig.json
    // (`paths`), scripts/node/ts-resolve-hook.mjs and ESLint's resolver
    // (eslint.config.js, from tsconfig) know the same alias; Storybook takes
    // it from here.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // Supabase's redirect allow-list names http://localhost:5173 exactly. If
    // Vite drifted to 5174 because the port was busy, every auth link would
    // silently land on the production Site URL instead. Fail loudly instead.
    port: 5173,
    strictPort: true,
  },
  build: {
    // Three front doors, one build: the public map at /, the editor at /studio/
    // and the contributors' field test at /contribute/. Each HTML file is its own
    // entry point with its own <head>.
    rolldownOptions: {
      input: {
        'public-map': 'index.html',
        studio: 'studio/index.html',
        contribute: 'contribute/index.html',
      },
      // What both pages load, in chunks named for what they are: MapLibre,
      // React, and the shared code. As one chunk, any change to src/features,
      // src/shared or src/design-system gave it a new name, and every
      // returning phone fetched MapLibre and React again with it, over a link
      // the commuter's index and tiles want too. Apart, such a deploy is our
      // own code alone. React's chunk keeps its name until React is upgraded:
      // it is CommonJS, kept whole. MapLibre's two keep theirs until it is
      // upgraded, or until our code starts or stops importing one of its
      // exports: its .mjs files have no side effects (its package.json), so
      // Rolldown keeps of them only what our code reaches. A Popup imported,
      // or the ScaleControl dropped, renames maplibre-*.js, which every
      // returning phone fetches again; importing all of MapLibre renames
      // maplibre-gl-shared-*.js too, and with it the worker's chunk, which
      // imports it by name.
      //  - maplibre-gl-shared: the code MapLibre's page and
      //    worker files share, in a chunk of its own so that the worker
      //    (maplibreWorkerWithThePage) imports it and nothing of the page.
      //    With it, Vite's preload helper (vite-preload): Vite wraps each
      //    dynamic import in a build, the worker's two too (MapLibre's
      //    importScriptInWorkers, which the app never calls), and the page's
      //    workbox-window; left to the shared group, it would bring our code
      //    and React into the worker.
      //  - maplibre: maplibre-gl.mjs, its page's JavaScript. Not its
      //    stylesheet, which stays with the shared code's CSS
      //    (shared-*.css), ahead of global.css's safe-area overrides of its
      //    corners, which must come after it to win; and not the worker's
      //    file, which would bring it all into the worker.
      //  - react: react, react-dom and scheduler.
      //  - shared: a module goes in when two chunks import it — Rolldown
      //    counts lazy chunks as well as the two entries — so
      //    check-build.mjs, not this rule, is what proves the studio's
      //    Supabase stays out of what the public page loads. Named, so it
      //    does not take the name of one of its modules.
      // Each one's size is a guard in check-build.mjs; MapLibre is most of
      // it and is what keeps a thousand lines smooth, so the 500 kB warning
      // is answered by those guards rather than by splitting it further.
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'maplibre-gl-shared',
              test: /[\\/]node_modules[\\/]maplibre-gl[\\/]dist[\\/]maplibre-gl-shared\.mjs$/,
              priority: 3,
            },
            { name: 'vite-preload', test: /^\0vite\/preload-helper\.js$/, priority: 3 },
            {
              name: 'maplibre',
              test: /[\\/]node_modules[\\/]maplibre-gl[\\/]dist[\\/]maplibre-gl\.mjs$/,
              priority: 2,
            },
            //  - zod: the validator the published index is read with, in a chunk of
            //    its own so check-build.mjs can weigh it and `shared` stays
            //    our code alone.
            {
              name: 'zod',
              test: /[\\/]node_modules[\\/]zod[\\/]/,
              priority: 1,
            },
            {
              name: 'react',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 1,
            },
            //  - supabase: the database client and what it brings. The studio and
            //    the contributor page both import it, so left to `shared` it
            //    would ride along on the public page, which never calls the
            //    database (check-build.mjs proves it does not).
            {
              name: 'supabase',
              test: /[\\/]node_modules[\\/](@supabase[\\/][^\\/]+|iceberg-js|tslib)[\\/]/,
              priority: 1,
            },
            //  - tanstack-query: the studio's server state (the review queue
            //    and the Contributors map), two lazy chunks of the studio's.
            {
              name: 'tanstack-query',
              test: /[\\/]node_modules[\\/]@tanstack[\\/]/,
              priority: 1,
            },
            //  - fields: the design system's input fields, which only the
            //    studio and the contributor page draw. Both import them, so left
            //    to `shared` they would ride along on the public page, which has
            //    no form.
            {
              name: 'fields',
              test: /[\\/]src[\\/]design-system[\\/]primitives[\\/](field-frame|field-error|field-icons|text-field|text-area-field|password-field|select-field)\.tsx$/,
              priority: 1,
            },
            //  - shared never takes the studio's or the contributor page's own
            //    modules, nor Turnstile, which only those two load: two of
            //    their chunks importing one would otherwise put it on the
            //    public page. Nor the published map's fetchers: the contributor
            //    page reads them only once its map has settled (its faint
            //    routes), so in `shared` they would ride along on its opening.
            //    Left out, they are a chunk of their own that the public page
            //    opens with and the contributor page fetches later.
            {
              name: 'shared',
              minShareCount: 2,
              test: (id: string) =>
                !/[\\/]src[\\/]((app|features)[\\/](studio|contribute)[\\/]|shared[\\/]ui[\\/]turnstile|features[\\/]routes[\\/]published[\\/](fetch-index|fetch-line|line-file-schema)\.ts$)/.test(
                  id,
                ),
            },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 1300,
    // .vite/manifest.json records which chunks each page loads, so
    // scripts/checks/check-build.mjs can prove the public page carries no editor.
    // public/.assetsignore keeps .vite/ off the live site.
    manifest: true,
  },
  // MapLibre spawns its worker with { type: 'module' }; emit it as an ES chunk.
  worker: { format: 'es' },
  optimizeDeps: {
    // MapLibre 6 spawns its tile worker from a sibling file resolved via
    // import.meta.url. Vite's dev pre-bundler relocates the library into
    // node_modules/.vite/deps/ without that file, so the worker 404s
    // silently, tiles never parse and the map never fires 'load'.
    // MapView also sets the worker URL explicitly; this stays as a belt.
    exclude: ['maplibre-gl'],
  },
});
