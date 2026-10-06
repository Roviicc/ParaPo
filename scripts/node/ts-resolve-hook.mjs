import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
    const base = new URL(specifier, context.parentURL).href
    for (const ext of ['.ts', '.tsx']) {
      if (existsSync(fileURLToPath(base + ext))) return next(base + ext, context)
    }
  }
  return next(specifier, context)
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
