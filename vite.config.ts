import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { EARLY_MAP_FILE, MAP_FILE_URL } from './src/commuter/mapFile.ts'

/**
 * Writes .vite/modules.json: every output chunk and the source modules inside
 * it. Vite's manifest lists which chunks a page loads but not what went into
 * them; with this, scripts/checks/check-build.mjs can prove that no file from
 * src/studio/ reaches the public page, whatever that file happens to contain.
 */
function chunkModules(): Plugin {
  return {
    name: 'parapo:chunk-modules',
    apply: 'build',
    generateBundle(_options, bundle) {
      const modules: Record<string, string[]> = {}
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') {
          modules[output.fileName] = output.moduleIds.map((id) => id.replaceAll('\\', '/'))
        }
      }
      this.emitFile({
        type: 'asset',
        fileName: '.vite/modules.json',
        source: JSON.stringify(modules, null, 1),
      })
    },
  }
}

/**
 * The PWA plugin writes its `<link rel="manifest">` into every page it builds
 * without looking at which page it is, so left alone /studio/ would install
 * as Para Po too. This runs after it (both are post-order; this one is later
 * in the list) and takes the link back out of the studio page. The manifest
 * belongs to / only; scripts/checks/check-build.mjs checks the built studio page.
 */
function studioWithoutManifest(): Plugin {
  return {
    name: 'parapo:studio-without-manifest',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.filename.replaceAll('\\', '/').endsWith('/studio/index.html')) return html
        return html.replace(/<link rel="manifest"[^>]*>/g, '')
      },
    },
  }
}

/**
 * Each page asks for its stylesheets before its scripts (2026-10-05, for
 * the cheap-phone plan's steps 12 and 14). Vite writes the page's module
 * script, then a modulepreload for every chunk it imports, then the
 * stylesheets. Over HTTP/1.1 a browser opens six connections to a host:
 * once the page loads seven scripts (MapLibre in two chunks, step 14; React
 * and the shared code in one each, step 12; the entry, Rolldown's runtime
 * and Vite's preload helper), those ahead took all six, and the
 * stylesheets, which hold up the first paint, waited a round trip for one
 * to come free (the cheap-phone timer: first paint 1.76 -> 2.49 s). HTTP/2
 * and 3 have no such limit, but a phone behind a proxy, and the timer's own
 * server, speak HTTP/1.1. Moved to just before the module script: still
 * after index.html's early map-file script (a script after a stylesheet
 * waits for it), in the same order, so the cascade is the same, and the
 * module scripts waited for them anyway.
 */
export function stylesheetsBeforeScripts(html: string): string {
  const head = html.indexOf('</head>')
  const script = html.search(/<script type="module"[^>]*\ssrc=/)
  if (head < 0 || script < 0 || script > head) return html
  const sheets = html.slice(script, head).match(/<link rel="stylesheet"[^>]*>/g)
  if (!sheets) return html
  let rest = html.slice(script, head)
  for (const sheet of sheets) rest = rest.replace(new RegExp(`\\n?[ \\t]*${sheet.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`), '')
  const indent = /[ \t]*$/.exec(html.slice(0, script))![0]
  return html.slice(0, script) + sheets.map((s) => `${s}\n${indent}`).join('') + rest + html.slice(head)
}
function stylesheetsFirst(): Plugin {
  return {
    name: 'parapo:stylesheets-first',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: { order: 'post', handler: stylesheetsBeforeScripts },
  }
}

/**
 * Where this build writes, as Vite resolved it: dist/ for `npm run build`,
 * its own folder for scripts/research/phone-speed.mjs (2026-10-04). The
 * precache below is cut down by that build's own manifest. Read from dist/
 * whatever the folder, as it was, the timer's build was cut down by dist/'s
 * chunk names, and its own page's two chunks were left out of its precache.
 */
let outDir = 'dist'
function readOutDir(): Plugin {
  return {
    name: 'parapo:out-dir',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
  }
}

/**
 * The map file, asked for by the map's page as it is read (the cheap-phone
 * plan, step 20, 2026-10-04): a few lines of plain script in the <head> of
 * the root index.html, ahead of the app's own script and stylesheets (a
 * script after a stylesheet waits for it), so the 22 kB file comes over
 * while the app's 385 kB (355 before step 14, 2026-10-05) still downloads,
 * and the routes can go onto the map as soon as its style is in (the
 * owner's Q1, MapView's `openOn`). mapFile.ts takes the answer once, under
 * EARLY_MAP_FILE, and treats it as the one it would have fetched itself.
 * `no-cache`, as mapFile.ts asks: the file keeps no hash in its name. Low
 * priority: the app's script, which needs the whole link, keeps it first.
 * The studio's page reads the live tables and gets none. Not a word of the
 * registration here: check-build.mjs fails a page that carries one.
 */
function mapFileEarly(): Plugin {
  const script =
    `(function(){if(!window.fetch)return;` +
    `var q=fetch(${JSON.stringify(MAP_FILE_URL)},{cache:'no-cache',priority:'low'})` +
    `.then(function(r){return{res:r,body:r.ok?r.clone().json().catch(function(){}):null}});` +
    `q.catch(function(){});window.${EARLY_MAP_FILE}=q})()`
  return {
    name: 'parapo:map-file-early',
    transformIndexHtml: {
      // Before Vite's own: in a build, the app's script and stylesheets are
      // added to the <head> after what is there by then.
      order: 'pre',
      handler(html, ctx) {
        if (ctx.path !== '/index.html') return html
        return { html, tags: [{ tag: 'script', children: script, injectTo: 'head' }] }
      },
    },
  }
}

/**
 * MapLibre's worker, built with the page instead of on its own (the
 * cheap-phone plan, step 14, 2026-10-05). MapLibre 6 ships three files: the
 * page's maplibre-gl.mjs and the worker's maplibre-gl-worker.mjs both import
 * maplibre-gl-shared.mjs, most of the code. `?worker&url` built the worker as
 * a bundle of its own, the shared file copied into it: 135 kB gzipped that
 * the map's 'load' waits for, of code the page had just downloaded. Here the
 * worker is a chunk of the page's own build, so it imports the page's
 * maplibre-gl-shared chunk (the priority-3 group below), which the browser
 * already holds, and what is left of it is a few kB.
 *
 * Build only: under `npm run dev` MapView.tsx's `?worker&url` reaches Vite's
 * own worker plugin as it always did. In a build this answers that import
 * first, with the URL of the chunk it emits. check-build.mjs proves the
 * worker imports nothing but MapLibre's shared code and Vite's preload
 * helper: our shared chunk, with React, in the worker would stop the map.
 */
export const MAPLIBRE_WORKER_URL = 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
export function maplibreWorkerWithThePage(): Plugin {
  const resolved = '\0parapo:maplibre-worker-url'
  return {
    name: 'parapo:maplibre-worker',
    apply: 'build',
    // Ahead of Vite's worker plugin, which would build it on its own.
    enforce: 'pre',
    resolveId(source) {
      return source === MAPLIBRE_WORKER_URL ? resolved : null
    },
    async load(id) {
      if (id !== resolved) return null
      const worker = await this.resolve('maplibre-gl/dist/maplibre-gl-worker.mjs')
      if (!worker) throw new Error('maplibre-gl/dist/maplibre-gl-worker.mjs is missing')
      const ref = this.emitFile({ type: 'chunk', id: worker.id, name: 'maplibre-gl-worker' })
      // `new URL('maplibre-gl-worker-<hash>.js', import.meta.url).href` in
      // the chunk that reads it, beside it in assets/.
      return `export default import.meta.ROLLUP_FILE_URL_${ref}`
    },
  }
}

/** Brand colours, measured from the logo: the wordmark's maroon and a warm off-white behind the pin. */
const THEME_COLOUR = '#8a595a'
const BACKGROUND_COLOUR = '#f5f1ee'

// The `urlPattern` functions below are copied into the worker as text, so they
// must not reach for anything outside themselves: the OpenFreeMap origin is
// spelled out in each rather than shared as a constant.

export default defineConfig({
  plugins: [
    maplibreWorkerWithThePage(),
    react(),
    tailwindcss(),
    chunkModules(),
    readOutDir(),
    mapFileEarly(),
    VitePWA({
      // The page registers the worker itself (src/commuter/pwa.ts), so the
      // plugin writes no registration script — and none into /studio/.
      injectRegister: false,
      // A new version waits until the visitor taps "Reload": a silent reload
      // mid-ride would throw away the selected route.
      registerType: 'prompt',
      // Off under `npm run dev`, so the headless checks never meet a worker.
      // Test with `npm run build && npm run preview` (tests/e2e/pwa-test.mjs).
      devOptions: { enabled: false },
      manifest: {
        name: 'Para Po',
        short_name: 'Para Po',
        description: 'Jeepney routes in Metro Manila, drawn from the ground.',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        lang: 'en',
        theme_color: THEME_COLOUR,
        background_color: BACKGROUND_COLOUR,
        categories: ['navigation', 'travel'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The commuter shell and nothing else. The glob keeps out studio/,
        // .vite/, data/ and _headers by construction; the transform below
        // then drops every chunk the public page does not load, so a studio-only
        // chunk (the editor, the Supabase client) is never stored on a phone.
        // The fonts too, since they were subset to Latin (2026-09-29, 109 kB
        // for all six): offline, the text keeps its face.
        globPatterns: ['index.html', 'manifest.webmanifest', 'assets/*.{js,css,woff2}', 'icons/icon-*.png'],
        manifestTransforms: [
          (entries) => {
            // Written by Vite with the bundle; the worker is generated after.
            const manifestPath = join(outDir, '.vite', 'manifest.json')
            if (!existsSync(manifestPath)) {
              throw new Error(`${manifestPath} is missing: the precache cannot be limited to the public page`)
            }
            const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
              string,
              { file: string; css?: string[]; assets?: string[]; imports?: string[]; dynamicImports?: string[] }
            >
            const keep = new Set<string>()
            const visit = (key: string) => {
              const chunk = manifest[key]
              if (!chunk || keep.has(chunk.file)) return
              keep.add(chunk.file)
              for (const css of chunk.css ?? []) keep.add(css)
              for (const asset of chunk.assets ?? []) keep.add(asset)
              for (const k of [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])]) visit(k)
            }
            visit('index.html')
            // MapLibre's tile worker is a chunk of its own (maplibreWorkerWithThePage,
            // 2026-10-05) that no page imports, so the walk from index.html never
            // reaches it; without it the map draws nothing. What it imports, the
            // page imports too.
            const wanted = (url: string) =>
              !url.startsWith('assets/') || keep.has(url) || /^assets\/maplibre-gl-worker-/.test(url)
            return { manifest: entries.filter((e) => wanted(e.url)), warnings: [] }
          },
        ],
        // The map has exactly one address, `/` (with any query), and only that is
        // answered from the stored page. Any other navigation goes to the
        // server as it would without a worker — so `/studio` (with or without
        // the slash) opens the studio, and `/data/index.v4.json` typed into a tab
        // shows the data, not the app. The studio sits inside the installed
        // app's scope regardless; the denylist is the belt to the allowlist.
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^\/(\?.*)?$/],
        navigateFallbackDenylist: [/^\/studio(\/|$)/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: [
          {
            // The published map's index: fresh when the network answers in
            // time, the last copy otherwise. Only GET, only this file — the
            // studio's database reads share the origin and must never come
            // from here. (Shapes 1 to 3, /data/map.json, /data/index.json and
            // /data/index.v3.json, are older apps', each read through its own
            // worker; an older copy left in this store is the offline map
            // until the new one is fetched, mapFile.ts's STORED_OLD.)
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.origin === self.location.origin && url.pathname === '/data/index.v4.json',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'map-file',
              networkTimeoutSeconds: 3,
              // Only a real 200. Nothing here is fetched opaque (same origin,
              // and MapLibre asks with CORS), and Chrome charges an opaque
              // entry several MB of quota.
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 1 },
              plugins: [
                {
                  // Only JSON. The host answers a missing file with the
                  // map's page, 200 (wrangler.jsonc, single-page-application),
                  // and a 200 alone kept that page as the map (review of
                  // 2026-10-03). Inline: the worker is written from this.
                  cacheWillUpdate: async ({ response }) =>
                    (response.headers.get('content-type') ?? '').startsWith('application/json') ? response : null,
                },
                {
                  // Stamp what comes from the store, so the page can say
                  // "Not refreshed" honestly even while the phone believes it
                  // is online (a slow network answered after the timeout).
                  cachedResponseWillBeUsed: async ({ cachedResponse }) => {
                    if (!cachedResponse) return null
                    const headers = new Headers(cachedResponse.headers)
                    headers.set('x-parapo-served-from', 'cache')
                    return new Response(cachedResponse.body, {
                      status: cachedResponse.status,
                      statusText: cachedResponse.statusText,
                      headers,
                    })
                  },
                },
              ],
            },
          },
          {
            // A direction's full line, read when it is lit or opened: fresh
            // when the network answers in time, else the copy kept — every
            // line seen stays, so offline keeps what was ridden. A line is
            // 1 kB or so over the wire; the cap is the whole map, twice.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.origin === self.location.origin && url.pathname.startsWith('/data/lines/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'map-lines',
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 4000, purgeOnQuotaError: true },
              plugins: [
                {
                  // Only JSON: a line not there is the map's page, 200 (above).
                  // A page an older worker kept is passed over, not served.
                  cacheWillUpdate: async ({ response }) =>
                    (response.headers.get('content-type') ?? '').startsWith('application/json') ? response : null,
                  cachedResponseWillBeUsed: async ({ cachedResponse }) =>
                    cachedResponse && (cachedResponse.headers.get('content-type') ?? '').startsWith('application/json')
                      ? cachedResponse
                      : null,
                },
              ],
            },
          },
          {
            // A direction's signboards (0010): from the cache once seen, as a
            // board's name is a new uuid whenever it changes — so a board
            // ridden with stays offline. A few kB each.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.origin === self.location.origin && url.pathname.startsWith('/data/signboards/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'signboards',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 2000, purgeOnQuotaError: true },
              plugins: [
                {
                  // Only an SVG: a board not there is the map's page, 200,
                  // and cache-first would have kept it under that name for
                  // good. A page an older worker kept so is passed over, and
                  // the board asked of the network again.
                  cacheWillUpdate: async ({ response }) =>
                    (response.headers.get('content-type') ?? '').startsWith('image/svg+xml') ? response : null,
                  cachedResponseWillBeUsed: async ({ cachedResponse }) =>
                    cachedResponse && (cachedResponse.headers.get('content-type') ?? '').startsWith('image/svg+xml')
                      ? cachedResponse
                      : null,
                },
              ],
            },
          },
          {
            // Style, TileJSON, sprites, glyphs: served from the cache at once,
            // refreshed behind it. Glyphs are one entry per font and 256-glyph
            // range, and Liberty uses three faces, so the cap is roomy.
            urlPattern: ({ url }) =>
              url.origin === 'https://tiles.openfreemap.org' &&
              (/^\/(styles|sprites|fonts)\//.test(url.pathname) || url.pathname === '/planet'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'basemap-meta',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true },
            },
          },
          {
            // Tiles: places already viewed work offline. The vector source
            // stops at zoom 14, where a central-Manila tile is ~450 kB stored,
            // and Metro Manila is about 110 such tiles: a normal visitor keeps
            // 30–100 MB, and 1,000 entries is a ceiling only a cross-country
            // pan reaches. When the quota is hit, this cache is the first to go.
            urlPattern: ({ url }) =>
              url.origin === 'https://tiles.openfreemap.org' &&
              /^\/(planet|natural_earth)\/.+\/\d+\/\d+\/\d+\.(pbf|png)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'basemap-tiles',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 1000, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true },
            },
          },
          // Everything else — non-GET, Supabase, OSRM — never meets a cache.
        ],
      },
    }),
    studioWithoutManifest(),
    stylesheetsFirst(),
  ],
  resolve: {
    // `@/x` is src/x, for any import that leaves its own folder. tsconfig.json
    // (`paths`), scripts/node/ts-resolve-hook.mjs and
    // scripts/checks/check-boundaries.mjs know the same alias; Storybook takes
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
    // Two front doors, one build: the public map at / and the editor at
    // /studio/. Each HTML file is its own entry point with its own <head>.
    rolldownOptions: {
      input: {
        commuter: 'index.html',
        studio: 'studio/index.html',
      },
      // What both pages load, in chunks named for what they are (the
      // cheap-phone plan, step 12, 2026-10-05): MapLibre, React, and the
      // shared code. As one chunk (348 kB gzipped) any change to
      // src/shared or src/design-system gave it a new name, and every
      // returning phone fetched MapLibre and React again with it: 306 kB
      // of a deploy's 363 kB, over a link the visitor's index and tiles
      // want too. Now such a deploy is the 56 kB of our own code. React's
      // chunk keeps its name until React is upgraded: it is CommonJS, kept
      // whole. MapLibre's two keep theirs until it is upgraded, or until
      // our code starts or stops importing one of its exports (2026-10-05):
      // its .mjs files have no side effects (its package.json), so Rolldown
      // keeps of them only what our code reaches. A Popup imported, or the
      // ScaleControl dropped, renames maplibre-*.js, 137 kB gzipped that
      // every returning phone fetches again; importing all of MapLibre
      // renamed maplibre-gl-shared-*.js too, and with it the worker's
      // chunk, which imports it by name.
      //  - maplibre-gl-shared (step 14): the code MapLibre's page and
      //    worker files share, in a chunk of its own so that the worker
      //    (maplibreWorkerWithThePage) imports it and nothing of the page.
      //    With it, Vite's preload helper (vite-preload): Vite wraps each
      //    dynamic import in a build, the worker's two too (MapLibre's
      //    importScriptInWorkers, which the app never calls), and the page's
      //    workbox-window; left to the shared group, it would bring our code
      //    and React into the worker.
      //  - maplibre: maplibre-gl.mjs, its page's JavaScript. Not its
      //    stylesheet, which stays with the shared code's CSS
      //    (shared-*.css), ahead of index.css's safe-area overrides of its
      //    corners, which must come after it to win; and not the worker's
      //    file, which would bring it all into the worker.
      //  - react: react, react-dom and scheduler.
      //  - shared: a module goes in when two chunks import it — Rolldown
      //    counts lazy chunks as well as the two entries — so
      //    check-build.mjs, not this rule, is what proves the studio's
      //    Supabase stays out of what the public page loads. Left to itself
      //    it took the name of one of its modules (useSavedStops-*.js).
      // Each one's size is a guard in check-build.mjs; MapLibre is most of
      // it and is what keeps a thousand lines smooth, so the 500 kB warning
      // is answered by those guards rather than by splitting it further.
      output: {
        codeSplitting: {
          groups: [
            { name: 'maplibre-gl-shared', test: /[\\/]node_modules[\\/]maplibre-gl[\\/]dist[\\/]maplibre-gl-shared\.mjs$/, priority: 3 },
            { name: 'vite-preload', test: /^\0vite\/preload-helper\.js$/, priority: 3 },
            { name: 'maplibre', test: /[\\/]node_modules[\\/]maplibre-gl[\\/]dist[\\/]maplibre-gl\.mjs$/, priority: 2 },
            { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 1 },
            { name: 'shared', minShareCount: 2 },
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
})
