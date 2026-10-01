import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Marker, type MapLibreMap } from 'maplibre-gl'
import type { LngLat } from '../geo/geo'
import { rideEnds, type Ride } from './directionArrows'
import type { LineLook } from './liveryLine'
import { litWidthAt } from './lineStyle'
import { tapsOnItsButton } from './markerTap'
import { CircleArrowRightIcon } from '../cards/RouteIcons'
import './endTitles.css'

/**
 * Each lit ride's ends named in the owner's SelectedHintuanRouteTitle,
 * End&TailRoute (Figma 3848:12135, 2026-09-30): a pill over the end's
 * circle, its pointer at the circle, in place of the plain name the map
 * wrote beside it. The pill wears what is lit: the line's colour, and the
 * chevrons' white — near-black on yellow — for its words, as a card's are.
 *
 * Its Head and Tail Route variants (2026-10-01) read as the RouteCard does: where a ride starts, the top of its timeline,
 * is the card's title; where it goes is one of the card's rows, so its pill
 * leads with the rows' circled arrow. A place two rides share is named by
 * the first to reach it (`rideEnds`), so a trip's change of ride is the
 * earlier ride's tail, as it sits under the start on the timeline.
 *
 * DOM markers, like the picked hintuan's circle (HintuanPin): a pill with a
 * pointer is a box and a triangle, which a map symbol would need
 * a stretched picture for in every livery. Each place is named once
 * (`rideEnds`).
 *
 * Given `onPick`, a pill whose ride says which hotspot it ends at is a
 * button: a tap opens that place (the owner's ask, 2026-10-01), and the map
 * beneath never hears it (markerTap.ts). Without one, or a hotspot, it takes
 * no taps, and a tap on it reaches the line or the box beneath.
 *
 * Given `onTrip`, a Tail Route that one lit ride alone goes to opens that
 * ride's trip instead (the owner's ask, 2026-10-01): its RouteTripDetail,
 * its line lit, as the card's row of the same arrow does. Where two rides
 * go, the place's own card lists both, so the tap opens that. How a
 * focused or pressed pill looks is the owner's to design; until then it is
 * the browser's own focus ring.
 */
export function EndTitles({
  map,
  rides,
  look,
  onPick,
  onTrip,
}: {
  map: MapLibreMap
  rides: readonly Ride[]
  look: LineLook
  onPick?: (stopId: string) => void
  /** A direction's trip to open, from the one ride a tail names. */
  onTrip?: (variantId: string) => void
}) {
  return (
    <>
      {rideEnds(rides)
        .filter((e) => e.named)
        .map(({ end, name, at, stopId, rides: here }) => {
          const trip = onTrip && end === 'to' && here.length === 1 ? here[0] : null
          return (
            <EndTitle
              key={`${name}@${at.join(',')}`}
              map={map}
              at={at}
              name={name}
              head={end === 'from'}
              look={look}
              opens={trip ? 'trip' : 'place'}
              onPick={trip ? () => onTrip?.(trip) : onPick && stopId ? () => onPick(stopId) : undefined}
            />
          )
        })}
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

function EndTitle({
  map,
  at,
  name,
  head,
  look,
  opens,
  onPick,
}: {
  map: MapLibreMap
  at: LngLat
  name: string
  /** Where the ride starts (Head Route), or where it goes (Tail Route). */
  head: boolean
  look: LineLook
  /** What a tap opens: the ride's trip, or the place's card. */
  opens: 'trip' | 'place'
  onPick?: () => void
}) {
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

  // Read as the tap comes: a fresh function each render binds nothing anew.
  const pick = useRef(onPick)
  pick.current = onPick
  useEffect(() => tapsOnItsButton(el, () => pick.current?.()), [el])

  el.dataset.name = name
  el.dataset.end = head ? 'head' : 'tail'
  el.dataset.opens = onPick ? opens : ''
  const Pill = onPick ? 'button' : 'div'
  return createPortal(
    <Pill
      {...(onPick ? { type: 'button' as const, 'aria-label': opens === 'trip' ? `${name}: the trip there` : `${name}: the routes there` } : {})}
      className={
        'relative flex max-w-56 items-center gap-1 rounded-full py-1 text-sm/5 font-medium ' +
        (head ? 'px-2' : 'pr-2 pl-1')
      }
      style={{ backgroundColor: look.line, color: look.arrow }}
    >
      {!head && (
        <span aria-hidden className="size-5 shrink-0 *:size-full">
          <CircleArrowRightIcon />
        </span>
      )}
      <span className="min-w-0 truncate">{name}</span>
      {/* Figma's Arrow, turned to point down at the circle. */}
      <svg
        aria-hidden
        viewBox="0 0 14.7047 13"
        className="absolute left-1/2 top-full -mt-[1.5px] h-[13px] w-[14.7px] -translate-x-1/2 rotate-180"
        style={{ fill: look.line }}
      >
        <path d="M6.48632 0.5C6.87122 -0.166666 7.83347 -0.166667 8.21837 0.499999L14.5692 11.5C14.9541 12.1667 14.473 13 13.7032 13H1.00149C0.231692 13 -0.249434 12.1667 0.135466 11.5L6.48632 0.5Z" />
      </svg>
    </Pill>,
    el,
  )
}
