import { useCallback, useEffect, useRef, useState } from 'react'
import type { GeoJSONSource, MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import { HOTSPOT_COLOUR } from './colours'
import { convexHull, ringToPolygon } from './geo'
import { siblingsOf, stopRing, type StopKind, type StopLink, type StopSummary } from './stops'
import { ROUTES_HIT_LAYER, STOPS_FILL_LAYER, resolveTap, tapTargets } from './tap'

const SRC = 'saved-stops'
const FILL = STOPS_FILL_LAYER
const OUTLINE = 'saved-stops-outline'
const LABEL = 'saved-stops-label'
const HINTUAN_LABEL = 'saved-stops-label-hintuan'
/**
 * Hotspot names show only close in. Further out a name, centred on the road
 * it stands on, sat over the orange stretch it marks. The owner's asks of
 * 2026-09-25: hintuan names from zoom 16.5 (between a view at 16, names in
 * the way, and one at 16.7, names kept); then the terminals' the same; then
 * the names lasting 12/10 as far out — gone once the map shows 1.2 times the
 * ground it did at 16.5. Two layers, one a kind, so each can be set apart.
 */
const NAMES_FROM = 16.5 - Math.log2(1.2)

/** A flag of the feature state a tap sets on a box: `lit`, `sibling` or `chosen`. */
const state = (name: 'lit' | 'sibling' | 'chosen') => ['boolean', ['feature-state', name], false] as const
/** The label points of one kind, less the hotspot being edited. */
const labelsOf = (kind: StopKind, hidden = '') =>
  ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'kind'], kind], ['!=', ['get', 'id'], hidden]] as never
/** The boxes under a tap, or the chosen one, drawn again stronger while they are asked about. */
const LIT = 'saved-stops-lit'
/**
 * The place highlight, decided with the owner 2026-09-23: tap one box and
 * its siblings — the boxes sharing its informal name — draw stronger, and a
 * soft wash over the hull of all of them says "one place". Studio and public
 * map alike. The wash has its own source, rebuilt when the selection changes.
 */
const SIBLINGS = 'saved-stops-siblings'
const WASH_SRC = 'place-wash'
const WASH = 'place-wash-fill'
const WASH_EDGE = 'place-wash-edge'

/**
 * Hotspots sit under the route lines; a route drawn right under the tapped
 * pixel still wins the click, and one merely near it shares a chooser.
 */
const ROUTES_ABOVE = 'saved-routes-casing'
const DRAW_ABOVE = 'draw-line-casing'
const ROUTES_HIT = ROUTES_HIT_LAYER

/**
 * Every saved hotspot, drawn for everyone as a shaded outline in its kind's
 * colour, with its route links alongside so the tap card can list them.
 *
 * `load` decides where the hotspots come from: the public map reads the
 * published file, the editor the live tables. Pass a function defined once at
 * module level, not a new one per render, or it reloads every render.
 *
 * The editor also passes `drawing` and `hiddenStopId`; the public map passes
 * neither, and both default to off.
 */
export function useSavedStops<S extends StopSummary>(
  map: MapLibreMap | null,
  load: () => Promise<{ stops: S[]; links: StopLink[] }>,
  opts: { drawing?: boolean; hiddenStopId?: string | null } = {},
) {
  const [stops, setStops] = useState<S[]>([])
  const [links, setLinks] = useState<StopLink[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /**
   * The hotspots under a tap that landed on several things (hotspots, routes
   * or both), for a chooser. Empty otherwise. The routes hook keeps the route
   * half of the same tap.
   */
  const [candidates, setCandidates] = useState<S[]>([])

  /** Choosing one hotspot answers the question the chooser was asking. */
  const select = useCallback((id: string | null) => {
    setSelectedId(id)
    setCandidates([])
  }, [])

  const drawingRef = useRef(opts.drawing ?? false)
  drawingRef.current = opts.drawing ?? false
  // A chooser left open when drawing starts would come back, stale, after it.
  useEffect(() => {
    if (opts.drawing) setCandidates([])
  }, [opts.drawing])

  // The click handler is bound once; this is how it reads today's hotspots.
  const byId = useRef(new Map<string, S>())
  useEffect(() => {
    byId.current = new Map(stops.map((s) => [s.id, s]))
  }, [stops])

  const reload = useCallback(async () => {
    try {
      const loaded = await load()
      setStops(loaded.stops)
      setLinks(loaded.links)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [load])

  useEffect(() => {
    void reload()
  }, [reload])

  // ----------------------------------------------------------------- layers

  useEffect(() => {
    if (!map || map.getSource(SRC)) return
    // Under the routes, under the draft, and under the basemap's labels in
    // any case: a box never hides a street name.
    const before = map.getLayer(ROUTES_ABOVE)
      ? ROUTES_ABOVE
      : map.getLayer(DRAW_ABOVE)
        ? DRAW_ABOVE
        : map.getStyle().layers.find((l) => l.type === 'symbol')?.id

    // `promoteId`: the feature state a tap sets is keyed on the hotspot's id
    // (its box and its label point share it, so both carry the state).
    map.addSource(SRC, {
      type: 'geojson',
      promoteId: 'id',
      data: { type: 'FeatureCollection', features: [] },
    })
    map.addSource(WASH_SRC, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    // The wash sits under every box: a tint that joins them, never a thing to tap.
    map.addLayer(
      {
        id: WASH,
        type: 'fill',
        source: WASH_SRC,
        paint: { 'fill-color': HOTSPOT_COLOUR.terminal, 'fill-opacity': 0.1 },
      },
      before,
    )
    map.addLayer(
      {
        id: WASH_EDGE,
        type: 'line',
        source: WASH_SRC,
        layout: { 'line-join': 'round' },
        paint: { 'line-color': HOTSPOT_COLOUR.terminal, 'line-width': 1.5, 'line-opacity': 0.5, 'line-dasharray': [2, 2] },
      },
      before,
    )
    const colour = [
      'match',
      ['get', 'kind'],
      'terminal',
      HOTSPOT_COLOUR.terminal,
      HOTSPOT_COLOUR.hintuan,
    ] as const
    map.addLayer(
      {
        id: FILL,
        type: 'fill',
        source: SRC,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': colour as never, 'fill-opacity': 0.22 },
      },
      before,
    )
    map.addLayer(
      {
        id: OUTLINE,
        type: 'line',
        source: SRC,
        filter: ['==', ['geometry-type'], 'Polygon'],
        layout: { 'line-join': 'round' },
        // The chosen box is outlined twice as thick.
        paint: { 'line-color': colour as never, 'line-width': ['case', state('chosen'), 4, 2] as never },
      },
      before,
    )
    // The chosen box's siblings, drawn stronger than the rest and outlined.
    // Every box is in this layer and the lit one, at opacity 0 unless its
    // feature state says so: a filter naming the boxes would lay the whole
    // source out again at every tap (see useLighting in useSavedRoutes.ts).
    map.addLayer(
      {
        id: SIBLINGS,
        type: 'fill',
        source: SRC,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': colour as never, 'fill-opacity': ['case', state('sibling'), 0.4, 0] as never },
      },
      before,
    )
    // The lit boxes: the one chosen, or everything under a tap while the sheet
    // asks which. Same idea as the routes' lit pair, decided 2026-09-22.
    map.addLayer(
      {
        id: LIT,
        type: 'fill',
        source: SRC,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': colour as never, 'fill-opacity': ['case', state('lit'), 0.5, 0] as never },
      },
      before,
    )
    // Labels go on top of everything: a name is never worth hiding under a line.
    // The terminals' above the hintuans', so where two collide the terminal
    // keeps its name.
    for (const [id, kind] of [
      [HINTUAN_LABEL, 'hintuan'],
      [LABEL, 'terminal'],
    ] as const) {
      map.addLayer({
        id,
        type: 'symbol',
        source: SRC,
        minzoom: NAMES_FROM,
        filter: labelsOf(kind),
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-font': ['Noto Sans Bold'],
          'text-anchor': 'center',
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': colour as never,
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      })
    }
  }, [map])

  useEffect(() => {
    if (!map) return
    const src = map.getSource(SRC) as GeoJSONSource | undefined
    if (!src) return
    // The label on the map is the name written on the ground, not the informal
    // one the cards, pickers and route names read: the map draws boxes, and the
    // three boxes of one place would otherwise carry three identical labels.
    // Tapping still opens a card that leads with the informal name and shows
    // the ground name beneath it, so neither is lost. Decided 2026-09-22.
    const withArea = stops.filter((s) => stopRing(s).length >= 3)
    src.setData({
      type: 'FeatureCollection',
      features: [
        ...withArea.map((s) => ({
          type: 'Feature' as const,
          properties: { id: s.id, kind: s.kind, name: s.name },
          geometry: s.area!,
        })),
        ...withArea.map((s) => ({
          type: 'Feature' as const,
          properties: { id: s.id, kind: s.kind, name: s.name },
          geometry: s.point,
        })),
      ],
    })
  }, [map, stops])

  // What a tap did to each box, as feature state: lit (chosen, or under the
  // tap while the sheet asks), the chosen one, and its siblings. Only the
  // boxes whose state changed are set, and none is ever removed: a removal
  // and a set of one id in the same frame leave the removal in charge.
  const was = useRef(new Map<string, string>())
  useEffect(() => {
    if (!map || !map.getSource(SRC)) return
    const chosen = stops.find((s) => s.id === selectedId)
    const siblings = chosen ? siblingsOf(chosen, stops).map((s) => s.id) : []
    const lit = selectedId ? [selectedId] : candidates.map((s) => s.id)
    const now = new Map<string, string>()
    for (const id of lit) now.set(id, 'lit')
    for (const id of siblings) now.set(id, now.has(id) ? 'lit+sibling' : 'sibling')
    if (chosen) now.set(chosen.id, 'chosen')
    for (const id of new Set([...was.current.keys(), ...now.keys()])) {
      const state = now.get(id) ?? 'none'
      if (was.current.get(id) === state) continue
      map.setFeatureState(
        { source: SRC, id },
        { lit: state === 'lit' || state === 'lit+sibling' || state === 'chosen', sibling: state.includes('sibling'), chosen: state === 'chosen' },
      )
    }
    was.current = now
  }, [map, selectedId, candidates, stops])

  // The place highlight's wash: a hull over the chosen box and its siblings.
  useEffect(() => {
    if (!map || !map.getLayer(SIBLINGS)) return
    const wash = map.getSource(WASH_SRC) as GeoJSONSource | undefined
    const chosen = stops.find((s) => s.id === selectedId)
    const siblings = chosen ? siblingsOf(chosen, stops).filter((s) => stopRing(s).length >= 3) : []
    const hull = chosen && siblings.length > 0 ? convexHull([chosen, ...siblings].flatMap((s) => stopRing(s))) : []
    wash?.setData({
      type: 'FeatureCollection',
      features: hull.length >= 3 ? [{ type: 'Feature', properties: {}, geometry: ringToPolygon(hull) }] : [],
    })
  }, [map, selectedId, stops])

  // The hotspot being edited is drawn by the editor; hide the saved copy.
  useEffect(() => {
    if (!map || !map.getLayer(FILL)) return
    const hidden = opts.hiddenStopId ?? ''
    map.setFilter(FILL, ['all', ['==', ['geometry-type'], 'Polygon'], ['!=', ['get', 'id'], hidden]])
    map.setFilter(OUTLINE, ['all', ['==', ['geometry-type'], 'Polygon'], ['!=', ['get', 'id'], hidden]])
    map.setFilter(LABEL, labelsOf('terminal', hidden))
    map.setFilter(HINTUAN_LABEL, labelsOf('hintuan', hidden))
  }, [map, opts.hiddenStopId])

  // ----------------------------------------------------------------- events

  useEffect(() => {
    if (!map || !map.getLayer(FILL)) return
    const canvas = map.getCanvas()

    // A route line crossing a hotspot is drawn above it and takes the click.
    const routeUnder = (e: MapMouseEvent) =>
      map.getLayer(ROUTES_HIT) &&
      map.queryRenderedFeatures(e.point, { layers: [ROUTES_HIT] }).length > 0

    // One handler, one box, sized for the finger: nothing deselects, one
    // hotspot alone opens its card, several things — hotspots, routes or
    // both — light up and go to the sheet. The routes hook reads the same
    // tap and keeps its own half.
    const onMapClick = (e: MapMouseEvent) => {
      if (drawingRef.current) return
      const out = resolveTap(tapTargets(map, e.point, e.originalEvent))
      if (out.kind === 'stop') {
        setSelectedId(out.stopId)
        setCandidates([])
      } else if (out.kind === 'several') {
        setSelectedId(null)
        setCandidates(out.stopIds.map((id) => byId.current.get(id)).filter((s) => !!s))
      } else {
        setSelectedId(null)
        setCandidates([])
      }
    }
    const enter = (e: MapMouseEvent) => {
      if (!drawingRef.current && !routeUnder(e)) canvas.style.cursor = 'pointer'
    }
    const leave = () => {
      if (!drawingRef.current) canvas.style.cursor = ''
    }

    map.on('click', onMapClick)
    map.on('mouseenter', FILL, enter)
    map.on('mouseleave', FILL, leave)
    return () => {
      map.off('click', onMapClick)
      map.off('mouseenter', FILL, enter)
      map.off('mouseleave', FILL, leave)
    }
  }, [map])

  const selected = stops.find((s) => s.id === selectedId) ?? null

  /** Direction ids linked to a hotspot, in stop_sequence order. */
  const linkedVariantIds = useCallback(
    (stopId: string) =>
      links
        .filter((l) => l.stop_id === stopId)
        .sort((a, b) => a.stop_sequence - b.stop_sequence)
        .map((l) => l.route_variant_id),
    [links],
  )

  /** The hotspots one direction passes, in the order its line reaches them — the card's timeline. */
  const stopsAlong = useCallback(
    (variantId: string): S[] =>
      links
        .filter((l) => l.route_variant_id === variantId)
        .sort((a, b) => a.stop_sequence - b.stop_sequence)
        .map((l) => stops.find((s) => s.id === l.stop_id))
        .filter((s): s is S => !!s),
    [links, stops],
  )

  /** Select a box and bring the map to it — what tapping a timeline row does, in both apps. */
  const show = useCallback(
    (id: string) => {
      const s = stops.find((x) => x.id === id)
      select(id)
      if (s && map) map.flyTo({ center: s.point.coordinates, zoom: Math.max(map.getZoom(), 16) })
    },
    [stops, select, map],
  )

  return { stops, links, error, reload, selected, select, show, candidates, linkedVariantIds, stopsAlong }
}
