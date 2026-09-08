import { useCallback, useEffect, useRef, useState } from 'react'
import type { GeoJSONSource, MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import { listVariants, variantLine, type VariantRow } from './routes'
import { supabase } from './supabase'

const SRC = 'saved-routes'
const CASING = 'saved-routes-casing'
const LINE = 'saved-routes-line'
const HIT = 'saved-routes-hit'

/** Draw layers, if present, must stay above the saved ones. */
const DRAW_ABOVE = 'draw-line-casing'

type IdFeature = { properties?: { id?: string } }

/**
 * Every saved route direction, drawn for everyone. This is the public half of
 * ParaPo: no sign-in, no editor, just the map with what has been recorded.
 */
export function useSavedRoutes(
  map: MapLibreMap | null,
  opts: { drawing: boolean; hiddenVariantId: string | null },
) {
  const [variants, setVariants] = useState<VariantRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const drawingRef = useRef(opts.drawing)
  drawingRef.current = opts.drawing

  const reload = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    try {
      setVariants(await listVariants())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // ----------------------------------------------------------------- layers

  useEffect(() => {
    if (!map || map.getSource(SRC)) return
    const before = map.getLayer(DRAW_ABOVE) ? DRAW_ABOVE : undefined

    map.addSource(SRC, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    map.addLayer(
      {
        id: CASING,
        type: 'line',
        source: SRC,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.9 },
      },
      before,
    )
    map.addLayer(
      {
        id: LINE,
        type: 'line',
        source: SRC,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#2563eb', 'line-width': 3 },
      },
      before,
    )
    map.addLayer(
      {
        id: HIT,
        type: 'line',
        source: SRC,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#000000', 'line-width': 18, 'line-opacity': 0 },
      },
      before,
    )
  }, [map])

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
            signboard: v.route?.signboard ?? '',
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
    for (const id of [CASING, LINE, HIT]) map.setFilter(id, filter as never)
  }, [map, opts.hiddenVariantId])

  useEffect(() => {
    if (!map || !map.getLayer(LINE)) return
    map.setPaintProperty(LINE, 'line-width', [
      'case',
      ['==', ['get', 'id'], selectedId ?? ''],
      5,
      3,
    ])
  }, [map, selectedId])

  // ----------------------------------------------------------------- events

  useEffect(() => {
    if (!map || !map.getLayer(HIT)) return
    const canvas = map.getCanvas()

    const onHitClick = (e: MapMouseEvent & { features?: IdFeature[] }) => {
      if (drawingRef.current) return
      const id = e.features?.[0]?.properties?.id
      if (typeof id === 'string') setSelectedId(id)
    }
    const onMapClick = (e: MapMouseEvent) => {
      if (drawingRef.current) return
      const hits = map.queryRenderedFeatures(e.point, { layers: [HIT] })
      if (hits.length === 0) setSelectedId(null)
    }
    const enter = () => {
      if (!drawingRef.current) canvas.style.cursor = 'pointer'
    }
    const leave = () => {
      if (!drawingRef.current) canvas.style.cursor = ''
    }

    map.on('click', HIT, onHitClick)
    map.on('click', onMapClick)
    map.on('mouseenter', HIT, enter)
    map.on('mouseleave', HIT, leave)
    return () => {
      map.off('click', HIT, onHitClick)
      map.off('click', onMapClick)
      map.off('mouseenter', HIT, enter)
      map.off('mouseleave', HIT, leave)
    }
  }, [map])

  const selected = variants.find((v) => v.id === selectedId) ?? null

  return { variants, error, loading, reload, selected, select: setSelectedId }
}
