import { useCallback, useEffect, useRef, useState } from 'react'
import type { GeoJSONSource, MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import { variantLine, type VariantSummary } from './routes'
import { ROUTES_HIT_LAYER, tapTargets } from './tap'

const SRC = 'saved-routes'
const CASING = 'saved-routes-casing'
const LINE = 'saved-routes-line'
/** The chosen direction, drawn again on top so it can be thick while the rest dim. */
const SELECTED_CASING = 'saved-routes-selected-casing'
const SELECTED = 'saved-routes-selected'
const HIT = ROUTES_HIT_LAYER

/** Draw layers, if present, must stay above the saved ones. */
const DRAW_ABOVE = 'draw-line-casing'

/**
 * Every saved route direction, drawn for everyone. This is the public half of
 * ParaPo: no sign-in, no editor, just the map with what has been recorded.
 *
 * `load` decides where the directions come from: the public map reads the
 * published file (summaries, simplified lines), the editor the live tables
 * (full rows it can reopen). Pass a function defined once at module level,
 * not a new one per render, or it reloads every render.
 *
 * The editor also passes `drawing` and `hiddenVariantId`; the public map
 * passes neither, and both default to off.
 */
export function useSavedRoutes<T extends VariantSummary>(
  map: MapLibreMap | null,
  load: () => Promise<T[]>,
  opts: { drawing?: boolean; hiddenVariantId?: string | null } = {},
) {
  const [variants, setVariants] = useState<T[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /**
   * The directions under a tap that landed on several things (routes, hotspots
   * or both), for a chooser. Empty otherwise. The stops hook keeps the
   * hotspot half of the same tap.
   */
  const [candidates, setCandidates] = useState<T[]>([])

  /** Choosing one direction answers the question the chooser was asking. */
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

  // The click handler is bound once; this is how it reads today's variants.
  const byId = useRef(new Map<string, T>())
  useEffect(() => {
    byId.current = new Map(variants.map((v) => [v.id, v]))
  }, [variants])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setVariants(await load())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [load])

  useEffect(() => {
    void reload()
  }, [reload])

  // ----------------------------------------------------------------- layers

  useEffect(() => {
    if (!map || map.getSource(SRC)) return
    const before = map.getLayer(DRAW_ABOVE) ? DRAW_ABOVE : undefined

    map.addSource(SRC, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    map.addLayer(
      {
        id: CASING,
        type: 'line',
        source: SRC,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.9 },
      },
      before,
    )
    map.addLayer(
      {
        id: LINE,
        type: 'line',
        source: SRC,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#2563eb', 'line-width': 3 },
      },
      before,
    )
    // The chosen direction, drawn once more above the rest. Dimming the others
    // is what makes it stand out; this pair is what stays bright.
    map.addLayer(
      {
        id: SELECTED_CASING,
        type: 'line',
        source: SRC,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 1 },
        filter: ['==', ['get', 'id'], ''] as never,
      },
      before,
    )
    map.addLayer(
      {
        id: SELECTED,
        type: 'line',
        source: SRC,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#2563eb', 'line-width': 5 },
        filter: ['==', ['get', 'id'], ''] as never,
      },
      before,
    )
    map.addLayer(
      {
        id: HIT,
        type: 'line',
        source: SRC,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#000000', 'line-width': 18, 'line-opacity': 0 },
      },
      before,
    )
  }, [map])

  // Open on the routes, not on a fixed centre. Once, on first load, and never
  // while drawing: a draft already has a view the user chose.
  const fittedRef = useRef(false)
  useEffect(() => {
    if (!map || fittedRef.current || drawingRef.current) return
    const coords = variants.flatMap(variantLine)
    if (coords.length < 2) return
    fittedRef.current = true
    let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const [x, y] of coords) {
      if (x < w) w = x
      if (x > e) e = x
      if (y < s) s = y
      if (y > n) n = y
    }
    map.fitBounds([[w, s], [e, n]], { padding: 100, maxZoom: 13, duration: 0 })
  }, [map, variants])

  useEffect(() => {
    if (!map) return
    const src = map.getSource(SRC) as GeoJSONSource | undefined
    if (!src) return
    src.setData({
      type: 'FeatureCollection',
      features: variants
        .map((v) => ({ v, line: variantLine(v) }))
        .filter(({ line }) => line.length > 1)
        .map(({ v, line }) => ({
          type: 'Feature' as const,
          properties: {
            id: v.id,
            route_id: v.route_id,
            name: v.route?.name ?? '',
            mode: v.route?.mode ?? 'jeepney',
          },
          geometry: { type: 'LineString' as const, coordinates: line },
        })),
    })
  }, [map, variants])

  // The direction being edited is drawn by the editor; hide the saved copy.
  useEffect(() => {
    if (!map || !map.getLayer(LINE)) return
    const filter = ['!=', ['get', 'id'], opts.hiddenVariantId ?? ''] as const
    for (const id of [CASING, LINE, HIT]) map.setFilter(id, filter as never)
  }, [map, opts.hiddenVariantId])

  // What "chosen" looks like: the selected pair shows only that direction, and
  // the rest fade back so it reads at a glance on a small screen.
  useEffect(() => {
    if (!map || !map.getLayer(SELECTED)) return
    const hidden = ['!=', ['get', 'id'], opts.hiddenVariantId ?? '']
    const isSelected = ['==', ['get', 'id'], selectedId ?? '']
    const filter = ['all', hidden, isSelected]
    map.setFilter(SELECTED_CASING, filter as never)
    map.setFilter(SELECTED, filter as never)
    map.setPaintProperty(LINE, 'line-opacity', selectedId ? 0.35 : 1)
    map.setPaintProperty(CASING, 'line-opacity', selectedId ? 0.5 : 0.9)
  }, [map, selectedId, opts.hiddenVariantId])

  // ----------------------------------------------------------------- events

  useEffect(() => {
    if (!map || !map.getLayer(HIT)) return
    const canvas = map.getCanvas()

    // One handler, one box. A finger is wider than a pixel, so we ask what is
    // near the tap: nothing deselects, one thing selects it, several — routes,
    // hotspots or both — open a chooser. The stops hook reads the same tap and
    // keeps its own half.
    const onMapClick = (e: MapMouseEvent) => {
      if (drawingRef.current) return
      const { routeIds, stopIds } = tapTargets(map, e.point, e.originalEvent)
      const routes = routeIds.map((id) => byId.current.get(id)).filter((v) => !!v)
      if (routes.length === 1 && stopIds.length === 0) {
        setSelectedId(routes[0]!.id)
        setCandidates([])
      } else {
        setSelectedId(null)
        setCandidates(routes.length + stopIds.length > 1 ? routes : [])
      }
    }
    const enter = () => {
      if (!drawingRef.current) canvas.style.cursor = 'pointer'
    }
    const leave = () => {
      if (!drawingRef.current) canvas.style.cursor = ''
    }

    map.on('click', onMapClick)
    map.on('mouseenter', HIT, enter)
    map.on('mouseleave', HIT, leave)
    return () => {
      map.off('click', onMapClick)
      map.off('mouseenter', HIT, enter)
      map.off('mouseleave', HIT, leave)
    }
  }, [map])

  const selected = variants.find((v) => v.id === selectedId) ?? null

  return { variants, error, loading, reload, selected, select, candidates }
}
