import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Marker, type MapLibreMap } from 'maplibre-gl'
import { metresPerPixel } from '../shared/geo/geo'
import type { Fix } from './useLocator'

/**
 * Where Figma's cone points as drawn (3870:5241): its arc runs from due east
 * round to 205°, so it is turned by the heading less this.
 */
export const CONE_DRAWN_DEG = 147.6

/** The dot's own size, 24 px in 4 px of white: no accuracy circle is drawn smaller. */
const DOT_PX = 32
/** A circle past this is the whole screen anyway, and a DOM element that big costs. */
const HALO_MAX_PX = 1600

type Props = {
  /** The accuracy circle's width: the fix's 68 % radius, twice, in pixels. */
  haloPx: number
  /** Which way the cone points on the screen, degrees clockwise from up. Null: no cone. */
  coneDeg: number | null
}

/**
 * The owner's LocatorIndicatorOverlay (3870:5247, 2026-10-01): the visitor
 * on the map, in the walking figure's place — a 24 px Brand/surface dot in
 * white, a cone the way they face fading out from it, and the circle the
 * fix is good to, both in Map/LocatorIndicatorOverlay/surface. The circle
 * matters: GPS in Metro Manila is often 20–50 m out, and a dot alone would
 * claim a certainty the phone does not have. Figma's is 240 across, its
 * cone 70 long; here the circle is the fix's, the cone stays as drawn.
 */
export function LocatorIndicatorOverlay({ haloPx, coneDeg }: Props) {
  const halo = Math.round(Math.min(HALO_MAX_PX, Math.max(DOT_PX, haloPx)))
  return (
    <div className="pointer-events-none relative size-0">
      <div
        className="absolute top-1/2 left-1/2 -translate-1/2 rounded-full bg-map-locator-indicator-overlay-surface/15"
        style={{ width: halo, height: halo }}
      />
      {coneDeg !== null && (
        <div
          className="absolute top-1/2 left-1/2 size-35 -translate-1/2 text-map-locator-indicator-overlay-surface"
          style={{ rotate: `${coneDeg - CONE_DRAWN_DEG}deg` }}
        >
          <svg viewBox="0 0 99.8046 70" className="absolute top-1/2 left-[28.71%] h-17.5 w-[99.8px]" aria-hidden>
            <defs>
              <linearGradient id="locator-cone" x1="29.8046" y1="3.05551" x2="54.8732" y2="70" gradientUnits="userSpaceOnUse">
                <stop stopColor="currentColor" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M99.8046 0C99.8046 11.7907 96.8263 23.3905 91.146 33.7228C85.4658 44.0551 77.2677 52.7852 67.3124 59.103C57.3572 65.4208 45.9674 69.1215 34.1999 69.8619C22.4324 70.6022 10.6686 68.3581 8.2676e-07 63.3379L29.8046 0H99.8046Z"
              fill="url(#locator-cone)"
            />
          </svg>
        </div>
      )}
      <div className="absolute top-1/2 left-1/2 -translate-1/2 rounded-full bg-surface p-1">
        <div className="size-6 rounded-full bg-brand-surface" />
      </div>
    </div>
  )
}

/**
 * The overlay at the visitor's fix, as a DOM marker, not a map layer: it
 * costs the map nothing to move (an animated layer kept MapLibre repainting
 * the whole map, 2026-09-25). Its circle grows and shrinks with the zoom;
 * its cone points the way they face on the screen, the map's own turn
 * taken off.
 */
export function LocatorOnMap({ map, fix, heading }: { map: MapLibreMap; fix: Fix; heading: number | null }) {
  const [el] = useState(() => {
    const div = document.createElement('div')
    div.dataset.testid = 'locator-overlay'
    return div
  })
  const [marker] = useState(() => new Marker({ element: el, anchor: 'center' }))
  const [view, setView] = useState(() => ({ zoom: map.getZoom(), bearing: map.getBearing() }))

  useEffect(() => {
    marker.setLngLat(fix.at).addTo(map)
    const moved = () => setView({ zoom: map.getZoom(), bearing: map.getBearing() })
    map.on('zoom', moved)
    map.on('rotate', moved)
    return () => {
      map.off('zoom', moved)
      map.off('rotate', moved)
      marker.remove()
    }
    // Added once per map; the fix moves it below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, marker])
  useEffect(() => {
    marker.setLngLat(fix.at)
  }, [marker, fix.at])

  const haloPx = (2 * fix.accuracy) / metresPerPixel(fix.at[1], view.zoom)
  // For the suites (where-test): what the overlay was drawn from.
  useEffect(() => {
    el.dataset.accuracyM = String(Math.round(fix.accuracy))
    el.dataset.haloPx = String(Math.round(Math.min(HALO_MAX_PX, Math.max(DOT_PX, haloPx))))
    el.dataset.heading = heading === null ? '' : String(Math.round(heading))
  }, [el, fix.accuracy, haloPx, heading])
  return createPortal(<LocatorIndicatorOverlay haloPx={haloPx} coneDeg={heading === null ? null : heading - view.bearing} />, el)
}
