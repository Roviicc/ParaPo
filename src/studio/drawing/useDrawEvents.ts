import { useEffect, type RefObject } from 'react'
import type { MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import type { LngLat, Segment, SnapMode } from '../../shared/geo/geo'
import { ROUTES_HIT_LAYER } from '../../shared/map/tap'
import { nearestSpot } from './borrow'
import { CLOSING, HIT_LAYER, POINT_LAYER } from './drawLayers'
import type { AreaTarget, Picking } from './useDrawing'

/** A tap this many pixels off the line being extended does not pick a spot on it. */
const PICK_PX = 40

type IndexedFeature = { properties?: { index?: number } }

/**
 * The drawing's pointer, while drawing: a click on the map adds a point, on
 * the line inserts one (shift: straightens that stretch), a drag moves a
 * point (its two stretches rubber-band, then re-route on release), a
 * right-click on a point deletes it and on a saved line asks to follow it;
 * while picking where an Extend leaves a line, a tap near it picks the spot.
 *
 * The handlers are bound once per drawing and read the drawing through its
 * refs, which every mutator keeps current.
 */
export function useDrawEvents(
  map: MapLibreMap | null,
  drawing: boolean,
  refs: {
    points: RefObject<LngLat[]>
    segments: RefObject<Segment[]>
    area: RefObject<AreaTarget | null>
    picking: RefObject<Picking | null>
    join: RefObject<LngLat | null>
    follow: RefObject<((variantIds: string[], at: LngLat) => void) | undefined>
  },
  actions: {
    setPicking: (p: Picking) => void
    addPoint: (point: LngLat) => Promise<void>
    insertPoint: (gap: number, point: LngLat) => Promise<void>
    deletePoint: (idx: number) => Promise<void>
    toggleSegment: (gap: number) => Promise<void>
    resolveGaps: (first: number, modes: SnapMode[]) => Promise<void>
    writePoints: (pts: LngLat[]) => void
    writeSegments: (next: Segment[]) => void
    markStandIn: (s: Segment) => void
  },
): void {
  const { setPicking, addPoint, insertPoint, deletePoint, toggleSegment, resolveGaps, writePoints, writeSegments, markStandIn } =
    actions
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
      const p = refs.picking.current
      if (p) {
        const spot = nearestSpot(p.variant.segments ?? [], [e.lngLat.lng, e.lngLat.lat])
        if (!spot) return
        const px = map.project(spot.point)
        if (Math.hypot(px.x - e.point.x, px.y - e.point.y) > PICK_PX) return
        const next = { variant: p.variant, spot }
        refs.picking.current = next
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
        if (!refs.area.current) void toggleSegment(gap)
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
      if (refs.area.current || refs.picking.current || !refs.follow.current) return
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
      refs.follow.current(ids, [e.lngLat.lng, e.lngLat.lat])
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
      const pts = [...refs.points.current]
      if (pts[i] === refs.join.current) refs.join.current = point
      pts[i] = point
      writePoints(pts)

      // Rubber-band the two neighbours while dragging; they re-route on release.
      const next = [...refs.segments.current]
      if (i > 0 && pts[i - 1]) {
        next[i - 1] = { snap: dragModes[0] ?? 'snapped', coordinates: [pts[i - 1], point] }
        markStandIn(next[i - 1])
      }
      if (i < pts.length - 1 && pts[i + 1]) {
        next[i] = { snap: dragModes[1] ?? 'snapped', coordinates: [point, pts[i + 1]] }
        markStandIn(next[i])
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
      const last = refs.points.current.length - 1
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
      dragModes = [refs.segments.current[idx - 1]?.snap, refs.segments.current[idx]?.snap]
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
    refs,
    setPicking,
    addPoint,
    insertPoint,
    deletePoint,
    toggleSegment,
    resolveGaps,
    writePoints,
    writeSegments,
    markStandIn,
  ])
}
