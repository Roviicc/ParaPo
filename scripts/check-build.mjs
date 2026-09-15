// Proves, from the production build, that the public page carries no editor.
// Runs as the last step of `npm run build`, so a deploy that would leak fails.
//
// 1. Modules. Walks Vite's manifest from each HTML entry through every chunk it
//    imports, statically or dynamically, and reads which source files went
//    into those chunks (.vite/modules.json, written by the chunkModules plugin
//    in vite.config.ts). No file from src/studio/ may reach the public page,
//    whatever it contains.
//
// 2. Strings, as a second net: the public chunks may not contain words only
//    the editor has —
//      router.project-osrm.org   the route snapper
//      parapo.draft              the drawing-draft key
//      Sign in to save, Forgot password?, + New Route, Draw the return trip
//      .supabase.co              the database's address: visitors read the
//                                published file and never call it
//
// 3. No Supabase client: since step 5 the public page reads /data/map.json, so
//    no module from @supabase may reach it — 54 kB gzipped a visitor does not
//    download (the shared chunk went 375 → 321 kB), and a database the public
//    never touches. The live-table readers live in src/studio/live.ts, which
//    check-boundaries.mjs keeps out of commuter/ by construction; these two
//    checks are the backstop.
//
// Each check has a positive control on the studio side — its chunks must hold
// studio modules, every marker and the Supabase client — or the search itself
// is broken and a pass would mean nothing. No built file may mention the `e2e`
// test switch, which exists only in development builds.
//
// 4. The installable app (step 6) belongs to / only: the manifest link is in
//    index.html and not in studio/index.html; the worker's precache holds the
//    public page's chunks, the MapLibre worker and the icons, and no studio
//    chunk, nothing from .vite/ or data/, and not _headers; the studio is on
//    the worker's navigation denylist; a new version waits to be asked.
//
//   npm run build        (runs this at the end)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const manifestPath = join(dist, '.vite', 'manifest.json')
const modulesPath = join(dist, '.vite', 'modules.json')

const EDITOR_ONLY = [
  'router.project-osrm.org',
  'parapo.draft',
  'Sign in to save',
  'Forgot password?',
  '+ New Route',
  'Draw the return trip',
  '.supabase.co',
]

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

for (const path of [manifestPath, modulesPath]) {
  if (!existsSync(path)) {
    console.log(`FAIL  missing ${path.slice(root.length + 1)} — run vite build first`)
    process.exit(1)
  }
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const modules = JSON.parse(readFileSync(modulesPath, 'utf8'))

/** Every JS file an entry loads, following imports and dynamic imports. */
function chunksOf(entryKey) {
  const seen = new Set()
  const files = new Set()
  const visit = (key) => {
    if (seen.has(key)) return
    seen.add(key)
    const chunk = manifest[key]
    if (!chunk) throw new Error(`manifest has no entry "${key}"`)
    if (chunk.file.endsWith('.js')) files.add(chunk.file)
    for (const k of [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])]) visit(k)
  }
  visit(entryKey)
  return [...files]
}

const commuterFiles = chunksOf('index.html')
const studioFiles = chunksOf('studio/index.html')

// ------------------------------------------------------------------ modules

/** Source modules of ours (under src/) inside the given chunks, relative to the repo. */
function sourceModules(files) {
  const out = new Set()
  for (const file of files) {
    for (const id of modules[file] ?? []) {
      const at = id.indexOf('/src/')
      if (at >= 0 && !id.includes('/node_modules/')) out.add(id.slice(at + 1).replace(/\?.*$/, ''))
    }
  }
  return [...out].sort()
}

const commuterModules = sourceModules(commuterFiles)
const studioModules = sourceModules(studioFiles)

const leakedModules = commuterModules.filter((m) => !m.startsWith('src/shared/') && !m.startsWith('src/commuter/'))
check(
  `public page (${commuterFiles.length} chunk(s), ${commuterModules.length} of our modules) holds only shared/ and commuter/ code`,
  commuterModules.length > 0 && leakedModules.length === 0,
  leakedModules.join(', '),
)
check(
  'studio chunks hold src/studio/ modules — the module search works',
  studioModules.some((m) => m.startsWith('src/studio/')),
)

/** Package modules (under node_modules/) inside the given chunks. */
function packageModules(files) {
  const out = new Set()
  for (const file of files) {
    for (const id of modules[file] ?? []) {
      const m = /\/node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(id)
      if (m) out.add(m[1])
    }
  }
  return [...out].sort()
}
const supabaseInCommuter = packageModules(commuterFiles).filter((p) => p.startsWith('@supabase/'))
check('public page carries no Supabase client', supabaseInCommuter.length === 0, supabaseInCommuter.join(', '))
check(
  'studio chunks carry the Supabase client — the package search works',
  packageModules(studioFiles).some((p) => p.startsWith('@supabase/')),
)

// ------------------------------------------------------------------ strings

const text = (files) => files.map((f) => readFileSync(join(dist, f), 'utf8')).join('\n')
const commuter = text(commuterFiles)
const studio = text(studioFiles)

const leaked = EDITOR_ONLY.filter((s) => commuter.includes(s))
check('public page contains no editor-only string', leaked.length === 0, leaked.join(', '))

const missing = EDITOR_ONLY.filter((s) => !studio.includes(s))
check(
  'studio contains every marker — the string search works',
  missing.length === 0,
  missing.length ? 'missing: ' + missing.join(', ') : '',
)

// --------------------------------------------------------------------- e2e

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* walk(path)
    else yield path
  }
}
const E2E = /["'`]e2e["'`]/
const mentions = [...walk(dist)]
  .filter((f) => /\.(js|html)$/.test(f))
  .filter((f) => E2E.test(readFileSync(f, 'utf8')))
  .map((f) => f.slice(dist.length + 1))
check('no production file mentions the e2e test switch', mentions.length === 0, mentions.join(', '))

// --------------------------------------------------------------------- pwa

const html = (f) => readFileSync(join(dist, f), 'utf8')
check('index.html links the manifest', /<link rel="manifest" href="\/manifest\.webmanifest">/.test(html('index.html')))
check('studio/index.html links no manifest — /studio/ is not installable', !/rel="manifest"/.test(html('studio/index.html')))
check('neither page carries a registration script', !/registerSW|vite-plugin-pwa:/.test(html('index.html') + html('studio/index.html')))

const manifestFile = join(dist, 'manifest.webmanifest')
let webManifest = null
try {
  webManifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
} catch {}
check('manifest.webmanifest is valid JSON', webManifest !== null)
if (webManifest) {
  const icons = webManifest.icons ?? []
  const hasIcon = (size, purpose) =>
    icons.some((i) => i.sizes === size && (purpose ? i.purpose === purpose : !i.purpose) && existsSync(join(dist, i.src)))
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
  )
  check('manifest: icons 192, 512 and 512 maskable, all present on disk', hasIcon('192x192') && hasIcon('512x512') && hasIcon('512x512', 'maskable'))
  const themeMeta = /<meta name="theme-color" content="([^"]+)"/.exec(html('index.html'))?.[1]
  check('index.html theme-color matches the manifest', themeMeta === webManifest.theme_color, `${themeMeta} vs ${webManifest.theme_color}`)
}

const swPath = join(dist, 'sw.js')
check('sw.js exists', existsSync(swPath))
if (existsSync(swPath)) {
  const sw = readFileSync(swPath, 'utf8')
  const precached = [...sw.matchAll(/"?url"?:\s*"([^"]+)"/g)].map((m) => m[1])
  const expected = ['index.html', 'manifest.webmanifest', ...commuterFiles]
  const cssOf = (files) => files.flatMap((f) => Object.values(manifest).find((c) => c.file === f)?.css ?? [])
  expected.push(...cssOf(commuterFiles))
  const missingPrecache = expected.filter((f) => !precached.includes(f))
  check(
    `precache holds the public page, its ${commuterFiles.length} chunk(s) and CSS (${precached.length} entries)`,
    missingPrecache.length === 0,
    missingPrecache.length ? 'missing: ' + missingPrecache.join(', ') : '',
  )
  check('precache holds the MapLibre worker', precached.some((u) => /^assets\/maplibre-gl-worker-.*\.js$/.test(u)))
  check('precache holds the three icons', ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png'].every((u) => precached.includes(u)))
  const studioOnly = studioFiles.filter((f) => !commuterFiles.includes(f))
  const leakedPrecache = precached.filter(
    (u) => studioOnly.includes(u) || /^(studio\/|\.vite\/|data\/|branding\/|_headers)/.test(u),
  )
  check(
    `precache holds no studio chunk (${studioOnly.length} to keep out), nothing from studio/, .vite/, data/, branding/, no _headers`,
    studioOnly.length > 0 && leakedPrecache.length === 0,
    leakedPrecache.join(', '),
  )
  check(
    'sw.js answers only / from the stored page, and never /studio',
    sw.includes('/^\\/(\\?.*)?$/') && sw.includes('/^\\/studio(\\/|$)/'),
  )
  check(
    'sw.js caches /data/map.json NetworkFirst (stamping what it serves from the store) and OpenFreeMap tiles CacheFirst',
    sw.includes('/data/map.json') && sw.includes('x-parapo-served-from') && sw.includes('tiles.openfreemap.org') && sw.includes('map-file') && sw.includes('basemap-tiles'),
  )
  // With `skipWaiting: false` Workbox calls skipWaiting() once, inside the
  // handler for the page's SKIP_WAITING message — never on its own.
  const msgAt = sw.indexOf('SKIP_WAITING')
  const skipAt = sw.indexOf('skipWaiting()')
  check(
    'sw.js waits to be told to update (one skipWaiting(), inside the SKIP_WAITING handler)',
    msgAt >= 0 && skipAt > msgAt && sw.indexOf('skipWaiting()', skipAt + 1) === -1,
  )
}

process.exit(failed ? 1 : 0)
