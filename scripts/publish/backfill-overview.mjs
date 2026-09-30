// Writes each drawn direction's overview (0009) where it has none yet: the
// rows saved before 2026-09-29. A save writes it from then on, and the
// editor's list reads a row's full line in its place until then, so this is
// a tidy-up, not a repair — run it once, when convenient.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs scripts/publish/backfill-overview.mjs            says what it would write
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs scripts/publish/backfill-overview.mjs --write    writes it
//
// It writes to the live table, so it needs a key that may: SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY in the environment (the project's settings,
// API). Never commit that key. The overview is the app's own (geo.ts
// overviewOf), so a backfilled row is what a save would have written.
import { overviewOf } from '../../src/shared/geo/geo.ts'

const URL_BASE = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const WRITE = process.argv.includes('--write')
const PAGE = 1000

if (!URL_BASE || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY: this writes to the live table.')
  process.exit(1)
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const rows = []
for (let from = 0; ; from += PAGE) {
  const res = await fetch(`${URL_BASE}/rest/v1/route_variant?select=id,shape&overview=is.null&shape=not.is.null&order=id.asc`, {
    headers: { ...headers, Range: `${from}-${from + PAGE - 1}` },
  })
  if (!res.ok && res.status !== 206) throw new Error(`route_variant: HTTP ${res.status} ${await res.text()}`)
  const page = await res.json()
  rows.push(...page)
  if (page.length < PAGE) break
}

let written = 0
for (const r of rows) {
  const coordinates = overviewOf(r.shape?.coordinates ?? [])
  if (coordinates.length < 2) continue
  console.log(`  ${r.id}: ${r.shape.coordinates.length} → ${coordinates.length} points`)
  if (!WRITE) continue
  const res = await fetch(`${URL_BASE}/rest/v1/route_variant?id=eq.${r.id}&overview=is.null`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ overview: { type: 'LineString', coordinates } }),
  })
  if (!res.ok) throw new Error(`${r.id}: HTTP ${res.status} ${await res.text()}`)
  written++
}
console.log(`${rows.length} direction(s) without an overview; ${WRITE ? `${written} written` : 'nothing written (pass --write)'}`)
