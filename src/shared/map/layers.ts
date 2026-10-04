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
 * Hides one saved thing from a hook's layers — the direction or hotspot the
 * studio is editing, which the editor draws itself — by `apply`, handed the
 * id to leave out ('' for none), and keeps in `applied` the id it last hid
 * (null for none, as the layers start). It applies an id whenever asked, and
 * none only when one was hidden before, to show it again. So the public map,
 * which never hides anything, sets no filter: each setFilter that changes a
 * filter has MapLibre check it against a copy of the whole style, and the
 * public map's eleven came to 13-18 ms at 4x CPU on every load, and split the
 * hotspots' fills into two buckets for the worker to lay out (the cheap-phone
 * plan, step 5, 2026-10-04).
 */
export function applyHidden(
  applied: { current: string | null },
  hidden: string | null | undefined,
  apply: (id: string) => void,
): void {
  const next = hidden ?? null
  if (applied.current === null && next === null) return
  applied.current = next
  apply(next ?? '')
}

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
