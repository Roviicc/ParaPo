import type { Session } from '@supabase/supabase-js';
import type { MapLibreMap } from 'maplibre-gl';
import { useMemo, useState } from 'react';

import { HotspotCard } from '@/features/routes/cards/hotspot-card';
import { RouteCardList } from '@/features/routes/cards/route-card-list';
import { TripCard } from '@/features/routes/cards/trip-card';
import { useCardCamera } from '@/features/routes/cards/use-card-camera';
import { useCardStack } from '@/features/routes/cards/use-card-stack';
import { EndTitles } from '@/features/routes/map/end-titles';
import { HintuanPin } from '@/features/routes/map/hintuan-pin';
import { APP_MOVE, MapView } from '@/features/routes/map/map-view';
import { StationLabels } from '@/features/routes/map/station-labels';
import { useLitRides } from '@/features/routes/map/use-lit-rides';
import { useSavedHotspots } from '@/features/routes/map/use-saved-hotspots';
import { useSavedRoutes } from '@/features/routes/map/use-saved-routes';
import { hotspotRing, type HotspotRow } from '@/features/routes/model/hotspots';
import { hotspotCount } from '@/features/routes/model/places';
import { routeTimeline } from '@/features/routes/model/ride';
import { isDrawn, directionLine, type DirectionRow } from '@/features/routes/model/routes';
import {
  lineOf,
  listDirections,
  loadHotspotsFromSupabase,
  getSupabase,
  supabaseConfigError,
  CardActions,
  returnTripLeft,
  signboardUrl,
  AuthDialogs,
  AccountPill,
  NewButtons,
  DrawToolbar,
  HotspotPanel,
  SavePanel,
  SaveToasts,
  STUDIO_BASEMAPS,
  STUDIO_BASEMAP_THUMBNAILS,
  TripCardExtras,
  type SaveToast,
  type usePasswordRecovery,
  useDrawing,
  useFollow,
  useSaveTarget,
  useDeleteActions,
} from '@/features/studio';

interface WorkshopProps {
  session: Session | null;
  recovery: ReturnType<typeof usePasswordRecovery>;
}

/**
 * The map and every editing tool, for a signed-in editor or a test session.
 * The composition root: the state and the hooks' results passed down. What
 * it decides lives in the studio's panels: the return-trip offer
 * (return-trip.ts), a route's end refusing a delete (hotspot-in-use.ts), the
 * deletes themselves (use-delete-actions.ts), the saved toasts
 * (save-toasts.tsx) and what the trip card adds for an editor
 * (trip-card-extras.tsx).
 */
export function Workshop({ session, recovery }: WorkshopProps) {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hotspotMenu, setHotspotMenu] = useState(false);
  // One toast at a time, the newest: a save's, or a problem. A rejected reset
  // link (expired, already used) is the first one: just a notice, since the
  // user is plainly signed out and can ask for another. The link is read once,
  // on arrival, so its error is known before this mounts and never comes later.
  const [toast, setToast] = useState<SaveToast | null>(() =>
    recovery.error ? { kind: 'notice', text: `Reset link problem: ${recovery.error}` } : null,
  );
  const setNotice = (text: string | null) =>
    setToast(text === null ? null : { kind: 'notice', text });
  const justSaved = toast?.kind === 'route' ? toast.v : null;

  // A right-click on a saved line while drawing: decided below, once the
  // saved lines and hotspots are loaded (onFollow).
  const draw = useDrawing(map, { onFollow: (ids, at, offered) => onFollow(ids, at, offered) });
  // The list rows, each with its overview (0009): a direction's full line is
  // read when it is lit or chosen, its drawing when it is opened (below).
  const saved = useSavedRoutes(map, listDirections, {
    drawing: draw.drawing,
    hiddenDirectionId: draw.target.directionId,
    loadLine: lineOf,
  });
  const hotspots = useSavedHotspots(map, loadHotspotsFromSupabase, {
    drawing: draw.drawing,
    hiddenHotspotId: draw.area?.hotspotId ?? null,
    // While a trip is open, the map lights only the trip, as on the public map.
    muted: !!saved.selected,
  });
  // The route list, a hotspot's card and the trip opened from either, as on
  // the public map (useCardStack).
  const cards = useCardStack(map, saved, hotspots);
  // The camera with the cards, as on the public map (useCardCamera), the
  // owner's ask of 2026-09-30: "most of the interaction of public map should
  // be in studio". A hintuan picked on the trip card, the camera gliding
  // there clear of the card and a circle popping up on it, the route left
  // whole, the card staying at its height; a trip opened on its whole route,
  // a RouteCard picked, SWITCH and the sheet settled at another height, each
  // framed beside the card; and the camera from before a hotspot's RouteCard
  // was picked, back as it is let go.
  const {
    root,
    tripDock,
    ride,
    clearOfOpen,
    switchTrip,
    flipList,
    pickOnPlaceCard,
    openTrip,
    backFromTrip,
    pickOnTrip,
    endOnTrip,
  } = useCardCamera(map, saved, hotspots, cards);

  // What the lit routes wear on the map, as on the public map (useLitRides);
  // none of the orange over the direction being redrawn.
  const rides = useLitRides(
    map,
    saved,
    hotspots.hotspots,
    draw.target.directionId,
    ride.ridden,
    ride.startId,
  );

  // The open trip's hintuans, worked out as the trip or the hotspots change,
  // as the public map works them out (PublicMapApp): the card's rows and
  // their dots along the line read one timeline, and the dots hang on its
  // identity — a fresh `between` each render would place every dot anew
  // (StationLabels' rowStops memo) — so the memo is load-bearing, not a
  // saving.
  const trip = saved.selected;
  // The hook's result is a fresh object each render; its members are stable.
  const { hotspots: hotspotRows, hotspotsAlong } = hotspots;
  const timeline = useMemo(
    () =>
      trip ? routeTimeline(trip, hotspotRows, hotspotsAlong(trip.id, directionLine(trip))) : null,
    [trip, hotspotRows, hotspotsAlong],
  );

  // The pill counts routes, not directions: a route is two rows, one of them
  // perhaps an empty slot, and five routes once read "10 routes" (finding 7).
  const routeCount = useMemo(
    () => new Set(saved.directions.map((v) => v.routeId)).size,
    [saved.directions],
  );

  const signedIn = !!session;
  // Every editor edits every route and hotspot (migration 0015, the owner's
  // ask of 2026-10-14). There is no sign-up, so a session is an editor's; the
  // database refuses anyone else's writes whatever this shows.
  const canEdit = signedIn;

  // Signed in from the dialog Done opened: the dialog hides itself on the
  // session, so its flag is cleared here, during render — left set, it kept
  // the drawing keys (Ctrl+Z, Enter, F) off for the rest of the visit
  // (finding 9).
  if (signedIn && signingIn) setSigningIn(false);

  // Back from a valid reset link or an invite: the link gave us a session, now
  // set the password.
  const resetting = recovery.recovering && signedIn;

  // What the save panel saves into, and where the drawing is headed.
  const target = useSaveTarget(draw, saved.directions, hotspots.hotspots);
  const { editing, parentRoute, slotReversed, extendEnds } = target;
  // A right-click on saved lines while drawing, and opening a direction's drawing.
  const { onFollow, opening } = useFollow({
    draw,
    directions: saved.directions,
    hotspots: hotspots.hotspots,
    target,
    setNotice,
  });

  const onDone = () => {
    if (!signedIn) setSigningIn(true);
    else setSaving(true);
  };

  // The hotspot being edited, when the area trace came from a saved one.
  const editingHotspot = draw.area?.hotspotId
    ? (hotspots.hotspots.find((s) => s.id === draw.area?.hotspotId) ?? null)
    : null;

  const onSaved = (v: DirectionRow) => {
    setSaving(false);
    draw.cancel();
    void saved.reload();
    // A moved line may have entered or left a hintuan; its links were re-synced.
    void hotspots.reload();
    setToast({ kind: 'route', v });
  };

  const onSavedHotspot = (s: HotspotRow) => {
    setSaving(false);
    draw.cancel();
    void hotspots.reload();
    // The directions too: their names are generated from the hotspots at
    // their ends when they load, so a renamed end left every card, the list
    // and the pill on the old name until the next route save (finding 8).
    void saved.reload();
    setToast({ kind: 'hotspot', s });
  };

  const { choice, choosing, closeAll, tripLivery, litLivery, height } = cards;

  // "Draw the return trip" only while the route still has a way undrawn.
  const slotLeft = returnTripLeft(justSaved, saved.directions);

  // Delete on the trip's card and the hotspot's: signed out, it asks for sign-in.
  const { onDelete, onDeleteHotspot } = useDeleteActions({
    signedIn,
    onSignInNeeded: () => setSigningIn(true),
    saved,
    hotspots,
    setNotice,
  });

  return (
    <div ref={root} className="@container relative h-full w-full overflow-clip">
      <MapView
        onReady={setMap}
        foldCredits
        basemaps={STUDIO_BASEMAPS}
        basemapThumbnails={STUDIO_BASEMAP_THUMBNAILS}
      />

      {/* A config or load problem is a banner, never a blank page. */}
      {(supabaseConfigError || saved.error || hotspots.error) && (
        <div className="absolute top-[calc(1rem+env(safe-area-inset-top))] left-1/2 z-20 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg bg-amber-50 px-4 py-2 text-xs text-amber-900 shadow ring-1 ring-amber-200">
          {supabaseConfigError ?? `Couldn't load saved routes: ${saved.error ?? hotspots.error}`}
        </div>
      )}

      {/* Each lit ride's ends, named over their circles. */}
      {map && !draw.drawing && <EndTitles map={map} rides={rides} livery={litLivery} />}
      {/* The open trip's hintuans along its line, a train's stations and a jeepney's alike, named (RouteLineLabel). */}
      {map && !draw.drawing && saved.selected && tripLivery && timeline && (
        <StationLabels
          map={map}
          selected={saved.selected}
          hotspots={hotspots.hotspots}
          rows={timeline.between}
          livery={tripLivery}
          pickedId={ride.pickedId}
          startId={ride.startId}
          endPicked={ride.endPicked}
          hasRide={ride.ridden !== null}
          onPick={pickOnTrip}
        />
      )}
      {/* Keyed on the pick: another hintuan pops a fresh circle. */}
      {map && !draw.drawing && ride.pinAt && tripLivery && (
        <HintuanPin
          key={ride.pickedId}
          map={map}
          at={ride.pinAt}
          label={ride.pickedLabel}
          code={ride.pickedCode}
          livery={tripLivery}
        />
      )}
      {map && !draw.drawing && ride.startPinAt && tripLivery && (
        <HintuanPin
          key={`start:${ride.startId}`}
          map={map}
          at={ride.startPinAt}
          label={ride.startLabel}
          code={ride.startCode}
          livery={tripLivery}
          marks="start"
        />
      )}

      {/*
        The tapped direction as the public map's trip card (the owner's pick,
        2026-09-30), the editor's facts and its Edit, Extend and Delete under
        its tiles. Keyed on the route, as there: SWITCH keeps its colour.
      */}
      {!draw.drawing && saved.selected && tripLivery && timeline && (
        <TripCard
          key={saved.selected.routeId}
          direction={saved.selected}
          directions={saved.directions}
          timeline={timeline}
          livery={tripLivery}
          onBackToList={backFromTrip}
          onSwitch={switchTrip}
          onClose={closeAll}
          picked={ride.pickedId}
          pickedMetres={saved.fullIds.has(saved.selected.id) ? ride.rideTo?.metres : undefined}
          pickedCode={ride.pickedCode}
          start={ride.startId}
          startCode={ride.startCode}
          onSetStart={ride.setStart}
          onRemoveStart={ride.removeStart}
          onPick={pickOnTrip}
          onEnd={endOnTrip}
          endPicked={ride.endPicked}
          dockRef={tripDock}
          height={height}
          signboardUrl={signboardUrl}
          extras={
            <TripCardExtras
              direction={saved.selected}
              directions={saved.directions}
              hotspots={hotspots.hotspots}
              hotspotsAlong={hotspots.hotspotsAlong}
              canEdit={canEdit}
              onEdit={() => {
                const v = saved.selected;
                if (!v) return;
                closeAll();
                void opening(v, draw.load);
              }}
              onDelete={() => {
                if (saved.selected) void onDelete(saved.selected);
              }}
              onExtend={
                isDrawn(saved.selected)
                  ? () => {
                      const v = saved.selected;
                      if (!v) return;
                      closeAll();
                      void opening(v, draw.startExtend);
                    }
                  : undefined
              }
              onSignboardsChanged={() => void saved.reload()}
            />
          }
        />
      )}

      {/*
        A hotspot's card, its routes as RouteCards; it stays behind the trip
        picked from them, hidden, for the trip's ‹. After the trip on
        purpose, as on the public map: the suites' first `card` is the trip.
      */}
      {!draw.drawing && hotspots.selected && (
        <HotspotCard
          key={hotspots.selected.id}
          routeCards={{
            selected: saved.highlight?.where === 'hotspot' ? saved.highlight.from : null,
            onSelect: pickOnPlaceCard,
            onShown: saved.showCard,
          }}
          hidden={!!saved.selected}
          height={height}
          hotspot={hotspots.selected}
          linkedDirectionIds={hotspots.linkedDirectionIds(hotspots.selected.id)}
          directions={saved.directions}
          onSelectDirection={openTrip}
          hotspots={hotspots.hotspots}
          // Another box: the map goes there, the box clear of the card on
          // show, as on the public map.
          onPickSibling={(id) => {
            saved.highlightCard(null);
            hotspots.show(id, clearOfOpen);
          }}
          actions={
            canEdit && (
              <CardActions
                editLabel={hotspots.selected.kind === 'terminal' ? 'Edit terminal' : 'Edit hintuan'}
                onEdit={() => {
                  const s = hotspots.selected;
                  if (!s) return;
                  closeAll();
                  // A RouteCard picked on the way here, on this card or in
                  // the list, took in its routes whole and left the box a
                  // few pixels across: the outline opens on the box, in
                  // close enough to take its corners. Already that close,
                  // the map stays where it is.
                  if (map && map.getZoom() < 16)
                    map.flyTo({ center: s.point.coordinates, zoom: 16 }, APP_MOVE);
                  draw.loadArea(s.kind, s.id, hotspotRing(s));
                }}
                onDelete={() => {
                  if (hotspots.selected) void onDeleteHotspot(hotspots.selected);
                }}
              />
            )
          }
          onClose={cards.closeHotspot}
        />
      )}

      {/*
        Several saved things under one click: the same list the public map
        has — the owner's "Studio too", 2026-09-29, knowing it lists only what
        is drawn — kept hidden behind the trip picked from it.
      */}
      {!draw.drawing && choosing && (
        <RouteCardList
          key={choice.map((c) => c.id).join()}
          hidden={!!saved.selected}
          height={height}
          routes={saved.candidates}
          hotspots={hotspots.candidates}
          back={saved.back}
          onFlip={flipList}
          selected={saved.highlight?.where === 'list' ? saved.highlight.from : null}
          onSelect={(p) => saved.highlightCard(p && { where: 'list', ...p })}
          onRoute={openTrip}
          onHotspot={(s) => cards.openHotspot(s.id)}
          onClose={closeAll}
        />
      )}
      {!draw.drawing && !saved.selected && !hotspots.selected && !choosing && (
        <AccountPill
          routes={routeCount}
          hotspots={hotspots.hotspots.length > 0 ? hotspotCount(hotspots.hotspots) : 0}
          email={signedIn ? (session.user.email ?? '') : null}
          onSignIn={() => setSigningIn(true)}
          onPassword={() => setChangingPassword(true)}
          onSignOut={() => void getSupabase()?.auth.signOut()}
        />
      )}

      <SaveToasts
        toast={toast}
        isDrawing={draw.drawing}
        canDrawReturnTrip={slotLeft}
        onDismiss={() => setToast(null)}
        onDrawReturnTrip={(routeId) => {
          setToast(null);
          draw.start(routeId);
        }}
      />

      {draw.drawing ? (
        <DrawToolbar
          draw={draw}
          onDone={onDone}
          keys={!saving && !signingIn && !changingPassword && !resetting}
          ends={extendEnds}
        />
      ) : choosing ? null : (
        /*
          Drawing needs no account; saving does, and asks for it at Done. Not
          while the route list is open, as the account pill is not: under
          1024 px wide the list docks along the bottom, and these would stand
          on its corner (the owner, 2026-09-29).
        */
        <NewButtons
          ready={!!map}
          menu={hotspotMenu}
          setMenu={setHotspotMenu}
          onNewRoute={() => draw.start()}
          onNewHotspot={(kind) => draw.startArea(kind)}
        />
      )}

      <AuthDialogs
        signingIn={signingIn && !signedIn}
        onSignInDismiss={() => setSigningIn(false)}
        resetting={resetting}
        isInvite={recovery.isInvite}
        onResetDone={recovery.done}
        changingPasswordFor={changingPassword && !resetting ? (session?.user.email ?? null) : null}
        onPasswordDone={() => setChangingPassword(false)}
      />

      {saving && draw.drawing && draw.area && (
        <HotspotPanel
          draw={draw}
          existing={editingHotspot}
          existingLinks={editingHotspot ? hotspots.linkedDirectionIds(editingHotspot.id) : []}
          directions={saved.directions}
          hotspots={hotspots.hotspots}
          onSaved={onSavedHotspot}
          onCancel={() => setSaving(false)}
          // A row written before its links failed becomes the outline's own
          // (adoptHotspot): ✕, Done and Save again, or a reload, update it.
          onWritten={draw.adoptHotspot}
        />
      )}

      {saving && draw.drawing && !draw.area && (
        <SavePanel
          draw={draw}
          existing={editing}
          route={parentRoute}
          slotReversed={slotReversed}
          hotspots={hotspots.hotspots}
          directions={saved.directions}
          onSaved={onSaved}
          onCancel={() => setSaving(false)}
        />
      )}
    </div>
  );
}
