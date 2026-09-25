import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GeoJSONSource, MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import {
  joinSegments,
  lineLength,
  type LngLat,
  type Segment,
  type SnapMode,
} from '../shared/geo'
import { HOTSPOT_COLOUR } from '../shared/colours'
import { findUTurns, snapSegments, straightSegment } from './snap'
import { variantLine, type VariantDrawing } from '../shared/routes'
import { cutAt, nearestSpot, reverseDrawing, type BorrowPart, type LineSpot } from './borrow'
import { ROUTES_HIT_LAYER } from '../shared/tap'

const EMPTY = { type: 'FeatureCollection', features: [] } as const

/**
 * An in-progress drawing lives here until it is saved or discarded. Signing in
 * via magic link reloads the page, and a refresh is one keystroke away; either
 * would otherwise throw away twenty minutes of clicking.
 */
const DRAFT_KEY = 'parapo.draft.v1'

type Target = { routeId: string | null; variantId: string | null }

/** Which kind of hotspot an area trace will become. */
export type HotspotKind = 'terminal' | 'hintuan'

/**
 * Set while tracing a hotspot instead of a route. The same click / drag /
 * insert / delete / undo machinery runs; the differences are that every edge
 * is a straight line (no router), the ring closes itself, and a fill is drawn.
 * `stopId` is the saved hotspot being edited, or null for a new one.
 */
export type AreaTarget = { kind: HotspotKind; stopId: string | null }

/**
 * Set once a drawing has taken over part of a saved direction (Extend): which
 * one, and which part. What the save records, so a later change to the parent
 * can offer to follow into this line.
 */
export type Borrow = { variantId: string; part: BorrowPart }

/**
 * Set while choosing where a new route leaves a saved direction, before any
 * of it is taken: the direction, and the spot tapped on it so far.
 */
export type Picking = { variant: VariantDrawing; spot: LineSpot | null }

/** A gap still waiting for the router when the draft was written is marked `pending`. */
type DraftSegment = Segment & { pending?: boolean }

type Draft = {
  controlPoints: LngLat[]
  segments: DraftSegment[]
  target: Target
  area?: AreaTarget | null
  borrow?: Borrow | null
  /** Index of the join point, when new points go in before a borrowed end. */
  join?: number | null
}

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Draft
    return Array.isArray(d.controlPoints) && d.controlPoints.length > 0 ? d : null
  } catch {
    return null
  }
}

const LINE_SRC = 'draw-line'
const POINT_SRC = 'draw-points'
const AREA_SRC = 'draw-area'
const UTURN_SRC = 'draw-uturns'
const BORROW_SRC = 'draw-borrow'
const POINT_LAYER = 'draw-point-dots'
const HIT_LAYER = 'draw-line-hit'
const AREA_FILL_LAYER = 'draw-area-fill'

const ROUTE_COLOUR = '#e11d48'
const UTURN_COLOUR = '#f59e0b'

const BORROW_COLOUR = '#2563eb'

/** A tap this many pixels off the line being extended does not pick a spot on it. */
const PICK_PX = 40

/** The closing edge of an area is a feature in the line source with this index. */
const CLOSING = -1

type IndexedFeature = { properties?: { index?: number } }

/** A router request still wanted: the stand-ins its answer will replace. */
type Request = { standIns: Segment[]; controller: AbortController }

export type Drawing = ReturnType<typeof useDrawing>

export function useDrawing(
  map: MapLibreMap | null,
  opts: {
    /**
     * A right-click on saved lines while drawing a route: the directions under
     * it and where. The studio decides which one is meant and calls `connect`.
     */
    onFollow?: (variantIds: string[], at: LngLat) => void
  } = {},
) {
  const [drawing, setDrawing] = useState(false)
  const [controlPoints, setControlPoints] = useState<LngLat[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [snapping, setSnapping] = useState(0)
  const [freehand, setFreehand] = useState(false)
  /** What a save will write to: an existing direction, a new direction on an
   *  existing route, or (both null) a brand-new route. */
  const [target, setTarget] = useState<Target>({
    routeId: null,
    variantId: null,
  })
  /** Non-null while tracing a hotspot rather than a route. */
  const [area, setArea] = useState<AreaTarget | null>(null)
  /** Non-null once part of a saved direction has been taken over (Extend). */
  const [borrow, setBorrow] = useState<Borrow | null>(null)
  /** Non-null while choosing where a new route leaves a saved direction. */
  const [picking, setPicking] = useState<Picking | null>(null)

  // Map event handlers are registered once and must always see current state,
  // so every mutator updates these refs synchronously.
  const cpRef = useRef<LngLat[]>([])
  const segRef = useRef<Segment[]>([])
  const freehandRef = useRef(false)
  freehandRef.current = freehand
  const areaRef = useRef<AreaTarget | null>(null)
  areaRef.current = area
  const pickingRef = useRef<Picking | null>(null)
  pickingRef.current = picking
  /**
   * The point where a kept *end* begins, when a new route joins a saved one
   * there. New clicks go in just before it rather than after the last point,
   * so the owner draws forwards — from where the jeep starts to where it
   * joins — and the line stays joined to the borrowed end the whole time.
   * Held by identity: a drag replaces it (see onDragMove); deleting it
   * returns the drawing to plain appending.
   */
  const joinRef = useRef<LngLat | null>(null)
  const borrowRef = useRef<Borrow | null>(null)
  borrowRef.current = borrow
  const followRef = useRef(opts.onFollow)
  followRef.current = opts.onFollow
  /**
   * The first and last points a right-click added by joining a saved line.
   * While the last is still the drawing's last, Undo takes the whole join
   * back in one step rather than one borrowed point at a time.
   */
  const connectedRef = useRef<{ spot: LngLat; end: LngLat } | null>(null)

  /**
   * Straight stand-ins: drawn while the router is asked, and while a point is
   * dragged. A router answer is written only where its stand-in still is, no
   * U-turn is ever reported against one, and none can be saved.
   */
  const standInRef = useRef(new WeakSet<Segment>())
  const requestsRef = useRef(new Set<Request>())

  const writeSegments = useCallback((next: Segment[]) => {
    segRef.current = next
    setSegments(next)
    // A request whose stand-ins are all gone has nowhere to write: stop it,
    // and give its place in the router queue to one that is still wanted.
    for (const request of requestsRef.current) {
      if (!request.standIns.some((s) => next.includes(s))) {
        request.controller.abort()
        requestsRef.current.delete(request)
      }
    }
  }, [])

  const writeSegment = useCallback(
    (i: number, seg: Segment) => {
      const next = [...segRef.current]
      next[i] = seg
      writeSegments(next)
    },
    [writeSegments],
  )

  const writePoints = useCallback((pts: LngLat[]) => {
    cpRef.current = pts
    setControlPoints(pts)
  }, [])

  /**
   * Resolve the gaps that start at control point `first`, one per mode given.
   *
   * Adjacent routed gaps go to the router as one request. Until it answers,
   * each shows a straight stand-in, and the answer is written wherever that
   * stand-in is by then: moved along if a point was inserted or deleted before
   * it, dropped if it is gone (the point dragged again, the stretch
   * straightened, the point undone, another route opened) — in which case the
   * request is called off too.
   */
  const resolveGaps = useCallback(
    async (first: number, modes: SnapMode[]) => {
      const pts = cpRef.current.slice(first, first + modes.length + 1)
      if (modes.length === 0 || pts.length < modes.length + 1) return

      // A hotspot's edges are never routed: it is an outline, not a path.
      const routed = modes.map((mode) => mode === 'snapped' && !areaRef.current)
      const next = [...segRef.current]
      const standIns = modes.map((_, k) => {
        if (!routed[k]) {
          next[first + k] = straightSegment(pts[k], pts[k + 1])
          return null
        }
        const seg: Segment = { snap: 'snapped', coordinates: [pts[k], pts[k + 1]] }
        standInRef.current.add(seg)
        next[first + k] = seg
        return seg
      })
      writeSegments(next)

      // Runs of adjacent routed gaps, as [from, to] offsets from `first`.
      const runs: [number, number][] = []
      routed.forEach((r, k) => {
        if (!r) return
        const last = runs[runs.length - 1]
        if (last && last[1] === k - 1) last[1] = k
        else runs.push([k, k])
      })

      await Promise.all(
        runs.map(async ([a, b]) => {
          const request: Request = {
            standIns: standIns.slice(a, b + 1) as Segment[],
            controller: new AbortController(),
          }
          requestsRef.current.add(request)
          setSnapping((n) => n + 1)
          try {
            const answer = await snapSegments(pts.slice(a, b + 2), request.controller.signal)
            answer.forEach((seg, j) => {
              const at = segRef.current.indexOf(request.standIns[j])
              if (at !== -1) writeSegment(at, seg)
            })
          } catch (err) {
            if (!(err instanceof Error && err.name === 'AbortError')) throw err
          } finally {
            requestsRef.current.delete(request)
            setSnapping((n) => n - 1)
          }
        }),
      )
    },
    [writeSegment, writeSegments],
  )

  const addPoint = useCallback(
    async (point: LngLat) => {
      const mode: SnapMode = freehandRef.current ? 'freehand' : 'snapped'
      const join = joinRef.current ? cpRef.current.indexOf(joinRef.current) : -1
      if (join !== -1 && !areaRef.current) {
        // Before a borrowed end: the new point goes in just ahead of the join,
        // and both gaps it touches are new drawing.
        const pts = [...cpRef.current]
        pts.splice(join, 0, point)
        writePoints(pts)
        const segs = [...segRef.current]
        if (join === 0) segs.unshift(straightSegment(point, pts[1]))
        else segs.splice(join - 1, 1, straightSegment(pts[join - 1], point), straightSegment(point, pts[join + 1]))
        writeSegments(segs)
        await resolveGaps(join === 0 ? 0 : join - 1, join === 0 ? [mode] : [mode, mode])
        return
      }
      const prevLen = cpRef.current.length
      writePoints([...cpRef.current, point])
      if (prevLen === 0) return
      await resolveGaps(prevLen - 1, [mode])
    },
    [resolveGaps, writePoints, writeSegments],
  )

  /** Split a segment by dropping a new control point into it. */
  const insertPoint = useCallback(
    async (gap: number, point: LngLat) => {
      const mode: SnapMode = segRef.current[gap]?.snap ?? 'snapped'
      const pts = [...cpRef.current]
      pts.splice(gap + 1, 0, point)
      writePoints(pts)

      const segs = [...segRef.current]
      segs.splice(gap, 1, straightSegment(pts[gap], point), straightSegment(point, pts[gap + 2]))
      writeSegments(segs)

      await resolveGaps(gap, [mode, mode])
    },
    [resolveGaps, writePoints, writeSegments],
  )

  /** Remove a control point, healing the two segments around it into one. */
  const deletePoint = useCallback(
    async (idx: number) => {
      const origLen = cpRef.current.length
      const modeBefore = segRef.current[idx - 1]?.snap
      const modeAfter = segRef.current[idx]?.snap

      const pts = [...cpRef.current]
      pts.splice(idx, 1)
      writePoints(pts)

      const segs = [...segRef.current]
      if (idx === 0) segs.splice(0, 1)
      else if (idx === origLen - 1) segs.splice(segs.length - 1, 1)
      else segs.splice(idx - 1, 2, straightSegment(pts[idx - 1], pts[idx]))
      writeSegments(segs)

      if (idx > 0 && idx < pts.length) {
        await resolveGaps(idx - 1, [modeBefore ?? modeAfter ?? 'snapped'])
      }
    },
    [resolveGaps, writePoints, writeSegments],
  )

  /**
   * Flip one segment between routed and straight. This is the escape hatch for
   * a stretch the router refuses, and the retry for one where it failed.
   */
  const toggleSegment = useCallback(
    async (gap: number) => {
      const current: SnapMode = segRef.current[gap]?.snap ?? 'snapped'
      await resolveGaps(gap, [current === 'snapped' ? 'freehand' : 'snapped'])
    },
    [resolveGaps],
  )

  const undo = useCallback(() => {
    // Straight after a join, Undo takes the whole join back.
    const joined = connectedRef.current
    const pts = cpRef.current
    if (joined && pts[pts.length - 1] === joined.end) {
      const at = pts.indexOf(joined.spot)
      if (at > 0) {
        connectedRef.current = null
        writePoints(pts.slice(0, at))
        writeSegments(segRef.current.slice(0, at - 1))
        setBorrow(null)
        return
      }
    }
    const join = joinRef.current ? cpRef.current.indexOf(joinRef.current) : -1
    // Before a borrowed end, the last point drawn is the one just ahead of the
    // join. With none drawn yet there is nothing of the owner's to take back.
    if (join !== -1) {
      if (join > 0) void deletePoint(join - 1)
      return
    }
    writePoints(cpRef.current.slice(0, -1))
    writeSegments(segRef.current.slice(0, -1))
  }, [deletePoint, writePoints, writeSegments])

  const reset = useCallback(() => {
    writePoints([])
    writeSegments([])
    setBorrow(null)
    setPicking(null)
    pickingRef.current = null
    joinRef.current = null
    connectedRef.current = null
  }, [writePoints, writeSegments])

  /** Begin a new direction — of an existing route when routeId is given. */
  const start = useCallback(
    (routeId?: string | null) => {
      reset()
      setFreehand(false)
      setArea(null)
      areaRef.current = null
      setTarget({ routeId: typeof routeId === 'string' ? routeId : null, variantId: null })
      setDrawing(true)
    },
    [reset],
  )

  /** Open a saved direction for editing: its row with its drawing (live.ts withDrawing). */
  const load = useCallback(
    (v: VariantDrawing) => {
      reset()
      writePoints(v.control_points ?? [])
      writeSegments(v.segments ?? [])
      setFreehand(false)
      setArea(null)
      areaRef.current = null
      setTarget({ routeId: v.route_id, variantId: v.id })
      setDrawing(true)
    },
    [reset, writePoints, writeSegments],
  )

  /**
   * Begin a new route from a saved direction (Extend): the owner taps where
   * the new route leaves it, then keeps the part before or after that spot.
   */
  const startExtend = useCallback(
    (v: VariantDrawing) => {
      reset()
      setFreehand(false)
      setArea(null)
      areaRef.current = null
      setTarget({ routeId: null, variantId: null })
      const p = { variant: v, spot: null }
      setPicking(p)
      pickingRef.current = p
      setDrawing(true)
    },
    [reset],
  )

  /**
   * Take over one side of the picked spot. The kept part becomes ordinary
   * control points and segments — a copy, editable like any drawing. Keeping
   * the start, new clicks carry on from the spot; keeping the end, they are
   * drawn from where the new route starts and join it at the spot.
   */
  const keep = useCallback(
    (part: BorrowPart) => {
      const p = pickingRef.current
      if (!p?.spot) return
      const cut = cutAt(p.variant.control_points ?? [], p.variant.segments ?? [], p.spot, part)
      writePoints(cut.controlPoints)
      writeSegments(cut.segments)
      joinRef.current = part === 'end' ? (cut.controlPoints[0] ?? null) : null
      setBorrow({ variantId: p.variant.id, part })
      setPicking(null)
      pickingRef.current = null
    },
    [writePoints, writeSegments],
  )

  /**
   * Join a saved direction where the owner right-clicked it, and follow it to
   * its end: a routed gap from the drawing's last point to the spot, then a
   * copy of the rest of that line. For a return trip that meets another
   * route's line and rides it home. `backwards` when that line was stored
   * from its far end, so the copy is turned to run the way the jeep goes.
   *
   * Returns a sentence for the owner when it cannot join, or null.
   */
  /**
   * Whether a join can start now, asked before the line's drawing is fetched
   * (live.ts withDrawing), so the owner hears "draw first" at once rather
   * than after a request. `go` false with no problem: nothing to say, as when
   * tracing a hotspot. `connect` asks the same again when the drawing lands.
   */
  const joinGate = useCallback((): { go: boolean; problem: string | null } => {
    if (areaRef.current || pickingRef.current) return { go: false, problem: null }
    if (cpRef.current.length === 0) {
      return { go: false, problem: 'Draw from where the jeep starts first, then right-click the line it joins.' }
    }
    if (joinRef.current || borrowRef.current) {
      return { go: false, problem: 'This drawing already follows part of another line. One per drawing, for now.' }
    }
    return { go: true, problem: null }
  }, [])

  const connect = useCallback(
    (v: VariantDrawing, at: LngLat, backwards: boolean): string | null => {
      const gate = joinGate()
      if (!gate.go) return gate.problem
      const cp = v.control_points ?? []
      const segs = v.segments ?? []
      const src = backwards ? reverseDrawing(cp, segs) : { controlPoints: cp, segments: segs }
      const spot = nearestSpot(src.segments, at)
      if (!spot) return null
      const cut = cutAt(src.controlPoints, src.segments, spot, 'end')
      if (cut.segments.length === 0) return 'That is the very end of the line: nothing left to follow.'

      const gap = cpRef.current.length - 1
      const last = cpRef.current[gap]
      writePoints([...cpRef.current, ...cut.controlPoints])
      writeSegments([...segRef.current, straightSegment(last, cut.controlPoints[0]), ...cut.segments])
      connectedRef.current = { spot: cut.controlPoints[0], end: cut.controlPoints[cut.controlPoints.length - 1] }
      setBorrow({ variantId: v.id, part: 'end' })
      void resolveGaps(gap, [freehandRef.current ? 'freehand' : 'snapped'])
      return null
    },
    [joinGate, resolveGaps, writePoints, writeSegments],
  )

  /** Begin tracing a hotspot outline. */
  const startArea = useCallback(
    (kind: HotspotKind) => {
      reset()
      setFreehand(false)
      const a = { kind, stopId: null }
      setArea(a)
      areaRef.current = a
      setTarget({ routeId: null, variantId: null })
      setDrawing(true)
    },
    [reset],
  )

  /** Open a saved hotspot's outline for editing. */
  const loadArea = useCallback(
    (kind: HotspotKind, stopId: string, ring: LngLat[]) => {
      reset()
      const a = { kind, stopId }
      setArea(a)
      areaRef.current = a
      writePoints(ring)
      const segs: Segment[] = []
      for (let i = 1; i < ring.length; i++) segs.push(straightSegment(ring[i - 1], ring[i]))
      writeSegments(segs)
      setFreehand(false)
      setTarget({ routeId: null, variantId: null })
      setDrawing(true)
    },
    [reset, writePoints, writeSegments],
  )

  const cancel = useCallback(() => {
    setDrawing(false)
    reset()
    setTarget({ routeId: null, variantId: null })
    setArea(null)
    areaRef.current = null
  }, [reset])

  // ------------------------------------------------------------------ draft

  // Once per page: development's StrictMode runs effects twice, which would ask
  // the router for every pending gap twice.
  const restoredRef = useRef(false)

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const d = readDraft()
    if (!d) return
    const a = d.area ?? null
    setArea(a)
    areaRef.current = a
    const saved = d.segments ?? []
    writePoints(d.controlPoints)
    writeSegments(saved.map((s) => (s?.pending ? { snap: s.snap, coordinates: s.coordinates } : s)))
    setTarget(d.target ?? { routeId: null, variantId: null })
    setBorrow(d.borrow ?? null)
    joinRef.current = typeof d.join === 'number' ? (d.controlPoints[d.join] ?? null) : null
    setDrawing(true)

    // Gaps still waiting for the router when the page went away: their answers
    // went with it, so ask again, adjacent ones in one request as before.
    if (a) return
    let from = -1
    saved.forEach((s, i) => {
      const pending = !!s?.pending
      if (pending && from === -1) from = i
      if (from === -1 || (pending && i < saved.length - 1)) return
      const to = pending ? i : i - 1
      void resolveGaps(from, new Array<SnapMode>(to - from + 1).fill('snapped'))
      from = -1
    })
  }, [writePoints, writeSegments, resolveGaps])

  useEffect(() => {
    try {
      if (drawing && controlPoints.length > 0) {
        const marked: DraftSegment[] = segments.map((s) =>
          s && standInRef.current.has(s) ? { ...s, pending: true } : s,
        )
        const join = joinRef.current ? controlPoints.indexOf(joinRef.current) : -1
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ controlPoints, segments: marked, target, area, borrow, join: join === -1 ? null : join }),
        )
      } else if (!drawing) {
        localStorage.removeItem(DRAFT_KEY)
      }
    } catch {
      /* storage unavailable: drafts simply do not persist */
    }
  }, [drawing, controlPoints, segments, target, area, borrow])

  // ----------------------------------------------------------------- layers

  useEffect(() => {
    if (!map || map.getSource(LINE_SRC)) return

    map.addSource(LINE_SRC, { type: 'geojson', data: EMPTY })
    map.addSource(POINT_SRC, { type: 'geojson', data: EMPTY })
    map.addSource(AREA_SRC, { type: 'geojson', data: EMPTY })
    map.addSource(UTURN_SRC, { type: 'geojson', data: EMPTY })
    map.addSource(BORROW_SRC, { type: 'geojson', data: EMPTY })

    // The hotspot fill sits under its own outline and under the route layers.
    map.addLayer({
      id: AREA_FILL_LAYER,
      type: 'fill',
      source: AREA_SRC,
      paint: { 'fill-color': ROUTE_COLOUR, 'fill-opacity': 0.18 },
    })
    // The direction being extended, while its spot is picked: wide and pale,
    // so the tap has something to land on, with the spot as a ringed dot.
    map.addLayer({
      id: 'draw-borrow-line',
      type: 'line',
      source: BORROW_SRC,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': BORROW_COLOUR, 'line-width': 10, 'line-opacity': 0.35 },
    })
    map.addLayer({
      id: 'draw-borrow-spot',
      type: 'circle',
      source: BORROW_SRC,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 8,
        'circle-color': '#ffffff',
        'circle-stroke-color': BORROW_COLOUR,
        'circle-stroke-width': 3,
      },
    })
    map.addLayer({
      id: 'draw-line-casing',
      type: 'line',
      source: LINE_SRC,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.9 },
    })
    // Routed and freehand are separate layers because line-dasharray cannot be
    // driven by a feature property.
    map.addLayer({
      id: 'draw-line-snapped',
      type: 'line',
      source: LINE_SRC,
      filter: ['==', ['get', 'snap'], 'snapped'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#e11d48', 'line-width': 4 },
    })
    map.addLayer({
      id: 'draw-line-freehand',
      type: 'line',
      source: LINE_SRC,
      filter: ['==', ['get', 'snap'], 'freehand'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#e11d48',
        'line-width': 4,
        'line-dasharray': [2, 1.5],
      },
    })
    // Where the route turns back on itself, the doubled-back stretch overlaps
    // or runs beside the line and would be invisible. Paint it amber over it.
    map.addLayer({
      id: 'draw-uturn-stub',
      type: 'line',
      source: UTURN_SRC,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': UTURN_COLOUR, 'line-width': 5 },
    })
    // A 4px line is far too thin to hit reliably; this invisible one is not.
    map.addLayer({
      id: HIT_LAYER,
      type: 'line',
      source: LINE_SRC,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#000000', 'line-width': 22, 'line-opacity': 0 },
    })
    // …and ring the control point it turns at.
    map.addLayer({
      id: 'draw-uturn-ring',
      type: 'circle',
      source: UTURN_SRC,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 12,
        'circle-opacity': 0,
        'circle-stroke-color': UTURN_COLOUR,
        'circle-stroke-width': 3,
      },
    })
    map.addLayer({
      id: POINT_LAYER,
      type: 'circle',
      source: POINT_SRC,
      paint: {
        'circle-radius': 6,
        'circle-color': '#ffffff',
        'circle-stroke-color': '#e11d48',
        'circle-stroke-width': 2.5,
      },
    })
  }, [map])

  // ----------------------------------------------------------------- events

  useEffect(() => {
    if (!map || !drawing) return
    if (!map.getLayer(POINT_LAYER) || !map.getLayer(HIT_LAYER)) return

    const canvas = map.getCanvas()
    canvas.style.cursor = 'crosshair'

    // Shift+drag is MapLibre's box zoom and it swallows shift+click, which is
    // our "straighten this segment" gesture. Double-click zoom would fire on a
    // quick pair of route clicks. Neither belongs in drawing mode.
    map.boxZoom.disable()
    map.doubleClickZoom.disable()

    // Clicking empty map appends a point; clicking the route itself does not.
    const onMapClick = (e: MapMouseEvent) => {
      // Choosing where a new route leaves a saved one: a tap near its line
      // picks the nearest spot on it; a tap elsewhere is ignored.
      const p = pickingRef.current
      if (p) {
        const spot = nearestSpot(p.variant.segments ?? [], [e.lngLat.lng, e.lngLat.lat])
        if (!spot) return
        const px = map.project(spot.point)
        if (Math.hypot(px.x - e.point.x, px.y - e.point.y) > PICK_PX) return
        const next = { variant: p.variant, spot }
        pickingRef.current = next
        setPicking(next)
        return
      }
      const hits = map.queryRenderedFeatures(e.point, {
        layers: [POINT_LAYER, HIT_LAYER],
      })
      if (hits.length > 0) return
      void addPoint([e.lngLat.lng, e.lngLat.lat])
    }

    const onLineClick = (e: MapMouseEvent & { features?: IndexedFeature[] }) => {
      // A click on a point's dot is a press on that point, not a click on the
      // line beneath it: inserting here would stack a second point on the first.
      if (map.queryRenderedFeatures(e.point, { layers: [POINT_LAYER] }).length > 0) return
      const gap = e.features?.[0]?.properties?.index
      if (typeof gap !== 'number') return
      // Clicking the closing edge of a hotspot appends a corner: the ring
      // re-closes through the new point, which is what "insert here" means
      // on that edge. Nothing to straighten — area edges are already straight.
      if (gap === CLOSING) {
        if (!e.originalEvent.shiftKey) void addPoint([e.lngLat.lng, e.lngLat.lat])
        return
      }
      if (e.originalEvent.shiftKey) {
        if (!areaRef.current) void toggleSegment(gap)
      } else void insertPoint(gap, [e.lngLat.lng, e.lngLat.lat])
    }

    const onPointContext = (e: MapMouseEvent & { features?: IndexedFeature[] }) => {
      e.preventDefault()
      const idx = e.features?.[0]?.properties?.index
      if (typeof idx === 'number') void deletePoint(idx)
    }

    // A right-click on a saved line — not on one of the drawing's points,
    // which deletes it — asks to join that line and follow it to its end.
    const onMapContext = (e: MapMouseEvent) => {
      if (areaRef.current || pickingRef.current || !followRef.current) return
      if (!map.getLayer(ROUTES_HIT_LAYER)) return
      if (map.queryRenderedFeatures(e.point, { layers: [POINT_LAYER] }).length > 0) return
      const ids = [
        ...new Set(
          map
            .queryRenderedFeatures(e.point, { layers: [ROUTES_HIT_LAYER] })
            .map((f) => f.properties?.id)
            .filter((id): id is string => typeof id === 'string'),
        ),
      ]
      if (ids.length === 0) return
      e.preventDefault()
      followRef.current(ids, [e.lngLat.lng, e.lngLat.lat])
    }

    let dragIdx: number | null = null
    let dragMoved = false
    let dragModes: [SnapMode | undefined, SnapMode | undefined] = [
      undefined,
      undefined,
    ]

    const onDragMove = (e: MapMouseEvent) => {
      const i = dragIdx
      if (i === null) return
      dragMoved = true
      const point: LngLat = [e.lngLat.lng, e.lngLat.lat]
      const pts = [...cpRef.current]
      if (pts[i] === joinRef.current) joinRef.current = point
      pts[i] = point
      writePoints(pts)

      // Rubber-band the two neighbours while dragging; they re-route on release.
      const next = [...segRef.current]
      if (i > 0 && pts[i - 1]) {
        next[i - 1] = { snap: dragModes[0] ?? 'snapped', coordinates: [pts[i - 1], point] }
        standInRef.current.add(next[i - 1])
      }
      if (i < pts.length - 1 && pts[i + 1]) {
        next[i] = { snap: dragModes[1] ?? 'snapped', coordinates: [point, pts[i + 1]] }
        standInRef.current.add(next[i])
      }
      writeSegments(next)
    }

    const onDragEnd = () => {
      const i = dragIdx
      dragIdx = null
      map.off('mousemove', onDragMove)
      map.off('mouseup', onDragEnd)
      document.removeEventListener('mouseup', onDragEnd)
      canvas.style.cursor = 'crosshair'
      map.dragPan.enable()
      // A press and release that never moved is not an edit: both segments are
      // still right, so the router is not asked again.
      if (i === null || !dragMoved) return
      // Only the two segments touching the moved point are stale, and they go
      // to the router together, as one request.
      const before = dragModes[0] ?? 'snapped'
      const after = dragModes[1] ?? 'snapped'
      const last = cpRef.current.length - 1
      if (i > 0 && i < last) void resolveGaps(i - 1, [before, after])
      else if (i > 0) void resolveGaps(i - 1, [before])
      else if (i < last) void resolveGaps(i, [after])
    }

    const onPointDown = (e: MapMouseEvent & { features?: IndexedFeature[] }) => {
      const idx = e.features?.[0]?.properties?.index
      if (typeof idx !== 'number') return
      // Left button only. A right-click must reach the contextmenu handler;
      // starting a drag here would swallow it.
      if (e.originalEvent.button !== 0) return
      e.preventDefault()
      dragIdx = idx
      dragMoved = false
      dragModes = [segRef.current[idx - 1]?.snap, segRef.current[idx]?.snap]
      canvas.style.cursor = 'grabbing'
      map.dragPan.disable()
      map.on('mousemove', onDragMove)
      map.once('mouseup', onDragEnd)
      // MapLibre reports mouseup only over the map. Released over the toolbar,
      // the drag would never end and its stand-ins would stay.
      document.addEventListener('mouseup', onDragEnd)
    }

    const enterPoint = () => {
      if (dragIdx === null) canvas.style.cursor = 'grab'
    }
    const enterLine = () => {
      if (dragIdx === null) canvas.style.cursor = 'copy'
    }
    const leave = () => {
      if (dragIdx === null) canvas.style.cursor = 'crosshair'
    }

    map.on('click', onMapClick)
    map.on('click', HIT_LAYER, onLineClick)
    map.on('mousedown', POINT_LAYER, onPointDown)
    map.on('contextmenu', POINT_LAYER, onPointContext)
    map.on('contextmenu', onMapContext)
    map.on('mouseenter', POINT_LAYER, enterPoint)
    map.on('mouseleave', POINT_LAYER, leave)
    map.on('mouseenter', HIT_LAYER, enterLine)
    map.on('mouseleave', HIT_LAYER, leave)

    return () => {
      map.off('click', onMapClick)
      map.off('click', HIT_LAYER, onLineClick)
      map.off('mousedown', POINT_LAYER, onPointDown)
      map.off('contextmenu', POINT_LAYER, onPointContext)
      map.off('contextmenu', onMapContext)
      map.off('mouseenter', POINT_LAYER, enterPoint)
      map.off('mouseleave', POINT_LAYER, leave)
      map.off('mouseenter', HIT_LAYER, enterLine)
      map.off('mouseleave', HIT_LAYER, leave)
      map.off('mousemove', onDragMove)
      map.off('mouseup', onDragEnd)
      document.removeEventListener('mouseup', onDragEnd)
      map.dragPan.enable()
      map.boxZoom.enable()
      map.doubleClickZoom.enable()
      canvas.style.cursor = ''
    }
  }, [
    map,
    drawing,
    addPoint,
    insertPoint,
    deletePoint,
    toggleSegment,
    resolveGaps,
    writePoints,
    writeSegments,
  ])

  // -------------------------------------------------------------- rendering

  const line = useMemo(() => joinSegments(segments), [segments])

  /** Control points where the route turns back on itself. Shown, never changed. */
  const uTurns = useMemo(
    () => (area ? [] : findUTurns(segments, (s) => standInRef.current.has(s))),
    [segments, area],
  )

  /** A stand-in is still on the line: not road geometry yet, so not ready to save. */
  const unresolved = useMemo(
    () => segments.some((s) => !!s && standInRef.current.has(s)),
    [segments],
  )

  useEffect(() => {
    if (!map) return
    const lineSrc = map.getSource(LINE_SRC) as GeoJSONSource | undefined
    const pointSrc = map.getSource(POINT_SRC) as GeoJSONSource | undefined
    if (!lineSrc || !pointSrc) return

    // Index before filtering: the feature's `index` must stay the segment's
    // real position, or editing one segment would edit another.
    const lineFeatures = segments
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => (s?.coordinates?.length ?? 0) > 1)
      .map(({ s, i }) => ({
        type: 'Feature' as const,
        properties: { index: i, snap: s.snap },
        geometry: { type: 'LineString' as const, coordinates: s.coordinates },
      }))

    // A hotspot closes itself once it has three corners. The closing edge is a
    // real, clickable feature so a corner can be inserted on it; it carries a
    // sentinel index because no segment backs it.
    if (area && controlPoints.length >= 3) {
      lineFeatures.push({
        type: 'Feature' as const,
        properties: { index: CLOSING, snap: 'freehand' as const },
        geometry: {
          type: 'LineString' as const,
          coordinates: [controlPoints[controlPoints.length - 1], controlPoints[0]],
        },
      })
    }

    lineSrc.setData({ type: 'FeatureCollection', features: lineFeatures })

    pointSrc.setData({
      type: 'FeatureCollection',
      features: controlPoints.map((c, i) => ({
        type: 'Feature' as const,
        properties: { index: i },
        geometry: { type: 'Point' as const, coordinates: c },
      })),
    })

    const areaSrc = map.getSource(AREA_SRC) as GeoJSONSource | undefined
    areaSrc?.setData(
      area && controlPoints.length >= 3
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'Polygon',
                  coordinates: [[...controlPoints, controlPoints[0]]],
                },
              },
            ],
          }
        : EMPTY,
    )

    const uturnSrc = map.getSource(UTURN_SRC) as GeoJSONSource | undefined
    const stubs = uTurns.map((u) => ({
      type: 'Feature' as const,
      properties: { point: u.point, metres: Math.round(u.metres) },
      geometry: { type: 'LineString' as const, coordinates: u.stub },
    }))
    const rings = uTurns
      .filter((u) => controlPoints[u.point])
      .map((u) => ({
        type: 'Feature' as const,
        properties: { point: u.point, metres: Math.round(u.metres) },
        geometry: { type: 'Point' as const, coordinates: controlPoints[u.point] },
      }))
    uturnSrc?.setData({ type: 'FeatureCollection', features: [...stubs, ...rings] })
  }, [map, segments, controlPoints, area, uTurns])

  useEffect(() => {
    if (!map) return
    const src = map.getSource(BORROW_SRC) as GeoJSONSource | undefined
    if (!src) return
    if (!picking) {
      src.setData(EMPTY)
      return
    }
    const line = {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: variantLine(picking.variant) },
    }
    const spot = picking.spot && {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Point' as const, coordinates: picking.spot.point },
    }
    src.setData({ type: 'FeatureCollection', features: spot ? [line, spot] : [line] })
  }, [map, picking])

  // Route traces are rose; a hotspot trace takes its kind's colour, and its
  // straight edges are drawn solid rather than in the freehand dash.
  useEffect(() => {
    if (!map || !map.getLayer(AREA_FILL_LAYER)) return
    const colour = area ? HOTSPOT_COLOUR[area.kind] : ROUTE_COLOUR
    map.setPaintProperty('draw-line-snapped', 'line-color', colour)
    map.setPaintProperty('draw-line-freehand', 'line-color', colour)
    map.setPaintProperty('draw-line-freehand', 'line-dasharray', area ? [1, 0] : [2, 1.5])
    map.setPaintProperty(POINT_LAYER, 'circle-stroke-color', colour)
    map.setPaintProperty(AREA_FILL_LAYER, 'fill-color', colour)
  }, [map, area])

  return {
    drawing,
    controlPoints,
    segments,
    line,
    snapping,
    /** True while a stand-in is still on the line (see standInRef). */
    unresolved,
    freehand,
    setFreehand,
    target,
    /** Non-null while tracing a hotspot; null while drawing a route. */
    area,
    /** Set once part of a saved direction has been taken over (Extend). */
    borrow,
    /** Set while choosing where a new route leaves a saved direction. */
    picking,
    startExtend,
    keep,
    joinGate,
    connect,
    /** Control points where the route turns back on itself (see findUTurns). */
    uTurns,
    load,
    metres: useMemo(() => lineLength(line), [line]),
    start,
    startArea,
    loadArea,
    cancel,
    undo,
    addPoint,
    insertPoint,
    deletePoint,
    toggleSegment,
  }
}
