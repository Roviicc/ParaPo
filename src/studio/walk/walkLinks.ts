import { haversine, type LngLat } from '../../shared/geo/geo'

/**
 * The walking-link trial (2026-10-06): walks between nearby hotspots, as a
 * pedestrian router suggests them from OpenStreetMap, written to a file by
 * scripts/walk/walk-links.mjs and drawn on the studio's map (useWalkLinks.ts).
 * Nothing here is in the database or the published file, and nothing here is
 * checked on the ground yet: it is for the owner to look at.
 */

/** Metres of a walk by what it is on (walkedOn in scripts/walk/walkParts.mjs). */
export type WalkOn = {
  road: number
  footpath: number
  crossing: number
  stairs: number
  lift: number
  other: number
  /** Overlaps the others: a footbridge's deck and its stairs. */
  footbridge: number
  /** Overlaps the others, as `footbridge`. */
  underpass: number
}

/** One walk between two hotspots (linkRecord in scripts/walk/walkParts.mjs). */
export type WalkLink = {
  from: string
  to: string
  from_name: string
  to_name: string
  straight_m: number
  walk_m: number
  walk_s: number
  on: WalkOn
  line: LngLat[]
}

/** The file walk-links.mjs writes. */
export type WalkLinksFile = {
  trial: string
  area: string
  area_osm: string
  router: string
  licence: string
  made_at: string
  published_at: string
  within_m: number
  links: WalkLink[]
  skipped: { from: string; to: string; from_name: string; to_name: string; reason: string }[]
}

/** Under this many metres a stretch is the router meeting an edge's end, not a walk on it. */
const WORTH_SAYING_M = 3

/** What a walk meets that a walker would want told: a footbridge, an underpass, stairs, a lift, a crossing. */
export function walkMeets(on: WalkOn): string[] {
  return (
    [
      ['footbridge', on.footbridge],
      ['underpass', on.underpass],
      ['stairs', on.stairs],
      ['lift', on.lift],
      ['crossing', on.crossing],
    ] as const
  )
    .filter(([, m]) => m >= WORTH_SAYING_M)
    .map(([word]) => word)
}

/**
 * A link's words on the map: the walk and its minutes, then how far apart
 * the two hotspots are in a straight line and what the walk meets —
 * "319 m walk · 5 min" over "117 m apart". The two numbers side by side are
 * the point: 117 m across, 319 m on foot.
 */
export function walkLabel(link: Pick<WalkLink, 'walk_m' | 'walk_s' | 'straight_m' | 'on'>): string {
  const minutes = Math.max(1, Math.round(link.walk_s / 60))
  return `${link.walk_m} m walk · ${minutes} min\n${[`${link.straight_m} m apart`, ...walkMeets(link.on)].join(' · ')}`
}

/** The point halfway along a line by its length: where a link's words go. */
export function halfway(line: readonly LngLat[]): LngLat {
  if (line.length === 0) throw new Error('A line of no points has no middle')
  const legs = line.slice(1).map((p, i) => haversine(line[i], p))
  let left = legs.reduce((sum, m) => sum + m, 0) / 2
  for (let i = 0; i < legs.length; i++) {
    if (left <= legs[i] && legs[i] > 0) {
      const t = left / legs[i]
      const [a, b] = [line[i], line[i + 1]]
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    left -= legs[i]
  }
  return line[line.length - 1]
}

/** The links as their source takes them: each its line, and a point halfway along it carrying its words. */
export function walkLinksData(links: readonly WalkLink[]) {
  return {
    type: 'FeatureCollection' as const,
    features: [
      ...links.map((l) => ({
        type: 'Feature' as const,
        properties: { from: l.from, to: l.to },
        geometry: { type: 'LineString' as const, coordinates: l.line },
      })),
      ...links.map((l) => ({
        type: 'Feature' as const,
        properties: { from: l.from, to: l.to, label: walkLabel(l) },
        geometry: { type: 'Point' as const, coordinates: halfway(l.line) },
      })),
    ],
  }
}
