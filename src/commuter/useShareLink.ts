import { useEffect, useRef } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { APP_MOVE } from '../shared/map/MapView'
import { variantLine, type VariantSummary } from '../shared/model/routes'

/** The query key a shared link carries: `/?r=<direction id>`. A query, not a path, so no SPA fallback is needed. */
const SHARE_KEY = 'r'

/**
 * Keeps the address and the selected route in step. Opening `/?r=<id>` selects
 * that direction and brings the view to it; selecting one writes `?r=` so the
 * address bar is already a link to share; closing clears it. Nothing is
 * written until the arriving link has been honoured, so a slow load never
 * wipes it.
 */
export function useShareLink(
  map: MapLibreMap | null,
  saved: { variants: VariantSummary[]; selected: VariantSummary | null; select: (id: string | null) => void },
) {
  const wantedRef = useRef(new URLSearchParams(window.location.search).get(SHARE_KEY))
  const syncingRef = useRef(wantedRef.current === null)

  const { variants, select } = saved
  useEffect(() => {
    const wanted = wantedRef.current
    if (wanted === null || !map || variants.length === 0) return
    wantedRef.current = null
    syncingRef.current = true
    const v = variants.find((x) => x.id === wanted)
    if (!v) {
      // A direction since deleted: leave nothing stale to re-share.
      const url = new URL(window.location.href)
      url.searchParams.delete(SHARE_KEY)
      window.history.replaceState(null, '', url)
      return
    }
    select(v.id)
    const line = variantLine(v)
    if (line.length < 2) return
    let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const [x, y] of line) {
      if (x < w) w = x
      if (x > e) e = x
      if (y < s) s = y
      if (y > n) n = y
    }
    map.fitBounds([[w, s], [e, n]], { padding: 60, maxZoom: 15, duration: 0 }, APP_MOVE)
  }, [map, variants, select])

  const selectedId = saved.selected?.id ?? null
  useEffect(() => {
    if (!syncingRef.current) return
    const url = new URL(window.location.href)
    if (selectedId) url.searchParams.set(SHARE_KEY, selectedId)
    else url.searchParams.delete(SHARE_KEY)
    if (url.href !== window.location.href) window.history.replaceState(null, '', url)
  }, [selectedId])
}
