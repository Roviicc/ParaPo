import { haversine, type LngLat } from '../../shared/geo/geo'
import { pointInRing, polygonToRing } from '../../shared/geo/ring'
import type { StopSummary } from '../../shared/model/stops'

/**
 * Hintuan drafts (2026-10-06): boxes drawn by scripts/drafts/hintuan-drafts.mjs
 * at OpenStreetMap's stops along the jeepney lines, for an area the owner
 * named — Caloocan first. The studio lists them under + New hotspot and opens
 * one as an outline with its name filled in (useDrawing's loadArea); the
 * owner checks the box against the ground and saves it, or leaves it. None
 * is in the database until then.
 */

/** One drafted box (draftRecord in scripts/drafts/draftParts.mjs). */
export type HintuanDraft = {
  id: string
  name: string
  kind: 'hintuan'
  /** OpenStreetMap's stop is on the road itself: the box straddles it, as which side it serves is not known. */
  on_road: boolean
  /** Four corners, not closed: an outline as the studio draws one. */
  ring: LngLat[]
  /** Where OpenStreetMap has the stop. */
  at: LngLat
  /** Its name, and those of the stops mapped beside it. */
  osm_names: string[]
  /** Metres from the stop to the nearest jeepney line. */
  route_m: number
  /** The saved hotspot nearest it when the drafts were made, metres from its box. */
  nearest: { name: string; metres: number } | null
}

/** The file hintuan-drafts.mjs writes. */
export type HintuanDraftsFile = {
  trial: string
  area: string
  area_osm: string
  source: string
  licence: string
  made_at: string
  published_at: string
  drafts: HintuanDraft[]
}

/** The middle of a draft's box: where the camera goes to open it. */
export function draftMiddle(d: Pick<HintuanDraft, 'ring'>): LngLat {
  const n = d.ring.length
  return [d.ring.reduce((s, p) => s + p[0], 0) / n, d.ring.reduce((s, p) => s + p[1], 0) / n]
}

/** A saved hotspot whose own middle is this close to a draft's took its place. */
export const TAKEN_M = 15

/**
 * The drafts still to look at: those no saved hotspot has taken — its box
 * over the draft's middle, or its middle within TAKEN_M of it. So a draft
 * saved, moved a little, goes from the list, and one saved somewhere else
 * entirely stays.
 */
export function draftsLeft(drafts: readonly HintuanDraft[], stops: readonly StopSummary[]): HintuanDraft[] {
  return drafts.filter((d) => {
    const middle = draftMiddle(d)
    return !stops.some((s) => {
      const ring = polygonToRing(s.area)
      return (ring.length >= 3 && pointInRing(middle, ring)) || haversine(middle, s.point.coordinates) <= TAKEN_M
    })
  })
}

/** The note a box opened from a draft keeps: where it came from, as the rail stations keep theirs. */
export function draftNote(d: Pick<HintuanDraft, 'osm_names'>, file: Pick<HintuanDraftsFile, 'made_at'>): string {
  return `OpenStreetMap stop "${d.osm_names.join('" / "')}", drafted ${file.made_at.slice(0, 10)}`
}

/** What a draft's row in the list says under its name. */
export function draftDetail(d: Pick<HintuanDraft, 'nearest' | 'on_road'>): string {
  const near = d.nearest ? `${d.nearest.metres} m from ${d.nearest.name}` : 'no hotspot near'
  return d.on_road ? `${near} · on the road, side unknown` : near
}

/** The drafts as their source takes them: each box, and its name at its middle. */
export function draftsData(drafts: readonly HintuanDraft[]) {
  return {
    type: 'FeatureCollection' as const,
    features: [
      ...drafts.map((d) => ({
        type: 'Feature' as const,
        properties: { id: d.id, name: d.name },
        geometry: { type: 'Polygon' as const, coordinates: [[...d.ring, d.ring[0]]] },
      })),
      ...drafts.map((d) => ({
        type: 'Feature' as const,
        properties: { id: d.id, name: d.name },
        geometry: { type: 'Point' as const, coordinates: draftMiddle(d) },
      })),
    ],
  }
}
