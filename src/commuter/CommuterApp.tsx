import { useRef, useState } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { HintuanCard } from '../shared/cards/HintuanCard'
import { placeKey } from '../shared/model/places'
import { MAP_FILE_TOO_NEW, loadLine, loadStopsFromFile, loadVariantsFromFile } from './mapFile'
import { reloadForNewerApp, reloadToUpdate, useNeedRefresh } from './pwa'
import { METRO_MANILA, MapView, coarse } from '../shared/map/MapView'
import { RouteCardList } from '../shared/cards/RouteCardList'
import { clearOfSheet } from '../shared/cards/BottomSheet'
import { useCardStack } from '../shared/cards/useCardStack'
import { useRideTo } from '../shared/map/rideTo'
import { routeTimeline } from '../shared/model/ride'
import { useLitRides } from '../shared/map/useLitRides'
import { useSavedRoutes } from '../shared/map/useSavedRoutes'
import { useSavedStops } from '../shared/map/useSavedStops'
import { HintuanPin } from '../shared/map/HintuanPin'
import { EndTitles } from '../shared/map/EndTitles'
import { Notices } from './Notices'
import { TripCard } from '../shared/cards/TripCard'
import { useMapAge, useOffline } from './status'
import { useShareLink } from './useShareLink'
import { useCameraBefore, useCardOverview, useHeightOverview, useSwitchOverview, useTripOverview, type Framed } from './useOverviews'
import { Locator } from './Locator'
import { LocatorOnMap } from './LocatorIndicatorOverlay'
import { useLocator } from './useLocator'
import { useLocatorMood } from './locatorMood'
import { nearestOnLines, useDotLook } from './dotLook'
import type { LngLat } from '../shared/geo/geo'
import { variantLine } from '../shared/model/routes'

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

  // What the lit routes wear on the map, their ends named (useLitRides).
  const rides = useLitRides(map, saved, stops.stops)
  // The route list, a hotspot's card and the trip opened from either: which
  // is up, what stands behind what, their height and colours (useCardStack).
  const cards = useCardStack(map, saved, stops)
  // A hintuan picked on the trip card (the owner's Timeline State=Selected,
  // 2026-09-29): the camera gliding there clear of the card, and a circle
  // popping up on it — the route left whole, no get-off circles (the
  // owner's ask of 2026-09-30: "now I don't want to cut the route"). The
  // card stays at its height (clearOfSheet).
  const tripDock = useRef<HTMLDivElement>(null)
  // The HintuanCard's, for a picked box to land clear of it.
  const hotspotDock = useRef<HTMLDivElement>(null)
  const ride = useRideTo(map, saved.selected, stops.stops, { onGlide: cards.clearOf(tripDock) })
  useTripOverview(map, saved.selected, tripDock, cards.snap)
  // The page, and the card's sheet on show in it, for what the camera keeps clear of.
  const root = useRef<HTMLDivElement>(null)
  const openSheet = () => root.current?.querySelector<HTMLElement>('[data-floats]:not([hidden])') ?? null
  // A RouteCard picked, in the list or a hotspot's card: its routes whole.
  useCardOverview(map, saved.highlight, saved.variants, openSheet, cards.snap)
  // …and on a hotspot's card, let go, the camera the visitor had before it.
  const before = useCameraBefore(map)
  // SWITCH, on any card: the routes the other way round, whole.
  const [switches, setSwitches] = useState(0)
  const switched = () => setSwitches((n) => n + 1)
  useSwitchOverview(map, saved.litVariants, switches, openSheet, cards.snap)
  // The sheet settled at another height: what the card on show frames, again,
  // in the map it leaves — a trip's route, a picked card's routes or what the
  // list lights, a hotspot's place.
  const framed = (): Framed => {
    const ids = saved.highlight && new Set(saved.highlight.ids)
    const picked = ids && { lines: saved.variants.filter((v) => ids.has(v.id)).map(variantLine) }
    if (saved.selected) return { lines: [variantLine(saved.selected)] }
    if (stops.selected) return picked ?? { at: stops.selected.point.coordinates as LngLat }
    if (cards.choosing) return picked ?? { lines: saved.litVariants.map(variantLine) }
    return null
  }
  useHeightOverview(map, cards.snap, framed, openSheet)

  useShareLink(map, saved)
  // The visitor's own position, when they ask for it, and the camera with
  // them (the owner's LocatorButton, 2026-10-01): kept clear of the card on
  // show, as a picked hintuan is.
  const locator = useLocator(map, {
    compass: coarse,
    snap: cards.snap,
    offset: () =>
      map ? clearOfSheet(map.getContainer(), openSheet(), cards.snap) : [0, 0],
  })
  // How the dot feels: glad as the location comes, a boing at a tap on the
  // button or on the dot, now and then a huff (locatorMood).
  const { mood, face, beat, poke } = useLocatorMood(locator)
  // …and where it looks: at what was just picked, for three seconds — a
  // hintuan on the trip card, a place, or the routes lit (dotLook.ts).
  const eyes = useDotLook(locator.fix?.at ?? null, [
    { key: ride.pickedId, at: () => ride.pinAt },
    { key: stops.selected && placeKey(stops.selected), at: () => (stops.selected?.point.coordinates as LngLat | undefined) ?? null },
    {
      key: saved.litVariants.length ? saved.litVariants.map((v) => v.id).join() : null,
      at: () => (locator.fix ? nearestOnLines(locator.fix.at, saved.litVariants.map(variantLine)) : null),
    },
  ])
  const offline = useOffline()
  const age = useMapAge(saved.variants)
  const needRefresh = useNeedRefresh()

  // A place's name on the map: its card opens at the height the trip's is
  // at, or a hotspot card's.
  const openPlace = (stopId: string) => cards.openPlace(stopId, tripDock.current ? tripDock : hotspotDock)
  // A tail's name with no trip open: its ride's trip, in the colour of the card picked, if one is.
  const openRide = (id: string) => {
    const v = saved.variants.find((x) => x.id === id)
    if (v) cards.openTrip(v, saved.highlight?.livery)
  }
  const { tripLivery, look, height } = cards

  return (
    // `data-directions`: how many the map file brought, for the suites on a
    // production build, where the map itself is out of their reach — the
    // count pill that told them went on 2026-09-29.
    // `data-dock-host`: the open card's sheet says where its top is here,
    // for the LocatorButton to follow (BottomSheet).
    <div ref={root} data-dock-host data-directions={saved.variants.length} className="@container relative h-full w-full overflow-clip">
      {/*
        No count of routes and hotspots in a corner, and no +, − or compass:
        the owner's notes on his screenshot, "annoying for users"
        (2026-09-29).
      */}
      <MapView onReady={setMap} zoomButtons={false} maxBounds={METRO_MANILA} />
      {map && <Locator locator={locator} docked={cards.open} />}
      {map && locator.fix && <LocatorOnMap map={map} fix={locator.fix} heading={locator.heading} mood={mood} face={face} beat={beat} look={eyes} onPoke={poke} />}
      {/* Each lit ride's ends, named over their circles; with no trip open, a tail opens its ride's. */}
      {map && (
        <EndTitles
          map={map}
          rides={rides}
          look={look}
          onPick={openPlace}
          onTrip={saved.selected ? undefined : openRide}
        />
      )}
      {/* Keyed on the pick: another hintuan pops a fresh circle. */}
      {map && ride.pinAt && tripLivery && (
        <HintuanPin
          key={ride.pickedId}
          map={map}
          at={ride.pinAt}
          label={ride.pickedLabel}
          livery={tripLivery}
          onPick={() => ride.pickedId && openPlace(ride.pickedId)}
        />
      )}

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
        // One card for as long as a trip is open: SWITCH, and another
        // route from its "Other routes", leave the hintuans open or folded
        // as they were (the owner, 2026-10-01: "don't shrink it"), and the
        // sheet at its height. A trip opened afresh opens folded.
        <TripCard
          variant={saved.selected}
          variants={saved.variants}
          timeline={routeTimeline(saved.selected, stops.stops, stops.stopsAlong(saved.selected.id))}
          livery={tripLivery}
          onBackToList={cards.backFromTrip}
          onSwitch={(v) => {
            saved.select(v.id, { keepList: true })
            switched()
          }}
          onClose={cards.closeAll}
          picked={ride.pickedId}
          // The pesos to a picked hintuan are the full line's: none while
          // only its overview is here.
          pickedMetres={saved.fullIds.has(saved.selected.id) ? ride.rideTo?.metres : undefined}
          onPick={ride.pick}
          onEnd={ride.toEnd}
          endPicked={ride.endPicked}
          dockRef={tripDock}
          height={height}
          // "Other routes": that route's trip in this one's place, ‹ still to
          // what this one was picked from; the camera takes it in as it opens.
          // The sheet goes to Middle from wherever it is, so the map shows it
          // (the owner, 2026-10-01: from Max at first, then "not only max");
          // the hintuans stay open or folded.
          onOtherRoute={(v) => {
            if (height.snap !== 'middle') height.onSnap('middle')
            saved.select(v.id, { keepList: true })
          }}
        />
      )}

      {/*
        A hotspot's card: the owner's HintuanCard (3854:12690, 2026-09-30),
        its place and every box of it, the routes stopping at the Selected
        one as his RouteCards; it stays behind the trip picked from them,
        hidden, for the trip's ‹. It is `card` to the suites too, and comes
        after the trip here on purpose: their first `card` is then the trip
        while this one hides behind it.
      */}
      {stops.selected && (
        // Keyed by the place: another of its boxes — a row, or SWITCH moving
        // to it — keeps the card as it is, its way round with it.
        <HintuanCard
          key={placeKey(stops.selected)}
          routeCards={{
            selected: saved.highlight?.where === 'hotspot' ? saved.highlight.from : null,
            onSelect: (p) => {
              const pickedHere = saved.highlight?.where === 'hotspot'
              if (!p && pickedHere) before.back()
              else if (p && !pickedHere) before.keep()
              saved.highlightCard(p && { where: 'hotspot', ...p })
            },
            onShown: saved.showCard,
            // The other way round, the camera kept where it is (HintuanCard's onSwitch).
            onSwitch: (box) => box && stops.select(box),
          }}
          hidden={!!saved.selected}
          height={height}
          dockRef={hotspotDock}
          stop={stops.selected}
          stops={stops.stops}
          linkedVariantIds={stops.linkedVariantIds}
          variants={saved.variants}
          onSelectVariant={cards.openTrip}
          // Its Selected row tapped again: no box is the one until a row is
          // picked (the owner, 2026-10-01).
          deselected={stops.letGone}
          onDeselect={() => {
            saved.highlightCard(null)
            stops.letGo()
          }}
          // Another box: the map goes there, the box clear of the card,
          // which stays at its height (the owner, 2026-10-01).
          onPickBox={(id) => {
            saved.highlightCard(null)
            stops.show(id, cards.clearOf(hotspotDock))
          }}
          onBack={cards.backToTrip}
          onClose={cards.closeStop}
        />
      )}

      {/*
        Several things under the tap: the owner's route list (2026-09-28),
        kept hidden behind the trip picked from it (2026-09-29). Picking a
        route leaves the hotspots under the tap listed, so ‹ finds the list
        whole; a hotspot's row opens its card in the list's place.
      */}
      {cards.choosing && (
        <RouteCardList
          key={cards.choice.map((c) => c.id).join()}
          hidden={!!saved.selected || cards.tripBehind}
          height={height}
          routes={saved.candidates}
          stops={stops.candidates}
          back={saved.back}
          onFlip={() => {
            saved.flip()
            switched()
          }}
          selected={saved.highlight?.where === 'list' ? saved.highlight.from : null}
          onSelect={(p) => saved.highlightCard(p && { where: 'list', ...p })}
          onRoute={cards.openTrip}
          onStop={(s) => cards.openStop(s.id)}
          onClose={cards.closeAll}
        />
      )}

    </div>
  )
}

