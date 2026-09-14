import { useState } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { HotspotCard } from '../shared/HotspotCard'
import { MapView } from '../shared/MapView'
import { RouteCard } from '../shared/RouteCard'
import { listVariantSummaries } from '../shared/routes'
import { supabaseConfigError } from '../shared/supabase'
import { useSavedRoutes } from '../shared/useSavedRoutes'
import { useSavedStops } from '../shared/useSavedStops'

/**
 * The public map at /. Everything drawn so far and a card for whatever is
 * tapped — nothing else. No sign-in, no drawing, and no editor code in this
 * page's bundle (scripts/check-build.mjs proves it).
 */
export default function CommuterApp() {
  const [map, setMap] = useState<MapLibreMap | null>(null)
  // Only the columns the map draws and the cards show: no control points or
  // segments, which roughly halves what a visit downloads.
  const saved = useSavedRoutes(map, listVariantSummaries)
  const stops = useSavedStops(map)

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapView onReady={setMap} />

      {/* A config or load problem is a banner, never a blank page. */}
      {(supabaseConfigError || saved.error) && (
        <div
          className="absolute left-1/2 top-4 z-20 max-w-xl -translate-x-1/2 rounded-lg bg-amber-50
                     px-4 py-2 text-xs text-amber-900 shadow ring-1 ring-amber-200"
        >
          {supabaseConfigError ?? `Couldn't load saved routes: ${saved.error}`}
        </div>
      )}

      {saved.selected && <RouteCard variant={saved.selected} onClose={() => saved.select(null)} />}

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

      {!saved.selected && !stops.selected && saved.variants.length > 0 && (
        <div
          className="absolute left-4 top-4 z-10 rounded-full bg-white/90 px-3 py-1.5 text-xs
                     text-neutral-500 shadow ring-1 ring-black/5 backdrop-blur"
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
