import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Marker, type MapLibreMap } from 'maplibre-gl'
import { CARD_SURFACE, CARD_TEXT, TIMELINE_SURFACE } from '../cards/liveryCard'
import { TimelineDot } from '../cards/TripTimeline'
import type { LngLat } from '../geo/geo'
import type { Livery } from '../model/liveries'
import './hintuanPin.css'

type Props = {
  map: MapLibreMap
  /** Where the picked hintuan is (useRideTo's `pinAt`). */
  at: LngLat
  /** The hintuan's name, written beside the circle; none, and the circle stands alone. */
  label?: string | null
  /** The trip's colour: the circle is ringed in its rail's. */
  livery: Livery
}

/**
 * The picked hintuan on the map: a circle that pops up where it is, the
 * route left whole — the owner's ask of 2026-09-30: "now I don't want to
 * cut the route, but we still select hintuan it is just the a circle will
 * pop up when that hintuan is selected". It is the timeline's own
 * TimelineDot, Selected, in the trip's livery, so the map and the card
 * point at the same place the same way.
 *
 * A DOM marker, like the walker: the pop is a CSS animation that costs the
 * map nothing, and it takes no taps, so a tap on it reaches the line or the
 * box beneath. The caller keys it on the pick, so another hintuan pops a
 * fresh circle.
 *
 * Beside it, its name (the owner's SelectedHintuanRouteTitle, Figma
 * 3847:11777, 2026-09-30): a pill in the trip card's surface and words,
 * 10px right of the circle and centred on it, so the circle stays on the
 * point the marker is anchored to.
 */
export function HintuanPin({ map, at, label, livery }: Props) {
  const [el] = useState(() => {
    const div = document.createElement('div')
    div.className = 'hintuan-pin'
    div.dataset.testid = 'hintuan-pin'
    return div
  })
  const marker = useRef<Marker | null>(null)

  useEffect(() => {
    const m = new Marker({ element: el, anchor: 'center' }).setLngLat(at).addTo(map)
    marker.current = m
    return () => {
      m.remove()
      marker.current = null
    }
    // Made once per map; where it is moves it below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, el])

  // The line's point for a pick can land a moment after the pick itself.
  useEffect(() => {
    marker.current?.setLngLat(at)
  }, [at])

  el.dataset.livery = livery
  // Popped, and untucked from a rail it has none of, by hintuanPin.css.
  return createPortal(
    <>
      <TimelineDot rail={TIMELINE_SURFACE[livery]} selected />
      {label && (
        <div
          data-testid="hintuan-pin-title"
          className={
            'hintuan-pin-title absolute left-full top-1/2 ml-2.5 max-w-56 truncate rounded-full px-2 py-1 ' +
            'text-sm/5 font-medium shadow-selected-hintuan-route-title ' +
            CARD_SURFACE[livery] +
            ' ' +
            CARD_TEXT[livery]
          }
        >
          {label}
        </div>
      )}
    </>,
    el,
  )
}
