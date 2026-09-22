import { useEffect, useRef } from 'react'
import type { GeoJSONSource, MapLibreMap } from 'maplibre-gl'
import { haversine, type LngLat } from './geo'
import { LIT_EXTRA, roadWidthAt } from './lineStyle'

/**
 * Which way the jeep goes, drawn on the chosen direction only.
 *
 * Decided with the owner 2026-09-23: arrows *inside* the line, never as a
 * second offset line, only while one direction is chosen — on every resting
 * line they would be clutter once a road carries three routes — and
 * **flowing smoothly** along it from the start of the ride to its end. No
 * glow: he asked for it and then asked for it gone.
 *
 * One white arrow every so often, all alike, sized with the line. A train
 * of four fading chevrons — his own spec, built and looked at the same
 * evening — was dropped by him: "not good visually", back to this.
 *
 * MapLibre cannot slide a symbol along a line, so the arrows are points we
 * place ourselves: every frame, each one moves a little further along the
 * line and is rotated to its bearing there. The line handed in is already in
 * travel order (`travelLine`), so arrow number one leaves the terminal the
 * title names, whichever end it was drawn from.
 */

const SRC = 'direction-arrows'
const ARROWS = 'direction-arrow-symbols'
const ARROW_IMAGE = 'direction-arrow'

/**
 * On screen: how far apart the arrows sit, and how fast they flow. The
 * spacing is what the owner approved on 2026-09-22 — written as 56 then,
 * but doubled by a tile-size slip in `metresPerPixel`, since fixed.
 */
const SPACING_PX = 112
const SPEED_PX_PER_S = 28

/**
 * How wide the arrow is across the line: a share of the lit line's width,
 * and never under a floor. The owner's look at 0.9 of the line was "too
 * small"; this is the size he approved the day before, growing with the
 * line as the map zooms in.
 */
const ACROSS_SHARE = 1.5
const ACROSS_MIN_PX = 10

/**
 * A white triangle pointing east, drawn rather than taken from a font: the
 * basemap's glyphs are whatever the tile server ships, and an arrow that
 * silently vanishes on one design is worse than one we own. Drawn at
 * `IMAGE_ACROSS` pixels across at scale 1, two device pixels per logical
 * pixel so it stays crisp when scaled.
 */
const IMAGE_ACROSS = 12
function addArrowImage(map: MapLibreMap): void {
  if (map.hasImage(ARROW_IMAGE)) return
  const px = 2
  const size = 16 * px
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const c = canvas.getContext('2d')
  if (!c) return
  c.fillStyle = '#ffffff'
  c.beginPath()
  c.moveTo(4 * px, 2 * px)
  c.lineTo(13 * px, 8 * px)
  c.lineTo(4 * px, 14 * px)
  c.closePath()
  c.fill()
  const data = c.getImageData(0, 0, size, size).data
  map.addImage(ARROW_IMAGE, { width: size, height: size, data: new Uint8Array(data.buffer) }, { pixelRatio: px })
}

/** The line measured once: where each vertex is along it, in metres, and each segment's bearing. */
export type Measured = { line: LngLat[]; at: number[]; bearing: number[]; length: number; lat: number }

export function measure(line: LngLat[]): Measured {
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
export function metresPerPixel(lat: number, zoom: number): number {
  return (78271.51696 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
}

type Arrow = {
  type: 'Feature'
  properties: { bearing: number; size: number }
  geometry: { type: 'Point'; coordinates: LngLat }
}

/**
 * The arrows for one moment: one every `spacing` metres, starting `offset`
 * metres in, each at its point on the line and turned to its bearing.
 * Only the part of the line on screen is walked; the rest would be drawn
 * for nobody.
 */
function arrowsAt(m: Measured, offset: number, spacing: number, size: number, map: MapLibreMap) {
  const bounds = map.getBounds()
  const pad = 0.002
  const w = bounds.getWest() - pad
  const e = bounds.getEast() + pad
  const s = bounds.getSouth() - pad
  const n = bounds.getNorth() + pad
  const features: Arrow[] = []
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
    features.push({
      type: 'Feature',
      properties: { bearing: m.bearing[i - 1] - 90, size },
      geometry: { type: 'Point', coordinates: [x, y] },
    })
  }
  return { type: 'FeatureCollection' as const, features }
}

/** Whether this browser has been asked to keep still. */
export function stillPlease(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Draw flowing arrows along `line`, or nothing when it is null. */
export function useDirectionArrows(map: MapLibreMap | null, line: LngLat[] | null): void {
  useEffect(() => {
    if (!map || map.getSource(SRC)) return
    addArrowImage(map)
    map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: ARROWS,
      type: 'symbol',
      source: SRC,
      layout: {
        'icon-image': ARROW_IMAGE,
        'icon-size': ['get', 'size'],
        'icon-rotate': ['get', 'bearing'],
        'icon-rotation-alignment': 'map',
        // They move: never let placement drop one or nudge a label for it.
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    })
    // A basemap switch carries our source and layer across but not our
    // image, so the arrow is drawn again whenever a style lands.
    const again = () => addArrowImage(map)
    map.on('styledata', again)
    return () => {
      map.off('styledata', again)
    }
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
    const tick = (now: number) => {
      // Thirty frames a second is smooth for a flow and half the work of sixty.
      if (!still && now - last < 1000 / 30) {
        frame.current = requestAnimationFrame(tick)
        return
      }
      last = now
      const zoom = map.getZoom()
      const mpp = metresPerPixel(m.lat, zoom)
      const acrossPx = Math.max(ACROSS_MIN_PX, roadWidthAt(zoom, LIT_EXTRA) * ACROSS_SHARE)
      const size = acrossPx / IMAGE_ACROSS
      const spacing = SPACING_PX * mpp
      const offset = still ? spacing / 2 : (((now - start) / 1000) * SPEED_PX_PER_S * mpp) % spacing
      src.setData(arrowsAt(m, offset, spacing, size, map))
      if (!still) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [map, line])
}
