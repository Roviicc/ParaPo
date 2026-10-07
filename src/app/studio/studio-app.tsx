import type { Session } from '@supabase/supabase-js';
import type { MapLibreMap } from 'maplibre-gl';
import { useEffect, useMemo, useState } from 'react';

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
import { hotspotLabel, hotspotRing, type HotspotRow } from '@/features/routes/model/hotspots';
import { hotspotCount } from '@/features/routes/model/places';
import { routeTimeline } from '@/features/routes/model/ride';
import { isDrawn, variantLine, type VariantRow } from '@/features/routes/model/routes';
import {
  lineOf,
  listVariants,
  loadStopsFromSupabase,
  getSupabase,
  supabaseConfigError,
  CardActions,
  RouteFacts,
  SignboardEditor,
  signboardUrl,
  AuthDialogs,
  AccountPill,
  NewButtons,
  DrawToolbar,
  HotspotPanel,
  SavePanel,
  SignIn,
  Toast,
  deleteVariant,
  deleteStop,
  skipSignInForTests,
  useDrawing,
  useFollow,
  useSaveTarget,
  usePasswordRecovery,
  useSession,
} from '@/features/studio';

/**
 * The editor at /studio/. Signed out, the page is only its front door: the
 * map, the drawing tools and everything that writes appear once an editor
 * signs in. A drawing in progress survives on this device either way.
 *
 * The door guards the way in, not the room. If the session ends later —
 * signed out in another tab, a refresh that stops working — the workshop
 * stays on screen with whatever is half-typed, and the next save asks for
 * sign-in again. Swapping it for the door would throw that work away.
 */
export function StudioApp() {
  const session = useSession();
  // Read on the very first render, before supabase-js consumes the reset link.
  const recovery = usePasswordRecovery();
  const [admitted, setAdmitted] = useState(false);

  useEffect(() => {
    if (session) setAdmitted(true);
  }, [session]);

  // Still restoring a saved session: show nothing rather than flash the door.
  if (session === undefined && !admitted) {
    return (
      <div className="grid h-full place-items-center bg-neutral-100">
        <p className="text-sm text-neutral-500">Loading…</p>
      </div>
    );
  }

  if (!session && !admitted && !skipSignInForTests()) {
    return (
      <div className="relative h-full w-full bg-neutral-100">
        <SignIn
          title="Sign in to ParaPo Studio"
          notice={recovery.error ? `Reset link problem: ${recovery.error}` : null}
        />
      </div>
    );
  }

  return <Workshop session={session ?? null} recovery={recovery} />;
}

/** The map and every editing tool, for a signed-in editor or a test session. */
function Workshop({
  session,
  recovery,
}: {
  session: Session | null;
  recovery: ReturnType<typeof usePasswordRecovery>;
}) {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hotspotMenu, setHotspotMenu] = useState(false);
  // One toast at a time, the newest: a save's, or a problem.
  const [toast, setToast] = useState<
    | { kind: 'route'; v: VariantRow }
    | { kind: 'hotspot'; s: HotspotRow }
    | { kind: 'notice'; text: string }
    | null
  >(null);
  const setNotice = (text: string | null) =>
    setToast(text === null ? null : { kind: 'notice', text });
  const justSaved = toast?.kind === 'route' ? toast.v : null;

  // A right-click on a saved line while drawing: decided below, once the
  // saved lines and hotspots are loaded (onFollow).
  const draw = useDrawing(map, { onFollow: (ids, at, offered) => onFollow(ids, at, offered) });
  // The list rows, each with its overview (0009): a direction's full line is
  // read when it is lit or chosen, its drawing when it is opened (below).
  const saved = useSavedRoutes(map, listVariants, {
    drawing: draw.drawing,
    hiddenVariantId: draw.target.variantId,
    loadLine: lineOf,
  });
  const hotspots = useSavedHotspots(map, loadStopsFromSupabase, {
    drawing: draw.drawing,
    hiddenHotspotId: draw.area?.stopId ?? null,
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
  } = useCardCamera(map, saved, hotspots, cards);

  // What the lit routes wear on the map, as on the public map (useLitRides);
  // none of the orange over the direction being redrawn.
  const rides = useLitRides(map, saved, hotspots.hotspots, draw.target.variantId, ride.ridden);

  // The pill counts routes, not directions: a route is two rows, one of them
  // perhaps an empty slot, and five routes once read "10 routes" (finding 7).
  const routeCount = useMemo(
    () => new Set(saved.variants.map((v) => v.route_id)).size,
    [saved.variants],
  );

  const signedIn = !!session;
  const userId = session?.user.id ?? null;

  // Signed in from the dialog Done opened: the dialog hides itself on the
  // session, so its flag is cleared here — left set, it kept the drawing keys
  // (Ctrl+Z, Enter, F) off for the rest of the visit (finding 9).
  useEffect(() => {
    if (signedIn) setSigningIn(false);
  }, [signedIn]);

  // Back from a valid reset link: the link gave us a session, now set the password.
  const resetting = recovery.recovering && signedIn;

  // A rejected reset link (expired, already used) is just a notice; the user
  // is plainly signed out and can ask for another.
  useEffect(() => {
    if (recovery.error) setNotice(`Reset link problem: ${recovery.error}`);
  }, [recovery.error]);

  // What the save panel saves into, and where the drawing is headed.
  const target = useSaveTarget(draw, saved.variants, hotspots.hotspots);
  const { editing, parentRoute, slotReversed, extendEnds } = target;
  // A right-click on saved lines while drawing, and opening a direction's drawing.
  const { onFollow, opening } = useFollow({
    draw,
    variants: saved.variants,
    hotspots: hotspots.hotspots,
    target,
    setNotice,
  });

  const onDone = () => {
    if (!signedIn) setSigningIn(true);
    else setSaving(true);
  };

  // The hotspot being edited, when the area trace came from a saved one.
  const editingHotspot = draw.area?.stopId
    ? (hotspots.hotspots.find((s) => s.id === draw.area?.stopId) ?? null)
    : null;

  const onSaved = (v: VariantRow) => {
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

  const onDeleteHotspot = async (s: HotspotRow) => {
    // As Done does: with the session gone the delete went out on the
    // publishable key, matched no row, came back 2xx, and the box was still
    // there after the reload, with nothing said (review of 2026-10-03).
    if (!signedIn) {
      setSigningIn(true);
      return;
    }
    // A route's end cannot go while the route names it: the database refuses
    // (0006's foreign keys), and its refusal was the notice (finding 15).
    const ending = [
      ...new Set(
        saved.variants
          .filter((v) => v.route.head_stop_id === s.id || v.route.tail_stop_id === s.id)
          .map((v) => v.route.name),
      ),
    ];
    if (ending.length > 0) {
      setNotice(
        `"${hotspotLabel(s)}" is where ${ending.join(', ')} ${ending.length === 1 ? 'ends' : 'end'}. ` +
          `Delete ${ending.length === 1 ? 'that route' : 'those routes'} first.`,
      );
      return;
    }
    if (!window.confirm(`Delete ${s.kind} "${hotspotLabel(s)}"?`)) return;
    try {
      await deleteStop(s);
      hotspots.select(null);
      await hotspots.reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  };

  const { choice, choosing, closeAll, tripLivery, look, inCardColour, height } = cards;

  // "Draw the return trip" only while the route still has a way undrawn: after
  // an edit of a route drawn both ways it once started a drawing whose save
  // replaced the other direction's line (review finding 2). The direction
  // just saved is drawn whatever the list says until its reload lands.
  const slotLeft = justSaved
    ? saved.variants.some(
        (v) => v.route_id === justSaved.route_id && v.id !== justSaved.id && v.shape === null,
      )
    : false;

  const onDelete = async (v: VariantRow) => {
    // Signed out, the delete would match nothing and say nothing (onDeleteHotspot).
    if (!signedIn) {
      setSigningIn(true);
      return;
    }
    if (!window.confirm(`Delete "${v.route?.name}" — ${v.direction_name}?`)) return;
    try {
      await deleteVariant(v);
      saved.select(null);
      await saved.reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div ref={root} className="@container relative h-full w-full overflow-clip">
      <MapView onReady={setMap} foldCredits />

      {/* A config or load problem is a banner, never a blank page. */}
      {(supabaseConfigError || saved.error || hotspots.error) && (
        <div className="absolute top-[calc(1rem+env(safe-area-inset-top))] left-1/2 z-20 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg bg-amber-50 px-4 py-2 text-xs text-amber-900 shadow ring-1 ring-amber-200">
          {supabaseConfigError ?? `Couldn't load saved routes: ${saved.error ?? hotspots.error}`}
        </div>
      )}

      {/* Each lit ride's ends, named over their circles. */}
      {map && !draw.drawing && (
        <EndTitles map={map} rides={rides} look={look} badged={inCardColour} />
      )}
      {/* A selected train line's stations, named along it (RouteLineLabel). */}
      {map && !draw.drawing && saved.selected && tripLivery && (
        <StationLabels
          map={map}
          selected={saved.selected}
          hotspots={hotspots.hotspots}
          livery={tripLivery}
          pickedId={ride.pickedId}
          onPick={ride.pick}
        />
      )}
      {/* Keyed on the pick: another hintuan pops a fresh circle. */}
      {map && !draw.drawing && ride.pinAt && tripLivery && (
        <HintuanPin
          key={ride.pickedId}
          map={map}
          at={ride.pinAt}
          label={ride.pickedLabel}
          livery={tripLivery}
        />
      )}

      {/*
        The tapped direction as the public map's trip card (the owner's pick,
        2026-09-30), the editor's facts and its Edit, Extend and Delete under
        its tiles. Keyed on the route, as there: SWITCH keeps its colour.
      */}
      {!draw.drawing && saved.selected && tripLivery && (
        <TripCard
          key={saved.selected.route_id}
          variant={saved.selected}
          variants={saved.variants}
          timeline={routeTimeline(
            saved.selected,
            hotspots.hotspots,
            hotspots.hotspotsAlong(saved.selected.id, variantLine(saved.selected)),
          )}
          livery={tripLivery}
          onBackToList={backFromTrip}
          onSwitch={switchTrip}
          onClose={closeAll}
          picked={ride.pickedId}
          pickedMetres={saved.fullIds.has(saved.selected.id) ? ride.rideTo?.metres : undefined}
          onPick={ride.pick}
          onEnd={ride.toEnd}
          endPicked={ride.endPicked}
          dockRef={tripDock}
          height={height}
          signboardUrl={signboardUrl}
          extras={
            <>
              <RouteFacts
                variant={saved.selected}
                actions={
                  userId !== null &&
                  userId === saved.selected.owner_id && (
                    <CardActions
                      editLabel="Edit route"
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
                    />
                  )
                }
              />
              {userId !== null && userId === saved.selected.owner_id && (
                <SignboardEditor variant={saved.selected} onChanged={() => void saved.reload()} />
              )}
            </>
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
          linkedVariantIds={hotspots.linkedVariantIds(hotspots.selected.id)}
          variants={saved.variants}
          onSelectVariant={openTrip}
          hotspots={hotspots.hotspots}
          // Another box: the map goes there, the box clear of the card on
          // show, as on the public map.
          onPickSibling={(id) => {
            saved.highlightCard(null);
            hotspots.show(id, clearOfOpen);
          }}
          actions={
            userId !== null &&
            userId === hotspots.selected.owner_id && (
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

      {toast?.kind === 'hotspot' && !draw.drawing && (
        <Toast onDismiss={() => setToast(null)}>
          Saved {toast.s.kind === 'terminal' ? 'terminal' : 'hintuan'}{' '}
          <strong>{hotspotLabel(toast.s)}</strong>
        </Toast>
      )}

      {/* After a save, the other direction is almost always next — while there is one to draw. */}
      {toast?.kind === 'route' && !draw.drawing && (
        <Toast
          onDismiss={() => setToast(null)}
          action={
            slotLeft && (
              <button
                type="button"
                onClick={() => {
                  const routeId = toast.v.route_id;
                  setToast(null);
                  draw.start(routeId);
                }}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-900 pointer-coarse:min-h-11 pointer-coarse:px-4 pointer-coarse:text-sm"
              >
                Draw the return trip
              </button>
            )
          }
        >
          Saved <strong>{toast.v.route?.name}</strong> · {toast.v.direction_name}
        </Toast>
      )}

      {toast?.kind === 'notice' && (
        <Toast tone="alert" onDismiss={() => setToast(null)}>
          {toast.text}
        </Toast>
      )}

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
        onResetDone={recovery.done}
        changingPasswordFor={changingPassword && !resetting ? (session?.user.email ?? null) : null}
        onPasswordDone={() => setChangingPassword(false)}
      />

      {saving && draw.drawing && draw.area && (
        <HotspotPanel
          draw={draw}
          existing={editingHotspot}
          existingLinks={editingHotspot ? hotspots.linkedVariantIds(editingHotspot.id) : []}
          variants={saved.variants}
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
          variants={saved.variants}
          onSaved={onSaved}
          onCancel={() => setSaving(false)}
        />
      )}
    </div>
  );
}
