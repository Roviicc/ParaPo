import { useMemo, useRef, useState } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { HotspotCard } from '../shared/cards/HotspotCard'
import { MAP_FILE_TOO_NEW, loadLine, loadStopsFromFile, loadVariantsFromFile } from './mapFile'
import { reloadForNewerApp, reloadToUpdate, useNeedRefresh } from './pwa'
import { METRO_MANILA, MapView, coarse } from '../shared/map/MapView'
import type { Livery } from '../shared/model/liveries'
import { RouteCardList } from '../shared/cards/RouteCardList'
import { clearOfDock } from '../shared/cards/BottomSheet'
import type { Snap } from '../shared/cards/sheetGesture'
import { useRideTo } from '../shared/map/rideTo'
import { directionEnds, isDrawn } from '../shared/model/routes'
import { routeTimeline, travelLine } from '../shared/model/ride'
import { sharingAnEnd } from '../shared/model/departures'
import { useDirectionArrows, useRideColours } from '../shared/map/directionArrows'
import { usePassStretches } from '../shared/geo/passStretches'
import { useBabaanSides } from '../shared/geo/babaanSides'
import { useLitLineColour } from '../shared/map/savedRoutesLayers'
import { useSavedRoutes } from '../shared/map/useSavedRoutes'
import { LIT_LINE, LIVERY_LINE } from '../shared/map/liveryLine'
import { useSavedStops } from '../shared/map/useSavedStops'
import { Notices } from './Notices'
import { TripCard, useTripLivery } from './TripCard'
import { useMapAge, useOffline } from './status'
import { useShareLink } from './useShareLink'
import { Walker } from './Walker'
import { WhereAmIButton } from './WhereAmI'
import { useWhereAmI } from './useWhereAmI'

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
  // One index, fetched once, shared by both hooks; a direction's full line
  // read as it is lit (mapFile.ts).
  const saved = useSavedRoutes(map, loadVariantsFromFile, { loadLine })
  // While a trip is open, the map lights only the trip (the owner, 2026-09-29).
  const stops = useSavedStops(map, loadStopsFromFile, { muted: !!saved.selected })
  const tooNew = saved.error === MAP_FILE_TOO_NEW || stops.error === MAP_FILE_TOO_NEW

  // Where a lit direction passes a hintuan, the line turns orange for that
  // stretch: worked out on the full lines read — a lit direction's is asked
  // for as it lights, and its orange comes with it — rather than on every
  // overview at load. Offline, a line never read has none.
  const withLines = useMemo(() => saved.variants.filter((v) => saved.fullIds.has(v.id)), [saved.variants, saved.fullIds])
  usePassStretches(map, withLines, stops.stops, saved.lit)

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
  const age = useMapAge(saved.variants)
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

  // The trip's colour: its line wears it too (TripCard.tsx, useTripLivery).
  const tripLivery = useTripLivery(saved.selected, worn, wornBehind)
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

  // One height for the sheets that stand in for one another — the route
  // list, a hotspot's card and the trip opened from either: a pick and ‹
  // keep Low, Middle or Max as they were (the owner's ask of 2026-09-30:
  // "if RouteDetail was in medium, if they go back, the RouteCard is in
  // medium too"). With nothing open it goes back to Middle, where every
  // sheet opens.
  const [snap, setSnap] = useState<Snap>('middle')
  const anyOpen = !!saved.selected || !!stops.selected || choosing
  if (!anyOpen && snap !== 'middle') setSnap('middle')
  const height = { snap, onSnap: setSnap }
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
    <div data-directions={saved.variants.length} className="@container relative h-full w-full overflow-clip">
      {/*
        No count of routes and hotspots in a corner, and no +, − or compass:
        the owner's notes on his screenshot, "annoying for users"
        (2026-09-29).
      */}
      <MapView onReady={setMap} zoomButtons={false} maxBounds={METRO_MANILA} />
      {map && <WhereAmIButton where={where} coarse={coarse} />}
      {map && where.fix && <Walker map={map} fix={where.fix} pose={where.pose} facing={where.facing} />}

      {/*
        A load problem is a banner, never a blank page. On a phone it sits at
        the bottom: the attribution moved to the top right there, opens to three
        lines, and must stay visible. With no map loaded there is no card to
        share the bottom with.
      */}
      <Notices
        loadFailed={!!(saved.error || stops.error)}
        tooNew={tooNew}
        onTryAgain={() => {
          void saved.reload()
          void stops.reload()
        }}
        onReloadNewer={() => void reloadForNewerApp()}
        offline={offline}
        age={age}
        needRefresh={needRefresh}
        onUpdate={reloadToUpdate}
      />

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
          // The pesos to a picked hintuan are the full line's: none while
          // only its overview is here.
          pickedMetres={saved.fullIds.has(saved.selected.id) ? ride.rideTo?.metres : undefined}
          onPick={ride.pick}
          onEnd={ride.toEnd}
          endPicked={ride.endPicked}
          dockRef={tripDock}
          height={height}
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
        // Keyed by the hotspot: "Part of …" → a sibling once reused this card
        // as it was, flipped and pulled up.
        <HotspotCard
          key={stops.selected.id}
          routeCards={{
            selected: saved.highlight?.where === 'hotspot' ? saved.highlight.from : null,
            onSelect: (p) => saved.highlightCard(p && { where: 'hotspot', ...p }),
            onShown: saved.showCard,
          }}
          hidden={!!saved.selected}
          height={height}
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
          height={height}
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

