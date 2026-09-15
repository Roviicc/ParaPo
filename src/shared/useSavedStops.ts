import { useCallback, useEffect, useRef, useState } from 'react'
import type { GeoJSONSource, MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import { HOTSPOT_COLOUR } from './colours'
import { listStopLinks, listStops, stopRing, type StopLink, type StopRow } from './stops'
import { getSupabase } from './supabase'
import { ROUTES_HIT_LAYER, STOPS_FILL_LAYER, tapTargets } from './tap'

const SRC = 'saved-stops'
const FILL = STOPS_FILL_LAYER
const OUTLINE = 'saved-stops-outline'
const LABEL = 'saved-stops-label'

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
 * The editor passes `drawing` and `hiddenStopId`; the public map passes
 * neither, and both default to off.
 */
export function useSavedStops(
  map: MapLibreMap | null,
  opts: { drawing?: boolean; hiddenStopId?: string | null } = {},
) {
  const [stops, setStops] = useState<StopRow[]>([])
  const [links, setLinks] = useState<StopLink[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /**
   * The hotspots under a tap that landed on several things (hotspots, routes
   * or both), for a chooser. Empty otherwise. The routes hook keeps the route
   * half of the same tap.
   */
  const [candidates, setCandidates] = useState<StopRow[]>([])

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
  const byId = useRef(new Map<string, StopRow>())
  useEffect(() => {
    byId.current = new Map(stops.map((s) => [s.id, s]))
  }, [stops])

  const reload = useCallback(async () => {
    if (!getSupabase()) return
    try {
      const [s, l] = await Promise.all([listStops(), listStopLinks()])
      setStops(s)
      setLinks(l)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // ----------------------------------------------------------------- layers

  useEffect(() => {
    if (!map || map.getSource(SRC)) return
    const before = map.getLayer(ROUTES_ABOVE)
      ? ROUTES_ABOVE
      : map.getLayer(DRAW_ABOVE)
        ? DRAW_ABOVE
        : undefined

    map.addSource(SRC, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
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
        paint: { 'line-color': colour as never, 'line-width': 2 },
      },
      before,
    )
    // Labels go on top of everything: a name is never worth hiding under a line.
    map.addLayer({
      id: LABEL,
      type: 'symbol',
      source: SRC,
      filter: ['==', ['geometry-type'], 'Point'],
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
  }, [map])

  useEffect(() => {
    if (!map) return
    const src = map.getSource(SRC) as GeoJSONSource | undefined
    if (!src) return
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

  // The hotspot being edited is drawn by the editor; hide the saved copy.
  useEffect(() => {
    if (!map || !map.getLayer(FILL)) return
    const hidden = opts.hiddenStopId ?? ''
    map.setFilter(FILL, ['all', ['==', ['geometry-type'], 'Polygon'], ['!=', ['get', 'id'], hidden]])
    map.setFilter(OUTLINE, ['all', ['==', ['geometry-type'], 'Polygon'], ['!=', ['get', 'id'], hidden]])
    map.setFilter(LABEL, ['all', ['==', ['geometry-type'], 'Point'], ['!=', ['get', 'id'], hidden]])
  }, [map, opts.hiddenStopId])

  useEffect(() => {
    if (!map || !map.getLayer(OUTLINE)) return
    map.setPaintProperty(OUTLINE, 'line-width', [
      'case',
      ['==', ['get', 'id'], selectedId ?? ''],
      4,
      2,
    ])
  }, [map, selectedId])

  // ----------------------------------------------------------------- events

  useEffect(() => {
    if (!map || !map.getLayer(FILL)) return
    const canvas = map.getCanvas()

    // A route line crossing a hotspot is drawn above it and takes the click.
    const routeUnder = (e: MapMouseEvent) =>
      map.getLayer(ROUTES_HIT) &&
      map.queryRenderedFeatures(e.point, { layers: [ROUTES_HIT] }).length > 0

    // One handler, one box, sized for the finger: nothing deselects, one thing
    // selects it, several — hotspots, routes or both — open a chooser. The
    // routes hook reads the same tap and keeps its own half.
    const onMapClick = (e: MapMouseEvent) => {
      if (drawingRef.current) return
      const { routeIds, stopIds } = tapTargets(map, e.point, e.originalEvent)
      const here = stopIds.map((id) => byId.current.get(id)).filter((s) => !!s)
      if (here.length === 1 && routeIds.length === 0) {
        setSelectedId(here[0]!.id)
        setCandidates([])
      } else {
        setSelectedId(null)
        setCandidates(here.length + routeIds.length > 1 ? here : [])
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

  return { stops, links, error, reload, selected, select, candidates, linkedVariantIds }
}
