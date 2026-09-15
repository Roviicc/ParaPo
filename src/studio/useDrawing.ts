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
import type { VariantRow } from '../shared/routes'

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

type Draft = {
  controlPoints: LngLat[]
  segments: Segment[]
  target: Target
  area?: AreaTarget | null
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
const POINT_LAYER = 'draw-point-dots'
const HIT_LAYER = 'draw-line-hit'
const AREA_FILL_LAYER = 'draw-area-fill'

const ROUTE_COLOUR = '#e11d48'
const UTURN_COLOUR = '#f59e0b'

/** The closing edge of an area is a feature in the line source with this index. */
const CLOSING = -1

type IndexedFeature = { properties?: { index?: number } }

export type Drawing = ReturnType<typeof useDrawing>

export function useDrawing(map: MapLibreMap | null) {
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

  // Map event handlers are registered once and must always see current state,
  // so every mutator updates these refs synchronously.
  const cpRef = useRef<LngLat[]>([])
  const segRef = useRef<Segment[]>([])
  const freehandRef = useRef(false)
  freehandRef.current = freehand
  const areaRef = useRef<AreaTarget | null>(null)
  areaRef.current = area

  /**
   * Straight stand-ins: drawn while the router is asked, and while a point is
   * dragged. A router answer is written only where its stand-in still is, and
   * no U-turn is ever reported against one.
   */
  const standInRef = useRef(new WeakSet<Segment>())

  const writeSegments = useCallback((next: Segment[]) => {
    segRef.current = next
    setSegments(next)
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
   * straightened, the point undone, another route opened).
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
          setSnapping((n) => n + 1)
          try {
            const answer = await snapSegments(pts.slice(a, b + 2))
            answer.forEach((seg, j) => {
              const at = segRef.current.indexOf(standIns[a + j] as Segment)
              if (at !== -1) writeSegment(at, seg)
            })
          } finally {
            setSnapping((n) => n - 1)
          }
        }),
      )
    },
    [writeSegment, writeSegments],
  )

  const addPoint = useCallback(
    async (point: LngLat) => {
      const prevLen = cpRef.current.length
      writePoints([...cpRef.current, point])
      if (prevLen === 0) return
      await resolveGaps(prevLen - 1, [freehandRef.current ? 'freehand' : 'snapped'])
    },
    [resolveGaps, writePoints],
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
    writePoints(cpRef.current.slice(0, -1))
    writeSegments(segRef.current.slice(0, -1))
  }, [writePoints, writeSegments])

  const reset = useCallback(() => {
    writePoints([])
    writeSegments([])
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

  /** Open a saved direction for editing. */
  const load = useCallback(
    (v: VariantRow) => {
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

  useEffect(() => {
    const d = readDraft()
    if (!d) return
    const a = d.area ?? null
    setArea(a)
    areaRef.current = a
    writePoints(d.controlPoints)
    writeSegments(d.segments ?? [])
    setTarget(d.target ?? { routeId: null, variantId: null })
    setDrawing(true)

    // A draft saved while the router was being asked holds stand-ins: straight,
    // two points, no streets, yet marked routed. Their answers died with the
    // page, so ask again.
    if (a) return
    ;(d.segments ?? []).forEach((s, i) => {
      if (s?.snap === 'snapped' && s.coordinates?.length === 2 && !s.streets) {
        void resolveGaps(i, ['snapped'])
      }
    })
  }, [writePoints, writeSegments, resolveGaps])

  useEffect(() => {
    try {
      if (drawing && controlPoints.length > 0) {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ controlPoints, segments, target, area }),
        )
      } else if (!drawing) {
        localStorage.removeItem(DRAFT_KEY)
      }
    } catch {
      /* storage unavailable: drafts simply do not persist */
    }
  }, [drawing, controlPoints, segments, target, area])

  // ----------------------------------------------------------------- layers

  useEffect(() => {
    if (!map || map.getSource(LINE_SRC)) return

    map.addSource(LINE_SRC, { type: 'geojson', data: EMPTY })
    map.addSource(POINT_SRC, { type: 'geojson', data: EMPTY })
    map.addSource(AREA_SRC, { type: 'geojson', data: EMPTY })
    map.addSource(UTURN_SRC, { type: 'geojson', data: EMPTY })

    // The hotspot fill sits under its own outline and under the route layers.
    map.addLayer({
      id: AREA_FILL_LAYER,
      type: 'fill',
      source: AREA_SRC,
      paint: { 'fill-color': ROUTE_COLOUR, 'fill-opacity': 0.18 },
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
    // the line and would be invisible. Paint it amber over the line.
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
      const hits = map.queryRenderedFeatures(e.point, {
        layers: [POINT_LAYER, HIT_LAYER],
      })
      if (hits.length > 0) return
      void addPoint([e.lngLat.lng, e.lngLat.lat])
    }

    const onLineClick = (e: MapMouseEvent & { features?: IndexedFeature[] }) => {
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
      canvas.style.cursor = 'crosshair'
      map.dragPan.enable()
      if (i === null) return
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
    freehand,
    setFreehand,
    target,
    /** Non-null while tracing a hotspot; null while drawing a route. */
    area,
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
