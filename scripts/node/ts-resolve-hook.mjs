import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// `@/x` is the app's alias for src/x (vite.config.ts, tsconfig.json), and a
// feature's folder stands for its index.ts; Node knows neither, so both are
// resolved here the way Vite and tsc resolve them.
const SRC = new URL('../../src/', import.meta.url)

export async function resolve(specifier, context, next) {
  const aliased = specifier.startsWith('@/') ? new URL(specifier.slice(2), SRC).href : null
  const relative = specifier.startsWith('.') && context.parentURL ? new URL(specifier, context.parentURL).href : null
  const base = aliased ?? relative
  if (base && !/\.[a-z]+$/i.test(specifier)) {
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      if (existsSync(fileURLToPath(base + ext))) return next(base + ext, context)
    }
  }
  return next(aliased ?? specifier, context)
}

// Vite fills `import.meta.env` in the app; under Node it is undefined, and
// supabase.ts reads it as it loads. Given an empty one, a check can import
// the studio's reads and writes and hand them a fake client (setSupabase)
// instead of reading no further than the first line (2026-10-03).
export async function load(url, context, next) {
  const result = await next(url, context)
  if (!url.startsWith('file:') || !/\.tsx?$/.test(url) || result.source == null) return result
  const source = String(result.source)
  if (!source.includes('import.meta.env')) return result
  // Same line as the first, so every stack trace keeps its line numbers.
  return { ...result, source: `import.meta.env ??= { DEV: false }; ${source}` }
}
