import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { variantLine, type LineStringGeoJSON, type VariantSummary } from '../model/routes'
import type { Livery } from '../model/liveries'
import { ROUTES_LINE, useSavedRoutesLayers } from './savedRoutesLayers'
import { litOf, shownOf, showingOf, steady } from './routesShown'
import { useRouteTaps } from './routeTaps'

/**
 * The RouteCard picked in a list of them — the route list's, or a hotspot's
 * card's (`where`) — by its place, the directions its rows list, and the
 * colour it wears: what the map lights while no trip is open, and in what
 * (the owner, 2026-09-29).
 */
/**
 * From this zoom a pixel is a couple of metres, and an overview's corners
 * show: the directions on screen get their full lines, as a lit one does.
 */
const FULL_LINES_FROM = 15

export type Highlight = { where: 'list' | 'hotspot'; from: string; ids: readonly string[]; livery: Livery }

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
 * Both pass `loadLine`: their lists carry each direction's overview (the
 * public map's file, mapFile.ts; the editor's tables, 0009), and a
 * direction's full line is read when it is lit or chosen, or on screen at
 * street zoom (the public map's loadLine; the editor's lineOf, live.ts).
 * From then on `variants` carries that line in its `shape` — so the orange
 * stretches, the chevrons, the ride-cut and the babaan sides all work on the
 * line itself — and the map draws it in place of the overview. The editor
 * still reads a line itself for what it opens to edit (live.ts, linesOf).
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
   * null once it closes.
   */
  const [cardShows, setCardShows] = useState<readonly string[] | null>(null)
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

  // What is shown and what is lit (routesShown.ts).
  const showing = useMemo(() => showingOf(candidates, back, variants, cardShows), [candidates, back, variants, cardShows])
  // Each kept one array while it holds the same (steady): an unrelated
  // line's arrival lights nothing new, and the chevrons flow on.
  const litNow = useMemo(
    () => litOf(selectedId, highlight?.ids ?? null, variants, showing),
    [selectedId, variants, highlight, showing],
  )
  const litKept = useRef(litNow)
  const litVariants = (litKept.current = steady(litKept.current, litNow))
  const litIdsNow = useMemo(() => litVariants.map((v) => v.id), [litVariants])
  const litIdsKept = useRef(litIdsNow)
  const lit = (litIdsKept.current = steady(litIdsKept.current, litIdsNow))

  // ----------------------------------------------------------------- layers

  useSavedRoutesLayers(map, rows, lines, opts.hiddenVariantId, lit)

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

  // Reading a direction's full line, once. One that failed (offline, never
  // stored) is asked again when it lights, not at every look at the screen.
  const loadLine = opts.loadLine
  // Only a drawn direction has a line to read. A slot (a return not drawn
  // yet) opened by a trip link (?r=, since taken out) asked for
  // /data/lines/<id>.json, which is not there; the host answers a missing
  // file with the page, 200, and that was kept as the line (review of
  // 2026-10-03, finding 10).
  const drawn = useMemo(() => new Set(rows.filter((v) => variantLine(v).length > 1).map((v) => v.id)), [rows])
  const request = useCallback(
    (id: string) => {
      if (!loadLine || requestedRef.current.has(id) || !drawn.has(id)) return
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
    [loadLine, drawn],
  )

  // What is lit, and the chosen direction, get their full lines: asked
  // whenever what is lit is worked out again (litNow), as when `lit` itself
  // was new each time, before it was kept (steady). So a lit line whose read
  // failed is asked for again as before: as it lights, and as any other
  // line arrives.
  useEffect(() => {
    for (const id of selectedId ? [...lit, selectedId] : lit) request(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, litNow, selectedId])

  // So do the directions on screen at street zoom, where an overview's
  // corners would show: a resting line on a street is drawn as it was drawn
  // (the owner's look of 2026-09-25). Looked at whenever the map settles.
  useEffect(() => {
    if (!map || !loadLine) return
    const readInView = () => {
      if (map.getZoom() < FULL_LINES_FROM || !map.getLayer(ROUTES_LINE)) return
      for (const f of map.queryRenderedFeatures({ layers: [ROUTES_LINE] })) {
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

  // The click handler is bound once; this is how it reads what a tap where
  // directions overlap keeps to (routesShown.ts).
  const shown = useMemo(() => shownOf(selectedId, lit, showing), [selectedId, lit, showing])
  const shownRef = useRef<readonly string[]>([])
  useEffect(() => {
    shownRef.current = shown
  }, [shown])

  // ----------------------------------------------------------------- events

  useRouteTaps(
    map,
    { drawing: drawingRef, byId, shown: shownRef },
    { highlight: setHighlight, selectedId: setSelectedId, candidates: setCandidates, back: setBack },
  )

  const selected = variants.find((v) => v.id === selectedId) ?? null

  return {
    variants,
    /** The directions whose full line has been read, on either map (`loadLine`). */
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
