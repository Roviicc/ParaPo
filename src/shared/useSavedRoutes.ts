import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GeoJSONSource, MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import { directionToOpen, isDrawn, variantLine, type VariantSummary } from './routes'
import { ROUTES_HIT_LAYER, resolveTap, tapTargets } from './tap'
import { MAP_COLOURS } from '../design-system/foundation/mapColours'
import { CASING_EXTRA, litWidth, roadWidth } from './lineStyle'

const SRC = 'saved-routes'
const CASING = 'saved-routes-casing'
const LINE = 'saved-routes-line'
/** The lit directions, drawn again on top: thick, and in the selected blue. */
const SELECTED_CASING = 'saved-routes-selected-casing'
const SELECTED = 'saved-routes-selected'
const HIT = ROUTES_HIT_LAYER

/**
 * Two looks, the owner's of 2026-09-29, and no opacity: every direction
 * rests in Map/RouteLine/surface-default, opaque, in its white casing; the
 * lit ones — the trip open, or the routes a list is showing — are drawn
 * again on top in Map/RouteLine/surface-selected, thicker. See-through lines
 * stacked on a shared road and read as one muddle (his words: "it can stack
 * and confuse the user"), so nothing fades any more: the three levels of
 * 2026-09-22 (rest, faded, lit) and the resting way back of 2026-09-25 went
 * with them.
 *
 * What a tap lights is kept as MapLibre feature state (`setFeatureState`)
 * rather than as a filter or a paint expression naming ids. The paint
 * expressions below read it and never change, and a change of feature state
 * repaints only the features whose state changed, on the main thread;
 * whereas a new filter, or a new expression in a data-driven paint
 * property, has MapLibre lay out every tile of the source again in its
 * worker — for 1,000 directions, a second and a half of stall a tap
 * (measured 2026-09-25, future-proofing step 5).
 */
const isLit = ['boolean', ['feature-state', 'lit'], false]

/**
 * The opacity of a layer that draws the lit directions only: 1 for them, 0
 * for the rest — a switch, never a shade.
 */
export function litOpacity() {
  return ['case', isLit, 1, 0] as never
}

/**
 * Lights exactly `lit` on `source` and nothing else, changing only what
 * changed since the last call. Never `removeFeatureState`: a removal and a
 * set of the same id in one frame leave the removal in charge.
 */
export function useLighting(map: MapLibreMap | null, source: string, lit: readonly string[]) {
  const was = useRef(new Set<string>())
  useEffect(() => {
    if (!map || !map.getSource(source)) return
    const now = new Set(lit)
    for (const id of was.current) if (!now.has(id)) map.setFeatureState({ source, id }, { lit: false })
    for (const id of now) if (!was.current.has(id)) map.setFeatureState({ source, id }, { lit: true })
    was.current = now
  }, [map, source, lit])
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
  /**
   * Which way round the sheet shows the routes under a tap: outbound, or the
   * way back. One way at a time, each lit with its arrows; ⇄ flips all of
   * them together. The owner's ask of 2026-09-25.
   */
  const [back, setBack] = useState(false)
  const flip = useCallback(() => setBack((b) => !b), [])

  /**
   * Choosing one direction answers the question the chooser was asking, so
   * the list goes — unless `keepList`: the public map's trip card keeps the
   * list it was picked from behind it, for its ‹ (the owner's frames of
   * 2026-09-28); ‹ is then `select(null, { keepList: true })`.
   */
  const select = useCallback((id: string | null, opts: { keepList?: boolean } = {}) => {
    setSelectedId(id)
    if (!opts.keepList) setCandidates([])
  }, [])

  /**
   * Lists `directions` as a tap where they all run would, the way round
   * `way`, with nothing chosen: the ‹ of a trip opened on its own, whose
   * route shares its head or its tail with others (the public map's, since
   * the owner's ask of 2026-09-29; CommuterApp says which).
   */
  const openList = useCallback((directions: readonly T[], way: boolean) => {
    setSelectedId(null)
    setCandidates([...directions])
    setBack(way)
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

    // `promoteId`: the feature state a tap sets is keyed on the direction's id.
    map.addSource(SRC, {
      type: 'geojson',
      promoteId: 'id',
      data: { type: 'FeatureCollection', features: [] },
    })
    map.addLayer(
      {
        id: CASING,
        type: 'line',
        source: SRC,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': roadWidth(CASING_EXTRA) },
      },
      before,
    )
    map.addLayer(
      {
        id: LINE,
        type: 'line',
        source: SRC,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': MAP_COLOURS['Map/RouteLine/surface-default'], 'line-width': roadWidth(0) },
      },
      before,
    )
    // The lit directions — the one chosen, or everything under a tap — drawn
    // once more above the rest, in the selected blue: over a shared road,
    // they are the line that shows. Every direction is in these layers, the
    // unlit ones switched off: a filter naming the lit ones would lay the
    // whole source out again at every tap (see `useLighting`).
    map.addLayer(
      {
        id: SELECTED_CASING,
        type: 'line',
        source: SRC,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': litWidth(CASING_EXTRA), 'line-opacity': litOpacity() },
      },
      before,
    )
    map.addLayer(
      {
        id: SELECTED,
        type: 'line',
        source: SRC,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': MAP_COLOURS['Map/RouteLine/surface-selected'], 'line-width': litWidth(), 'line-opacity': litOpacity() },
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
    for (const id of [CASING, LINE, SELECTED_CASING, SELECTED, HIT]) map.setFilter(id, filter as never)
  }, [map, opts.hiddenVariantId])

  // What is lit: the chosen direction alone, or, while the sheet asks which,
  // the routes under the tap the way round it is showing them.
  const litVariants = useMemo(
    () =>
      selectedId
        ? variants.filter((v) => v.id === selectedId && isDrawn(v))
        : candidates.filter((v) => v.reversed === back && isDrawn(v)),
    [selectedId, variants, candidates, back],
  )
  const lit = useMemo(() => litVariants.map((v) => v.id), [litVariants])
  useLighting(map, SRC, lit)

  // The click handler is bound once; this is how it reads what is lit now.
  const litRef = useRef<readonly string[]>([])
  useEffect(() => {
    litRef.current = lit
  }, [lit])

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
        // check, 2026-09-22). Where both overlap, the one already lit stays
        // (the owner's ask of 2026-09-25: a tap on the lit Novaliches → Tala
        // opened Tala → Novaliches); with neither lit, the outbound rule
        // decides.
        const under = out.routeIds.map((id) => byId.current.get(id)).filter((v) => !!v)
        const routeId = under[0]?.route_id
        const open =
          under.length === 1
            ? under[0]!
            : (under.find((v) => litRef.current.includes(v.id)) ?? directionToOpen(all.filter((v) => v.route_id === routeId)))
        setSelectedId(open?.id ?? null)
        setCandidates([])
      } else if (out.kind === 'several') {
        const keys = new Set(out.routeKeys)
        setSelectedId(null)
        setCandidates(all.filter((v) => keys.has(v.route_id)))
        // The way round under the finger, as for one route: outbound where an
        // outbound line was hit, the way back where only ways back were — so
        // a tap on the light-blue way back switches to it (the owner's
        // report, 2026-09-25) — and, where a lit line was hit, the way round
        // already lit.
        const hit = out.routeIds.map((id) => byId.current.get(id)).filter((v) => !!v)
        const litHit = hit.find((v) => litRef.current.includes(v.id))
        setBack(litHit ? litHit.reversed : hit.length > 0 && hit.every((v) => v.reversed))
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

  return { variants, error, loading, reload, selected, select, openList, candidates, back, flip, lit, litVariants }
}
