import { useCallback, useRef, useState, type RefObject } from 'react'
import type { LngLat, Segment, SnapMode } from '../../shared/geo/geo'
import { snapSegments, straightSegment } from './snap'
import type { AreaTarget } from './useDrawing'

/** A router request still wanted: the stand-ins its answer will replace. */
type Request = { standIns: Segment[]; controller: AbortController }

/**
 * The drawing's segments and the router's answers for them. Straight
 * stand-ins are drawn while the router is asked, and while a point is
 * dragged; an answer is written only where its stand-in still is, no U-turn
 * is ever reported against one, and none can be saved. A request whose
 * stand-ins are all gone is called off, giving its place in the router's
 * queue to one still wanted.
 *
 * The drawing's refs are passed in, not owned: the map's handlers read them
 * (useDrawEvents) and every mutator writes them synchronously.
 */
export function useGapResolver(
  refs: {
    points: RefObject<LngLat[]>
    segments: RefObject<Segment[]>
    area: RefObject<AreaTarget | null>
  },
  setSegments: (next: Segment[]) => void,
) {
  /** How many router requests are out. */
  const [snapping, setSnapping] = useState(0)
  const standInRef = useRef(new WeakSet<Segment>())
  const requestsRef = useRef(new Set<Request>())

  const writeSegments = useCallback(
    (next: Segment[]) => {
      refs.segments.current = next
      setSegments(next)
      for (const request of requestsRef.current) {
        if (!request.standIns.some((s) => next.includes(s))) {
          request.controller.abort()
          requestsRef.current.delete(request)
        }
      }
    },
    [refs.segments, setSegments],
  )

  const writeSegment = useCallback(
    (i: number, seg: Segment) => {
      const next = [...refs.segments.current]
      next[i] = seg
      writeSegments(next)
    },
    [refs.segments, writeSegments],
  )

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
      const pts = refs.points.current.slice(first, first + modes.length + 1)
      if (modes.length === 0 || pts.length < modes.length + 1) return

      // A hotspot's edges are never routed: it is an outline, not a path.
      const routed = modes.map((mode) => mode === 'snapped' && !refs.area.current)
      const next = [...refs.segments.current]
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
              const at = refs.segments.current.indexOf(request.standIns[j])
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
    [refs.points, refs.segments, refs.area, writeSegment, writeSegments],
  )

  /** Whether a segment is a stand-in: drawn straight, the router's answer not in. */
  const isStandIn = useCallback((s: Segment) => standInRef.current.has(s), [])
  /** Marks a rubber-banded segment (a drag) as a stand-in until it is routed. */
  const markStandIn = useCallback((s: Segment) => {
    standInRef.current.add(s)
  }, [])

  return { snapping, writeSegments, writeSegment, resolveGaps, isStandIn, markStandIn }
}
