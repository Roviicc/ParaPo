import { useEffect, type RefObject } from 'react'
import type { MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import type { StopSummary } from '../model/stops'
import { ROUTES_HIT_LAYER, STOPS_FILL_LAYER, resolveTap, tapTargets } from './tap'

/*
 * A tap on the saved hotspots: what it opens, lists or lets go. Split from
 * useSavedStops.ts, 2026-09-29.
 */

const FILL = STOPS_FILL_LAYER
const ROUTES_HIT = ROUTES_HIT_LAYER

/**
 * Binds the map's click, and the pointer over a box, once. The handler reads
 * today's hotspots and whether the editor is drawing through `read`, and
 * answers through the hook's setters (`set`), which never change.
 */
export function useStopTaps<S extends StopSummary>(
  map: MapLibreMap | null,
  read: { drawing: RefObject<boolean>; byId: RefObject<Map<string, S>> },
  set: { selectedId: (id: string | null) => void; candidates: (c: S[]) => void },
) {
  useEffect(() => {
    if (!map || !map.getLayer(FILL)) return
    const canvas = map.getCanvas()

    // Over a route line, the pointer is the line's (the routes hook sets it).
    const routeUnder = (e: MapMouseEvent) =>
      map.getLayer(ROUTES_HIT) &&
      map.queryRenderedFeatures(e.point, { layers: [ROUTES_HIT] }).length > 0

    // One handler, one box, sized for the finger: nothing deselects, one
    // hotspot opens its card, several side by side go to the sheet. A tap
    // inside a box is the hotspot's alone, a route through it or not
    // (tapTargets); the routes hook reads the same tap and keeps its half.
    const onMapClick = (e: MapMouseEvent) => {
      if (read.drawing.current) return
      const out = resolveTap(tapTargets(map, e.point, e.originalEvent))
      if (out.kind === 'stop') {
        set.selectedId(out.stopId)
        set.candidates([])
      } else if (out.kind === 'several') {
        set.selectedId(null)
        set.candidates(out.stopIds.map((id) => read.byId.current.get(id)).filter((s) => !!s))
      } else {
        set.selectedId(null)
        set.candidates([])
      }
    }
    const enter = (e: MapMouseEvent) => {
      if (!read.drawing.current && !routeUnder(e)) canvas.style.cursor = 'pointer'
    }
    const leave = () => {
      if (!read.drawing.current) canvas.style.cursor = ''
    }

    map.on('click', onMapClick)
    map.on('mouseenter', FILL, enter)
    map.on('mouseleave', FILL, leave)
    return () => {
      map.off('click', onMapClick)
      map.off('mouseenter', FILL, enter)
      map.off('mouseleave', FILL, leave)
    }
  }, [map])
}
