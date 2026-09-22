import { useEffect, useRef } from 'react'
import type { GeoJSONSource, MapLibreMap } from 'maplibre-gl'
import { haversine, type LngLat } from './geo'
import { LIT_EXTRA, roadWidthAt } from './lineStyle'
import { ROUTES_HIT_LAYER } from './tap'

/**
 * Which way the jeep goes, drawn on the chosen direction only.
 *
 * Decided with the owner 2026-09-23: marks *inside* the line, never as a
 * second offset line, only while one direction is chosen — on every resting
 * line they would be clutter once a road carries three routes — and
 * **flowing smoothly** along it from the start of the ride to its end. No
 * glow: he asked for it and then asked for it gone.
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

/** The line measured once: where each vertex is along it, in metres, and each segment's bearing. */
type Measured = { line: LngLat[]; at: number[]; bearing: number[]; length: number; lat: number }

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
  return { line, at, bearing, length: at[at.length - 1], lat: line[Math.floor(line.length / 2)][1] }
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
 * The chevrons for one moment: one every `spacing` metres, starting
 * `offset` metres in, each at its point on the line and turned to its
 * bearing. Only the part of the line on screen is walked; the rest would be
 * drawn for nobody.
 */
function chevronsAt(m: Measured, offset: number, spacing: number, across: number, map: MapLibreMap) {
  const bounds = map.getBounds()
  const zoom = map.getZoom()
  const pad = 0.002
  const w = bounds.getWest() - pad
  const e = bounds.getEast() + pad
  const s = bounds.getSouth() - pad
  const n = bounds.getNorth() + pad
  const features: Chevron[] = []
  let i = 1
  for (let d = offset; d < m.length; d += spacing) {
    while (i < m.at.length - 1 && m.at[i] < d) i++
    const a = m.line[i - 1]
    const b = m.line[i]
    const span = m.at[i] - m.at[i - 1]
    const t = span > 0 ? (d - m.at[i - 1]) / span : 0
    const x = a[0] + (b[0] - a[0]) * t
    const y = a[1] + (b[1] - a[1]) * t
    if (x < w || x > e || y < s || y > n) continue
    features.push(chevronAt([x, y], m.bearing[i - 1], across, zoom))
  }
  return { type: 'FeatureCollection' as const, features }
}

/** Whether this browser has been asked to keep still. */
function stillPlease(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Draw flowing chevrons along `line`, or nothing when it is null. */
export function useDirectionArrows(map: MapLibreMap | null, line: LngLat[] | null): void {
  useEffect(() => {
    // Over the lit line and its orange stretches, under the hit area and the
    // basemap's labels: the line hook's layers must be there first, and are,
    // since it is called before this one on both surfaces.
    if (!map || map.getSource(SRC) || !map.getLayer(ROUTES_HIT_LAYER)) return
    map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({ id: CHEVRONS, type: 'fill', source: SRC, paint: { 'fill-color': '#ffffff' } }, ROUTES_HIT_LAYER)
  }, [map])

  const frame = useRef(0)
  useEffect(() => {
    const src = map?.getSource(SRC) as GeoJSONSource | undefined
    if (!map || !src) return
    if (!line || line.length < 2) {
      src.setData({ type: 'FeatureCollection', features: [] })
      return
    }
    const m = measure(line)
    const still = stillPlease()
    const start = performance.now()
    let last = 0
    const draw = (now: number) => {
      const zoom = map.getZoom()
      const mpp = metresPerPixel(m.lat, zoom)
      const across = Math.max(0, roadWidthAt(zoom, LIT_EXTRA) - 2 * INSET_PX)
      const spacing = spacingPx(zoom) * mpp
      const offset = still ? spacing / 2 : (((now - start) / 1000) * SPEED_PX_PER_S * mpp) % spacing
      src.setData(chevronsAt(m, offset, spacing, across, map))
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
  }, [map, line])
}
