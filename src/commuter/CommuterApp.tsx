import { useState } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { HintuanCard } from '../shared/cards/HintuanCard'
import { placeKey } from '../shared/model/places'
import { MAP_FILE_TOO_NEW, loadLine, loadStopsFromFile, loadVariantsFromFile } from './mapFile'
import { reloadForNewerApp, reloadToUpdate, useNeedRefresh } from './pwa'
import { METRO_MANILA, MapView, coarse } from '../shared/map/MapView'
import { RouteCardList } from '../shared/cards/RouteCardList'
import { useCardStack } from '../shared/cards/useCardStack'
import { useCardCamera } from '../shared/cards/useCardCamera'
import { routeTimeline } from '../shared/model/ride'
import { useLitRides } from '../shared/map/useLitRides'
import { useSavedRoutes } from '../shared/map/useSavedRoutes'
import { useSavedStops } from '../shared/map/useSavedStops'
import { HintuanPin } from '../shared/map/HintuanPin'
import { StationLabels } from '../shared/map/StationLabels'
import { EndTitles } from '../shared/map/EndTitles'
import { Notices } from './Notices'
import { TripCard } from '../shared/cards/TripCard'
import { useMapAge, useOffline } from './status'
import { useStatusBarColour } from './statusBar'
import { useShareLink } from './useShareLink'
import { Locator } from './Locator'
import { LocatorOnMap } from './LocatorIndicatorOverlay'
import { useLocator } from './useLocator'
import { useLocatorMood } from './locatorMood'
import { nearestOnLines, useGazeHush, type Subject } from './dotGaze'
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

  // The route list, a hotspot's card and the trip opened from either: which
  // is up, what stands behind what, their height and colours (useCardStack).
  const cards = useCardStack(map, saved, stops)
  // The camera with the cards: a hintuan picked on the trip, gliding there;
  // a trip, a picked RouteCard and SWITCH taken in whole, again as the sheet
  // settles; the camera from before a hotspot's card was picked, back as it
  // is let go (useCardCamera).
  const { root, tripDock, hotspotDock, ride, clearOfOpen, switchTrip, flipList, otherRoute, pickOnPlaceCard, openPlace, openRide, openTrip, backFromTrip } =
    useCardCamera(map, saved, stops, cards)
  // What the lit routes wear on the map, their ends named (useLitRides): a
  // picked hintuan's ride flowing only as far as there.
  const rides = useLitRides(map, saved, stops.stops, null, ride.ridden)

  useShareLink(map, saved)
  // The visitor's own position, when they ask for it, and the camera with
  // them (the owner's LocatorButton, 2026-10-01): kept clear of the card on
  // show, as a picked hintuan is.
  const locator = useLocator(map, {
    compass: coarse,
    snap: cards.snap,
    offset: clearOfOpen,
  })
  // How the dot feels: glad as the location comes, a boing at a tap on the
  // button or on the dot, now and then a huff (locatorMood).
  const { mood, face, beat, poke } = useLocatorMood(locator)
  // …and its gaze: at what was just picked, for three seconds (dotGaze.ts) —
  // a hintuan on the trip card, a place, a trip, a card, or the routes a tap
  // on the map lists. Keyed by route, not direction, so SWITCH is no pick;
  // ‹ and ✕ are hushed, so going back picks nothing.
  const { hush, hushedAt } = useGazeHush()
  const nearestLit = (lines: LngLat[][]) => (locator.fix ? nearestOnLines(locator.fix.at, lines) : null)
  const routesOf = (vs: readonly { route_id: string }[]) => [...new Set(vs.map((v) => v.route_id))].sort().join() || null
  const gazeAt: Subject[] = [
    { key: ride.pickedId, at: () => ride.pinAt },
    { key: stops.selected && placeKey(stops.selected), at: () => (stops.selected?.point.coordinates as LngLat | undefined) ?? null },
    { key: saved.selected?.route_id ?? null, at: () => nearestLit(saved.selected ? [variantLine(saved.selected)] : []) },
    { key: saved.highlight && `${saved.highlight.where}:${saved.highlight.from}`, at: () => nearestLit(saved.litVariants.map(variantLine)) },
    { key: routesOf(saved.candidates), at: () => nearestLit(saved.litVariants.map(variantLine)) },
  ]
  const offline = useOffline()
  // The phone's status bar in the map's colour (statusBar.ts).
  useStatusBarColour(map)
  const age = useMapAge(saved.variants)
  const needRefresh = useNeedRefresh()

  const { tripLivery, look, inCardColour, height } = cards

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
      {map && locator.fix && <LocatorOnMap map={map} fix={locator.fix} heading={locator.heading} mood={mood} face={face} beat={beat} gazeAt={gazeAt} hushedAt={hushedAt} onPoke={poke} />}
      {/* Each lit ride's ends, named over their circles; with no trip open, a tail opens its ride's. */}
      {map && (
        <EndTitles
          map={map}
          rides={rides}
          look={look}
          badged={inCardColour}
          onPick={openPlace}
          onTrip={saved.selected ? undefined : openRide}
        />
      )}
      {/* A selected train line's stations, named along it (RouteLineLabel). */}
      {map && saved.selected && tripLivery && (
        <StationLabels map={map} selected={saved.selected} stops={stops.stops} livery={tripLivery} pickedId={ride.pickedId} onPick={openPlace} />
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
          onBackToList={hush(backFromTrip)}
          onSwitch={switchTrip}
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
          onOtherRoute={otherRoute}
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
            onSelect: pickOnPlaceCard,
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
          onSelectVariant={openTrip}
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
          onBack={hush(cards.backToTrip)}
          onClose={hush(cards.closeStop)}
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
          onFlip={flipList}
          selected={saved.highlight?.where === 'list' ? saved.highlight.from : null}
          onSelect={(p) => saved.highlightCard(p && { where: 'list', ...p })}
          onRoute={openTrip}
          onStop={(s) => cards.openStop(s.id)}
          onClose={cards.closeAll}
        />
      )}

    </div>
  )
}

