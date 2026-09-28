import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Marker, type GeoJSONSource, type MapLibreMap } from 'maplibre-gl'
import { haversine } from './geo'
import { CASING_EXTRA, litWidth } from './lineStyle'
import { rideCut, type VariantSummary } from './routes'
import type { StopSummary } from './stops'

const SRC = 'ride-rest'
const WASH = 'ride-rest-wash'

/**
 * The ride-to preview: tap a hintuan on the route card's timeline and the
 * lit line ends there — the way not ridden fades under a white wash — while
 * the card stays open with the stretch's own length and fare. The owner's
 * ask of 2026-09-28: the row answers "what if I get off here?", not "what
 * is this hotspot?". Each mini stop of the hintuan gets a get-off circle
 * (drawn like a route's end circle); the ride ends at the last one, and
 * tapping another moves the get-off side without moving the hintuan. The
 * circles are DOM markers, like the walker: their taps stay their own and
 * never fall through to the route or the box below. Tapping the row again,
 * an end row, another route or the card away puts the whole route back.
 */
export function useRideTo(
  map: MapLibreMap | null,
  selected: VariantSummary | null,
  stops: readonly StopSummary[],
) {
  const [picked, setPicked] = useState<{ rowId: string; endId: string | null } | null>(null)

  // A different direction is a different ride: start it whole.
  useEffect(() => setPicked(null), [selected?.id])

  const cut = useMemo(
    () => (selected && picked ? rideCut(selected, stops, picked.rowId, picked.endId) : null),
    [selected, stops, picked],
  )

  /** A hintuan row picks its ride (again puts it back); an end row passes null. */
  const pick = useCallback((id: string | null) => {
    setPicked((cur) => (id === null || cur?.rowId === id ? null : { rowId: id, endId: null }))
  }, [])

  // The wash over the way not ridden. Added on first use — long after the
  // style loaded — and under the hotspot labels, so a name is never washed.
  useEffect(() => {
    if (!map) return
    if (!map.getSource(SRC)) {
      if (!cut) return
      map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer(
        {
          id: WASH,
          type: 'line',
          source: SRC,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': litWidth(CASING_EXTRA), 'line-opacity': 0.8 },
        },
        map.getLayer('saved-stops-label-hintuan') ? 'saved-stops-label-hintuan' : undefined,
      )
    }
    const src = map.getSource(SRC) as GeoJSONSource
    src.setData({
      type: 'FeatureCollection',
      features: cut
        ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: cut.rest } }]
        : [],
    })
  }, [map, cut])

  // The get-off circles, one a mini stop, remade whenever the cut changes.
  const markers = useRef<Marker[]>([])
  useEffect(() => {
    if (!map) return
    for (const m of markers.current) m.remove()
    markers.current = []
    if (!cut) return
    for (const d of cut.dots) {
      const here = d.stopId === cut.endStopId
      // Two mini stops can share a stretch of line (Bestlink's boxes overlap
      // along it), stacking their circles: each crowded circle is nudged a
      // few pixels toward its own box, so both sides can be seen and tapped.
      let offset: [number, number] = [0, 0]
      const crowding = cut.dots.find((o) => o !== d && haversine(o.at, d.at) < 30)
      if (crowding) {
        // Two mini stops can share the very same stretch of line (Bestlink's
        // boxes do), stacking their circles. Each is slid toward its own box
        // and away from the other's, so both sides can be seen and tapped —
        // the boxes' own axis, since the dots may sit on one point.
        const box = stops.find((s) => s.id === d.stopId)
        const other = stops.find((s) => s.id === crowding.stopId)
        if (box && other) {
          const b = map.project(box.point.coordinates)
          const o = map.project(other.point.coordinates)
          const len = Math.hypot(b.x - o.x, b.y - o.y)
          if (len > 1) offset = [((b.x - o.x) / len) * 8, ((b.y - o.y) / len) * 8]
        }
      }
      const el = document.createElement('button')
      el.type = 'button'
      el.dataset.testid = 'ride-dot'
      el.className = 'ride-dot' + (here ? ' ride-dot-end' : '')
      el.title = here ? 'Getting off here' : 'Get off on this side instead'
      el.setAttribute('aria-label', el.title)
      el.setAttribute('aria-pressed', String(here))
      el.addEventListener('click', (e) => {
        // The tap is the dot's own: it must not fall through to the route line
        // or the hintuan box underneath and open their cards.
        e.stopPropagation()
        setPicked((cur) => cur && { rowId: cur.rowId, endId: d.stopId })
      })
      markers.current.push(new Marker({ element: el, anchor: 'center', offset }).setLngLat(d.at).addTo(map))
    }
    return () => {
      for (const m of markers.current) m.remove()
      markers.current = []
    }
  }, [map, cut, stops])

  // Glide to where the rider would get off, at the height the map is at:
  // the owner tried the stretch fitted whole and it zoomed far out (2026-09-28).
  useEffect(() => {
    if (!map || !cut) return
    map.easeTo({ center: cut.at, duration: 700 })
  }, [map, cut])

  return {
    rideTo: cut && picked ? { stopId: picked.rowId, metres: cut.metres } : null,
    pick,
  }
}
