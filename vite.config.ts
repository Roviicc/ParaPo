import { existsSync, readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Writes .vite/modules.json: every output chunk and the source modules inside
 * it. Vite's manifest lists which chunks a page loads but not what went into
 * them; with this, scripts/check-build.mjs can prove that no file from
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
 * belongs to / only; scripts/check-build.mjs checks the built studio page.
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

/** Brand colours, measured from the logo: the wordmark's maroon and a warm off-white behind the pin. */
const THEME_COLOUR = '#8a595a'
const BACKGROUND_COLOUR = '#f5f1ee'

// The `urlPattern` functions below are copied into the worker as text, so they
// must not reach for anything outside themselves: the OpenFreeMap origin is
// spelled out in each rather than shared as a constant.

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    chunkModules(),
    VitePWA({
      // The page registers the worker itself (src/commuter/pwa.ts), so the
      // plugin writes no registration script — and none into /studio/.
      injectRegister: false,
      // A new version waits until the visitor taps "Reload": a silent reload
      // mid-ride would throw away the selected route.
      registerType: 'prompt',
      // Off under `npm run dev`, so the headless checks never meet a worker.
      // Test with `npm run build && npm run preview` (scripts/pw/pwa-test.mjs).
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
        globPatterns: ['index.html', 'manifest.webmanifest', 'assets/*.{js,css}', 'icons/icon-*.png', 'figure/*.png'],
        manifestTransforms: [
          (entries) => {
            // Written by Vite with the bundle; the worker is generated after.
            if (!existsSync('dist/.vite/manifest.json')) {
              throw new Error('dist/.vite/manifest.json is missing: the precache cannot be limited to the public page')
            }
            const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8')) as Record<
              string,
              { file: string; css?: string[]; imports?: string[]; dynamicImports?: string[] }
            >
            const keep = new Set<string>()
            const visit = (key: string) => {
              const chunk = manifest[key]
              if (!chunk || keep.has(chunk.file)) return
              keep.add(chunk.file)
              for (const css of chunk.css ?? []) keep.add(css)
              for (const k of [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])]) visit(k)
            }
            visit('index.html')
            // MapLibre's tile worker is emitted by `?worker&url` (MapView.tsx) and
            // Vite's manifest never lists it; without it the map draws nothing.
            const wanted = (url: string) =>
              !url.startsWith('assets/') || keep.has(url) || /^assets\/maplibre-gl-worker-/.test(url)
            return { manifest: entries.filter((e) => wanted(e.url)), warnings: [] }
          },
        ],
        // The map has exactly one address, `/` (plus `?r=`), and only that is
        // answered from the stored page. Any other navigation goes to the
        // server as it would without a worker — so `/studio` (with or without
        // the slash) opens the studio, and `/data/map.json` typed into a tab
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
            // The published map: fresh when the network answers in time, the
            // last copy otherwise. Only GET, only this file — the studio's
            // database reads share the origin and must never come from here.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.origin === self.location.origin && url.pathname === '/data/map.json',
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
  ],
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
    },
    // .vite/manifest.json records which chunks each page loads, so
    // scripts/check-build.mjs can prove the public page carries no editor.
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
