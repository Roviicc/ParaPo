import { useEffect, useRef } from 'react'
import type { GeoJSONSource, MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import type { LngLat } from './geo'
import { LIT_EXTRA, roadWidthAt } from './lineStyle'
import { measure, metresPerPixel, stillPlease, type Measured } from './directionArrows'
import { JEEP_DESIGNS, JEEP_H, JEEP_W, jeepSvg, type JeepDesign } from './jeepSprites'
import { JEEPS_LAYER, tapBox } from './tap'

/**
 * Which way the jeep goes, shown by jeeps: small jeepneys, seen from above,
 * driving the chosen direction from the start of the ride to its end, all
 * the same distance apart. One that reaches the end starts again from the
 * beginning, so the line always carries the same number.
 *
 * The owner's ask of 2026-09-23, in place of the flowing arrows
 * (`directionArrows`, kept for now): jeeps like the cars in Grab or Angkas,
 * but plainly Philippine jeepneys. First one jeep; then, the same day, one
 * for every 2 km of the ride ("if 10 km there should be 5"), evenly spaced,
 * and slow.
 *
 * Four designs are on trial (`jeepSprites`); `?jeep=painted` (or `classic`,
 * `route`, or `mix` for a different one each) in the address picks one,
 * `toy` otherwise.
 *
 * A tap on a jeep makes the screen follow it, as the owner asked the same
 * day: the camera comes down to street level and rides along until the
 * jeep reaches the end of the ride, the map is moved by hand, or the same
 * jeep is tapped again. The tap is the jeep's alone (`resolveTap`), so the
 * card underneath stays as it was.
 */

const SRC = 'direction-jeep'
const IMAGE = 'direction-jeep-'

/** One jeep for every this many metres of the ride, and never none. */
const METRES_PER_JEEP = 2000

/**
 * How fast they drive, on screen, at every zoom. The owner's "6/10" of the
 * single jeep's pace, which at the whole-route view was 70 px a second.
 */
const SPEED_PX_PER_S = 42

/** How long a jeep is on screen: a share of the lit line's width, kept between these. */
const LENGTH_SHARE = 3.4
const LENGTH_MIN_PX = 36
const LENGTH_MAX_PX = 56

/** Drawn this many times over, so it stays crisp when scaled up. */
const SCALE = 4

/**
 * Following a tapped jeep: no further out than street level, catching up
 * within about a second, and a little above the middle of the screen, clear
 * of the card that rises from the bottom. The followed jeep is drawn a size
 * up, so it is plain which one is being followed.
 */
const FOLLOW_ZOOM = 16
const FOLLOW_EASE_S = 0.25
const FOLLOW_AT_Y = 0.4
const FOLLOWED_SIZE = 1.2

/** The design each jeep wears, jeep by jeep along the ride. */
function chosenDesigns(): JeepDesign[] {
  if (typeof window === 'undefined') return ['toy']
  const asked = new URLSearchParams(window.location.search).get('jeep')
  if (asked === 'mix') return JEEP_DESIGNS
  return [JEEP_DESIGNS.find((d) => d === asked) ?? 'toy']
}

/** Paint each design's SVG into pixels and hand it to the map, once it has loaded. */
function addJeepImages(map: MapLibreMap): void {
  for (const design of JEEP_DESIGNS) {
    const name = IMAGE + design
    if (map.hasImage(name)) continue
    const img = new Image()
    img.onload = () => {
      if (map.hasImage(name)) return
      const canvas = document.createElement('canvas')
      canvas.width = JEEP_W * SCALE
      canvas.height = JEEP_H * SCALE
      const c = canvas.getContext('2d')
      if (!c) return
      c.drawImage(img, 0, 0, canvas.width, canvas.height)
      const data = c.getImageData(0, 0, canvas.width, canvas.height).data
      map.addImage(name, { width: canvas.width, height: canvas.height, data: new Uint8Array(data.buffer) }, { pixelRatio: SCALE })
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(jeepSvg(design))
  }
}

/** How far jeep `k` is into the ride, when the first is `lead` metres in and the rest `spacing` apart. */
function along(m: Measured, lead: number, spacing: number, k: number): number {
  return (lead + k * spacing) % m.length
}

/** Every jeep for one moment, each at its place on the line and turned to its bearing. */
function jeepsAt(m: Measured, lead: number, spacing: number, count: number, size: number, designs: JeepDesign[], followed: number | null) {
  const features = []
  for (let k = 0; k < count; k++) {
    const d = along(m, lead, spacing, k)
    let i = 1
    while (i < m.at.length - 1 && m.at[i] < d) i++
    const a = m.line[i - 1]
    const b = m.line[i]
    const span = m.at[i] - m.at[i - 1]
    const t = span > 0 ? (d - m.at[i - 1]) / span : 0
    features.push({
      type: 'Feature' as const,
      properties: {
        k,
        bearing: m.bearing[i - 1] - 90,
        size: k === followed ? size * FOLLOWED_SIZE : size,
        image: IMAGE + designs[k % designs.length],
      },
      geometry: { type: 'Point' as const, coordinates: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] },
    })
  }
  return { type: 'FeatureCollection' as const, features }
}

/** The screen point the followed jeep is kept at. */
function followPoint(map: MapLibreMap): [number, number] {
  const canvas = map.getCanvas()
  return [canvas.clientWidth / 2, canvas.clientHeight * FOLLOW_AT_Y]
}

/** Move the camera `share` of the way to having `at` on the follow point and the zoom at `zoom`. */
function cameraToward(map: MapLibreMap, at: LngLat, zoom: number, share: number): void {
  const p = map.project(at)
  const [wx, wy] = followPoint(map)
  const c = map.project(map.getCenter())
  const z = map.getZoom()
  map.jumpTo({ center: map.unproject([c.x + (p.x - wx) * share, c.y + (p.y - wy) * share]), zoom: z + (zoom - z) * share })
}

/** Drive jeeps along `line`, or show none when it is null. */
export function useDirectionJeep(map: MapLibreMap | null, line: LngLat[] | null): void {
  useEffect(() => {
    if (!map || map.getSource(SRC)) return
    addJeepImages(map)
    map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: JEEPS_LAYER,
      type: 'symbol',
      source: SRC,
      layout: {
        'icon-image': ['get', 'image'],
        'icon-size': ['get', 'size'],
        'icon-rotate': ['get', 'bearing'],
        'icon-rotation-alignment': 'map',
        // They move: never let placement drop one or nudge a label for it.
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    })
    // A basemap switch carries our source and layer across but not our
    // images, so the jeeps are painted again whenever a style lands.
    const again = () => addJeepImages(map)
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
    const count = Math.max(1, Math.round(m.length / METRES_PER_JEEP))
    const spacing = m.length / count
    const designs = chosenDesigns()
    const still = stillPlease()
    // How far the first jeep is into the ride. Kept still, they wait half a gap in, clear of both terminals.
    let lead = still ? spacing / 2 : 0
    // The jeep the screen follows, the zoom it follows at, and how far into the ride it was last frame.
    let following: { k: number; zoom: number; d: number } | null = null
    // The jeep a press on the map just let go of, so a tap on that same jeep leaves it let go.
    let letGoOf: number | null = null
    // Set while the camera takes one of our own steps, whose events are not a hand on the map.
    let steering = false
    const steer = (at: LngLat, zoom: number, share: number) => {
      steering = true
      try {
        cameraToward(map, at, zoom, share)
      } finally {
        steering = false
      }
    }
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const zoom = map.getZoom()
      const lengthPx = Math.min(LENGTH_MAX_PX, Math.max(LENGTH_MIN_PX, roadWidthAt(zoom, LIT_EXTRA) * LENGTH_SHARE))
      // Metres into the ride, counted on so each jeep keeps its place (and its paint) in the queue.
      if (!still) lead = (lead + dt * SPEED_PX_PER_S * metresPerPixel(m.lat, zoom)) % m.length
      const jeeps = jeepsAt(m, lead, spacing, count, lengthPx / JEEP_W, designs, following?.k ?? null)
      src.setData(jeeps)
      if (following) {
        const d = along(m, lead, spacing, following.k)
        // Back at the start means it reached the end: the camera stays at the terminal.
        if (d < following.d) following = null
        else {
          following.d = d
          const at = jeeps.features[following.k].geometry.coordinates as LngLat
          steer(at, following.zoom, 1 - Math.exp(-dt / FOLLOW_EASE_S))
        }
      }
      if (!still) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)

    const onClick = (e: MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(tapBox(e.point, e.originalEvent), { layers: [JEEPS_LAYER] })
      if (hits.length === 0) return
      // The one nearest the finger, when two are close.
      const where = (f: (typeof hits)[number]) => (f.geometry as unknown as { coordinates: LngLat }).coordinates
      const distance = (f: (typeof hits)[number]) => {
        const p = map.project(where(f))
        return (p.x - e.point.x) ** 2 + (p.y - e.point.y) ** 2
      }
      const hit = hits.reduce((a, b) => (distance(b) < distance(a) ? b : a))
      const k = Number(hit.properties.k)
      if (letGoOf === k) {
        // The followed jeep, tapped again: the press let go of it, and so it stays.
        letGoOf = null
      } else if (still) {
        // Parked, there is nothing to ride along with: go to it once, zoom first, then place it.
        steer(where(hit), Math.max(map.getZoom(), FOLLOW_ZOOM), 1)
        steer(where(hit), map.getZoom(), 1)
      } else {
        following = { k, zoom: Math.max(map.getZoom(), FOLLOW_ZOOM), d: along(m, lead, spacing, k) }
      }
    }
    // A hand on the map lets go of the jeep, the moment it touches: every
    // step of the camera ends whatever drag, pinch or wheel MapLibre is
    // reading, so waiting for the map to move would leave it unmovable.
    // Any other camera move (the zoom buttons, a fly to a hotspot) lets go too.
    const container = map.getCanvasContainer()
    const onPress = () => {
      letGoOf = following?.k ?? null
      following = null
    }
    const letGo = () => {
      following = null
    }
    const onMoveStart = () => {
      if (!steering) letGo()
    }
    container.addEventListener('pointerdown', onPress)
    container.addEventListener('wheel', letGo, { passive: true })
    container.addEventListener('keydown', letGo)
    map.on('movestart', onMoveStart)
    map.on('click', onClick)
    // Parked, they are only drawn again when a zoom changes their size.
    const resize = () => tick(performance.now())
    if (still) map.on('zoom', resize)
    return () => {
      cancelAnimationFrame(frame.current)
      container.removeEventListener('pointerdown', onPress)
      container.removeEventListener('wheel', letGo)
      container.removeEventListener('keydown', letGo)
      map.off('movestart', onMoveStart)
      map.off('click', onClick)
      map.off('zoom', resize)
    }
  }, [map, line])
}
