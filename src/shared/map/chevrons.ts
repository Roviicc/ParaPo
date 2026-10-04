import { M_PER_DEG, haversine, pointToSegmentM, type LngLat } from '../geo/geo'

/*
 * The chevrons' geometry: where along each lit line they sit, which stretches
 * an earlier lit line already flows on, and each one's polygon, shaped in
 * screen pixels. Pure — the map is only its view — so a unit test can hold
 * it (chevrons-test). useDirectionArrows moves them. Split from
 * directionArrows.ts, 2026-09-29.
 */

/** What of the map is on screen, and at what zoom: all a frame of chevrons needs of it. */
export type View = { west: number; east: number; south: number; north: number; zoom: number }

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
export const SPEED_PX_PER_S = 28

/**
 * The spacing at `zoom`, in steps rather than smoothly: where each chevron
 * sits depends on the spacing, so one that changed with every bit of zoom
 * would send them racing along the line under a pinch. A step moves them
 * once.
 */
export function spacingPx(zoom: number): number {
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
export const INSET_PX = 0

/**
 * The line measured once: where each vertex is along it, in metres, each
 * segment's bearing, and which segments an earlier lit line already covers.
 */
export type Measured = {
  line: readonly LngLat[]
  at: number[]
  bearing: number[]
  length: number
  lat: number
  covered: boolean[]
}

export function measure(line: readonly LngLat[]): Measured {
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

/** How far apart two bearings are, 0–180°. */
const turn = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180)

/**
 * Mark the segments of `m` that run on an earlier line's road the same way:
 * their middle within SAME_ROAD_M of one of its segments, bearings within
 * SAME_WAY_DEG. Once per change of what is lit, not per frame.
 */
export function markCovered(m: Measured, earlier: Measured[]): void {
  const reach = SAME_ROAD_M / M_PER_DEG / Math.cos((m.lat * Math.PI) / 180)
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
        if (pointToSegmentM(mid, c, d) <= SAME_ROAD_M && turn(m.bearing[i], e.bearing[j]) <= SAME_WAY_DEG) return true
      }
      return false
    })
  }
}

export type Chevron = {
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
export function chevronAt(at: LngLat, bearing: number, across: number, zoom: number): Chevron {
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
 * flows. Only the part of the line in `view` is walked; the rest would be
 * drawn for nobody.
 */
export function chevronsAt(
  m: Measured,
  offset: number,
  spacing: number,
  across: number,
  view: View,
  features: Chevron[],
): void {
  const zoom = view.zoom
  const pad = 0.002
  const w = view.west - pad
  const e = view.east + pad
  const s = view.south - pad
  const n = view.north + pad
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
