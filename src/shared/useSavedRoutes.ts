import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GeoJSONSource, MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import { directionToOpen, isDrawn, variantLine, type VariantSummary } from './routes'
import { ROUTES_HIT_LAYER, resolveTap, tapTargets } from './tap'
import { CASING_EXTRA, LINE_BLUE, litWidth, roadWidth } from './lineStyle'

const SRC = 'saved-routes'
const CASING = 'saved-routes-casing'
const LINE = 'saved-routes-line'
/** The chosen direction, drawn again on top so it can be thick while the rest dim. */
const SELECTED_CASING = 'saved-routes-selected-casing'
/** Named for the pass-stretch hook, which slots its layers just under this one. */
export const SELECTED_CASING_LAYER = SELECTED_CASING
const SELECTED = 'saved-routes-selected'
const HIT = ROUTES_HIT_LAYER


/**
 * Three levels, decided with the owner 2026-09-22: every direction rests in a
 * light blue; when a tap lights some, the rest fade further; the lit ones are
 * drawn again on top, full and thick. One rule for a road that will carry
 * three routes. While the sheet lights one way round, the same routes the
 * other way stay at rest rather than fade (the owner's pick, 2026-09-25).
 */
const REST = { line: 0.45, casing: 0.8 }
const FADED = { line: 0.15, casing: 0.3 }

/**
 * What a tap does to a direction's features, kept as MapLibre feature state
 * (`setFeatureState`) rather than as a filter or a paint expression naming
 * ids. The paint expressions below read it and never change, and a change
 * of feature state repaints only the features whose state changed, on the
 * main thread; whereas a new filter, or a new expression in a data-driven
 * paint property, has MapLibre lay out every tile of the source again in
 * its worker — for 1,000 directions, a second and a half of stall a tap
 * (measured 2026-09-25, future-proofing step 5).
 *
 *   lit      – drawn again on top, full and thick
 *   resting  – at rest while others fade: the lit direction's way back
 *   dim      – faded: everything else, once anything is lit
 *   (none)   – at rest: everything, while nothing is lit
 */
export type Lighting = 'lit' | 'resting' | 'dim' | 'rest'
const STATE_OF: Record<Lighting, { lit: boolean; resting: boolean; dim: boolean }> = {
  lit: { lit: true, resting: false, dim: true },
  resting: { lit: false, resting: true, dim: false },
  dim: { lit: false, resting: false, dim: true },
  rest: { lit: false, resting: false, dim: false },
}
const flag = (name: 'lit' | 'resting' | 'dim') => ['boolean', ['feature-state', name], false]

/**
 * The `line-opacity` of the lines that are not lit, from feature state: at
 * rest while nothing is lit; once something is, faded, but for the
 * `resting` ones. (A lit direction's own copy here fades too; its lit copy
 * is drawn on top.)
 */
export function unlitOpacity(part: keyof typeof REST) {
  return ['case', flag('resting'), REST[part], flag('dim'), FADED[part], REST[part]] as never
}

/** The opacity of a layer that draws the lit directions only: 1 for them, 0 for the rest. */
export function litOpacity() {
  return ['case', flag('lit'), 1, 0] as never
}

/**
 * Sets the lighting of every id in `ids` on `source`, changing only what
 * changed since the last call. `lit` and `resting` name the exceptions;
 * everything else is dim while anything is lit, at rest otherwise. Never
 * `removeFeatureState`: a removal and a set of the same id in one frame
 * leave the removal in charge.
 */
export function useLighting(
  map: MapLibreMap | null,
  source: string,
  ids: readonly string[],
  lit: readonly string[],
  resting: readonly string[],
) {
  const was = useRef(new Map<string, Lighting>())
  useEffect(() => {
    if (!map || !map.getSource(source)) return
    const now = new Map<string, Lighting>()
    if (lit.length > 0) {
      for (const id of ids) now.set(id, lit.includes(id) ? 'lit' : resting.includes(id) ? 'resting' : 'dim')
    }
    for (const id of new Set([...was.current.keys(), ...now.keys()])) {
      const state = now.get(id) ?? 'rest'
      if ((was.current.get(id) ?? 'rest') !== state) map.setFeatureState({ source, id }, STATE_OF[state])
    }
    was.current = now
  }, [map, source, ids, lit, resting])
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
        paint: { 'line-color': '#ffffff', 'line-width': roadWidth(CASING_EXTRA), 'line-opacity': unlitOpacity('casing') },
      },
      before,
    )
    map.addLayer(
      {
        id: LINE,
        type: 'line',
        source: SRC,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': LINE_BLUE, 'line-width': roadWidth(0), 'line-opacity': unlitOpacity('line') },
      },
      before,
    )
    // The lit directions — the one chosen, or everything under a tap — drawn
    // once more above the rest. Fading the others is what makes them stand
    // out; this pair is what stays bright. Every direction is in these
    // layers, the unlit ones at opacity 0: a filter naming the lit ones
    // would lay the whole source out again at every tap (see `useLighting`).
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
        paint: { 'line-color': LINE_BLUE, 'line-width': litWidth(), 'line-opacity': litOpacity() },
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
  // the routes under the tap the way round it is showing them. The rest fade
  // so it reads at a glance.
  const litVariants = useMemo(
    () =>
      selectedId
        ? variants.filter((v) => v.id === selectedId && isDrawn(v))
        : candidates.filter((v) => v.reversed === back && isDrawn(v)),
    [selectedId, variants, candidates, back],
  )
  const lit = useMemo(() => litVariants.map((v) => v.id), [litVariants])
  // The same routes the other way round, while the sheet shows one: they stay
  // at rest, so the way back reads as there, and only what the sheet does not
  // list fades. The owner's pick of 2026-09-25, over fading or hiding it; and
  // the same for a card opened on its own: its route's other way rests.
  const resting = useMemo(() => {
    const chosen = selectedId ? variants.find((v) => v.id === selectedId) : undefined
    const others = chosen
      ? variants.filter((v) => v.route_id === chosen.route_id && v.id !== chosen.id)
      : candidates.filter((v) => v.reversed !== back)
    return others.filter(isDrawn).map((v) => v.id)
  }, [selectedId, variants, candidates, back])
  const drawnIds = useMemo(() => variants.filter(isDrawn).map((v) => v.id), [variants])
  useLighting(map, SRC, drawnIds, lit, resting)

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

  return { variants, error, loading, reload, selected, select, candidates, back, flip, lit, litVariants, resting }
}
