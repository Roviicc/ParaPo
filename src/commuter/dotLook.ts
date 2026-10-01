import { useEffect, useRef, useState } from 'react'
import { M_PER_DEG, nearestOnSegment, type LngLat } from '../shared/geo/geo'

/**
 * The dot looking at what was just picked (the owner's ask, 2026-10-01: "when
 * I tap the route it should look the route for maybe 3 sec then go back
 * again to normal"; routes, and hintuans too, and still when what it looks
 * at is off the screen). Its eyes leave their wandering for the way to it,
 * hold there, and wander again (locator.css). The face it wears stays: only
 * the eyes turn.
 */

/** How long the dot looks before its eyes wander again. */
export const LOOK_MS = 3000

/**
 * How far its eyes go from the middle toward what it looks at, in px of the
 * dot's 24: as far as its glances go, the eyes still inside the dot.
 */
export const LOOK_PX = 3.5

/** Closer than this, it is already there: nothing to look toward. */
const HERE_M = 2

const cosLat = (lat: number) => Math.cos((lat * Math.PI) / 180)

/** Where the eyes go, in px from the middle: x east, y south — the dot lies on the map, north up (LocatorOnMap). */
export type Look = { x: number; y: number }

/**
 * The eyes' place to look from `from` toward `to`: the way on the ground, so
 * it holds wherever `to` is, on the screen or off it. Null when `to` is
 * where the dot is.
 */
export function lookToward(from: LngLat, to: LngLat): Look | null {
  const east = (to[0] - from[0]) * cosLat(from[1])
  const north = to[1] - from[1]
  const d = Math.hypot(east, north)
  if (d * M_PER_DEG < HERE_M) return null
  const r = (n: number) => Math.round(n * 10) / 10 || 0
  return { x: r((LOOK_PX * east) / d), y: r((-LOOK_PX * north) / d) }
}

/** The point of these lines nearest `p`: where on the routes to look. Null with no line. */
export function nearestOnLines(p: LngLat, lines: readonly (readonly LngLat[])[]): LngLat | null {
  let best: LngLat | null = null
  let bestD = Infinity
  const k = cosLat(p[1])
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
 * Something the dot may look at: its `key` changes when it is picked, null
 * when nothing is; `at` says where it is, asked when it is picked.
 */
export type Subject = { key: string | null; at: () => LngLat | null }

/**
 * Where the dot's eyes look, for LOOK_MS after one of `subjects` is picked,
 * or null. When several change at once (a hotspot tapped lights its routes
 * too), the first in the list is looked at; a pick while it looks starts the
 * look afresh.
 */
export function useDotLook(from: LngLat | null, subjects: readonly Subject[]): Look | null {
  const [look, setLook] = useState<Look | null>(null)
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
    const here = latest.current.from
    const there = picked?.at()
    const next = here && there ? lookToward(here, there) : null
    if (!next) return
    setLook(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setLook(null), LOOK_MS)
    // The keys alone say when something was picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join('\n')])

  return look
}
