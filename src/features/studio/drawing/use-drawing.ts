import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { joinSegments, lineLength, type LngLat, type Segment, type SnapMode } from '@/shared/utils/geo'
import { straightSegment } from './snap'
import { findUTurns } from './uturns'
import type { VariantDrawing } from '@/features/routes/model/routes'
import { cutAt, nearestSpot, reverseDrawing, type BorrowPart, type LineSpot } from './borrow'
import { readDraft, useDraftSaving } from './draft'
import { useDrawLayers, useDrawRendering } from './draw-layers'
import { useDrawEvents } from './use-draw-events'
import { useGapResolver } from './gap-resolver'
import { coarsePointer } from '@/features/routes/map/tap'

/**
 * The drawing tool: a route's control points and the road between them, or a
 * hotspot's outline, from the first click to the save. This file keeps the
 * state, the edits and the modes; what it paints is drawLayers.ts, how the
 * pointer drives it useDrawEvents.ts, the router's answers gapResolver.ts,
 * and the draft on this device draft.ts (split 2026-09-29, stage 10 of the
 * clean-up; nothing it does changed).
 */

/** What a save will write to: an existing direction, a new direction on an existing route, or (both null) a new route. */
export type Target = { routeId: string | null; variantId: string | null }

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

export type Drawing = ReturnType<typeof useDrawing>

/** See `followOffer` in useDrawing. */
export type FollowOffer = { ids: string[]; at: LngLat; point: LngLat }

/** What the point bar's Delete keeps, to put back. */
type Undone = { points: LngLat[]; segments: Segment[]; join: LngLat | null; connected: { spot: LngLat; end: LngLat } | null }

/** How long Put back is offered after the point bar's Delete. */
const PUT_BACK_MS = 6000

export function useDrawing(
  map: MapLibreMap | null,
  opts: {
    /**
     * A right-click on saved lines while drawing a route: the directions under
     * it and where. The studio decides which one is meant and calls `connect`.
     */
    onFollow?: (variantIds: string[], at: LngLat, offered?: LngLat) => void
  } = {},
) {
  const [drawing, setDrawing] = useState(false)
  const [controlPoints, setControlPoints] = useState<LngLat[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
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
  /** The point a finger tapped, whose bar of actions is open (PointBar.tsx). */
  const [selected, setSelected] = useState<number | null>(null)
  /**
   * The drawing as it was before the point bar's Delete, and as Delete left
   * it: Put back restores `before` while the drawing is still `after`.
   */
  const [deleted, setDeleted] = useState<{ before: Undone; after: LngLat[] } | null>(null)
  /**
   * A finger tap that added a point on a saved line offers to follow that
   * line instead: the lines under it, where, and the point the tap added.
   */
  const [followOffer, setFollowOffer] = useState<FollowOffer | null>(null)

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
  const selectedRef = useRef<number | null>(null)
  /**
   * The first and last points a right-click added by joining a saved line.
   * While the last is still the drawing's last, Undo takes the whole join
   * back in one step rather than one borrowed point at a time.
   */
  const connectedRef = useRef<{ spot: LngLat; end: LngLat } | null>(null)

  // The segments and the router's answers for them.
  const gaps = useGapResolver(useMemo(() => ({ points: cpRef, segments: segRef, area: areaRef }), []), setSegments)
  const { writeSegments, resolveGaps, isStandIn, markStandIn } = gaps

  const select = useCallback((i: number | null) => {
    selectedRef.current = i
    setSelected(i)
  }, [])

  // A point added or taken away moves every index after it, so a selection
  // lasts only while the drawing keeps its number of points.
  const writePoints = useCallback(
    (pts: LngLat[]) => {
      if (pts.length !== cpRef.current.length) select(null)
      cpRef.current = pts
      setControlPoints(pts)
    },
    [select],
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

  /** The point bar's Delete: the selected point goes, and can be put back for a while. */
  const deleteSelected = useCallback(() => {
    const i = selectedRef.current
    if (i === null) return
    const before = { points: cpRef.current, segments: segRef.current, join: joinRef.current, connected: connectedRef.current }
    void deletePoint(i)
    setDeleted({ before, after: cpRef.current })
  }, [deletePoint])

  const putBack = useCallback(() => {
    if (!deleted || cpRef.current !== deleted.after) return
    const { points, segments, join, connected } = deleted.before
    writePoints(points)
    writeSegments(segments)
    joinRef.current = join
    connectedRef.current = connected
    setDeleted(null)
    // A stretch still waiting for the router lost its request to the Delete:
    // ask again, each run of them in one request.
    let from = -1
    segments.forEach((s, i) => {
      const waiting = !!s && isStandIn(s)
      if (waiting && from === -1) from = i
      if (from === -1 || (waiting && i < segments.length - 1)) return
      const to = waiting ? i : i - 1
      void resolveGaps(from, segments.slice(from, to + 1).map((g) => g.snap))
      from = -1
    })
  }, [deleted, writePoints, writeSegments, isStandIn, resolveGaps])

  // Put back is offered for a few seconds after the Delete.
  useEffect(() => {
    if (!deleted) return
    const t = setTimeout(() => setDeleted(null), PUT_BACK_MS)
    return () => clearTimeout(t)
  }, [deleted])

  /** Take the follow offer: the point the tap added goes, and the line is followed from there. */
  /**
   * Take the follow offer: the line is followed from where the tap was, and
   * the point the tap added goes only once the join goes ahead (`connect`),
   * so a refused follow leaves the drawing as it was.
   */
  const takeFollowOffer = useCallback(() => {
    const o = followOffer
    setFollowOffer(null)
    if (!o || cpRef.current[cpRef.current.length - 1] !== o.point) return
    followRef.current?.(o.ids, o.at, o.point)
  }, [followOffer])

  /** The drawing's line as it is now, without its last point when that is `drop`. */
  const lineNow = useCallback((drop?: LngLat) => {
    const last = cpRef.current[cpRef.current.length - 1]
    return joinSegments(drop && last === drop ? segRef.current.slice(0, -1) : segRef.current)
  }, [])

  const reset = useCallback(() => {
    writePoints([])
    writeSegments([])
    setDeleted(null)
    setFollowOffer(null)
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
      return {
        go: false,
        problem: coarsePointer()
          ? 'Draw from where the jeep starts first, then tap the line it joins and follow it.'
          : 'Draw from where the jeep starts first, then right-click the line it joins.',
      }
    }
    if (joinRef.current || borrowRef.current) {
      return { go: false, problem: 'This drawing already follows part of another line. One per drawing, for now.' }
    }
    return { go: true, problem: null }
  }, [])

  /**
   * `drop`, from the follow offer: the point the finger's tap added, which
   * the join replaces, taken out only once the join goes ahead.
   */
  const connect = useCallback(
    (v: VariantDrawing, at: LngLat, backwards: boolean, drop?: LngLat): string | null => {
      const gate = joinGate()
      if (!gate.go) return gate.problem
      const cp = v.control_points ?? []
      const segs = v.segments ?? []
      const src = backwards ? reverseDrawing(cp, segs) : { controlPoints: cp, segments: segs }
      const spot = nearestSpot(src.segments, at)
      if (!spot) return null
      const cut = cutAt(src.controlPoints, src.segments, spot, 'end')
      if (cut.segments.length === 0) return 'That is the very end of the line: nothing left to follow.'

      const dropping = !!drop && cpRef.current.length > 1 && cpRef.current[cpRef.current.length - 1] === drop
      const mine = dropping ? cpRef.current.slice(0, -1) : cpRef.current
      const mineSegs = dropping ? segRef.current.slice(0, -1) : segRef.current
      const gap = mine.length - 1
      const last = mine[gap]
      writePoints([...mine, ...cut.controlPoints])
      writeSegments([...mineSegs, straightSegment(last, cut.controlPoints[0]), ...cut.segments])
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

  /**
   * The outline being traced is now this saved hotspot: a save wrote its row
   * and failed after it (its links). Held in the area, so the panel closed
   * and opened again, or the page reloaded from its draft, updates that row
   * rather than inserting the box a second time (review of 2026-10-03).
   */
  const adoptStop = useCallback((stopId: string) => {
    const a = areaRef.current
    if (!a || a.stopId === stopId) return
    const next = { ...a, stopId }
    setArea(next)
    areaRef.current = next
  }, [])

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

  useDraftSaving({ drawing, controlPoints, segments, target, area, borrow }, joinRef, isStandIn)

  // ------------------------------------------------------ layers and events

  useDrawLayers(map)
  useDrawEvents(
    map,
    drawing,
    useMemo(
      () => ({
        points: cpRef,
        segments: segRef,
        area: areaRef,
        picking: pickingRef,
        join: joinRef,
        borrow: borrowRef,
        follow: followRef,
        selected: selectedRef,
      }),
      [],
    ),
    {
      setPicking,
      addPoint,
      insertPoint,
      deletePoint,
      toggleSegment,
      resolveGaps,
      writePoints,
      writeSegments,
      markStandIn,
      isStandIn,
      select,
      setFollowOffer,
    },
  )

  // -------------------------------------------------------------- rendering

  const line = useMemo(() => joinSegments(segments), [segments])

  /** Control points where the route turns back on itself. Shown, never changed. */
  const uTurns = useMemo(
    () => (area ? [] : findUTurns(segments, isStandIn)),
    [segments, area, isStandIn],
  )

  /** A stand-in is still on the line: not road geometry yet, so not ready to save. */
  const unresolved = useMemo(
    () => segments.some((s) => !!s && isStandIn(s)),
    [segments, isStandIn],
  )

  useDrawRendering(map, { segments, controlPoints, area, uTurns, picking, selected })

  return {
    drawing,
    controlPoints,
    segments,
    line,
    snapping: gaps.snapping,
    /** True while a stand-in is still on the line (gapResolver.ts). */
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
    lineNow,
    /** Control points where the route turns back on itself (see findUTurns). */
    uTurns,
    load,
    metres: useMemo(() => lineLength(line), [line]),
    start,
    startArea,
    loadArea,
    adoptStop,
    cancel,
    undo,
    addPoint,
    insertPoint,
    deletePoint,
    toggleSegment,
    /** The point a finger tapped, or null; its bar is PointBar.tsx. */
    selected,
    select,
    deleteSelected,
    /** Whether the last Delete can still be put back. */
    canPutBack: deleted !== null && controlPoints === deleted.after,
    putBack,
    /** The lines a finger tap just added a point on, while that point is still the last. */
    followOffer: followOffer && controlPoints[controlPoints.length - 1] === followOffer.point ? followOffer : null,
    takeFollowOffer,
  }
}
