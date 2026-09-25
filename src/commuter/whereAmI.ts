import { useCallback, useEffect, useRef, useState } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { haversine, type LngLat } from '../shared/geo'

/**
 * "Where am I": the visitor's own position on the map, shown as a small
 * walking figure (Walker.tsx) instead of a dot. Off until asked for, then
 * the browser's own permission prompt; the position never leaves the phone
 * — nothing here talks to a server, and nothing stores it. The owner's ask
 * of 2026-09-26.
 *
 * The figure's pose is read off the speed, so it is honest rather than
 * decorative: standing below a slow walk, walking at a walk, and above
 * 15 km/h *flying* — the app's way of saying "I can tell you're on a jeep".
 * Which way it faces is the heading: the phone's, when it gives one while
 * moving, else the bearing between the last two fixes far enough apart to
 * mean something.
 */

export type WhereStatus = 'off' | 'asking' | 'on' | 'denied' | 'unavailable' | 'error'
export type Pose = 'standing' | 'walking' | 'flying'
export type Facing = 'down' | 'up' | 'left' | 'right'

export type Fix = {
  at: LngLat
  /** Metres, the browser's 68 % radius. */
  accuracy: number
  /** Metres a second, the browser's or derived from the last fixes. */
  speed: number
  /** Degrees clockwise from north, or null when standing still. */
  heading: number | null
  time: number
}

/** Below this the figure stands: a slow shuffle, or GPS drift while still. */
export const STANDING_BELOW_MPS = 0.5
/** From this speed on the figure flies: 15 km/h, faster than anyone walks. */
export const FLYING_FROM_MPS = 15 / 3.6
/** The zoom a first fix brings the map to, when it was further out. */
const ARRIVE_ZOOM = 15

export function poseFor(speed: number): Pose {
  if (speed >= FLYING_FROM_MPS) return 'flying'
  if (speed >= STANDING_BELOW_MPS) return 'walking'
  return 'standing'
}

/** Which of the four sheets faces this heading: north is the figure's back (up), east its right side. */
export function facingFor(heading: number): Facing {
  const h = ((heading % 360) + 360) % 360
  if (h < 45 || h >= 315) return 'up'
  if (h < 135) return 'right'
  if (h < 225) return 'down'
  return 'left'
}

/** Compass bearing from a to b, degrees clockwise from north. */
export function bearing(a: LngLat, b: LngLat): number {
  const r = Math.PI / 180
  const dLng = (b[0] - a[0]) * r
  const [la, lb] = [a[1] * r, b[1] * r]
  const y = Math.sin(dLng) * Math.cos(lb)
  const x = Math.cos(la) * Math.sin(lb) - Math.sin(la) * Math.cos(lb) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/**
 * Speed and heading from a run of fixes, for a browser that gives neither
 * (a laptop, an emulator, many phones indoors). The last fix against the
 * newest one at least 2 s older, so two fixes a second apart do not read
 * GPS jitter as a sprint; heading only once they are further apart than
 * the jitter, else the last known heading.
 */
export function motionFrom(
  fixes: readonly { at: LngLat; accuracy: number; time: number }[],
  lastHeading: number | null,
): { speed: number; heading: number | null } {
  const last = fixes[fixes.length - 1]
  if (!last) return { speed: 0, heading: lastHeading }
  let ref: (typeof fixes)[number] | null = null
  for (let i = fixes.length - 2; i >= 0; i--) {
    if (last.time - fixes[i].time >= 2000) {
      ref = fixes[i]
      break
    }
  }
  if (!ref) return { speed: 0, heading: lastHeading }
  const metres = haversine(ref.at, last.at)
  const speed = metres / ((last.time - ref.time) / 1000)
  const heading = metres > Math.max(3, Math.min(ref.accuracy, last.accuracy) / 4) ? bearing(ref.at, last.at) : lastHeading
  return { speed, heading }
}

export type WhereAmI = {
  status: WhereStatus
  fix: Fix | null
  pose: Pose
  facing: Facing
  /** Whether the map keeps the figure in the middle. Off the moment the visitor drags the map. */
  follow: boolean
  /** Start, or when already on, follow again. */
  ask: () => void
  stop: () => void
}

export function useWhereAmI(map: MapLibreMap | null): WhereAmI {
  const [status, setStatus] = useState<WhereStatus>('off')
  const [fix, setFix] = useState<Fix | null>(null)
  const [facing, setFacing] = useState<Facing>('down')
  const [follow, setFollow] = useState(false)
  const watchRef = useRef<number | null>(null)
  const fixesRef = useRef<{ at: LngLat; accuracy: number; time: number }[]>([])
  const headingRef = useRef<number | null>(null)
  const arrivedRef = useRef(false)

  const stop = useCallback(() => {
    if (watchRef.current !== null) navigator.geolocation?.clearWatch(watchRef.current)
    watchRef.current = null
    fixesRef.current = []
    arrivedRef.current = false
    setFix(null)
    setFollow(false)
    setStatus('off')
  }, [])

  const ask = useCallback(() => {
    if (watchRef.current !== null) {
      setFollow(true)
      return
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable')
      return
    }
    setStatus('asking')
    setFollow(true)
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const at: LngLat = [p.coords.longitude, p.coords.latitude]
        const time = p.timestamp || Date.now()
        const run = [...fixesRef.current.filter((f) => time - f.time < 15_000), { at, accuracy: p.coords.accuracy, time }]
        fixesRef.current = run
        const derived = motionFrom(run, headingRef.current)
        const speed = p.coords.speed !== null && p.coords.speed >= 0 ? p.coords.speed : derived.speed
        const heading =
          p.coords.heading !== null && !Number.isNaN(p.coords.heading) && speed >= STANDING_BELOW_MPS
            ? p.coords.heading
            : derived.heading
        headingRef.current = heading
        if (heading !== null) setFacing(facingFor(heading))
        setFix({ at, accuracy: p.coords.accuracy, speed, heading, time })
        setStatus('on')
      },
      (e) => {
        // Only a refusal ends the watch. "Position unavailable" and a timeout
        // come and go — indoors, under a flyover, and between every fix on
        // an emulated GPS — and the next fix is still coming; say "no fix
        // yet" only while there has been none.
        if (e.code === e.PERMISSION_DENIED) {
          navigator.geolocation.clearWatch(watchRef.current ?? -1)
          watchRef.current = null
          fixesRef.current = []
          setFollow(false)
          setStatus('denied')
          return
        }
        if (fixesRef.current.length === 0) setStatus('error')
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20_000 },
    )
  }, [])

  // The map follows the figure until the visitor moves the map themselves.
  useEffect(() => {
    if (!map) return
    const letGo = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) setFollow(false)
    }
    map.on('dragstart', letGo)
    map.on('zoomstart', letGo)
    map.on('rotatestart', letGo)
    map.on('pitchstart', letGo)
    return () => {
      map.off('dragstart', letGo)
      map.off('zoomstart', letGo)
      map.off('rotatestart', letGo)
      map.off('pitchstart', letGo)
    }
  }, [map])

  useEffect(() => {
    if (!map || !fix || !follow) return
    // The first fix brings the map in close enough to see the street; after
    // that the zoom is the visitor's and only the centre moves.
    const zoom = arrivedRef.current ? map.getZoom() : Math.max(map.getZoom(), ARRIVE_ZOOM)
    arrivedRef.current = true
    map.easeTo({ center: fix.at, zoom, duration: 600 })
  }, [map, fix, follow])

  useEffect(() => () => {
    if (watchRef.current !== null) navigator.geolocation?.clearWatch(watchRef.current)
  }, [])

  return { status, fix, pose: fix ? poseFor(fix.speed) : 'standing', facing, follow, ask, stop }
}
