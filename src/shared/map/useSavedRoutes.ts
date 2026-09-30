import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GeoJSONSource, MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import { directionToOpen, isDrawn, variantLine, type LineStringGeoJSON, type VariantSummary } from '../model/routes'
import { ROUTES_HIT_LAYER, resolveTap, tapTargets } from './tap'
import { MAP_COLOURS } from '../../design-system/foundation/mapColours'
import { CASING_EXTRA, litWidth, roadWidth } from './lineStyle'
import type { Livery } from '../model/liveries'

const SRC = 'saved-routes'
const CASING = 'saved-routes-casing'
const LINE = 'saved-routes-line'
/**
 * From this zoom a pixel is a couple of metres, and an overview's corners
 * show: the directions on screen get their full lines, as a lit one does.
 */
const FULL_LINES_FROM = 15
/** The lit directions, drawn again on top: thick, in the selected blue, or on the public map in a picked card's or an open trip's colour. */
const SELECTED_CASING = 'saved-routes-selected-casing'
const SELECTED = 'saved-routes-selected'
const HIT = ROUTES_HIT_LAYER

/**
 * Two looks, the owner's of 2026-09-29, and no opacity: every direction
 * rests in Map/RouteLine/surface-default, opaque, in its white casing; the
 * lit ones — the trip open, the Selected card's directions, or else every
 * direction a list or a hotspot's card shows — are drawn again on top in
 * Map/RouteLine/surface-selected, thicker; on the public map a picked
 * card's, or an open trip's, wear that card's Card/<livery>/surface instead
 * (useLitLineColour, his ask of 2026-09-29). See-through lines
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
 * The RouteCard picked in a list of them — the route list's, or a hotspot's
 * card's (`where`) — by its place, the directions its rows list, and the
 * colour it wears: what the map lights while no trip is open, and in what
 * (the owner, 2026-09-29).
 */
export type Highlight = { where: 'list' | 'hotspot'; from: string; ids: readonly string[]; livery: Livery }

/**
 * The colour the lit directions are drawn in, over the rest: the selected
 * blue unless the public map says otherwise — a picked card's, an open
 * trip's (liveryLine.ts). A paint property, set once per change: every lit
 * line wears the same colour at a time.
 */
export function useLitLineColour(map: MapLibreMap | null, colour: string) {
  useEffect(() => {
    if (!map || !map.getLayer(SELECTED)) return
    map.setPaintProperty(SELECTED, 'line-color', colour)
  }, [map, colour])
}

/**
 * Every saved route direction, drawn for everyone. This is the public half of
 * ParaPo: no sign-in, no editor, just the map with what has been recorded.
 *
 * `load` decides where the directions come from: the public map reads the
 * published file (summaries, simplified lines), the editor the live tables
 * (their overviews, 0009, and what a save needs). Pass a function defined
 * once at module level, not a new one per render, or it reloads every
 * render.
 *
 * The editor also passes `drawing` and `hiddenVariantId`; the public map
 * passes neither, and both default to off.
 *
 * The public map also passes `loadLine`: its file carries each direction's
 * overview (mapFile.ts), and a direction's full line is read when it is lit
 * or chosen, or on screen at street zoom. From then on `variants` carries that line in its `shape` — so
 * the orange stretches, the chevrons, the ride-cut and the babaan sides all
 * work on the line itself — and the map draws it in place of the overview.
 * The editor passes none: its list carries overviews, and it reads a full
 * line itself when it needs one (live.ts, lineOf and linesOf).
 */
export function useSavedRoutes<T extends VariantSummary>(
  map: MapLibreMap | null,
  load: () => Promise<T[]>,
  opts: {
    drawing?: boolean
    hiddenVariantId?: string | null
    loadLine?: (id: string) => Promise<LineStringGeoJSON | null>
  } = {},
) {
  // The rows as loaded, and the full lines read since, by direction.
  const [rows, setRows] = useState<T[]>([])
  const [lines, setLines] = useState<ReadonlyMap<string, LineStringGeoJSON>>(() => new Map())
  // A direction with its line is one object for as long as its row and its
  // line are the ones it was made from: a line arriving for another
  // direction must not make the chosen one new (its ride-to would glide the
  // camera back to the picked hintuan).
  const withLine = useRef(new Map<string, { row: T; line: LineStringGeoJSON; v: T }>())
  const variants = useMemo(
    () =>
      lines.size === 0
        ? rows
        : rows.map((v) => {
            const line = lines.get(v.id)
            if (!line) return v
            const was = withLine.current.get(v.id)
            if (was && was.row === v && was.line === line) return was.v
            const next = { ...v, shape: line }
            withLine.current.set(v.id, { row: v, line, v: next })
            return next
          }),
    [rows, lines],
  )
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
   * way back. One way at a time; ⇄ flips all of them together. The owner's
   * ask of 2026-09-25.
   */
  const [back, setBack] = useState(false)
  /**
   * The Selected RouteCard, whose directions alone are lit while no trip is
   * open; with none picked, a list lights every direction it shows (the
   * owner, 2026-09-29, after seeing a list light nothing). SWITCH, a new
   * list, a map tap, opening a trip and closing let it go.
   */
  const [highlight, setHighlight] = useState<Highlight | null>(null)
  /**
   * What a hotspot's RouteCards show, the way round its ⇄ has them: lit as a
   * list's are, till one of its cards is picked (the owner, 2026-09-29: "on
   * hintuan it should light its routes"). The card says what it shows, and
   * nothing once it closes.
   */
  const [cardShows, setCardShows] = useState<readonly string[]>([])
  const flip = useCallback(() => {
    setBack((b) => !b)
    setHighlight(null)
  }, [])

  /**
   * Choosing one direction answers the question the chooser was asking, so
   * the list goes — unless `keepList`: the public map's trip card keeps what
   * it was picked from behind it, the list or a hotspot's card, for its ‹
   * (the owner's frames of 2026-09-28); ‹ is then `select(null, { keepList:
   * true })`. A Selected card is let go either way, so ‹ comes back to every
   * card at rest (the owner, 2026-09-29: "back to normal").
   */
  const select = useCallback((id: string | null, opts: { keepList?: boolean } = {}) => {
    setSelectedId(id)
    setHighlight(null)
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
    setHighlight(null)
  }, [])

  // The full lines asked for, and those whose read failed.
  const requestedRef = useRef(new Set<string>())
  const failedRef = useRef(new Set<string>())
  const drawingRef = useRef(opts.drawing ?? false)
  drawingRef.current = opts.drawing ?? false
  // A chooser left open when drawing starts would come back, stale, after it.
  useEffect(() => {
    if (!opts.drawing) return
    setCandidates([])
    setHighlight(null)
  }, [opts.drawing])

  // The click handler is bound once; this is how it reads today's variants.
  const byId = useRef(new Map<string, T>())
  useEffect(() => {
    byId.current = new Map(variants.map((v) => [v.id, v]))
  }, [variants])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const next = await load()
      setRows(next)
      setLines(new Map())
      requestedRef.current.clear()
      failedRef.current.clear()
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
    // The lit directions — the one chosen, the Selected card's, or else
    // everything a list or a hotspot's card shows — drawn once more above the
    // rest, in the selected blue (or a card's, useLitLineColour): over a
    // shared road, they are the line that shows. Every direction is in these
    // layers, the unlit ones switched off: a filter naming the lit ones would
    // lay the whole source out again at every tap (see `useLighting`).
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
        paint: {
          'line-color': MAP_COLOURS['Map/RouteLine/surface-selected'],
          // A new colour shows with the lighting it goes with, in the same
          // frame: MapLibre's default 300 ms fade would draw the next card's
          // routes in the last card's colour for a moment.
          'line-color-transition': { duration: 0, delay: 0 },
          'line-width': litWidth(),
          'line-opacity': litOpacity(),
        },
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

  // The source is laid out from the rows as loaded — on the public map, the
  // overviews — and a full line read later is patched into it alone
  // (updateData), not the whole source laid out again.
  useEffect(() => {
    if (!map) return
    const src = map.getSource(SRC) as GeoJSONSource | undefined
    if (!src) return
    src.setData({
      type: 'FeatureCollection',
      features: rows
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
  }, [map, rows])

  useEffect(() => {
    if (!map || lines.size === 0) return
    const src = map.getSource(SRC) as GeoJSONSource | undefined
    if (!src) return
    void src.updateData({ update: [...lines].map(([id, line]) => ({ id, newGeometry: line })) })
  }, [map, rows, lines])

  // The direction being edited is drawn by the editor; hide the saved copy.
  useEffect(() => {
    if (!map || !map.getLayer(LINE)) return
    const filter = ['!=', ['get', 'id'], opts.hiddenVariantId ?? ''] as const
    for (const id of [CASING, LINE, SELECTED_CASING, SELECTED, HIT]) map.setFilter(id, filter as never)
  }, [map, opts.hiddenVariantId])

  // What is shown: the routes under the tap, the way round the list is
  // showing them — or, with no list, what a hotspot's cards show.
  const showing = useMemo(
    () =>
      candidates.length > 0
        ? candidates.filter((v) => v.reversed === back && isDrawn(v))
        : variants.filter((v) => cardShows.includes(v.id) && isDrawn(v)),
    [candidates, back, variants, cardShows],
  )
  // What is lit: the chosen direction alone; or the Selected card's; or,
  // with none picked, everything shown.
  const litVariants = useMemo(
    () =>
      selectedId
        ? variants.filter((v) => v.id === selectedId && isDrawn(v))
        : highlight
          ? variants.filter((v) => highlight.ids.includes(v.id) && isDrawn(v))
          : showing,
    [selectedId, variants, highlight, showing],
  )
  const lit = useMemo(() => litVariants.map((v) => v.id), [litVariants])
  useLighting(map, SRC, lit)

  // Reading a direction's full line, once. One that failed (offline, never
  // stored) is asked again when it lights, not at every look at the screen.
  const loadLine = opts.loadLine
  const request = useCallback(
    (id: string) => {
      if (!loadLine || requestedRef.current.has(id)) return
      requestedRef.current.add(id)
      failedRef.current.delete(id)
      loadLine(id).then(
        (line) => {
          if (line) setLines((m) => new Map(m).set(id, line))
        },
        () => {
          requestedRef.current.delete(id)
          failedRef.current.add(id)
        },
      )
    },
    [loadLine],
  )

  // What is lit, and the chosen direction, get their full lines.
  useEffect(() => {
    for (const id of selectedId ? [...lit, selectedId] : lit) request(id)
  }, [request, lit, selectedId])

  // So do the directions on screen at street zoom, where an overview's
  // corners would show: a resting line on a street is drawn as it was drawn
  // (the owner's look of 2026-09-25). Looked at whenever the map settles.
  useEffect(() => {
    if (!map || !loadLine) return
    const readInView = () => {
      if (map.getZoom() < FULL_LINES_FROM || !map.getLayer(LINE)) return
      for (const f of map.queryRenderedFeatures({ layers: [LINE] })) {
        const id = String(f.properties?.id ?? '')
        if (id && !failedRef.current.has(id)) request(id)
      }
    }
    readInView()
    map.on('idle', readInView)
    return () => {
      map.off('idle', readInView)
    }
  }, [map, loadLine, request])
  const fullIds = useMemo(() => new Set(lines.keys()), [lines])

  // What a tap where directions overlap keeps to: what is lit — but with a
  // card picked, everything shown, so the taps of 2026-09-25 below keep to
  // the way round the list shows. The click handler is bound once; this is
  // how it reads it.
  const shown = useMemo(
    () => (selectedId || showing.length === 0 ? lit : showing.map((v) => v.id)),
    [selectedId, lit, showing],
  )
  const shownRef = useRef<readonly string[]>([])
  useEffect(() => {
    shownRef.current = shown
  }, [shown])

  // ----------------------------------------------------------------- events

  useEffect(() => {
    if (!map || !map.getLayer(HIT)) return
    const canvas = map.getCanvas()

    // One handler, one box. A finger is wider than a pixel, so we ask what is
    // near the tap: nothing deselects, one route opens its card, several
    // things — routes, hotspots or both — go to the list, the routes lit the
    // way round it shows them. The candidates are whole routes, slots
    // included, so the studio's rows can say "return not mapped yet".
    // The stops hook reads the same tap and keeps its own half.
    const onMapClick = (e: MapMouseEvent) => {
      if (drawingRef.current) return
      // Whatever the tap opens, the card picked before it is let go.
      setHighlight(null)
      const out = resolveTap(tapTargets(map, e.point, e.originalEvent))
      const all = [...byId.current.values()]
      if (out.kind === 'route') {
        // The line under the finger wins: where a route's two directions run
        // on different roads, tapping the other one must open it (the owner's
        // check, 2026-09-22). Where both overlap, the one already shown stays
        // (the owner's ask of 2026-09-25: a tap on the lit Novaliches → Tala
        // opened Tala → Novaliches); with neither shown, the outbound rule
        // decides.
        const under = out.routeIds.map((id) => byId.current.get(id)).filter((v) => !!v)
        const routeId = under[0]?.route_id
        const open =
          under.length === 1
            ? under[0]!
            : (under.find((v) => shownRef.current.includes(v.id)) ?? directionToOpen(all.filter((v) => v.route_id === routeId)))
        setSelectedId(open?.id ?? null)
        setCandidates([])
      } else if (out.kind === 'several') {
        const keys = new Set(out.routeKeys)
        setSelectedId(null)
        setCandidates(all.filter((v) => keys.has(v.route_id)))
        // The way round under the finger, as for one route: outbound where an
        // outbound line was hit, the way back where only ways back were — so
        // a tap on the light-blue way back switches to it (the owner's
        // report, 2026-09-25) — and, where a line shown was hit, the way
        // round already shown.
        const hit = out.routeIds.map((id) => byId.current.get(id)).filter((v) => !!v)
        const shownHit = hit.find((v) => shownRef.current.includes(v.id))
        setBack(shownHit ? shownHit.reversed : hit.length > 0 && hit.every((v) => v.reversed))
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

  return {
    variants,
    /** The directions whose full line has been read (the public map); none on the editor, which reads its own. */
    fullIds,
    error,
    loading,
    reload,
    selected,
    select,
    openList,
    candidates,
    back,
    flip,
    highlight,
    highlightCard: setHighlight,
    showCard: setCardShows,
    lit,
    litVariants,
  }
}
