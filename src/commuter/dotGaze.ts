import { useEffect, useRef, useState } from 'react'
import { M_PER_DEG, nearestOnSegment, type LngLat } from '../shared/geo/geo'

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

/**
 * Which way the dot gazes, in degrees from north, for GAZE_MS after one of
 * `subjects` is picked; null while its eyes wander. When several are picked at
 * once (a hotspot tapped lights its routes too), the first in the list wins;
 * a pick while it gazes starts afresh, and one it cannot gaze at (no fix yet,
 * or right where the dot is) ends the gaze.
 */
export function useDotGaze(from: LngLat | null, subjects: readonly Subject[]): number | null {
  const [gaze, setGaze] = useState<number | null>(null)
  const was = useRef<(string | null)[]>(subjects.map(() => null))
  const latest = useRef({ from, subjects })
  latest.current = { from, subjects }
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const keys = subjects.map((s) => s.key)

  useEffect(() => {
    const before = was.current
    was.current = keys
    const picked = latest.current.subjects.find((s, i) => s.key !== null && s.key !== before[i])
    if (!picked) return
    const here = latest.current.from
    const there = picked.at()
    const next = here && there ? gazeToward(here, there) : null
    window.clearTimeout(timer.current)
    setGaze(next)
    if (next !== null) timer.current = window.setTimeout(() => setGaze(null), GAZE_MS)
    // The keys alone say when something was picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join('\n')])

  return gaze
}
