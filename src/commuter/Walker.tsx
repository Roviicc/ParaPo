import { useEffect, useRef } from 'react'
import { Marker, type MapLibreMap } from 'maplibre-gl'
import type { Facing, Fix, Pose } from './useWhereAmI'

type Props = {
  map: MapLibreMap
  fix: Fix
  pose: Pose
  facing: Facing
}

/** Metres one pixel covers at this zoom and latitude (Web Mercator). */
function metresPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
}

/**
 * The visitor on the map: a small figure standing, walking or flying at the
 * last fix, over a soft halo the size of the fix's accuracy. A DOM marker,
 * not a map layer: the walk cycle and the flight's bob are CSS animations
 * on a 60-pixel element, which cost the map nothing — an animated layer
 * keeps MapLibre repainting the whole map (the chevrons did, 2026-09-25).
 * `prefers-reduced-motion` stills both, in index.css.
 *
 * The halo matters: GPS in Metro Manila is often 20–50 m out, and the
 * figure alone would claim a certainty the phone does not have.
 */
export function Walker({ map, fix, pose, facing }: Props) {
  const markerRef = useRef<Marker | null>(null)
  const haloRef = useRef<HTMLDivElement | null>(null)
  const fixRef = useRef(fix)
  fixRef.current = fix

  useEffect(() => {
    const el = document.createElement('div')
    el.className = 'walker'
    el.dataset.testid = 'walker'
    const halo = document.createElement('div')
    halo.className = 'walker-halo'
    const figure = document.createElement('div')
    figure.className = 'walker-figure'
    el.append(halo, figure)
    haloRef.current = halo
    const marker = new Marker({ element: el, anchor: 'center' }).setLngLat(fix.at).addTo(map)
    markerRef.current = marker
    const size = () => {
      const f = fixRef.current
      const px = Math.max(28, Math.min(480, (2 * f.accuracy) / metresPerPixel(f.at[1], map.getZoom())))
      halo.style.width = `${px}px`
      halo.style.height = `${px}px`
      el.dataset.haloPx = String(Math.round(px))
    }
    size()
    map.on('zoom', size)
    return () => {
      map.off('zoom', size)
      marker.remove()
      markerRef.current = null
      haloRef.current = null
    }
    // Made once per map; the fix flows through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  useEffect(() => {
    const marker = markerRef.current
    if (!marker) return
    marker.setLngLat(fix.at)
    const el = marker.getElement()
    el.dataset.pose = pose
    el.dataset.facing = facing
    // Flying is a side view: it faces right for any eastward heading, left for westward.
    if (fix.heading !== null) el.dataset.side = fix.heading < 180 ? 'right' : 'left'
    el.dataset.accuracyM = String(Math.round(fix.accuracy))
    const halo = haloRef.current
    if (halo) {
      const px = Math.max(28, Math.min(480, (2 * fix.accuracy) / metresPerPixel(fix.at[1], map.getZoom())))
      halo.style.width = `${px}px`
      halo.style.height = `${px}px`
      el.dataset.haloPx = String(Math.round(px))
    }
  }, [map, fix, pose, facing])

  return null
}
