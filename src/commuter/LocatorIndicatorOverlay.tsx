import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Marker, type MapLibreMap } from 'maplibre-gl'
import { metresPerPixel } from '../shared/geo/geo'
import { ACCURACY_CAP_M, indicatorScale, type Fix } from './useLocator'

/**
 * Where Figma's cone points as drawn (3870:5241): its arc runs from due east
 * round to 205°, so it is turned by the heading less this.
 */
export const CONE_DRAWN_DEG = 147.6

/** The dot's own size, 24 px in 4 px of white: an accuracy circle smaller is hidden under it, so not drawn. */
const DOT_PX = 32
/** A circle past this is the whole screen anyway, and a DOM element that big costs. */
const HALO_MAX_PX = 1600

/**
 * The circle as drawn: the fix's metres on the ground, so it shrinks as the
 * map zooms out and is gone once the dot covers it, as Google Maps' is (the
 * owner's screenshots, 2026-10-01); never past HALO_MAX_PX. 0: none.
 */
export const haloFor = (px: number, scale = 1) => (px < DOT_PX * scale ? 0 : Math.round(Math.min(HALO_MAX_PX, px)))

type Props = {
  /** The accuracy circle's width: the fix's 68 % radius, twice, in pixels. */
  haloPx: number
  /** Which way the cone points, degrees clockwise from the overlay's up — north, on the map. Null: no cone. */
  coneDeg: number | null
  /** The dot and cone's size against Figma's, 1 at street level (indicatorScale). */
  scale?: number
}

/**
 * The owner's LocatorIndicatorOverlay (3870:5247, 2026-10-01): the visitor
 * on the map, in the walking figure's place — a 24 px Brand/surface dot in
 * white, a cone the way they face fading out from it, and the circle the
 * fix is good to, both in Map/LocatorIndicatorOverlay/surface. The circle
 * matters: GPS in Metro Manila is often 20–50 m out, and a dot alone would
 * claim a certainty the phone does not have. Figma's is 240 across, its
 * cone 70 long; here the circle is the fix's metres, the cone stays as drawn.
 */
export function LocatorIndicatorOverlay({ haloPx, coneDeg, scale = 1 }: Props) {
  const halo = haloFor(haloPx, scale)
  const gradient = useId()
  return (
    <div className="pointer-events-none relative size-0">
      {halo > 0 && (
        <div
          className="absolute top-1/2 left-1/2 -translate-1/2 rounded-full bg-map-locator-indicator-overlay-surface/15"
          style={{ width: halo, height: halo }}
        />
      )}
      {/* The dot and its cone, smaller zoomed out; the circle is metres, and keeps its own size. */}
      <div className="absolute inset-0" style={{ scale }}>
        {coneDeg !== null && (
          <div
            className="absolute top-1/2 left-1/2 size-35 -translate-1/2 text-map-locator-indicator-overlay-surface"
            style={{ rotate: `${coneDeg - CONE_DRAWN_DEG}deg` }}
          >
            <svg viewBox="0 0 99.8046 70" className="absolute top-1/2 left-[28.71%] h-17.5 w-[99.8px]" aria-hidden>
              <defs>
                <linearGradient id={gradient} x1="29.8046" y1="3.05551" x2="54.8732" y2="70" gradientUnits="userSpaceOnUse">
                  <stop stopColor="currentColor" />
                  <stop offset="1" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M99.8046 0C99.8046 11.7907 96.8263 23.3905 91.146 33.7228C85.4658 44.0551 77.2677 52.7852 67.3124 59.103C57.3572 65.4208 45.9674 69.1215 34.1999 69.8619C22.4324 70.6022 10.6686 68.3581 8.2676e-07 63.3379L29.8046 0H99.8046Z"
                fill={`url(#${gradient})`}
              />
            </svg>
          </div>
        )}
        <div className="absolute top-1/2 left-1/2 -translate-1/2 rounded-full bg-surface p-1">
          <div className="size-6 rounded-full bg-brand-surface" />
        </div>
      </div>
    </div>
  )
}

/**
 * The overlay at the visitor's fix, as a DOM marker, not a map layer: it
 * costs the map nothing to move (an animated layer kept MapLibre repainting
 * the whole map, 2026-09-25). It lies on the ground and turns with the map
 * (MapLibre's `map` alignments), as Google Maps' does: tilted, in the
 * compass view, the circle and the dot go oval with the street; and its
 * cone points the way they face, from north.
 */
export function LocatorOnMap({ map, fix, heading }: { map: MapLibreMap; fix: Fix; heading: number | null }) {
  const [el] = useState(() => {
    const div = document.createElement('div')
    div.dataset.testid = 'locator-overlay'
    return div
  })
  const [marker] = useState(() => new Marker({ element: el, anchor: 'center', pitchAlignment: 'map', rotationAlignment: 'map' }))
  const [zoom, setZoom] = useState(() => map.getZoom())

  useEffect(() => {
    marker.setLngLat(fix.at).addTo(map)
    const zoomed = () => setZoom(map.getZoom())
    map.on('zoom', zoomed)
    return () => {
      map.off('zoom', zoomed)
      marker.remove()
    }
    // Added once per map; the fix moves it below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, marker])
  useEffect(() => {
    marker.setLngLat(fix.at)
  }, [marker, fix.at])

  const haloPx = (2 * Math.min(fix.accuracy, ACCURACY_CAP_M)) / metresPerPixel(fix.at[1], zoom)
  const scale = indicatorScale(zoom)
  // For the suites (where-test): what the overlay was drawn from.
  useEffect(() => {
    el.dataset.accuracyM = String(Math.round(fix.accuracy))
    el.dataset.haloPx = String(haloFor(haloPx, scale))
    el.dataset.scale = scale.toFixed(2)
    el.dataset.heading = heading === null ? '' : String(Math.round(heading))
  }, [el, fix.accuracy, haloPx, heading, scale])
  return createPortal(<LocatorIndicatorOverlay haloPx={haloPx} coneDeg={heading} scale={scale} />, el)
}
