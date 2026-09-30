import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Marker, type GeoJSONSource, type MapLibreMap } from 'maplibre-gl'
import { MAP_COLOURS, MAP_PAINT } from '../../design-system/foundation/mapColours'
import { haversine } from '../geo/geo'
import { CASING_EXTRA, litWidth } from './lineStyle'
import { APP_MOVE } from './MapView'
import { LAYERS } from './layers'
import { rideCut, travelLine } from '../model/ride'
import type { VariantSummary } from '../model/routes'
import type { StopSummary } from '../model/stops'
import './rideTo.css'

const SRC = 'ride-rest'
const REST_CASING = 'ride-rest-casing'
const REST_LINE = 'ride-rest-line'

/**
 * The ride-to preview: tap a hintuan on the trip's timeline and the lit line
 * ends there, the card staying open. The owner's ask of 2026-09-28: the row
 * answers "what if I get off here?", not "what is this hotspot?". The way
 * not ridden goes back to how a line rests — Map/RouteLine/surface-default,
 * opaque, in its white casing, drawn at the lit line's width over it — since
 * nothing on the map is see-through any more (his two looks, 2026-09-29);
 * the white wash it had until then went with them. It lies over the lit
 * line's chevrons and orange stretches past the hintuan, and under the far
 * end's circle, so the dark stretch alone is the ride.
 *
 * The public map picks a hintuan on its trip card since 2026-09-29 (his
 * Timeline State=Selected), and since 2026-09-30 draws no cut there at all
 * (`cut: false`), the owner's ask of that day: "now I don't want to cut the
 * route, but we still select hintuan … a circle will pop up when that
 * hintuan is selected". The route stays as it is with nothing picked, and
 * the public map pops a circle up where `pinAt` says (HintuanPin.tsx); the
 * metres, which price the pick, are worked out all the same, and the camera
 * still glides there. The studio keeps the cut and its get-off circles:
 * each mini stop of the hintuan gets one (drawn like a route's end
 * circle); the ride ends at the last one, and tapping another moves the
 * get-off side without moving the hintuan. The circles are DOM markers,
 * like the walker: their taps stay their own and never fall through to the
 * route or the box below. Tapping the row again, an end row, another route
 * or the card away lets the pick go — the whole route back, or the circle
 * gone. On the public
 * map an end row also glides there (`toEnd`), so a rider can look along the
 * route from end to end (the owner's ask, 2026-09-29).
 */
export function useRideTo(
  map: MapLibreMap | null,
  selected: VariantSummary | null,
  stops: readonly StopSummary[],
  opts: {
    /**
     * The way not ridden drawn at rest, and the get-off circles: the
     * studio's. The public map has neither since 2026-09-30. Default true.
     */
    cut?: boolean
    /**
     * Where the glide puts the hintuan, from the map's centre, in pixels —
     * clear of a card over the map. Read as the glide starts.
     */
    offset?: () => [number, number]
  } = {},
) {
  // Which direction the pick was made on: a pick belongs to its ride, so the
  // first render of another one — SWITCH, a new trip — never cuts its line
  // at the old row.
  const [picked, setPicked] = useState<{ variantId: string; rowId: string; endId: string | null } | null>(null)
  const live = picked && picked.variantId === selected?.id ? picked : null

  // An end of the trip, picked from its row: the line stays whole, its dot
  // green like a picked hintuan's (the owner's asks, 2026-09-29: "tapping
  // Novaliches should indicate green circle too", then the origin: "it
  // should have!"). One pick at a time with the hintuans; kept by
  // direction, as a pick is.
  const [atEnd, setAtEnd] = useState<{ variantId: string; end: 'from' | 'to' } | null>(null)
  const endPicked = selected && atEnd?.variantId === selected.id ? atEnd.end : null

  // A different direction is a different ride, and so is the same one opened
  // again: start it whole.
  useEffect(() => {
    setPicked(null)
    setAtEnd(null)
  }, [selected?.id])

  // Read as a glide starts, so a fresh function each render moves nothing.
  const offset = useRef(opts.offset)
  offset.current = opts.offset

  const cut = useMemo(
    () => (selected && live ? rideCut(selected, stops, live.rowId, live.endId) : null),
    [selected, stops, live],
  )

  /** A hintuan row picks its ride (again puts it back); an end row passes null. */
  const selectedId = selected?.id
  const pick = useCallback(
    (id: string | null) => {
      setAtEnd(null)
      setPicked((cur) =>
        id === null || !selectedId || (cur?.variantId === selectedId && cur.rowId === id)
          ? null
          : { variantId: selectedId, rowId: id, endId: null },
      )
    },
    [selectedId],
  )

  /**
   * An end row: the whole ride again, that end picked, and the map gliding
   * to it at the height it is at. A second tap lets it go, the map staying
   * put.
   */
  const toEnd = useCallback(
    (end: 'from' | 'to') => {
      setPicked(null)
      const on = endPicked !== end
      setAtEnd(on && selectedId ? { variantId: selectedId, end } : null)
      if (!on) return
      if (!map || !selected) return
      const line = travelLine(selected, stops)
      if (line.length < 2) return
      map.easeTo({ center: end === 'from' ? line[0] : line[line.length - 1], offset: offset.current?.() ?? [0, 0], duration: 700 }, APP_MOVE)
    },
    [map, selected, selectedId, stops, endPicked],
  )

  // The way not ridden, as a line at rest. Added on first use — long after
  // the style loaded, the lit line's chevrons and orange included — just
  // under the end circles, so the far end keeps its circle and its name.
  // Butt caps: a round one would lay a light half-disc back over the dark
  // line where the ride ends.
  const drawCut = opts.cut ?? true
  const drawn = drawCut ? cut : null
  useEffect(() => {
    if (!map) return
    if (!map.getSource(SRC)) {
      if (!drawn) return
      map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      const before = [LAYERS.endCircles, LAYERS.stopsHintuanLabel].find((id) => map.getLayer(id))
      map.addLayer(
        {
          id: REST_CASING,
          type: 'line',
          source: SRC,
          layout: { 'line-cap': 'butt', 'line-join': 'round' },
          paint: { 'line-color': MAP_PAINT['Paint/casing'], 'line-width': litWidth(CASING_EXTRA) },
        },
        before,
      )
      map.addLayer(
        {
          id: REST_LINE,
          type: 'line',
          source: SRC,
          layout: { 'line-cap': 'butt', 'line-join': 'round' },
          paint: { 'line-color': MAP_COLOURS['Map/RouteLine/surface-default'], 'line-width': litWidth() },
        },
        before,
      )
    }
    const src = map.getSource(SRC) as GeoJSONSource
    src.setData({
      type: 'FeatureCollection',
      features: drawn
        ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: drawn.rest } }]
        : [],
    })
  }, [map, drawn])

  // The get-off circles, one a mini stop, remade whenever the cut changes.
  const markers = useRef<Marker[]>([])
  useEffect(() => {
    if (!map) return
    for (const m of markers.current) m.remove()
    markers.current = []
    if (!cut || !drawCut) return
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
        setPicked((cur) => cur && { ...cur, endId: d.stopId })
      })
      markers.current.push(new Marker({ element: el, anchor: 'center', offset }).setLngLat(d.at).addTo(map))
    }
    return () => {
      for (const m of markers.current) m.remove()
      markers.current = []
    }
  }, [map, cut, stops, drawCut])

  // Glide to where the rider would get off, at the height the map is at:
  // the owner tried the stretch fitted whole and it zoomed far out
  // (2026-09-28). `offset`, never `padding`: MapLibre keeps a padding for
  // every later move, and a shared link's fit or "Where am I" would land off
  // centre ever after.
  useEffect(() => {
    if (!map || !cut) return
    map.easeTo({ center: cut.at, offset: offset.current?.() ?? [0, 0], duration: 700 }, APP_MOVE)
  }, [map, cut])

  return {
    rideTo: cut && live ? { stopId: live.rowId, metres: cut.metres } : null,
    /** The row picked, cut or not: a row whose box the line misses is still shown picked, with nothing to price. */
    pickedId: live?.rowId ?? null,
    /**
     * Where the picked hintuan is: where the ride would end on the line, as
     * the glide goes; for a row whose box the line misses, the hintuan's own
     * point. Null with nothing picked.
     */
    pinAt: live ? (cut?.at ?? stops.find((s) => s.id === live.rowId)?.point.coordinates ?? null) : null,
    pick,
    /** The end picked from its row (`toEnd`), or null. */
    endPicked,
    toEnd,
  }
}
