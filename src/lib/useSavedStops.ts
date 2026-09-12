import { useCallback, useEffect, useRef, useState } from 'react'
import type { GeoJSONSource, MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import { listStopLinks, listStops, stopRing, type StopLink, type StopRow } from './stops'
import { supabase } from './supabase'
import { HOTSPOT_COLOUR } from './useDrawing'

const SRC = 'saved-stops'
const FILL = 'saved-stops-fill'
const OUTLINE = 'saved-stops-outline'
const LABEL = 'saved-stops-label'

/** Hotspots sit under the route lines; a route crossing one must still win the click. */
const ROUTES_ABOVE = 'saved-routes-casing'
const DRAW_ABOVE = 'draw-line-casing'
const ROUTES_HIT = 'saved-routes-hit'

type IdFeature = { properties?: { id?: string } }

/**
 * Every saved hotspot, drawn for everyone as a shaded outline in its kind's
 * colour, with its route links alongside so the tap card can list them.
 */
export function useSavedStops(
  map: MapLibreMap | null,
  opts: { drawing: boolean; hiddenStopId: string | null },
) {
  const [stops, setStops] = useState<StopRow[]>([])
  const [links, setLinks] = useState<StopLink[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const drawingRef = useRef(opts.drawing)
  drawingRef.current = opts.drawing

  const reload = useCallback(async () => {
    if (!supabase) return
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

    const onFillClick = (e: MapMouseEvent & { features?: IdFeature[] }) => {
      if (drawingRef.current || routeUnder(e)) return
      const id = e.features?.[0]?.properties?.id
      if (typeof id === 'string') setSelectedId(id)
    }
    const onMapClick = (e: MapMouseEvent) => {
      if (drawingRef.current) return
      const hits = map.queryRenderedFeatures(e.point, { layers: [FILL] })
      if (hits.length === 0 || routeUnder(e)) setSelectedId(null)
    }
    const enter = (e: MapMouseEvent) => {
      if (!drawingRef.current && !routeUnder(e)) canvas.style.cursor = 'pointer'
    }
    const leave = () => {
      if (!drawingRef.current) canvas.style.cursor = ''
    }

    map.on('click', FILL, onFillClick)
    map.on('click', onMapClick)
    map.on('mouseenter', FILL, enter)
    map.on('mouseleave', FILL, leave)
    return () => {
      map.off('click', FILL, onFillClick)
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

  return { stops, links, error, reload, selected, select: setSelectedId, linkedVariantIds }
}
