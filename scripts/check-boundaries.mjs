// The line between the two front doors, checked rather than hoped for.
//
//   src/shared/    imports nothing from commuter/ or studio/
//   src/commuter/  imports shared/ only
//   src/studio/    imports shared/ only
//
// Reads every import in src/ and fails, naming the file and line, on any that
// crosses. A source file outside the three folders fails too.
//
//   node scripts/check-boundaries.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src')

/** Which areas each area may import from. */
const ALLOWED = {
  shared: ['shared'],
  commuter: ['commuter', 'shared'],
  studio: ['studio', 'shared'],
}
/** Files allowed at the top of src/. */
const LOOSE = new Set(['vite-env.d.ts'])

// import x from '…' · import type { x } from '…' · export { x } from '…'
// import '…' · import('…')
const IMPORT =
  /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* walk(path)
    else yield path
  }
}

const areaOf = (file) => relative(src, file).split(sep)[0]
const problems = []
let files = 0
let imports = 0

for (const file of walk(src)) {
  if (!/\.(ts|tsx|js|jsx|css)$/.test(file)) continue
  const rel = relative(root, file).split(sep).join('/')
  const area = areaOf(file)

  if (!(area in ALLOWED)) {
    if (!LOOSE.has(relative(src, file))) problems.push(`${rel}: outside shared/, commuter/ and studio/`)
    continue
  }
  files++

  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(IMPORT)) {
    const spec = m[1] ?? m[2] ?? m[3]
    // Packages ('react', 'maplibre-gl/dist/…') are not ours to police.
    if (!spec.startsWith('.') && !spec.startsWith('/')) continue
    imports++

    const target = spec.startsWith('/') ? join(root, spec) : resolve(dirname(file), spec)
    const line = text.slice(0, m.index).split('\n').length
    const inSrc = !relative(src, target).startsWith('..')
    const targetArea = inSrc ? areaOf(target) : '(outside src)'

    if (!ALLOWED[area].includes(targetArea)) {
      problems.push(`${rel}:${line}: ${area}/ imports ${targetArea}/ ('${spec}')`)
    }
  }
}

if (problems.length > 0) {
  console.log(`FAIL  ${problems.length} boundary problem(s):`)
  for (const p of problems) console.log('  ' + p)
  process.exit(1)
}
console.log(`PASS  boundaries hold: ${imports} local imports in ${files} files`)
