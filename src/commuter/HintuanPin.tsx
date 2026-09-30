import { useEffect, useRef } from 'react'
import { Marker, type MapLibreMap } from 'maplibre-gl'
import { TIMELINE_SURFACE } from '../shared/cards/liveryCard'
import type { LngLat } from '../shared/geo/geo'
import type { Livery } from '../shared/model/liveries'
import './hintuanPin.css'

type Props = {
  map: MapLibreMap
  /** Where the picked hintuan is (useRideTo's `pinAt`). */
  at: LngLat
  /** The trip's colour: the circle is ringed in its rail's. */
  livery: Livery
}

/**
 * The picked hintuan on the map: a circle that pops up where it is, the
 * route left whole — the owner's ask of 2026-09-30: "now I don't want to
 * cut the route, but we still select hintuan it is just the a circle will
 * pop up when that hintuan is selected". It is the timeline's TimelineDot
 * Selected (TripTimeline.tsx), in the trip's livery: Content/inverse ringed
 * in Card/<livery>/Timeline/surface round a Content/success centre, 24
 * across, so the map and the card point at the same place the same way.
 *
 * A DOM marker, like the walker and the studio's get-off circles: the pop is
 * a CSS animation that costs the map nothing, and the colours are the
 * card's own tokens rather than a layer's hexes. It takes no taps, so a tap
 * on it reaches the line or the box beneath as if it were not there. The
 * caller keys it on the pick, so another hintuan pops a fresh circle.
 */
export function HintuanPin({ map, at, livery }: Props) {
  const markerRef = useRef<Marker | null>(null)
  const ringRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const el = document.createElement('div')
    el.className = 'hintuan-pin size-6'
    el.dataset.testid = 'hintuan-pin'
    const ring = document.createElement('span')
    const white = document.createElement('span')
    white.className = 'grid size-5 place-items-center rounded-full bg-content-inverse'
    const centre = document.createElement('span')
    centre.className = 'size-3.5 rounded-full bg-content-success'
    white.append(centre)
    ring.append(white)
    el.append(ring)
    ringRef.current = ring
    const marker = new Marker({ element: el, anchor: 'center' }).setLngLat(at).addTo(map)
    markerRef.current = marker
    return () => {
      marker.remove()
      markerRef.current = null
      ringRef.current = null
    }
    // Made once per map; where it is and its colour flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  useEffect(() => {
    markerRef.current?.setLngLat(at)
  }, [at])

  useEffect(() => {
    const ring = ringRef.current
    if (!ring) return
    ring.className = 'hintuan-pin-dot flex rounded-full p-0.5 ' + TIMELINE_SURFACE[livery]
    markerRef.current?.getElement().setAttribute('data-livery', livery)
  }, [livery])

  return null
}
