import { useState } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { HintuanCard } from '../shared/cards/HintuanCard'
import { placeKey } from '../shared/model/places'
import { MAP_FILE_TOO_NEW, loadLine, loadStopsFromFile, loadVariantsFromFile, openingVariants } from './mapFile'
import { reloadForNewerApp, reloadToUpdate, useNeedRefresh } from './pwa'
import { METRO_MANILA, MapView } from '../shared/map/MapView'
import { routesBounds } from '../shared/map/framing'
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
import { VisitorLocation } from './VisitorLocation'
import { useTurn } from './commitTurn'
import { useGazeHush } from './dotGaze'
import { variantLine } from '../shared/model/routes'

/**
 * The routes' framing the map opens on (the owner's Q1, 2026-10-04): their
 * box as the map file or the copy kept from an earlier visit has them
 * (openingVariants), the box the routes' own fit frames (useSavedRoutes).
 * Module-level, as the loaders below are.
 */
const openOnRoutes = () => openingVariants().then((variants) => (variants ? routesBounds(variants) : null))

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

  // The visitor's own position, the dot and the camera with them live in
  // VisitorLocation, so a fix, the phone's compass and the dot's moods
  // render it alone (the cheap-phone plan, step 15, 2026-10-05). Its camera
  // still moves here, where its hook stood: after the cards' camera above,
  // which a sheet set to another height moves in the same commit
  // (commitTurn.ts).
  const locatorTurn = useTurn()
  // The dot's gaze is hushed by ‹ and ✕: going back picks nothing (dotGaze.ts).
  const { hush, hushedAt } = useGazeHush()
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
      {/*
        Opened framed on the routes, and handed over to draw them as soon as
        its style is in (`openOn`, the owner's Q1 of 2026-10-04).
      */}
      <MapView onReady={setMap} zoomButtons={false} maxBounds={METRO_MANILA} openOn={openOnRoutes} />
      {/*
        The visitor's own position, and the camera with them, kept clear of
        the card on show; the dot gazes at what was just picked.
      */}
      <VisitorLocation
        map={map}
        snap={cards.snap}
        offset={clearOfOpen}
        docked={cards.open}
        cameraTurn={locatorTurn}
        picks={{
          pickedId: ride.pickedId,
          pinAt: ride.pinAt,
          place: stops.selected,
          trip: saved.selected,
          highlight: saved.highlight,
          candidates: saved.candidates,
          litVariants: saved.litVariants,
        }}
        hushedAt={hushedAt}
      />
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
      {/*
        A selected train line's stations, named along it (RouteLineLabel). A
        tap picks the station as its row on the trip card does, the map
        gliding in to it (the owner's ask, 2026-10-03), as the studio's do.
      */}
      {map && saved.selected && tripLivery && (
        <StationLabels map={map} selected={saved.selected} stops={stops.stops} livery={tripLivery} pickedId={ride.pickedId} onPick={ride.pick} />
      )}
      {/*
        Keyed on the pick: another hintuan pops a fresh circle. Its name,
        tapped, lets the pick go and takes the camera back where it was, as
        its row tapped again does (the owner's ask, 2026-10-03).
      */}
      {map && ride.pinAt && tripLivery && (
        <HintuanPin
          key={ride.pickedId}
          map={map}
          at={ride.pinAt}
          label={ride.pickedLabel}
          livery={tripLivery}
          onPick={() => ride.pick(ride.pickedId)}
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
          timeline={routeTimeline(saved.selected, stops.stops, stops.stopsAlong(saved.selected.id, variantLine(saved.selected)))}
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

