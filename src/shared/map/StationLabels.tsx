import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Marker, type MapLibreMap } from 'maplibre-gl'
import { CARD_SURFACE, CARD_TEXT } from '../cards/liveryCard'
import { TimelineDot } from '../cards/TripTimeline'
import type { Livery } from '../model/liveries'
import { isRail, type VariantSummary } from '../model/routes'
import { stopLabel, type StopSummary } from '../model/stops'
import { tapsOnItsButton } from './markerTap'
import './hintuanPin.css'

/**
 * Closer than this the names show; further out, the dots alone, so the
 * pills never pile up. From 13, lasting 14/10 as far out — gone once the
 * map shows 1.4 times the ground it did at 13 (the owner's ask of
 * 2026-10-02: at 10/10 they went too soon), as the boxes' names last 12/10.
 */
const NAMES_FROM_ZOOM = 13 - Math.log2(1.4)

/**
 * The selected train line's stations along it — the owner's asks of
 * 2026-10-02: a dot at each, its name beside it, for the selected line
 * only. The name is the owner's RouteLineLabel, SelectedHintuanRouteTitle's
 * Default (Figma 3846:11748): the picked hintuan's pill (HintuanPin), in
 * the trip card's surface and words, without its End. The dot is the
 * timeline's own TimelineDot at rest, its accent that same surface, so
 * the dot and its name are one colour, as the owner asked.
 *
 * The two ends are left to their end titles (EndTitles), and a picked
 * station to its HintuanPin. Further out than NAMES_FROM_ZOOM only the
 * dots show, smaller. Given `onPick`, a name is a button that opens the station's
 * place, as the picked hintuan's is; the dot takes no taps.
 */
export function StationLabels({
  map,
  selected,
  stops,
  livery,
  pickedId,
  onPick,
}: {
  map: MapLibreMap
  selected: VariantSummary
  stops: readonly StopSummary[]
  livery: Livery
  /** The picked hintuan, which its HintuanPin names. */
  pickedId?: string | null
  onPick?: (stopId: string) => void
}) {
  const [named, setNamed] = useState(() => map.getZoom() >= NAMES_FROM_ZOOM)
  useEffect(() => {
    const on = () => setNamed(map.getZoom() >= NAMES_FROM_ZOOM)
    map.on('zoom', on)
    return () => {
      map.off('zoom', on)
    }
  }, [map])

  const route = selected.route
  if (!isRail(route?.mode) || !route.route_code) return null
  // A train's stations are its line's (servedBy): both directions stop at each.
  const ends = new Set([route.head_stop_id, route.tail_stop_id, pickedId])
  const stations = stops.filter((s) => s.line === route.route_code && !ends.has(s.id))
  return (
    <>
      {stations.map((s) => (
        <StationLabel key={s.id} map={map} stop={s} livery={livery} named={named} onPick={onPick && (() => onPick(s.id))} />
      ))}
    </>
  )
}

function StationLabel({
  map,
  stop,
  livery,
  named,
  onPick,
}: {
  map: MapLibreMap
  stop: StopSummary
  livery: Livery
  named: boolean
  onPick?: () => void
}) {
  const [el] = useState(() => {
    const div = document.createElement('div')
    div.className = 'hintuan-pin station-label'
    div.dataset.testid = 'station-label'
    return div
  })
  useEffect(() => {
    const m = new Marker({ element: el, anchor: 'center' }).setLngLat(stop.point.coordinates).addTo(map)
    return () => {
      m.remove()
    }
  }, [map, el, stop.point.coordinates])
  useEffect(() => (onPick ? tapsOnItsButton(el, onPick) : undefined), [el, onPick])

  // Further out, a smaller dot (hintuanPin.css), so the stations read as beads, not a wall.
  el.toggleAttribute('data-far', !named)
  const label = stopLabel(stop)
  const Title = onPick ? 'button' : 'div'
  return createPortal(
    <>
      <TimelineDot rail={CARD_SURFACE[livery]} />
      {named && (
        <Title
          {...(onPick ? { type: 'button' as const, 'aria-label': `${label}: the routes there` } : {})}
          className="hintuan-pin-title absolute left-full top-1/2 ml-2.5 flex max-w-56"
        >
          <span
            data-testid="station-label-title"
            className={'max-w-full truncate rounded-full px-2 py-1 text-sm/5 font-medium shadow-selected-hintuan-route-title ' + CARD_SURFACE[livery] + ' ' + CARD_TEXT[livery]}
          >
            {label}
          </span>
        </Title>
      )}
    </>,
    el,
  )
}
