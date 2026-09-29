import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { Chooser } from '../shared/Chooser'
import { HotspotCard } from '../shared/HotspotCard'
import { MAP_FILE_TOO_NEW, loadMapFile, loadStopsFromFile, loadVariantsFromFile, mapFileIsStale } from '../shared/mapFile'
import { reloadToUpdate, useNeedRefresh } from './pwa'
import { MapView, coarse } from '../shared/MapView'
import { wholeRideFare } from '../shared/fares'
import { liveriesFor, type Livery } from '../shared/liveries'
import { RouteCardList } from '../shared/RouteCardList'
import { RouteTripDetail } from '../shared/RouteTripDetail'
import {
  directionEnds,
  isDrawn,
  otherDirection,
  routeTimeline,
  travelLine,
  variantLine,
  type VariantSummary,
} from '../shared/routes'
import { useDirectionArrows } from '../shared/directionArrows'
import { usePassStretches } from '../shared/passStretches'
import { useBabaanSides } from '../shared/babaanSides'
import { useSavedRoutes } from '../shared/useSavedRoutes'
import { useSavedStops } from '../shared/useSavedStops'
import { hotspotCount, type Timeline } from '../shared/stops'
import { Walker } from './Walker'
import { WhereAmIButton } from './WhereAmI'
import { useWhereAmI } from './useWhereAmI'

/** The query key a shared link carries: `/?r=<direction id>`. A query, not a path, so no SPA fallback is needed. */
const SHARE_KEY = 'r'

/**
 * The public map at /. Everything published so far and a card for whatever is
 * tapped — nothing else. No sign-in, no drawing, no database: the map comes
 * from one published file, and this page's bundle carries neither editor code
 * nor a Supabase client (scripts/check-build.mjs proves both).
 *
 * On a phone the tap is the whole interface: the cards are bottom sheets, a
 * tap near a line counts, and a tap where routes share a road offers a choice.
 */
export default function CommuterApp() {
  const [map, setMap] = useState<MapLibreMap | null>(null)
  // One file, fetched once, shared by both hooks.
  const saved = useSavedRoutes(map, loadVariantsFromFile)
  const stops = useSavedStops(map, loadStopsFromFile)
  const tooNew = saved.error === MAP_FILE_TOO_NEW || stops.error === MAP_FILE_TOO_NEW

  // Where a direction passes a hintuan, the line turns orange for that stretch.
  usePassStretches(map, saved.variants, stops.stops, saved.lit, saved.resting)

  // Which way the jeep goes, on what is lit only — the chosen direction, or
  // the routes under a tap the way round the sheet shows them: chevrons
  // flowing inside each line from where the ride starts, and each end a
  // circle with its place's name.
  const rides = useMemo(
    () => saved.litVariants.map((v) => ({ line: travelLine(v, stops.stops), ...directionEnds(v) })),
    [saved.litVariants, stops.stops],
  )
  useDirectionArrows(map, rides)
  // The chosen direction's side of each hintuan it cuts across: its right.
  useBabaanSides(map, saved.selected, stops.stops)

  useShareLink(map, saved)
  // The visitor's own position, when they ask for it: a walking figure.
  const where = useWhereAmI(map)
  const offline = useOffline()
  const age = useMapAge()
  const needRefresh = useNeedRefresh()

  // One tap, several things: routes, hotspots or both. Keyed on what it lists,
  // so a fresh tap gets a fresh, open sheet.
  const choice = [...saved.candidates, ...stops.candidates]
  const choosing = choice.length > 1
  // Routes alone under the tap: the owner's route list. It stays behind a
  // trip picked from it, hidden, for the trip's ‹.
  const listing = choosing && stops.candidates.length === 0
  // ✕ on the list, the Chooser or a trip: everything the tap opened closes.
  const closeAll = () => {
    saved.select(null)
    stops.select(null)
  }
  // The colour a card wore in the list, for the trip picked from it — only
  // while that list stands behind the trip: a clash colour is "for this list
  // only" (liveries.ts), so the same trip opened any other way wears its
  // place's kept colour.
  const [worn, setWorn] = useState<{ id: string; livery: Livery } | null>(null)

  return (
    <div className="@container relative h-full w-full overflow-hidden">
      <MapView onReady={setMap} />
      {map && <WhereAmIButton where={where} coarse={coarse} />}
      {map && where.fix && <Walker map={map} fix={where.fix} pose={where.pose} facing={where.facing} />}

      {/*
        A load problem is a banner, never a blank page. On a phone it sits at
        the bottom: the attribution moved to the top right there, opens to three
        lines, and must stay visible. With no map loaded there is no card to
        share the bottom with.
      */}
      {(saved.error || stops.error) && (
        <div
          className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-20 flex
                     w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg
                     bg-amber-50 px-4 py-2 text-xs text-amber-900 shadow ring-1 ring-amber-200
                     @wide:bottom-auto @wide:top-[calc(1rem+env(safe-area-inset-top))] @wide:max-w-xl"
        >
          {tooNew ? (
            // The file is a shape this installed app does not know. Loading
            // it again cannot help; loading the page fetches the app that can.
            <>
              <span>{MAP_FILE_TOO_NEW} Reload to update.</span>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-full bg-amber-900 px-3 py-1 text-xs font-medium text-white"
              >
                Reload
              </button>
            </>
          ) : (
            <>
              <span>The routes could not be loaded. Check your connection and try again.</span>
              <button
                type="button"
                onClick={() => {
                  void saved.reload()
                  void stops.reload()
                }}
                className="rounded-full bg-amber-900 px-3 py-1 text-xs font-medium text-white"
              >
                Try again
              </button>
            </>
          )}
        </div>
      )}

      {/*
        Honesty about age. With no signal, or a network too slow to answer in
        time, the map is whatever the phone kept, and the date comes from inside
        the file itself, so it is exact. Above the pill: bottom left on a phone
        (the credit line opens across the top there), under the pill on a wide
        map.
      */}
      {(offline || age.stale) && (
        <div
          data-testid="offline"
          className="absolute bottom-[calc(5rem+env(safe-area-inset-bottom))]
                     left-[calc(1rem+env(safe-area-inset-left))] z-10 rounded-full bg-neutral-800/90
                     px-3 py-1.5 text-xs text-white shadow backdrop-blur
                     @wide:bottom-auto @wide:top-[calc(3.25rem+env(safe-area-inset-top))]"
        >
          {offline ? 'Offline' : 'Not refreshed'}
          {age.publishedAt && <> · map as of {shortDate(age.publishedAt)}</>}
        </div>
      )}

      {/* A new version never applies itself: a reload mid-ride would drop the selected route. */}
      {needRefresh && (
        <button
          type="button"
          data-testid="update"
          onClick={reloadToUpdate}
          className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] left-1/2 z-20 -translate-x-1/2
                     rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-lg"
        >
          New version · Reload
        </button>
      )}

      {saved.selected && (
        // Keyed on the route: SWITCH leaves the hintuans open or folded as
        // they were; another route opens folded.
        <TripCard
          key={saved.selected.route_id}
          variant={saved.selected}
          variants={saved.variants}
          timeline={routeTimeline(saved.selected, stops.stops, stops.stopsAlong(saved.selected.id))}
          worn={listing && worn?.id === saved.selected.id ? worn.livery : undefined}
          onBackToList={listing ? () => saved.select(null, { keepList: true }) : null}
          onSwitch={(v) => saved.select(v.id, { keepList: true })}
          onClose={closeAll}
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
          stops={stops.stops}
          onPickSibling={stops.show}
          onClose={() => stops.select(null)}
        />
      )}

      {/*
        Routes alone under the tap: the owner's route list (2026-09-28), kept
        hidden behind the trip picked from it (2026-09-29). With a hotspot
        among them, the Chooser still asks, until he redraws it.
      */}
      {listing && (
        <RouteCardList
          key={choice.map((c) => c.id).join()}
          hidden={!!saved.selected}
          routes={saved.candidates}
          back={saved.back}
          onFlip={saved.flip}
          onRoute={(v, livery) => {
            stops.select(null)
            setWorn({ id: v.id, livery })
            saved.select(v.id, { keepList: true })
          }}
          onClose={closeAll}
        />
      )}

      {choosing && stops.candidates.length > 0 && (
        <Chooser
          key={choice.map((c) => c.id).join()}
          routes={saved.candidates}
          stops={stops.candidates}
          back={saved.back}
          onFlip={saved.flip}
          onRoute={(v) => {
            stops.select(null)
            saved.select(v.id)
          }}
          onStop={(s) => {
            saved.select(null)
            stops.select(s.id)
          }}
          onClose={closeAll}
        />
      )}

      {!saved.selected && !stops.selected && !choosing && saved.variants.length > 0 && (
        <div
          // On a phone, bottom left above the scale: the credit line opens to
          // three lines across the top there, and the pill would cover it.
          className="absolute bottom-[calc(2.5rem+env(safe-area-inset-bottom))]
                     left-[calc(1rem+env(safe-area-inset-left))] z-10 rounded-full bg-white/90 px-3
                     py-1.5 text-xs text-neutral-500 shadow ring-1 ring-black/5 backdrop-blur
                     @wide:bottom-auto @wide:top-[calc(1rem+env(safe-area-inset-top))]"
        >
          {saved.variants.length} {saved.variants.length === 1 ? 'route' : 'routes'}
          {stops.stops.length > 0 && (
            <> · {hotspotCount(stops.stops)} {hotspotCount(stops.stops) === 1 ? 'hotspot' : 'hotspots'}</>
          )}
        </div>
      )}
    </div>
  )
}

/** Whether the browser believes it has a network; `false` is certain, `true` only hopeful. */
function useOffline(): boolean {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener('online', notify)
      window.addEventListener('offline', notify)
      return () => {
        window.removeEventListener('online', notify)
        window.removeEventListener('offline', notify)
      }
    },
    () => !navigator.onLine,
    () => false,
  )
}

/** When the map on screen was published, and whether it came from a stored copy, from the file both hooks already share. */
function useMapAge(): { publishedAt: string | null; stale: boolean } {
  const [age, setAge] = useState<{ publishedAt: string | null; stale: boolean }>({ publishedAt: null, stale: false })
  useEffect(() => {
    let live = true
    loadMapFile().then((f) => live && setAge({ publishedAt: f.published_at, stale: mapFileIsStale() }), () => {})
    return () => {
      live = false
    }
  }, [])
  return age
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "14 Sep", in the phone's own time zone; spelled by hand so every browser agrees. */
function shortDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]}`
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
 * The chosen direction as the owner's trip card (RouteTripDetail,
 * 2026-09-29), from what the map file knows: its ends as the list names
 * them, the whole ride's pesos, the hintuans on the way, and the colour of
 * the place it leaves from — the one its card wore in the list, when it was
 * picked from there. SWITCH turns it round, the list staying behind it, and
 * the card then wears its new origin's colour.
 *
 * Share, the length, the mode, the status and the ride-to preview went with
 * the old card: the owner dropped them for now, to design later (2026-09-28).
 * So did the old card's fare details — the students/seniors/PWDs price, the
 * fare rule line, the route's fare_note, the estimate's source line and the
 * "old ₱13" grace warning (fare.previous): his frames carry only the pesos,
 * and he dropped them all on 2026-09-29. RouteSheet still shows them in the
 * studio.
 *
 * The address still follows the card (useShareLink), so a link can be copied
 * from the address bar, and still opens its trip.
 */
function TripCard({
  variant,
  variants,
  timeline,
  worn,
  onBackToList,
  onSwitch,
  onClose,
}: {
  variant: VariantSummary
  variants: readonly VariantSummary[]
  timeline: Timeline
  worn: Livery | undefined
  onBackToList: (() => void) | null
  onSwitch: (sibling: VariantSummary) => void
  onClose: () => void
}) {
  const { from, to } = directionEnds(variant)
  // The place's colour for the visit (liveries.ts): drawn when first met, kept after.
  const kept = useMemo(() => liveriesFor([from])[0], [from])
  const sibling = otherDirection(variants, variant)
  const switchable = !!sibling && isDrawn(sibling)
  return (
    <RouteTripDetail
      livery={worn ?? kept}
      fare={wholeRideFare([variant])}
      routeOrigin={from}
      hintuans={timeline.between}
      routeDirection={to}
      switchable={switchable}
      back={variant.reversed}
      onSwitch={() => {
        if (sibling && switchable) onSwitch(sibling)
      }}
      onBackToList={onBackToList}
      onClose={onClose}
    />
  )
}
