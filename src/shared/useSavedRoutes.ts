import { useCallback, useEffect, useRef, useState } from 'react'
import type { GeoJSONSource, MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import { directionToOpen, isDrawn, variantLine, type VariantSummary } from './routes'
import { ROUTES_HIT_LAYER, resolveTap, tapTargets } from './tap'

const SRC = 'saved-routes'
const CASING = 'saved-routes-casing'
const LINE = 'saved-routes-line'
/** The chosen direction, drawn again on top so it can be thick while the rest dim. */
const SELECTED_CASING = 'saved-routes-selected-casing'
const SELECTED = 'saved-routes-selected'
const HIT = ROUTES_HIT_LAYER


/**
 * Three levels, decided with the owner 2026-09-22: every direction rests in a
 * light blue; when a tap lights some, the rest fade further; the lit ones are
 * drawn again on top, full and thick. One rule for a road that will carry
 * three routes.
 */
const REST = { line: 0.45, casing: 0.8 }
const FADED = { line: 0.15, casing: 0.3 }

/**
 * The line fills the road, the owner's ask of 2026-09-23: its width follows
 * the basemap's own curve for a major road (2 px at zoom 10, 20 px at zoom
 * 20, growing by 1.3 a zoom), at 0.42 of it — the owner's "try 5 px",
 * judged at zoom 18 where the road is 12 px, after 10/10, 8/10 and 6/10 —
 * so road shows either side at every zoom. `extra` pads
 * it: the casing shows 1 px either side, the lit direction sits 1 px proud,
 * and the hit area reaches well beyond.
 */
const ROAD_SHARE = 0.42
function roadWidth(extra: number) {
  return ['interpolate', ['exponential', 1.3], ['zoom'], 10, 2 * ROAD_SHARE + extra, 20, 20 * ROAD_SHARE + extra] as never
}

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
    // Under the basemap's labels, so a road painted blue still shows its
    // name. The draft's layers, when there are any, sit above the labels and
    // so above these too.
    const before = map.getStyle().layers.find((l) => l.type === 'symbol')?.id

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
        paint: { 'line-color': '#ffffff', 'line-width': roadWidth(2), 'line-opacity': REST.casing },
      },
      before,
    )
    map.addLayer(
      {
        id: LINE,
        type: 'line',
        source: SRC,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#2563eb', 'line-width': roadWidth(0), 'line-opacity': REST.line },
      },
      before,
    )
    // The lit directions — the one chosen, or everything under a tap — drawn
    // once more above the rest. Fading the others is what makes them stand
    // out; this pair is what stays bright.
    map.addLayer(
      {
        id: SELECTED_CASING,
        type: 'line',
        source: SRC,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': roadWidth(3), 'line-opacity': 1 },
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
        paint: { 'line-color': '#2563eb', 'line-width': roadWidth(1) },
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
        paint: { 'line-color': '#000000', 'line-width': roadWidth(14), 'line-opacity': 0 },
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

  // What is lit: the chosen direction alone, or every drawn direction under
  // a tap while the sheet asks which. The rest fade so it reads at a glance.
  useEffect(() => {
    if (!map || !map.getLayer(SELECTED)) return
    const lit = selectedId ? [selectedId] : candidates.filter(isDrawn).map((v) => v.id)
    const hidden = ['!=', ['get', 'id'], opts.hiddenVariantId ?? '']
    const isLit = ['in', ['get', 'id'], ['literal', lit]]
    const filter = ['all', hidden, isLit]
    map.setFilter(SELECTED_CASING, filter as never)
    map.setFilter(SELECTED, filter as never)
    const level = lit.length > 0 ? FADED : REST
    map.setPaintProperty(LINE, 'line-opacity', level.line)
    map.setPaintProperty(CASING, 'line-opacity', level.casing)
  }, [map, selectedId, candidates, opts.hiddenVariantId])

  // ----------------------------------------------------------------- events

  useEffect(() => {
    if (!map || !map.getLayer(HIT)) return
    const canvas = map.getCanvas()

    // One handler, one box. A finger is wider than a pixel, so we ask what is
    // near the tap: nothing deselects, one route opens its card, several
    // things — routes, hotspots or both — light up and go to the sheet. The
    // candidates are whole routes, slots included, so the sheet can say
    // "return not mapped yet". The stops hook reads the same tap and keeps
    // its own half.
    const onMapClick = (e: MapMouseEvent) => {
      if (drawingRef.current) return
      const out = resolveTap(tapTargets(map, e.point, e.originalEvent))
      const all = [...byId.current.values()]
      if (out.kind === 'route') {
        // The line under the finger wins: where a route's two directions run
        // on different roads, tapping the other one must open it (the owner's
        // check, 2026-09-22). Only where both overlap does the outbound rule
        // decide.
        const under = out.routeIds.map((id) => byId.current.get(id)).filter((v) => !!v)
        const routeId = under[0]?.route_id
        const open = under.length === 1 ? under[0]! : directionToOpen(all.filter((v) => v.route_id === routeId))
        setSelectedId(open?.id ?? null)
        setCandidates([])
      } else if (out.kind === 'several') {
        const keys = new Set(out.routeKeys)
        setSelectedId(null)
        setCandidates(all.filter((v) => keys.has(v.route_id)))
      } else {
        setSelectedId(null)
        setCandidates([])
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
