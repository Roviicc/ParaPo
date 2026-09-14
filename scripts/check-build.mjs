// Proves, from the production build, that the public page carries no editor.
//
// Walks Vite's manifest from each HTML entry through every chunk it imports,
// statically or dynamically, and searches those chunks for strings that only
// the editor contains:
//
//   router.project-osrm.org   the route snapper
//   parapo.draft              the drawing-draft key
//   Sign in to save, Forgot password?, + New Route, Draw the return trip
//
// Not `signInWithPassword`: supabase-js itself defines that method, so any
// page that talks to Supabase carries the word whether or not it signs anyone
// in. Our own sign-in panel's words are the honest marker.
//
// The public page must contain none of them. The studio must contain all of
// them — otherwise the search itself is broken and a pass would mean nothing.
// Finally, no file in dist may mention the `e2e` test switch, which exists
// only in development builds.
//
//   npm run build && node scripts/check-build.mjs
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const manifestPath = join(dist, '.vite', 'manifest.json')

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

if (!existsSync(manifestPath)) {
  console.log('FAIL  no dist/.vite/manifest.json — run npm run build first')
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

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

const text = (files) => files.map((f) => readFileSync(join(dist, f), 'utf8')).join('\n')

const commuterFiles = chunksOf('index.html')
const studioFiles = chunksOf('studio/index.html')
const commuter = text(commuterFiles)
const studio = text(studioFiles)

const leaked = EDITOR_ONLY.filter((s) => commuter.includes(s))
check(
  `public page (${commuterFiles.length} chunk(s)) contains no editor-only string`,
  leaked.length === 0,
  leaked.join(', '),
)

const missing = EDITOR_ONLY.filter((s) => !studio.includes(s))
check(
  `studio (${studioFiles.length} chunk(s)) contains every marker — the search works`,
  missing.length === 0,
  missing.length ? 'missing: ' + missing.join(', ') : '',
)

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
