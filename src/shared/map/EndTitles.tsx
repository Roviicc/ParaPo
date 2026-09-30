import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Marker, type MapLibreMap } from 'maplibre-gl'
import type { LngLat } from '../geo/geo'
import { rideEnds, type Ride } from './directionArrows'
import type { LineLook } from './liveryLine'
import { litWidthAt } from './lineStyle'
import './endTitles.css'

/**
 * Each lit ride's ends named in the owner's SelectedHintuanRouteTitle,
 * End&TailRoute (Figma 3848:12135, 2026-09-30): a pill over the end's
 * circle, its pointer at the circle, in place of the plain name the map
 * wrote beside it. The pill wears what is lit: the line's colour, and the
 * chevrons' white — near-black on yellow — for its words, as a card's are.
 *
 * DOM markers, like the picked hintuan's circle (HintuanPin): a pill with a
 * pointer is a box and a triangle, which a map symbol would need
 * a stretched picture for in every livery. They take no taps, so a tap on
 * one reaches the line or the box beneath. Each place is named once
 * (`rideEnds`).
 */
export function EndTitles({ map, rides, look }: { map: MapLibreMap; rides: readonly Ride[]; look: LineLook }) {
  return (
    <>
      {rideEnds(rides)
        .filter((e) => e.named)
        .map((e) => (
          <EndTitle key={`${e.name}@${e.at.join(',')}`} map={map} at={e.at} name={e.name} look={look} />
        ))}
    </>
  )
}

/** The pointer's tip below the pill's bottom edge: Figma's Arrow, 13 tall, its centre 5px below the pill. */
const TIP_PX = 11.5
/** Between the pointer's tip and the circle's ring. */
const GAP_PX = 2

/** The end circle's outer edge from its centre at this zoom: endRadius and its 2px ring (lineStyle.ts). */
function ringPx(zoom: number): number {
  return litWidthAt(zoom) / 2 + 2 + 2
}

function EndTitle({ map, at, name, look }: { map: MapLibreMap; at: LngLat; name: string; look: LineLook }) {
  const [el] = useState(() => {
    const div = document.createElement('div')
    div.className = 'end-title'
    div.dataset.testid = 'end-title'
    return div
  })
  const marker = useRef<Marker | null>(null)

  useEffect(() => {
    const lift = () => [0, -(ringPx(map.getZoom()) + GAP_PX + TIP_PX)] as [number, number]
    const m = new Marker({ element: el, anchor: 'bottom', offset: lift() }).setLngLat(at).addTo(map)
    marker.current = m
    // The circle grows with the zoom; the pointer keeps to its edge.
    const onZoom = () => m.setOffset(lift())
    map.on('zoom', onZoom)
    return () => {
      map.off('zoom', onZoom)
      m.remove()
      marker.current = null
    }
    // Made once per map; where it is moves it below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, el])

  useEffect(() => {
    marker.current?.setLngLat(at)
  }, [at])

  el.dataset.name = name
  return createPortal(
    <div
      className="relative max-w-56 rounded-full px-2 py-1 text-center text-sm/5 font-medium"
      style={{ backgroundColor: look.line, color: look.arrow }}
    >
      <span className="block truncate">{name}</span>
      {/* Figma's Arrow, turned to point down at the circle. */}
      <svg
        aria-hidden
        viewBox="0 0 14.7047 13"
        className="absolute left-1/2 top-full -mt-[1.5px] h-[13px] w-[14.7px] -translate-x-1/2 rotate-180"
        style={{ fill: look.line }}
      >
        <path d="M6.48632 0.5C6.87122 -0.166666 7.83347 -0.166667 8.21837 0.499999L14.5692 11.5C14.9541 12.1667 14.473 13 13.7032 13H1.00149C0.231692 13 -0.249434 12.1667 0.135466 11.5L6.48632 0.5Z" />
      </svg>
    </div>,
    el,
  )
}
