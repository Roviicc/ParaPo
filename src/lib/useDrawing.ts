import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GeoJSONSource, MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import { joinSegments, lineLength, type LngLat, type Segment } from './geo'
import { snapSegment, straightSegment } from './snap'

const EMPTY = { type: 'FeatureCollection', features: [] } as const

const LINE_SRC = 'draw-line'
const POINT_SRC = 'draw-points'

export type Drawing = ReturnType<typeof useDrawing>

export function useDrawing(map: MapLibreMap | null) {
  const [drawing, setDrawing] = useState(false)
  const [controlPoints, setControlPoints] = useState<LngLat[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [snapping, setSnapping] = useState(0)

  // Clicks can land faster than the router answers, so the handler reads the
  // current points from a ref rather than from a captured render.
  const cpRef = useRef<LngLat[]>([])

  const addPoint = useCallback(async (point: LngLat) => {
    const prevLen = cpRef.current.length
    const prev = prevLen > 0 ? cpRef.current[prevLen - 1] : null

    cpRef.current = [...cpRef.current, point]
    setControlPoints(cpRef.current)

    if (!prev) return
    const gap = prevLen - 1

    // Draw a straight placeholder immediately so the line responds to the
    // click, then replace it when the router answers. Responses can arrive out
    // of order, so each writes to its own index rather than appending.
    setSegments((ss) => {
      const next = [...ss]
      next[gap] = straightSegment(prev, point)
      return next
    })

    setSnapping((n) => n + 1)
    try {
      const seg = await snapSegment(prev, point)
      setSegments((ss) => {
        const next = [...ss]
        next[gap] = seg
        return next
      })
    } finally {
      setSnapping((n) => n - 1)
    }
  }, [])

  const undo = useCallback(() => {
    cpRef.current = cpRef.current.slice(0, -1)
    setControlPoints(cpRef.current)
    setSegments((ss) => ss.slice(0, -1))
  }, [])

  const reset = useCallback(() => {
    cpRef.current = []
    setControlPoints([])
    setSegments([])
  }, [])

  const start = useCallback(() => {
    reset()
    setDrawing(true)
  }, [reset])

  const cancel = useCallback(() => {
    setDrawing(false)
    reset()
  }, [reset])

  // ------------------------------------------------------------ map wiring

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
    map.addLayer({
      id: 'draw-line-body',
      type: 'line',
      source: LINE_SRC,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#e11d48', 'line-width': 4 },
    })
    map.addLayer({
      id: 'draw-point-dots',
      type: 'circle',
      source: POINT_SRC,
      paint: {
        'circle-radius': 5,
        'circle-color': '#ffffff',
        'circle-stroke-color': '#e11d48',
        'circle-stroke-width': 2.5,
      },
    })
  }, [map])

  useEffect(() => {
    if (!map || !drawing) return

    const onClick = (e: MapMouseEvent) => {
      void addPoint([e.lngLat.lng, e.lngLat.lat])
    }
    map.on('click', onClick)
    map.getCanvas().style.cursor = 'crosshair'

    return () => {
      map.off('click', onClick)
      map.getCanvas().style.cursor = ''
    }
  }, [map, drawing, addPoint])

  const line = useMemo(() => joinSegments(segments), [segments])

  useEffect(() => {
    if (!map) return
    const lineSrc = map.getSource(LINE_SRC) as GeoJSONSource | undefined
    const pointSrc = map.getSource(POINT_SRC) as GeoJSONSource | undefined
    if (!lineSrc || !pointSrc) return

    lineSrc.setData(
      line.length > 1
        ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } }
        : EMPTY,
    )
    pointSrc.setData({
      type: 'FeatureCollection',
      features: controlPoints.map((c, i) => ({
        type: 'Feature',
        properties: { index: i },
        geometry: { type: 'Point', coordinates: c },
      })),
    })
  }, [map, line, controlPoints])

  return {
    drawing,
    controlPoints,
    segments,
    line,
    snapping,
    metres: useMemo(() => lineLength(line), [line]),
    start,
    cancel,
    undo,
    addPoint,
  }
}
