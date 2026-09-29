import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type Ref } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { HotspotCard } from '../shared/cards/HotspotCard'
import { MAP_FILE_TOO_NEW, loadMapFile, loadStopsFromFile, loadVariantsFromFile, mapFileIsStale } from './mapFile'
import { reloadForNewerApp, reloadToUpdate, useNeedRefresh } from './pwa'
import { APP_MOVE, MapView, coarse } from '../shared/map/MapView'
import { rideFare } from '../shared/model/fares'
import { lineLength } from '../shared/geo/geo'
import { liveriesFor, type Livery } from '../shared/model/liveries'
import { RouteCardList } from '../shared/cards/RouteCardList'
import { RouteTripDetail } from '../shared/cards/RouteTripDetail'
import { clearOfDock } from '../shared/cards/RouteDock'
import { useRideTo } from '../shared/map/rideTo'
import {
  directionEnds,
  isDrawn,
  otherDirection,
  routeTimeline,
  sharingAnEnd,
  travelLine,
  variantLine,
  type VariantSummary,
} from '../shared/model/routes'
import { useDirectionArrows, useRideColours } from '../shared/map/directionArrows'
import { usePassStretches } from '../shared/geo/passStretches'
import { useBabaanSides } from '../shared/geo/babaanSides'
import { useLitLineColour, useSavedRoutes } from '../shared/map/useSavedRoutes'
import { LIT_LINE, LIVERY_LINE } from '../shared/map/liveryLine'
import { useSavedStops } from '../shared/map/useSavedStops'
import type { Timeline } from '../shared/model/stops'
import { Walker } from './Walker'
import { WhereAmIButton } from './WhereAmI'
import { useWhereAmI } from './useWhereAmI'

/** The query key a shared link carries: `/?r=<direction id>`. A query, not a path, so no SPA fallback is needed. */
const SHARE_KEY = 'r'

/**
 * The public map at /. Everything published so far and a card for whatever is
 * tapped — nothing else. No sign-in, no drawing, no database: the map comes
 * from one published file, and this page's bundle carries neither editor code
 * nor a Supabase client (scripts/checks/check-build.mjs proves both).
 *
 * On a phone the tap is the whole interface: the cards are bottom sheets, a
 * tap near a line counts, and a tap where routes share a road offers a choice.
 */
export default function CommuterApp() {
  const [map, setMap] = useState<MapLibreMap | null>(null)
  // One file, fetched once, shared by both hooks.
  const saved = useSavedRoutes(map, loadVariantsFromFile)
  // While a trip is open, the map lights only the trip (the owner, 2026-09-29).
  const stops = useSavedStops(map, loadStopsFromFile, { muted: !!saved.selected })
  const tooNew = saved.error === MAP_FILE_TOO_NEW || stops.error === MAP_FILE_TOO_NEW

  // Where a lit direction passes a hintuan, the line turns orange for that stretch.
  usePassStretches(map, saved.variants, stops.stops, saved.lit)

  // Which way the jeep goes, on what is lit only — the chosen direction, the
  // Selected card's directions, or else a list's or a hotspot card's: chevrons
  // flowing inside each line from where the ride starts, and each end a
  // circle with its place's name.
  const rides = useMemo(
    () => saved.litVariants.map((v) => ({ line: travelLine(v, stops.stops), ...directionEnds(v) })),
    [saved.litVariants, stops.stops],
  )
  useDirectionArrows(map, rides)
  // The chosen direction's side of each hintuan it cuts across: its right.
  useBabaanSides(map, saved.selected, stops.stops)
  // A hintuan picked on the trip card: the ride drawn dark only that far,
  // the camera gliding there clear of the card, and no get-off circles (the
  // owner's Timeline State=Selected, 2026-09-29).
  const tripDock = useRef<HTMLDivElement>(null)
  const ride = useRideTo(map, saved.selected, stops.stops, {
    dots: false,
    offset: () => (map ? clearOfDock(map.getContainer(), tripDock.current) : [0, 0]),
  })

  useShareLink(map, saved)
  // The visitor's own position, when they ask for it: a walking figure.
  const where = useWhereAmI(map)
  const offline = useOffline()
  const age = useMapAge()
  const needRefresh = useNeedRefresh()

  // One tap, several things: routes, hotspots or both, in the owner's route
  // list — the hotspots first, then the routes as his RouteCards; the
  // Chooser it replaced asked for a tap with a hotspot among them until
  // 2026-09-29. Keyed on what it lists, so a fresh tap gets a fresh list. It
  // stays behind a trip picked from it, hidden, for the trip's ‹ — and so
  // does a hotspot's card (the owner, 2026-09-29).
  const choice = [...saved.candidates, ...stops.candidates]
  const choosing = choice.length > 1
  // ✕ on the list or a trip: everything the tap opened closes.
  const closeAll = () => {
    saved.select(null)
    stops.select(null)
  }
  // The colour a card wore — in the list, or in a hotspot's card — for the
  // trip picked from it. Read only as the trip opens, and only while that
  // card stands behind it: a clash colour is "for this list only"
  // (liveries.ts), so the same trip opened again any other way wears its
  // place's kept colour. Once open, the trip keeps what it opened in until
  // it closes — through SWITCH, and even when a tap on its own line closes
  // the list behind it: a card never changes colour while it is open (the
  // owner, 2026-09-29).
  const [worn, setWorn] = useState<{ id: string; livery: Livery } | null>(null)
  const wornBehind = choosing || !!stops.selected

  // The trip's colour, decided as it opens — its RouteCard's, in the list or
  // a hotspot's card, else its place's for the visit (liveries.ts: drawn
  // when first met, kept after) — and kept until it closes, through SWITCH.
  // Kept here, not in the trip card, since its line wears it too (the
  // owner's ask, 2026-09-29).
  const [tripWears, setTripWears] = useState<{ routeId: string; livery: Livery } | null>(null)
  const open = saved.selected
  let tripLivery = open && tripWears?.routeId === open.route_id ? tripWears.livery : null
  if (open && !tripLivery) {
    tripLivery = (wornBehind && worn?.id === open.id ? worn.livery : undefined) ?? liveriesFor([directionEnds(open).from])[0]
    setTripWears({ routeId: open.route_id, livery: tripLivery })
  } else if (!open && tripWears) {
    setTripWears(null)
  }
  // What is lit wears the colour of the card it answers: the open trip's, or
  // the picked RouteCard's; a list with none picked lights its routes in the
  // selected blue (the owner's ask, 2026-09-29).
  const look = tripLivery ? LIVERY_LINE[tripLivery] : saved.highlight ? LIVERY_LINE[saved.highlight.livery] : LIT_LINE
  useLitLineColour(map, look.line)
  useRideColours(map, look)

  // The trip's ‹: back to what it was picked from, kept behind it as it was
  // left, every card at rest — the route list, a hotspot's card (the
  // owner's "back to that card" and "back to normal", 2026-09-29). Opened
  // with nothing behind it — a tap on its line, a shared link — it lists
  // its route and those sharing its head or its tail, the way the trip
  // goes, as a tap where they all run would: Tala
  // → Novaliches ‹ to Tala's card, Tala → Novaliches and SM Fairview. The
  // owner's ask of 2026-09-29, drawn with a shared head; a shared tail counts
  // too (PLAN.md's "grouped by the end it shares"), and the way back lists
  // the trip's way — both his calls the same day. With nothing else drawn
  // that way round, there is nothing to go back to.
  const trip = saved.selected
  const fan = trip ? sharingAnEnd(saved.variants, trip) : []
  const backToList = stops.selected
    ? () => saved.select(null, { keepList: true })
    : choosing
      ? () => saved.select(null, { keepList: true })
      : trip && fan.filter((v) => v.reversed === trip.reversed && isDrawn(v)).length > 1
        ? () => {
            stops.select(null)
            saved.openList(fan, trip.reversed)
          }
        : null

  return (
    // `data-directions`: how many the map file brought, for the suites on a
    // production build, where the map itself is out of their reach — the
    // count pill that told them went on 2026-09-29.
    <div data-directions={saved.variants.length} className="@container relative h-full w-full overflow-hidden">
      {/*
        No count of routes and hotspots in a corner, and no +, − or compass:
        the owner's notes on his screenshot, "annoying for users"
        (2026-09-29).
      */}
      <MapView onReady={setMap} zoomButtons={false} />
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
            // it again cannot help; the newer app can, fetched through the
            // worker (pwa.ts, reloadForNewerApp).
            <>
              <span>{MAP_FILE_TOO_NEW} Reload to update.</span>
              <button
                type="button"
                onClick={() => void reloadForNewerApp()}
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
        the file itself, so it is exact. Where the count pill was until the
        owner took it off (2026-09-29): bottom left above the scale on a phone
        (the credit line opens across the top there), top left on a wide map.
      */}
      {(offline || age.stale) && (
        <div
          data-testid="offline"
          className="absolute bottom-[calc(2.5rem+env(safe-area-inset-bottom))]
                     left-[calc(1rem+env(safe-area-inset-left))] z-10 rounded-full bg-neutral-800/90
                     px-3 py-1.5 text-xs text-white shadow backdrop-blur
                     @wide:bottom-auto @wide:top-[calc(1rem+env(safe-area-inset-top))]"
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

      {saved.selected && tripLivery && (
        // Keyed on the route: SWITCH leaves the hintuans open or folded as
        // they were, in the colour the trip opened in; another route opens
        // folded, in its own.
        <TripCard
          key={saved.selected.route_id}
          variant={saved.selected}
          variants={saved.variants}
          timeline={routeTimeline(saved.selected, stops.stops, stops.stopsAlong(saved.selected.id))}
          livery={tripLivery}
          onBackToList={backToList}
          onSwitch={(v) => saved.select(v.id, { keepList: true })}
          onClose={closeAll}
          picked={ride.pickedId}
          pickedMetres={ride.rideTo?.metres}
          onPick={ride.pick}
          onEnd={ride.toEnd}
          endPicked={ride.endPicked}
          dockRef={tripDock}
        />
      )}

      {/*
        A hotspot's card: its routes are the owner's RouteCards (2026-09-29),
        and it stays behind the trip picked from them, hidden, for the trip's
        ‹. The rest of it waits for his hintuan design. It is `card` to the
        suites too, and comes after the trip here on purpose: their first
        `card` is then the trip while this one hides behind it.
      */}
      {stops.selected && (
        <HotspotCard
          routeCards={{
            selected: saved.highlight?.where === 'hotspot' ? saved.highlight.from : null,
            onSelect: (p) => saved.highlightCard(p && { where: 'hotspot', ...p }),
            onShown: saved.showCard,
          }}
          hidden={!!saved.selected}
          stop={stops.selected}
          linkedVariantIds={stops.linkedVariantIds(stops.selected.id)}
          variants={saved.variants}
          onSelectVariant={(v, livery) => {
            setWorn(livery ? { id: v.id, livery } : null)
            saved.select(v.id, { keepList: true })
          }}
          stops={stops.stops}
          onPickSibling={(id) => {
            saved.highlightCard(null)
            stops.show(id)
          }}
          onClose={() => {
            saved.highlightCard(null)
            stops.select(null)
          }}
        />
      )}

      {/*
        Several things under the tap: the owner's route list (2026-09-28),
        kept hidden behind the trip picked from it (2026-09-29). Picking a
        route leaves the hotspots under the tap listed, so ‹ finds the list
        whole; a hotspot's row opens its card in the list's place.
      */}
      {choosing && (
        <RouteCardList
          key={choice.map((c) => c.id).join()}
          hidden={!!saved.selected}
          routes={saved.candidates}
          stops={stops.candidates}
          back={saved.back}
          onFlip={saved.flip}
          selected={saved.highlight?.where === 'list' ? saved.highlight.from : null}
          onSelect={(p) => saved.highlightCard(p && { where: 'list', ...p })}
          onRoute={(v, livery) => {
            setWorn({ id: v.id, livery })
            saved.select(v.id, { keepList: true })
          }}
          onStop={(s) => {
            saved.select(null)
            stops.select(s.id)
          }}
          onClose={closeAll}
        />
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

/**
 * The chosen direction as the owner's trip card (RouteTripDetail,
 * 2026-09-29), from what the map file knows: its ends as the list names
 * them, the whole ride's length and pesos, the hintuans on the way, and the colour of
 * the place it leaves from — the one its RouteCard wore, when it was picked
 * from one, in the list or in a hotspot's card. SWITCH turns it round, what
 * it was picked from staying behind it, and the card keeps the colour it
 * opened in: turned round, it is still the same card (the owner, 2026-09-29).
 *
 * Share, the length, the mode and the status went with the old card: the
 * owner dropped them for now, to design later (2026-09-28). The ride-to
 * preview went too, and came back as his picked hintuan (2026-09-29): its
 * pill prices the ride from the trip's start to there, as the tile prices
 * the whole.
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
  livery,
  onBackToList,
  onSwitch,
  onClose,
  picked,
  pickedMetres,
  onPick,
  onEnd,
  endPicked,
  dockRef,
}: {
  variant: VariantSummary
  variants: readonly VariantSummary[]
  timeline: Timeline
  /** The colour it opened in, kept through SWITCH; its line wears it too. */
  livery: Livery
  onBackToList: (() => void) | null
  onSwitch: (sibling: VariantSummary) => void
  onClose: () => void
  /** The hintuan picked on the timeline (useRideTo), and how far the ride to it runs, when its line reaches it. */
  picked: string | null
  pickedMetres: number | undefined
  onPick: (id: string) => void
  /** The origin's or the destination's row: the whole ride, and that end on the map. */
  onEnd: (end: 'from' | 'to') => void
  /** The end picked from its row (useRideTo's `endPicked`), or null. */
  endPicked: 'from' | 'to' | null
  dockRef: Ref<HTMLDivElement>
}) {
  const { from, to } = directionEnds(variant)
  const sibling = otherDirection(variants, variant)
  const switchable = !!sibling && isDrawn(sibling)
  // The whole ride, measured once: its Kilometer and its Expected fare.
  const metres = lineLength(variantLine(variant))
  return (
    <RouteTripDetail
      livery={livery}
      metres={metres}
      fare={rideFare(variant.route?.mode, metres)}
      routeOrigin={from}
      hintuans={timeline.between}
      picked={picked}
      pickedFare={pickedMetres === undefined ? undefined : rideFare(variant.route?.mode, pickedMetres)}
      onPick={onPick}
      onEnd={onEnd}
      endPicked={endPicked}
      dockRef={dockRef}
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
