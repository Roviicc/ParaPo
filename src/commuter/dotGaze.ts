import { useEffect, useRef, useState } from 'react'
import { M_PER_DEG, nearestOnSegment, type LngLat } from '../shared/geo/geo'
import type { Highlight } from '../shared/map/useSavedRoutes'
import { placeKey } from '../shared/model/places'
import { variantLine, type VariantSummary } from '../shared/model/routes'
import type { StopSummary } from '../shared/model/stops'

/**
 * The dot's gaze at what was just picked (the owner's ask, 2026-10-01: "when
 * I tap the route it should look the route for maybe 3 sec then go back
 * again to normal"; routes, and hintuans too, and still when what it looks
 * at is off the screen). Its eyes leave their wandering for the way to it,
 * hold there, and wander again (locator.css). The face it wears stays: only
 * the eyes turn.
 */

/** How long the dot gazes before its eyes wander again. */
export const GAZE_MS = 3000

/**
 * How far its eyes go from the middle toward what it gazes at, in px of the
 * dot's 24: as far as its glances go, the eyes still inside the dot.
 */
export const GAZE_PX = 3.5

/** Closer than this, it is already there: nothing to gaze toward. */
const HERE_M = 2

const toRad = (deg: number) => (deg * Math.PI) / 180

/**
 * Which way to gaze from `from` toward `to`, in degrees clockwise from north,
 * as the beam's heading is: the way on the ground, so it holds wherever `to`
 * is, on the screen or off it. Null when `to` is where the dot is.
 */
export function gazeToward(from: LngLat, to: LngLat): number | null {
  const east = (to[0] - from[0]) * Math.cos(toRad(from[1]))
  const north = to[1] - from[1]
  if (Math.hypot(east, north) * M_PER_DEG < HERE_M) return null
  return Math.round(((Math.atan2(east, north) * 180) / Math.PI + 360) % 360)
}

/**
 * Where the eyes go for a gaze, in px from the middle: x right, y down, on the
 * dot as it lies on the map, north up (LocatorOnMap). Always GAZE_PX out, so
 * no gaze takes them out of the dot.
 */
export function gazeOffset(deg: number): { x: number; y: number } {
  const r = (n: number) => Math.round(n * 10) / 10 || 0
  return { x: r(GAZE_PX * Math.sin(toRad(deg))), y: r(-GAZE_PX * Math.cos(toRad(deg))) }
}

/** The point of these lines nearest `p`: where on the routes to gaze. Null with no line. */
export function nearestOnLines(p: LngLat, lines: readonly (readonly LngLat[])[]): LngLat | null {
  let best: LngLat | null = null
  let bestD = Infinity
  const k = Math.cos(toRad(p[1]))
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const point = i === 0 ? line[0] : nearestOnSegment(p, line[i - 1], line[i]).point
      const d = Math.hypot((p[0] - point[0]) * k, p[1] - point[1])
      if (d < bestD) {
        bestD = d
        best = point
      }
    }
  }
  return best
}

/**
 * Something the dot may gaze at: its `key` is new each time it is picked, and
 * null while nothing is; `at` says where it is, asked as it is picked.
 */
export type Subject = { key: string | null; at: () => LngLat | null }

/** What the public map has picked, for the dot to gaze at (gazeSubjects). */
export type Picks = {
  /** The hintuan picked on the trip card, and where its circle is (useRideTo). */
  pickedId: string | null
  pinAt: LngLat | null
  /** The hotspot whose card is open. */
  place: StopSummary | null
  /** The open trip. */
  trip: VariantSummary | null
  /** The RouteCard picked, in the list or on a hotspot's card. */
  highlight: Highlight | null
  /** What the route list lists, and what is lit. */
  candidates: readonly { route_id: string }[]
  litVariants: readonly VariantSummary[]
}

/**
 * The public map's subjects, first wins (useDotGaze): a hintuan on the trip
 * card, a place, a trip, a card, or the routes a tap on the map lists —
 * keyed by route, not direction, so SWITCH is no pick. A route is gazed at
 * where it comes nearest the visitor at `from` (their fix). Built where the
 * dot is (VisitorLocation) since 2026-10-05, word for word as CommuterApp
 * built them.
 */
export function gazeSubjects(p: Picks, from: LngLat | null): Subject[] {
  const nearestLit = (lines: LngLat[][]) => (from ? nearestOnLines(from, lines) : null)
  const routesOf = (vs: readonly { route_id: string }[]) => [...new Set(vs.map((v) => v.route_id))].sort().join() || null
  return [
    { key: p.pickedId, at: () => p.pinAt },
    { key: p.place && placeKey(p.place), at: () => (p.place?.point.coordinates as LngLat | undefined) ?? null },
    { key: p.trip?.route_id ?? null, at: () => nearestLit(p.trip ? [variantLine(p.trip)] : []) },
    { key: p.highlight && `${p.highlight.where}:${p.highlight.from}`, at: () => nearestLit(p.litVariants.map(variantLine)) },
    { key: routesOf(p.candidates), at: () => nearestLit(p.litVariants.map(variantLine)) },
  ]
}

/** A change this soon after ‹ or ✕ is the way back, not a pick. */
const HUSH_MS = 500

/**
 * The app's side of the gaze: `hush` wraps ‹ and ✕, whose changes pick
 * nothing (‹ to a trip from a place over it, ‹ from a trip to the routes
 * sharing its ends, ✕ on a place over a trip); `hushedAt` is read by the dot.
 */
export function useGazeHush() {
  const hushedAt = useRef(-Infinity)
  function hush<A extends unknown[]>(go: (...a: A) => void): (...a: A) => void
  function hush<A extends unknown[]>(go: ((...a: A) => void) | null): ((...a: A) => void) | null
  function hush<A extends unknown[]>(go: ((...a: A) => void) | null) {
    return (
      go &&
      ((...a: A) => {
        hushedAt.current = performance.now()
        go(...a)
      })
    )
  }
  return { hush, hushedAt }
}

/**
 * Which way the dot gazes, in degrees from north, for GAZE_MS after one of
 * `subjects` is picked; null while its eyes wander. When several are picked at
 * once (a hotspot tapped lights its routes too), the first in the list wins;
 * a pick while it gazes starts afresh, and one it cannot gaze at (right
 * where the dot is) ends the gaze. What was picked before the dot was there
 * is not looked back at, and a change just after ‹ or ✕ is none (`hushedAt`).
 * Kept in the dot (LocatorOnMap), so a gaze redraws the dot alone.
 */
export function useDotGaze(from: LngLat, subjects: readonly Subject[], hushedAt?: { readonly current: number }): number | null {
  const [gaze, setGaze] = useState<number | null>(null)
  const keys = subjects.map((s) => s.key)
  const was = useRef(keys)
  const latest = useRef({ from, subjects })
  latest.current = { from, subjects }
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    const before = was.current
    was.current = keys
    if (hushedAt && performance.now() - hushedAt.current < HUSH_MS) return
    const picked = latest.current.subjects.find((s, i) => s.key !== null && s.key !== before[i])
    if (!picked) return
    const there = picked.at()
    const next = there ? gazeToward(latest.current.from, there) : null
    window.clearTimeout(timer.current)
    setGaze(next)
    if (next !== null) timer.current = window.setTimeout(() => setGaze(null), GAZE_MS)
    // The keys alone say when something was picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join('\n')])

  return gaze
}
