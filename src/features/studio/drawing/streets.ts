import type { Segment, StreetRun } from '@/shared/utils/geo'

/** Streets followed for less than this are left out of the street list. */
const MIN_STREET_M = 25

/**
 * The streets a whole route follows, for the save panel: named runs of at
 * least MIN_STREET_M, in order, with a street that runs across a join named
 * once. `missing` counts routed segments with no streets recorded (saved
 * before they were, until routed again); `straight` counts freehand segments,
 * which follow no street. Runs that are not `{ name, metres }` are skipped.
 */
export function routeStreets(segments: Segment[]): { names: string[]; missing: number; straight: number } {
  const runs: StreetRun[] = []
  let missing = 0
  let straight = 0
  for (const s of segments) {
    if (!s) continue
    if (s.snap !== 'snapped') {
      straight++
      continue
    }
    if (!Array.isArray(s.streets)) {
      missing++
      continue
    }
    for (const r of s.streets as unknown[]) {
      if (!r || typeof r !== 'object') continue
      const { name, metres } = r as Partial<StreetRun>
      if (typeof name !== 'string' || typeof metres !== 'number' || !Number.isFinite(metres)) continue
      const last = runs[runs.length - 1]
      if (last && last.name === name) last.metres += metres
      else runs.push({ name, metres })
    }
  }
  const names: string[] = []
  for (const r of runs) {
    if (r.name && r.metres >= MIN_STREET_M && names[names.length - 1] !== r.name) names.push(r.name)
  }
  return { names, missing, straight }
}
