import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GeoJSONSource, MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import {
  joinSegments,
  lineLength,
  type LngLat,
  type Segment,
  type SnapMode,
} from './geo'
import { snapSegment, straightSegment } from './snap'

const EMPTY = { type: 'FeatureCollection', features: [] } as const

const LINE_SRC = 'draw-line'
const POINT_SRC = 'draw-points'
const POINT_LAYER = 'draw-point-dots'
const HIT_LAYER = 'draw-line-hit'

type IndexedFeature = { properties?: { index?: number } }

export type Drawing = ReturnType<typeof useDrawing>

export function useDrawing(map: MapLibreMap | null) {
  const [drawing, setDrawing] = useState(false)
  const [controlPoints, setControlPoints] = useState<LngLat[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [snapping, setSnapping] = useState(0)
  const [freehand, setFreehand] = useState(false)

  // Map event handlers are registered once and must always see current state,
  // so every mutator updates these refs synchronously.
  const cpRef = useRef<LngLat[]>([])
  const segRef = useRef<Segment[]>([])
  const freehandRef = useRef(false)
  freehandRef.current = freehand

  // A drag can start before an earlier re-snap has answered. Each gap carries a
  // counter, and a reply whose counter is stale is discarded rather than
  // painting geometry for a control point that has since moved.
  const epochRef = useRef<number[]>([])

  const writeSegment = useCallback((i: number, seg: Segment) => {
    setSegments((ss) => {
      const next = [...ss]
      next[i] = seg
      segRef.current = next
      return next
    })
  }, [])

  const writePoints = useCallback((pts: LngLat[]) => {
    cpRef.current = pts
    setControlPoints(pts)
  }, [])

  /** Resolve the gap between control points i and i+1 in the given mode. */
  const resolveGap = useCallback(
    async (i: number, mode: SnapMode) => {
      const from = cpRef.current[i]
      const to = cpRef.current[i + 1]
      if (!from || !to) return

      const epoch = (epochRef.current[i] = (epochRef.current[i] ?? 0) + 1)

      if (mode === 'freehand') {
        writeSegment(i, straightSegment(from, to))
        return
      }

      // Straight placeholder so the line tracks the click immediately; routed
      // geometry replaces it when the router answers.
      writeSegment(i, { snap: 'snapped', coordinates: [from, to] })
      setSnapping((n) => n + 1)
      try {
        const seg = await snapSegment(from, to)
        if (epochRef.current[i] === epoch) writeSegment(i, seg)
      } finally {
        setSnapping((n) => n - 1)
      }
    },
    [writeSegment],
  )

  const addPoint = useCallback(
    async (point: LngLat) => {
      const prevLen = cpRef.current.length
      writePoints([...cpRef.current, point])
      if (prevLen === 0) return
      await resolveGap(prevLen - 1, freehandRef.current ? 'freehand' : 'snapped')
    },
    [resolveGap, writePoints],
  )

  /** Split a segment by dropping a new control point into it. */
  const insertPoint = useCallback(
    async (gap: number, point: LngLat) => {
      const mode: SnapMode = segRef.current[gap]?.snap ?? 'snapped'
      const pts = [...cpRef.current]
      pts.splice(gap + 1, 0, point)
      writePoints(pts)

      setSegments((ss) => {
        const next = [...ss]
        next.splice(
          gap,
          1,
          straightSegment(pts[gap], point),
          straightSegment(point, pts[gap + 2]),
        )
        segRef.current = next
        return next
      })

      epochRef.current.splice(gap, 0, 0)
      await Promise.all([resolveGap(gap, mode), resolveGap(gap + 1, mode)])
    },
    [resolveGap, writePoints],
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

      setSegments((ss) => {
        const next = [...ss]
        if (idx === 0) next.splice(0, 1)
        else if (idx === origLen - 1) next.splice(next.length - 1, 1)
        else next.splice(idx - 1, 2, straightSegment(pts[idx - 1], pts[idx]))
        segRef.current = next
        return next
      })

      if (idx > 0 && idx < pts.length) {
        epochRef.current.splice(idx, 1)
        await resolveGap(idx - 1, modeBefore ?? modeAfter ?? 'snapped')
      }
    },
    [resolveGap, writePoints],
  )

  /**
   * Flip one segment between routed and straight. This is the escape hatch for
   * a stretch the router refuses, and the retry for one where it failed.
   */
  const toggleSegment = useCallback(
    async (gap: number) => {
      const current: SnapMode = segRef.current[gap]?.snap ?? 'snapped'
      await resolveGap(gap, current === 'snapped' ? 'freehand' : 'snapped')
    },
    [resolveGap],
  )

  const undo = useCallback(() => {
    writePoints(cpRef.current.slice(0, -1))
    setSegments((ss) => {
      const next = ss.slice(0, -1)
      segRef.current = next
      return next
    })
  }, [writePoints])

  const reset = useCallback(() => {
    writePoints([])
    setSegments([])
    segRef.current = []
    epochRef.current = []
  }, [writePoints])

  const start = useCallback(() => {
    reset()
    setFreehand(false)
    setDrawing(true)
  }, [reset])

  const cancel = useCallback(() => {
    setDrawing(false)
    reset()
  }, [reset])

  // ----------------------------------------------------------------- layers

  useEffect(() => {
    if (!map || map.getSource(LINE_SRC)) return

    map.addSource(LINE_SRC, { type: 'geojson', data: EMPTY })
    map.addSource(POINT_SRC, { type: 'geojson', data: EMPTY })

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
    // A 4px line is far too thin to hit reliably; this invisible one is not.
    map.addLayer({
      id: HIT_LAYER,
      type: 'line',
      source: LINE_SRC,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#000000', 'line-width': 22, 'line-opacity': 0 },
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
      const hits = map.queryRenderedFeatures(e.point, {
        layers: [POINT_LAYER, HIT_LAYER],
      })
      if (hits.length > 0) return
      void addPoint([e.lngLat.lng, e.lngLat.lat])
    }

    const onLineClick = (e: MapMouseEvent & { features?: IndexedFeature[] }) => {
      const gap = e.features?.[0]?.properties?.index
      if (typeof gap !== 'number') return
      if (e.originalEvent.shiftKey) void toggleSegment(gap)
      else void insertPoint(gap, [e.lngLat.lng, e.lngLat.lat])
    }

    const onPointContext = (e: MapMouseEvent & { features?: IndexedFeature[] }) => {
      e.preventDefault()
      const idx = e.features?.[0]?.properties?.index
      if (typeof idx === 'number') void deletePoint(idx)
    }

    let dragIdx: number | null = null
    let dragModes: [SnapMode | undefined, SnapMode | undefined] = [
      undefined,
      undefined,
    ]

    const onDragMove = (e: MapMouseEvent) => {
      const i = dragIdx
      if (i === null) return
      const point: LngLat = [e.lngLat.lng, e.lngLat.lat]
      const pts = [...cpRef.current]
      pts[i] = point
      writePoints(pts)

      // Rubber-band the two neighbours while dragging; they re-route on release.
      setSegments((ss) => {
        const next = [...ss]
        if (i > 0 && pts[i - 1]) {
          next[i - 1] = {
            snap: dragModes[0] ?? 'snapped',
            coordinates: [pts[i - 1], point],
          }
        }
        if (i < pts.length - 1 && pts[i + 1]) {
          next[i] = {
            snap: dragModes[1] ?? 'snapped',
            coordinates: [point, pts[i + 1]],
          }
        }
        segRef.current = next
        return next
      })
    }

    const onDragEnd = () => {
      const i = dragIdx
      dragIdx = null
      map.off('mousemove', onDragMove)
      canvas.style.cursor = 'crosshair'
      map.dragPan.enable()
      if (i === null) return
      // Only the two segments touching the moved point are stale.
      if (i > 0) void resolveGap(i - 1, dragModes[0] ?? 'snapped')
      if (i < cpRef.current.length - 1) void resolveGap(i, dragModes[1] ?? 'snapped')
    }

    const onPointDown = (e: MapMouseEvent & { features?: IndexedFeature[] }) => {
      const idx = e.features?.[0]?.properties?.index
      if (typeof idx !== 'number') return
      // Left button only. A right-click must reach the contextmenu handler;
      // starting a drag here would swallow it.
      if (e.originalEvent.button !== 0) return
      e.preventDefault()
      dragIdx = idx
      dragModes = [segRef.current[idx - 1]?.snap, segRef.current[idx]?.snap]
      canvas.style.cursor = 'grabbing'
      map.dragPan.disable()
      map.on('mousemove', onDragMove)
      map.once('mouseup', onDragEnd)
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
    map.on('mouseenter', POINT_LAYER, enterPoint)
    map.on('mouseleave', POINT_LAYER, leave)
    map.on('mouseenter', HIT_LAYER, enterLine)
    map.on('mouseleave', HIT_LAYER, leave)

    return () => {
      map.off('click', onMapClick)
      map.off('click', HIT_LAYER, onLineClick)
      map.off('mousedown', POINT_LAYER, onPointDown)
      map.off('contextmenu', POINT_LAYER, onPointContext)
      map.off('mouseenter', POINT_LAYER, enterPoint)
      map.off('mouseleave', POINT_LAYER, leave)
      map.off('mouseenter', HIT_LAYER, enterLine)
      map.off('mouseleave', HIT_LAYER, leave)
      map.off('mousemove', onDragMove)
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
    resolveGap,
    writePoints,
  ])

  // -------------------------------------------------------------- rendering

  const line = useMemo(() => joinSegments(segments), [segments])

  useEffect(() => {
    if (!map) return
    const lineSrc = map.getSource(LINE_SRC) as GeoJSONSource | undefined
    const pointSrc = map.getSource(POINT_SRC) as GeoJSONSource | undefined
    if (!lineSrc || !pointSrc) return

    lineSrc.setData({
      type: 'FeatureCollection',
      // Index before filtering: the feature's `index` must stay the segment's
      // real position, or editing one segment would edit another.
      features: segments
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => (s?.coordinates?.length ?? 0) > 1)
        .map(({ s, i }) => ({
          type: 'Feature' as const,
          properties: { index: i, snap: s.snap },
          geometry: { type: 'LineString' as const, coordinates: s.coordinates },
        })),
    })

    pointSrc.setData({
      type: 'FeatureCollection',
      features: controlPoints.map((c, i) => ({
        type: 'Feature' as const,
        properties: { index: i },
        geometry: { type: 'Point' as const, coordinates: c },
      })),
    })
  }, [map, segments, controlPoints])

  return {
    drawing,
    controlPoints,
    segments,
    line,
    snapping,
    freehand,
    setFreehand,
    metres: useMemo(() => lineLength(line), [line]),
    start,
    cancel,
    undo,
    addPoint,
    insertPoint,
    deletePoint,
    toggleSegment,
  }
}
