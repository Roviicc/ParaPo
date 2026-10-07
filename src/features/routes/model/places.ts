import { haversine, type LngLat } from '@/shared/utils/geo'
import { stopLabel, type StopKind, type StopSummary } from './stops'

/*
 * Places: the boxes that are one place to a rider — one name, a terminal and
 * its hintuans, a mini stop on each side of the road — and how they are
 * counted and labelled. Split from stops.ts, 2026-09-29.
 */

/**
 * What makes two boxes one place: the same label, case-folded, so "SM
 * fairview" typed once does not become a second place (H3). The pickers
 * group by it and the timeline names by it.
 */
export function placeKey(s: Pick<StopSummary, 'name' | 'informal'>): string {
  return stopLabel(s).trim().toLowerCase()
}

/**
 * The other boxes of this box's place — SM Fairview's terminal and hintuans
 * when one of them is tapped — terminal first, then by name. Empty for a
 * place with one box. What the card's "Part of …" line lists, so a rider
 * who tapped a hintuan can find the terminal. Decided with the owner
 * 2026-09-22.
 */
export function siblingsOf<S extends StopSummary>(stop: StopSummary, all: readonly S[]): S[] {
  const key = placeKey(stop)
  return all
    .filter((s) => s.id !== stop.id && placeKey(s) === key)
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'terminal' ? -1 : 1))
}

/**
 * Every box of this box's place, as its HintuanCard lists them (the owner's
 * 3854:12690, 2026-09-30): terminals first, then the hintuans, each in the
 * order they were drawn. Each is named as it is written on the ground; where
 * two share that name, they are numbered in the order they were drawn —
 * "Fairview Teraccess 1", "Fairview Teraccess 2" — and a name only one box
 * has stays as it is.
 */
export function placeBoxes<S extends StopSummary>(stop: StopSummary, all: readonly S[]): { box: S; label: string }[] {
  const key = placeKey(stop)
  const drawn = (a: S, b: S) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  const boxes = all
    .filter((s) => placeKey(s) === key)
    .sort((a, b) => (a.kind === b.kind ? drawn(a, b) : a.kind === 'terminal' ? -1 : 1))
  const nameOf = (s: S) => s.name.trim().toLowerCase()
  const counts = new Map<string, number>()
  for (const s of boxes) counts.set(nameOf(s), (counts.get(nameOf(s)) ?? 0) + 1)
  // Numbered in drawing order, whatever the kind: a terminal and a hintuan of
  // one name are two boxes of it all the same.
  const nth = new Map<string, number>()
  const seen = new Map<string, number>()
  for (const s of [...boxes].sort(drawn)) {
    if ((counts.get(nameOf(s)) ?? 0) < 2) continue
    const n = (seen.get(nameOf(s)) ?? 0) + 1
    seen.set(nameOf(s), n)
    nth.set(s.id, n)
  }
  return boxes.map((s) => ({ box: s, label: nth.has(s.id) ? `${s.name.trim()} ${nth.get(s.id)}` : s.name.trim() }))
}

/**
 * "terminal + hintuan · 2 mini stops", "hintuan · 2 mini stops": what a place
 * is made of. A place's hintuan boxes are one hintuan to a rider; each box is
 * a mini stop, there for information. The owner's model, 2026-09-28.
 */
export function placeSummary(boxes: readonly StopSummary[]): string {
  const terminals = boxes.filter((s) => s.kind === 'terminal').length
  const minis = boxes.length - terminals
  const parts: string[] = []
  if (terminals > 0) parts.push(terminals === 1 ? 'terminal' : `${terminals} terminals`)
  if (minis > 0) parts.push(minis === 1 ? 'hintuan' : `hintuan · ${minis} mini stops`)
  return parts.join(' + ')
}

/**
 * How many hotspots there are, as a rider counts them: each terminal, and
 * each place's hintuan once however many mini stops it has. The owner's
 * rule of 2026-09-28; the studio's pill and the route list's header read it.
 */
export function hotspotCount(stops: readonly StopSummary[]): number {
  const hintuans = new Set(stops.filter((s) => s.kind === 'hintuan').map(placeKey))
  return stops.filter((s) => s.kind === 'terminal').length + hintuans.size
}

/** How far apart two boxes of one name may be and still be one hintuan: both sides of a road. */
export const SAME_HINTUAN_M = 100

/**
 * One map label per hintuan: boxes of the same kind and name within
 * SAME_HINTUAN_M of each other — one traced on each side of the road — share
 * a label halfway between them, so one hintuan does not read as two. The
 * owner's ask of 2026-09-28, with Bestlink. Farther apart, each keeps its own.
 */
export function labelGroups<S extends StopSummary>(stops: readonly S[]): { ids: string[]; kind: StopKind; name: string; point: LngLat }[] {
  const groups: { key: string; boxes: S[] }[] = []
  for (const s of stops) {
    const key = `${s.kind}|${s.name.trim().toLowerCase()}`
    const near = groups.find(
      (g) => g.key === key && g.boxes.some((b) => haversine(b.point.coordinates, s.point.coordinates) <= SAME_HINTUAN_M),
    )
    if (near) near.boxes.push(s)
    else groups.push({ key, boxes: [s] })
  }
  return groups.map(({ boxes }) => ({
    ids: boxes.map((b) => b.id),
    kind: boxes[0].kind,
    name: boxes[0].name,
    point: [
      boxes.reduce((a, b) => a + b.point.coordinates[0], 0) / boxes.length,
      boxes.reduce((a, b) => a + b.point.coordinates[1], 0) / boxes.length,
    ],
  }))
}
