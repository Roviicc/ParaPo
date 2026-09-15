import { useEffect, useRef, useState } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { Chooser } from '../shared/Chooser'
import { HotspotCard } from '../shared/HotspotCard'
import { MapView } from '../shared/MapView'
import { RouteCard } from '../shared/RouteCard'
import { listVariantSummaries, variantLine, type VariantSummary } from '../shared/routes'
import { supabaseConfigError } from '../shared/supabase'
import { useSavedRoutes } from '../shared/useSavedRoutes'
import { useSavedStops } from '../shared/useSavedStops'

/** The query key a shared link carries: `/?r=<direction id>`. A query, not a path, so no SPA fallback is needed. */
const SHARE_KEY = 'r'

/**
 * The public map at /. Everything drawn so far and a card for whatever is
 * tapped — nothing else. No sign-in, no drawing, and no editor code in this
 * page's bundle (scripts/check-build.mjs proves it).
 *
 * On a phone the tap is the whole interface: the cards are bottom sheets, a
 * tap near a line counts, and a tap where routes share a road offers a choice.
 */
export default function CommuterApp() {
  const [map, setMap] = useState<MapLibreMap | null>(null)
  // Only the columns the map draws and the cards show: no control points or
  // segments, which roughly halves what a visit downloads.
  const saved = useSavedRoutes(map, listVariantSummaries)
  const stops = useSavedStops(map)

  useShareLink(map, saved)

  // One tap, several things: routes, hotspots or both. Keyed on what it lists,
  // so a fresh tap gets a fresh, open sheet.
  const choice = [...saved.candidates, ...stops.candidates]
  const choosing = choice.length > 1
  const closeChooser = () => {
    saved.select(null)
    stops.select(null)
  }

  return (
    <div className="@container relative h-full w-full overflow-hidden">
      <MapView onReady={setMap} />

      {/*
        A config or load problem is a banner, never a blank page. On a phone it
        sits below the attribution, which moved to the top right there and must
        stay visible.
      */}
      {(supabaseConfigError || saved.error) && (
        <div
          className="absolute left-1/2 top-[calc(3.5rem+env(safe-area-inset-top))] z-20
                     max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg bg-amber-50 px-4 py-2 text-xs
                     text-amber-900 shadow ring-1 ring-amber-200 @wide:top-[calc(1rem+env(safe-area-inset-top))]
                     @wide:max-w-xl"
        >
          {supabaseConfigError ?? `Couldn't load saved routes: ${saved.error}`}
        </div>
      )}

      {saved.selected && (
        <RouteCard
          variant={saved.selected}
          actions={<ShareButton variant={saved.selected} />}
          onClose={() => saved.select(null)}
        />
      )}

      {!saved.selected && stops.selected && (
        <HotspotCard
          stop={stops.selected}
          linkedVariantIds={stops.linkedVariantIds(stops.selected.id)}
          variants={saved.variants}
          onSelectVariant={(v) => {
            stops.select(null)
            saved.select(v.id)
          }}
          onClose={() => stops.select(null)}
        />
      )}

      {choosing && (
        <Chooser
          key={choice.map((c) => c.id).join()}
          routes={saved.candidates}
          stops={stops.candidates}
          onRoute={(v) => {
            stops.select(null)
            saved.select(v.id)
          }}
          onStop={(s) => {
            saved.select(null)
            stops.select(s.id)
          }}
          onClose={closeChooser}
        />
      )}

      {!saved.selected && !stops.selected && !choosing && saved.variants.length > 0 && (
        <div
          className="absolute left-[calc(1rem+env(safe-area-inset-left))]
                     top-[calc(1rem+env(safe-area-inset-top))] z-10 rounded-full bg-white/90 px-3
                     py-1.5 text-xs text-neutral-500 shadow ring-1 ring-black/5 backdrop-blur"
        >
          {saved.variants.length} {saved.variants.length === 1 ? 'route' : 'routes'}
          {stops.stops.length > 0 && (
            <> · {stops.stops.length} {stops.stops.length === 1 ? 'hotspot' : 'hotspots'}</>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Keeps the address and the selected route in step. Opening `/?r=<id>` selects
 * that direction and brings the view to it; selecting one writes `?r=` so the
 * address bar is already a link to share; closing clears it. Nothing is
 * written until the arriving link has been honoured, so a slow load never
 * wipes it.
 */
function useShareLink(
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
    map.fitBounds([[w, s], [e, n]], { padding: 60, maxZoom: 15, duration: 0 })
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

/**
 * Shares the current address: the phone's share sheet where there is one, the
 * clipboard elsewhere. Browsers allow neither on a plain-http page (a build
 * served on the home network to try on a phone), so the last resort is to show
 * the link itself, selected, to copy by hand.
 */
function ShareButton({ variant }: { variant: VariantSummary }) {
  const [state, setState] = useState<'idle' | 'copied' | 'shown'>('idle')
  useEffect(() => {
    if (state !== 'copied') return
    const t = window.setTimeout(() => setState('idle'), 2000)
    return () => window.clearTimeout(t)
  }, [state])

  const share = async () => {
    const url = window.location.href
    const title = `${variant.route?.signboard ?? 'ParaPo'} — ${variant.direction_name}`
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url })
        return
      } catch (e) {
        // Dismissing the share sheet rejects with AbortError; nothing to tell the visitor.
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setState('copied')
    } catch {
      setState('shown')
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <button
        type="button"
        onClick={() => void share()}
        data-testid="share"
        className="self-start rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700"
      >
        {state === 'copied' ? 'Link copied' : 'Share'}
      </button>
      {state === 'shown' && (
        <input
          readOnly
          value={window.location.href}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Link to this route"
          className="w-full rounded-lg bg-neutral-100 px-2 py-1 text-xs text-neutral-700 ring-1 ring-black/10"
        />
      )}
    </div>
  )
}
