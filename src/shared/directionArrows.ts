import { useEffect, useMemo, useRef } from 'react'
import type { GeoJSONSource, MapLibreMap } from 'maplibre-gl'
import { haversine, type LngLat } from './geo'
import { LINE_BLUE, endRadius, litWidthAt } from './lineStyle'
import { ROUTES_HIT_LAYER } from './tap'

/**
 * Which way the jeep goes, drawn on the lit directions only, with a circle
 * at each end of each and the place's name beside it (the owner's asks of
 * 2026-09-25).
 *
 * Decided with the owner 2026-09-23: marks *inside* the line, never as a
 * second offset line, only on what is lit — on every resting line they would
 * be clutter once a road carries three routes — and **flowing smoothly**
 * along it from the start of the ride to its end. No glow: he asked for it
 * and then asked for it gone. What is lit is the chosen direction, or, since
 * 2026-09-25, every route under a tap the way round the sheet shows them;
 * where two of those share a road they flow as one stream, not two.
 *
 * The mark is a white chevron, one to a place and all alike, with no trail:
 * his call the night of 2026-09-23, after white arrows, a train of four
 * fading chevrons ("not good visually") and jeepneys (parked for a Simulate
 * button, PLAN.md). It is a chevron bigger than the line and cut off by it:
 * its arms run out to the line's edges and stop there, so none of it shows
 * outside the line.
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
const ENDS = 'direction-end-circles'
const END_NAMES = 'direction-end-names'

/** Two ends of one name closer than this are one place, and named once: Tala, where two rides start. */
const SAME_END_M = 150

/** One lit ride: its line in travel order, and the places it runs from and to. */
export type Ride = { line: LngLat[]; from: string; to: string }

/**
 * Two lit lines closer than this, running within `SAME_WAY_DEG` of the same
 * way, are on the same road: the later one leaves its chevrons out there, so
 * Tala → SM Fairview and Tala → Novaliches flow as one stream where they
 * share Quirino and as two once they part.
 */
const SAME_ROAD_M = 8
const SAME_WAY_DEG = 45

/**
 * On screen: how far apart the chevrons sit, and how fast they flow. The
 * spacing is what the owner approved for the arrows on 2026-09-22 — written
 * as 56 then, but doubled by a tile-size slip in `metresPerPixel`, since
 * fixed — and, his call on the chevrons, 12/10 as many zoomed out (below
 * zoom 14, the whole ride on screen) and 8/10 as many zoomed in (from 16,
 * street level).
 */
const SPACING_PX = 112
const MORE_ZOOMED_OUT = 1.2
const FEWER_ZOOMED_IN = 0.8
const ZOOMED_OUT_BELOW = 14
const ZOOMED_IN_FROM = 16
const SPEED_PX_PER_S = 28

/**
 * The spacing at `zoom`, in steps rather than smoothly: where each chevron
 * sits depends on the spacing, so one that changed with every bit of zoom
 * would send them racing along the line under a pinch. A step moves them
 * once.
 */
function spacingPx(zoom: number): number {
  if (zoom < ZOOMED_OUT_BELOW) return SPACING_PX / MORE_ZOOMED_OUT
  if (zoom >= ZOOMED_IN_FROM) return SPACING_PX / FEWER_ZOOMED_IN
  return SPACING_PX
}

/**
 * The chevron's shape: how thick its stroke is, as a share of the line's
 * width, and the angle each arm makes with the line. It is as wide as the
 * lit line, less `INSET_PX` a side.
 */
const STROKE_SHARE = 0.7
const ARM_DEG = 40
const INSET_PX = 0

/**
 * The line measured once: where each vertex is along it, in metres, each
 * segment's bearing, and which segments an earlier lit line already covers.
 */
type Measured = {
  line: LngLat[]
  at: number[]
  bearing: number[]
  length: number
  lat: number
  covered: boolean[]
}

function measure(line: LngLat[]): Measured {
  const at = [0]
  const bearing: number[] = []
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]
    const [bx, by] = line[i]
    at.push(at[i - 1] + haversine(line[i - 1], line[i]))
    // Flat is fine at street scale: bearing clockwise from north.
    const dx = (bx - ax) * Math.cos((ay * Math.PI) / 180)
    const dy = by - ay
    bearing.push((Math.atan2(dx, dy) * 180) / Math.PI)
  }
  return {
    line,
    at,
    bearing,
    length: at[at.length - 1],
    lat: line[Math.floor(line.length / 2)][1],
    covered: bearing.map(() => false),
  }
}

/** Metres from p to segment a–b, on a flat patch around a. */
function offSegmentM(p: LngLat, a: LngLat, b: LngLat): number {
  const k = Math.cos((a[1] * Math.PI) / 180)
  const [px, py] = [(p[0] - a[0]) * k, p[1] - a[1]]
  const [bx, by] = [(b[0] - a[0]) * k, b[1] - a[1]]
  const l2 = bx * bx + by * by
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / l2))
  return Math.hypot(px - t * bx, py - t * by) * 111_320
}

/** How far apart two bearings are, 0–180°. */
const turn = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180)

/**
 * Mark the segments of `m` that run on an earlier line's road the same way:
 * their middle within SAME_ROAD_M of one of its segments, bearings within
 * SAME_WAY_DEG. Once per change of what is lit, not per frame.
 */
function markCovered(m: Measured, earlier: Measured[]): void {
  const reach = SAME_ROAD_M / 111_320 / Math.cos((m.lat * Math.PI) / 180)
  for (let i = 0; i < m.bearing.length; i++) {
    const a = m.line[i]
    const b = m.line[i + 1]
    const mid: LngLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    m.covered[i] = earlier.some((e) => {
      for (let j = 0; j < e.bearing.length; j++) {
        const [c, d] = [e.line[j], e.line[j + 1]]
        // Cheap reject first: a segment wholly to one side is far.
        if (Math.max(c[0], d[0]) < mid[0] - reach || Math.min(c[0], d[0]) > mid[0] + reach) continue
        if (Math.max(c[1], d[1]) < mid[1] - reach || Math.min(c[1], d[1]) > mid[1] + reach) continue
        if (offSegmentM(mid, c, d) <= SAME_ROAD_M && turn(m.bearing[i], e.bearing[j]) <= SAME_WAY_DEG) return true
      }
      return false
    })
  }
}

/** Metres in one screen pixel at this latitude and zoom, with MapLibre's 512 px tiles (half the 256 px figure). */
function metresPerPixel(lat: number, zoom: number): number {
  return (78271.51696 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
}

type Chevron = {
  type: 'Feature'
  properties: { across: number }
  geometry: { type: 'Polygon'; coordinates: LngLat[][] }
}

/**
 * One chevron centred on `at` and pointing along `bearing`, `across` pixels
 * wide at `zoom`: a thick V whose arms are cut off where they reach the
 * edges of a band `across` wide. Laid out in pixels along the line and
 * across it, then turned and placed on the map; a pixel is the same number
 * of degrees of longitude everywhere, and that times the cosine of the
 * latitude in degrees of latitude.
 */
function chevronAt(at: LngLat, bearing: number, across: number, zoom: number): Chevron {
  const arm = (ARM_DEG * Math.PI) / 180
  const half = across / 2
  // How far behind its tip an edge of the V reaches the band's edge, and how
  // far the inner tip sits behind the outer one.
  const reach = half / Math.tan(arm)
  const inner = (across * STROKE_SHARE) / Math.sin(arm)
  const front = (reach + inner) / 2
  const corners: [number, number][] = [
    [front, 0],
    [front - reach, half],
    [front - inner - reach, half],
    [front - inner, 0],
    [front - inner - reach, -half],
    [front - reach, -half],
    [front, 0],
  ]
  const b = (bearing * Math.PI) / 180
  const degrees = 360 / (512 * 2 ** zoom)
  const cosLat = Math.cos((at[1] * Math.PI) / 180)
  const ring = corners.map(([along, side]): LngLat => {
    const east = along * Math.sin(b) - side * Math.cos(b)
    const north = along * Math.cos(b) + side * Math.sin(b)
    return [at[0] + east * degrees, at[1] + north * degrees * cosLat]
  })
  return { type: 'Feature', properties: { across }, geometry: { type: 'Polygon', coordinates: [ring] } }
}

/**
 * The chevrons of one line for one moment, added to `features`: one every
 * `spacing` metres, starting `offset` metres in, each at its point on the
 * line and turned to its bearing — except where an earlier lit line already
 * flows. Only the part of the line on screen is walked; the rest would be
 * drawn for nobody.
 */
function chevronsAt(
  m: Measured,
  offset: number,
  spacing: number,
  across: number,
  map: MapLibreMap,
  features: Chevron[],
): void {
  const bounds = map.getBounds()
  const zoom = map.getZoom()
  const pad = 0.002
  const w = bounds.getWest() - pad
  const e = bounds.getEast() + pad
  const s = bounds.getSouth() - pad
  const n = bounds.getNorth() + pad
  let i = 1
  for (let d = offset; d < m.length; d += spacing) {
    while (i < m.at.length - 1 && m.at[i] < d) i++
    if (m.covered[i - 1]) continue
    const a = m.line[i - 1]
    const b = m.line[i]
    const span = m.at[i] - m.at[i - 1]
    const t = span > 0 ? (d - m.at[i - 1]) / span : 0
    const x = a[0] + (b[0] - a[0]) * t
    const y = a[1] + (b[1] - a[1]) * t
    if (x < w || x > e || y < s || y > n) continue
    features.push(chevronAt([x, y], m.bearing[i - 1], across, zoom))
  }
}

/** Whether this browser has been asked to keep still. */
function stillPlease(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Draw flowing chevrons along each ride's line, and a circle at both ends of
 * each with the place's name beside it; nothing when there are none. Pass the
 * same array while what is lit is unchanged (a memo), or the flow restarts.
 */
export function useDirectionArrows(map: MapLibreMap | null, rides: readonly Ride[]): void {
  const lines = useMemo(() => rides.map((r) => r.line), [rides])
  useEffect(() => {
    // Over the lit line and its orange stretches, under the hit area and the
    // basemap's labels: the line hook's layers must be there first, and are,
    // since it is called before this one on both surfaces. The end circles
    // go in just after, so they sit over the chevrons; their names go on top
    // of everything, so a street name gives way to them rather than the
    // other way round.
    if (!map || map.getSource(SRC) || !map.getLayer(ROUTES_HIT_LAYER)) return
    map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({ id: CHEVRONS, type: 'fill', source: SRC, paint: { 'fill-color': '#ffffff' } }, ROUTES_HIT_LAYER)
    map.addSource(ENDS_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer(
      {
        id: ENDS,
        type: 'circle',
        source: ENDS_SRC,
        paint: {
          'circle-radius': endRadius(),
          'circle-color': '#ffffff',
          'circle-stroke-color': LINE_BLUE,
          'circle-stroke-width': 2,
        },
      },
      ROUTES_HIT_LAYER,
    )
    map.addLayer({
      id: END_NAMES,
      type: 'symbol',
      source: ENDS_SRC,
      filter: ['==', ['get', 'named'], true],
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 13,
        'text-font': ['Noto Sans Bold'],
        // Beside the circle, clear of it at every zoom; whichever side is free.
        'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
        'text-radial-offset': 1.1,
        'text-justify': 'auto',
        'text-allow-overlap': false,
      },
      paint: { 'text-color': '#171717', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
    })
  }, [map])

  // The ends: where each lit ride starts and finishes, each named once.
  // Still, so drawn once.
  useEffect(() => {
    const src = map?.getSource(ENDS_SRC) as GeoJSONSource | undefined
    if (!src) return
    const named: { name: string; at: LngLat }[] = []
    const features = rides
      .filter((r) => r.line.length > 1)
      .flatMap((r) =>
        (
          [
            ['from', r.from, r.line[0]],
            ['to', r.to, r.line[r.line.length - 1]],
          ] as const
        ).map(([end, name, at]) => {
          const first = !!name && !named.some((n) => n.name === name && haversine(n.at, at) < SAME_END_M)
          if (first) named.push({ name, at })
          return {
            type: 'Feature' as const,
            properties: { end, name, named: first },
            geometry: { type: 'Point' as const, coordinates: at },
          }
        }),
      )
    src.setData({ type: 'FeatureCollection', features })
  }, [map, rides])

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
    const start = performance.now()
    let last = 0
    const draw = (now: number) => {
      const zoom = map.getZoom()
      const across = Math.max(0, litWidthAt(zoom) - 2 * INSET_PX)
      const features: Chevron[] = []
      for (const m of measured) {
        const mpp = metresPerPixel(m.lat, zoom)
        const spacing = spacingPx(zoom) * mpp
        const offset = still ? spacing / 2 : (((now - start) / 1000) * SPEED_PX_PER_S * mpp) % spacing
        chevronsAt(m, offset, spacing, across, map, features)
      }
      src.setData({ type: 'FeatureCollection', features })
    }
    const tick = (now: number) => {
      // Thirty frames a second is smooth for a flow and half the work of sixty.
      if (now - last >= 1000 / 30) {
        last = now
        draw(now)
      }
      frame.current = requestAnimationFrame(tick)
    }
    // Kept still, they are drawn once, and again whenever the map moves: a
    // zoom changes their size and spacing, a pan brings new line on screen.
    const redraw = () => draw(performance.now())
    if (still) {
      redraw()
      map.on('move', redraw)
    } else {
      frame.current = requestAnimationFrame(tick)
    }
    return () => {
      cancelAnimationFrame(frame.current)
      map.off('move', redraw)
    }
  }, [map, lines])
}
