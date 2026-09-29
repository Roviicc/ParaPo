import { useEffect, useState } from 'react'
import type { MapLibreMap } from 'maplibre-gl'

/**
 * The layer ids one file paints and another places its own layers against.
 * The map's layer order is a contract between hooks — the orange stretches
 * go under the routes' hit area, the babaan sides and the hotspots under the
 * routes' casing, the ride-to preview under the ends' circles — and these
 * names are its terms; the headless suites read the same strings, so they
 * never change. A layer only its own file uses stays named there.
 */
export const LAYERS = {
  /** The routes' tap area, top of their stack: what paints on the lines goes under it. */
  routesHit: 'saved-routes-hit',
  /** The routes' white rim, bottom of their stack: what paints under the lines goes under it. */
  routesCasing: 'saved-routes-casing',
  /** The hotspots' fill: a tap asks it for boxes. */
  stopsFill: 'saved-stops-fill',
  /** A hintuan's name. */
  stopsHintuanLabel: 'saved-stops-label-hintuan',
  /** A lit ride's end circles. */
  endCircles: 'direction-end-circles',
  /** The line being drawn: its rim, and its snapped and freehand stretches. */
  drawCasing: 'draw-line-casing',
  drawSnapped: 'draw-line-snapped',
  drawFreehand: 'draw-line-freehand',
} as const

/**
 * True once `id` is a layer on `map`, and checked again whenever the style
 * changes. An effect that places a layer against another hook's used to look
 * once and give up for good when that one was not there yet — so the order
 * the hooks were called in was a silent contract (the review's 6.5). With
 * this in its dependencies it waits for the layer and runs when it arrives.
 */
export function useLayerReady(map: MapLibreMap | null, id: string): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!map) return
    const check = () => setReady(!!map.getLayer(id))
    check()
    map.on('styledata', check)
    return () => {
      map.off('styledata', check)
    }
  }, [map, id])
  return ready
}
