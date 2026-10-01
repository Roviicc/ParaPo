import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Marker, type MapLibreMap } from 'maplibre-gl'
import { metresPerPixel } from '../shared/geo/geo'
import './locator.css'
import { circleRadius, indicatorScale, type Fix } from './useLocator'

/** Where the beam points as drawn: due south, so it is turned by the heading less this. */
export const BEAM_DRAWN_DEG = 180

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
 * The owner's LocatorIndicatorOverlay (3870:5247, 2026-10-01, its second
 * pass the same day): the visitor on the map, in the walking figure's place
 * — a 24 px Brand/surface dot in white, lifted by LocatorDotShadow and
 * breathing, its wandering eyes glancing about (locator.css), a beam the way they face fading out from it, and
 * the circle the fix is good to, in Map/LocatorIndicatorOverlay/surface with
 * its border's hairline. The circle matters: GPS in Metro Manila is often
 * 20–50 m out, and a dot alone would claim a certainty the phone does not
 * have. Figma's is 240 across; here the circle is the fix's metres, the beam
 * as drawn.
 */
export function LocatorIndicatorOverlay({ haloPx, coneDeg, scale = 1 }: Props) {
  const halo = haloFor(haloPx, scale)
  const gradient = useId()
  return (
    <div className="pointer-events-none relative size-0">
      {halo > 0 && (
        <div
          className="absolute top-1/2 left-1/2 -translate-1/2 rounded-full border-[0.6px] border-map-locator-indicator-overlay-border/75 bg-map-locator-indicator-overlay-surface/15"
          style={{ width: halo, height: halo }}
        />
      )}
      {/* The dot and its beam, smaller zoomed out; the circle is metres, and keeps its own size. */}
      <div className="absolute inset-0" style={{ scale }}>
        {coneDeg !== null && (
          // The beam from the dot's centre, drawn pointing south and turned
          // to the heading. Figma's (3876:6051) leans 2.7 px to one side;
          // here it is the owner's size, made even (his ask, 2026-10-01).
          // In the border's blue, as Figma's beam is (#155DFC since the third pass).
          <div className="absolute top-1/2 left-1/2 size-0 text-map-locator-indicator-overlay-border" style={{ rotate: `${coneDeg - BEAM_DRAWN_DEG}deg` }}>
            <svg viewBox="0 0 86 84" className="absolute top-0 -left-[43px] h-21 w-[86px]" aria-hidden>
              <defs>
                <linearGradient id={gradient} x1="43" y1="0" x2="43" y2="84" gradientUnits="userSpaceOnUse">
                  <stop stopColor="currentColor" stopOpacity="0.8" />
                  <stop offset="1" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M27 0H59L86 84H0Z" fill={`url(#${gradient})`} />
            </svg>
          </div>
        )}
        <div className="locator-dot absolute top-1/2 left-1/2 -translate-1/2 rounded-full bg-surface p-1 shadow-locator-dot-shadow">
          <div className="relative size-6 overflow-clip rounded-full bg-brand-surface">
            {/* Its wandering eyes (3878:6071, 3878:6072, 2026-10-01): glancing about and blinking (locator.css). */}
            <div aria-hidden className="locator-eyes absolute inset-0">
              <span className="locator-eye absolute top-[6.33px] left-[10.48px] h-[5.95px] w-1 rounded-full bg-surface" />
              <span className="locator-eye absolute top-[6.33px] left-[17.43px] h-1.5 w-1 rounded-full bg-surface" />
            </div>
          </div>
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
 * beam points the way they face, from north.
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

  const haloPx = (2 * circleRadius(fix.accuracy)) / metresPerPixel(fix.at[1], zoom)
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
