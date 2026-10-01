import { useEffect, useMemo, useRef } from 'react'
import type { GeoJSONSource, MapLibreMap } from 'maplibre-gl'
import { haversine, metresPerPixel, type LngLat } from '../geo/geo'
import { INSET_PX, SPEED_PX_PER_S, chevronsAt, markCovered, measure, spacingPx, type Chevron, type Measured } from './chevrons'
import { MAP_COLOURS, MAP_PAINT } from '../../design-system/foundation/mapColours'
import { endRadius, litWidthAt } from './lineStyle'
import type { LineLook } from './liveryLine'
import { ROUTES_HIT_LAYER } from './tap'
import { LAYERS, useLayerReady } from './layers'

/**
 * Which way the jeep goes, drawn on the lit directions only, with a circle
 * at each end of each and the place's name over it (EndTitles.tsx; the owner's asks of
 * 2026-09-25).
 *
 * Decided with the owner 2026-09-23: marks *inside* the line, never as a
 * second offset line, only on what is lit — on every resting line they would
 * be clutter once a road carries three routes — and **flowing smoothly**
 * along it from the start of the ride to its end, for as long as it is lit
 * (STEP_MS). No glow: he asked for it
 * and then asked for it gone. What is lit is the chosen direction; or, since
 * 2026-09-29, the Selected RouteCard's directions (a route list's card or a
 * hotspot's); or else every route a list shows, the way round it shows them
 * (since 2026-09-25), or a hotspot's cards do (2026-09-29). Where two of
 * those share a road they flow as one stream, not two.
 *
 * The mark is a white chevron (near-black, Arrow/Inverse, on a yellow line —
 * and a mist one, until mist left on 2026-09-30 — since 2026-09-29:
 * useRideColours), one to a place and all alike, with
 * no trail: his call the night of 2026-09-23, after white arrows, a train of
 * four fading chevrons ("not good visually") and jeepneys (parked for a
 * Simulate button, PLAN.md). It is a chevron bigger than the line and cut off
 * by it: its arms run out to the line's edges and stop there, so none of it
 * shows outside the line.
 *
 * MapLibre can neither slide a mark along a line nor clip one to a line's
 * width, so each chevron is a small polygon we draw ourselves: every frame,
 * each one moves a little further along the line, is turned to its bearing
 * there, and is shaped in screen pixels to the lit line's width at that
 * zoom — crisp at every size, where a picture scaled from 5 px to 13 px
 * would blur or shimmer. The line handed in is already in travel order
 * (`travelLine`), so chevron number one leaves the terminal the title names,
 * whichever end it was drawn from.
 */

const SRC = 'direction-arrows'
const CHEVRONS = 'direction-arrow-chevrons'
const ENDS_SRC = 'direction-ends'
const ENDS = LAYERS.endCircles

/** Two ends of one name closer than this are one place, and named once: Tala, where two rides start. */
const SAME_END_M = 150

/** One lit ride: its direction, its line in travel order, and the places it runs from and to. */
export type Ride = { id?: string; line: LngLat[]; from: string; to: string; fromStop?: string | null; toStop?: string | null }

/**
 * An end of a lit ride: where it is, its place, whether it is the one of its
 * place that carries the name, its hotspot, when the ride says which, and
 * the directions of every lit ride that ends there, this way round
 * (`rides`, on the named one only: the rest are empty).
 */
export type RideEnd = { end: 'from' | 'to'; name: string; named: boolean; at: LngLat; stopId: string | null; rides: string[] }

/**
 * Where each lit ride starts and finishes, each place named once: two ends
 * of one name closer than SAME_END_M are one place (Tala, where two rides
 * start). The circles are drawn at every end; the names (EndTitles.tsx) at
 * the named ones.
 */
export function rideEnds(rides: readonly Ride[]): RideEnd[] {
  const named: RideEnd[] = []
  return rides
    .filter((r) => r.line.length > 1)
    .flatMap((r) =>
      (
        [
          ['from', r.from, r.line[0], r.fromStop ?? null],
          ['to', r.to, r.line[r.line.length - 1], r.toStop ?? null],
        ] as const
      ).map(([end, name, at, stopId]) => {
        const same = name ? named.find((n) => n.name === name && haversine(n.at, at) < SAME_END_M) : undefined
        if (same && same.end === end && r.id) same.rides.push(r.id)
        const e: RideEnd = { end, name, named: !!name && !same, at, stopId, rides: !same && r.id ? [r.id] : [] }
        if (e.named) named.push(e)
        return e
      }),
    )
}

/**
 * How often they move on: fifteen times a second. They flow for as long as
 * a route is lit (the owner's ask of 2026-09-30: "yes continuous arrows"),
 * after flowing for three seconds and resting since 2026-09-29, when a flow
 * at thirty frames kept a phone's main thread nine-tenths busy (a CPU slowed
 * 4×: 17 fps flowing, 60 at rest). At 28 px a second a step of about 2 px
 * still reads as a flow, for half that work; and it holds while the map is
 * dragged or zoomed, so moving the map keeps the whole frame to itself.
 */
const STEP_MS = 1000 / 15

/**
 * Steps that came this late, this many in a row, and they rest where they
 * are, as when asked to keep still: on a phone that cannot draw the map four
 * times a second, each step took the whole frame and a tap waited seconds
 * for its turn (a GitHub runner, 2026-10-01: the trip card's buttons
 * answering five seconds late, 13 frames in 8 s; 51 ms with them still).
 *
 * For WARM_MS after they start, after the map zooms and after a hidden page
 * comes back, no step counts: a new view's first frames are its dearest —
 * its tiles read and laid out — and say little of what the next ones will
 * cost (a GitHub runner, 2026-10-01: a jump to street zoom drew a few slow
 * frames, and the flow rested where it keeps up easily). A gap past AWAY_MS
 * is the page having been away, not a slow step. Rested, they try again only
 * once the map has zoomed a level or more — another view, another cost; a
 * pan, as the locator's camera makes each second, is the same view's.
 */
const SLOW_STEP_MS = 4 * STEP_MS
const SLOW_STEPS = 3
const WARM_MS = 1500
const AWAY_MS = 2000

/** Whether this browser has been asked to keep still. */
function stillPlease(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * The chevrons' colour, and the end circles' ring: the selected blue's white
 * chevrons and blue ring unless the public map says otherwise — a picked
 * card's or an open trip's (liveryLine.ts), the ring in the line's colour.
 */
export function useRideColours(map: MapLibreMap | null, look: LineLook) {
  // The chevrons' hook adds both layers together; wait for them.
  const ready = useLayerReady(map, ENDS)
  useEffect(() => {
    if (!map || !ready || !map.getLayer(CHEVRONS)) return
    map.setPaintProperty(CHEVRONS, 'fill-color', look.arrow)
    map.setPaintProperty(ENDS, 'circle-stroke-color', look.line)
  }, [map, look.line, look.arrow, ready])
}

/**
 * Draw chevrons along each ride's line, flowing for as long as it is lit
 * (STEP_MS), and a circle at both ends of each (named by EndTitles);
 * nothing when there are none. Pass the same array while what is lit is
 * unchanged (a memo), or the flow restarts.
 */
export function useDirectionArrows(map: MapLibreMap | null, rides: readonly Ride[]): void {
  const lines = useMemo(() => rides.map((r) => r.line), [rides])
  const hitReady = useLayerReady(map, ROUTES_HIT_LAYER)
  useEffect(() => {
    // Over the lit line and its orange stretches, under the hit area and the
    // basemap's labels: the line hook's layers must be there first, and are,
    // since it is called before this one on both surfaces. The end circles
    // go in just after, so they sit over the chevrons; their names go on top
    // of everything, so a street name gives way to them rather than the
    // other way round.
    if (!map || map.getSource(SRC) || !hitReady) return
    map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer(
      {
        id: CHEVRONS,
        type: 'fill',
        source: SRC,
        // No fade between colours: they change with what is lit, in its frame.
        paint: { 'fill-color': MAP_COLOURS['Map/RouteLine/Arrow/Rest'], 'fill-color-transition': { duration: 0, delay: 0 } },
      },
      ROUTES_HIT_LAYER,
    )
    map.addSource(ENDS_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer(
      {
        id: ENDS,
        type: 'circle',
        source: ENDS_SRC,
        paint: {
          'circle-radius': endRadius(),
          'circle-color': MAP_PAINT['Paint/casing'],
          'circle-stroke-color': MAP_COLOURS['Map/RouteLine/surface-selected'],
          'circle-stroke-color-transition': { duration: 0, delay: 0 },
          'circle-stroke-width': 2,
        },
      },
      ROUTES_HIT_LAYER,
    )
  }, [map, hitReady])

  // The ends: where each lit ride starts and finishes, each named once.
  // Still, so drawn once.
  useEffect(() => {
    const src = map?.getSource(ENDS_SRC) as GeoJSONSource | undefined
    if (!src) return
    const features = rideEnds(rides).map(({ end, name, named, at }) => ({
      type: 'Feature' as const,
      properties: { end, name, named },
      geometry: { type: 'Point' as const, coordinates: at },
    }))
    src.setData({ type: 'FeatureCollection', features })
  }, [map, rides, hitReady])

  const frame = useRef(0)
  useEffect(() => {
    const src = map?.getSource(SRC) as GeoJSONSource | undefined
    if (!map || !src) return
    const drawn = lines.filter((l) => l.length > 1)
    if (drawn.length === 0) {
      src.setData({ type: 'FeatureCollection', features: [] })
      return
    }
    const measured: Measured[] = []
    for (const l of drawn) {
      const m = measure(l)
      markCovered(m, measured)
      measured.push(m)
    }
    const still = stillPlease()
    // How far they have flowed, in ms of flowing: not while the map moves.
    let flowed = 0
    let last = performance.now()
    let moving = false
    let slow = 0
    let warmUntil = last + WARM_MS
    /** The zoom they rested at, or null while they flow; and the zoom the map last came to rest at. */
    let restedAt: number | null = null
    let zoomAt = map.getZoom()
    const draw = () => {
      const zoom = map.getZoom()
      const bounds = map.getBounds()
      const view = { west: bounds.getWest(), east: bounds.getEast(), south: bounds.getSouth(), north: bounds.getNorth(), zoom }
      const across = Math.max(0, litWidthAt(zoom) - 2 * INSET_PX)
      const features: Chevron[] = []
      for (const m of measured) {
        const mpp = metresPerPixel(m.lat, zoom)
        const spacing = spacingPx(zoom) * mpp
        const offset = still ? spacing / 2 : ((flowed / 1000) * SPEED_PX_PER_S * mpp) % spacing
        chevronsAt(m, offset, spacing, across, view, features)
      }
      src.setData({ type: 'FeatureCollection', features })
    }
    // Moved, the map draws them again where they are: a zoom changes their
    // size and spacing, a pan brings new line on screen.
    const onMove = () => draw()
    const onStart = () => (moving = true)
    const onEnd = () => {
      moving = false
      last = performance.now()
      const zoom = map.getZoom()
      if (restedAt === null) {
        // Zoomed: the new view's first frames are warm-up, its count afresh.
        if (Math.abs(zoom - zoomAt) >= 1) {
          slow = 0
          warmUntil = last + WARM_MS
        }
      } else if (Math.abs(zoom - restedAt) >= 1) {
        // Rested for being slow, and another view now: they try again.
        restedAt = null
        slow = 0
        warmUntil = last + WARM_MS
        frame.current = requestAnimationFrame(tick)
      }
      zoomAt = zoom
    }
    const tick = (now: number) => {
      if (moving || now - last < STEP_MS) {
        frame.current = requestAnimationFrame(tick)
        return
      }
      const gap = now - last
      if (gap > AWAY_MS) warmUntil = now + WARM_MS
      slow = now < warmUntil ? 0 : gap > SLOW_STEP_MS ? slow + 1 : 0
      // Too slow to flow: they rest where they are.
      if (slow >= SLOW_STEPS) {
        restedAt = map.getZoom()
        return
      }
      frame.current = requestAnimationFrame(tick)
      // Back from a hidden page, or a long frame: one step on, not a leap.
      flowed += Math.min(gap, 2 * STEP_MS)
      last = now
      draw()
    }
    draw()
    map.on('move', onMove)
    map.on('movestart', onStart)
    map.on('moveend', onEnd)
    // Still, when the browser is asked to keep still; and a hidden page
    // runs no frames at all.
    if (!still) frame.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame.current)
      map.off('move', onMove)
      map.off('movestart', onStart)
      map.off('moveend', onEnd)
    }
  }, [map, lines, hitReady])
}
