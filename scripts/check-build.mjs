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
//    Not `signInWithPassword`: supabase-js itself defines that method, so any
//    page that talks to Supabase carries the word whether or not it signs
//    anyone in.
//
// Each check has a positive control on the studio side — its chunks must hold
// studio modules and every marker — or the search itself is broken and a pass
// would mean nothing. Finally, no built file may mention the `e2e` test
// switch, which exists only in development builds.
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

process.exit(failed ? 1 : 0)
