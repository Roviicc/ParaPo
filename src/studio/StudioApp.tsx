import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { MapLibreMap } from 'maplibre-gl'
import { HotspotCard } from '../shared/cards/HotspotCard'
import { MapView } from '../shared/map/MapView'
import { RouteCardList } from '../shared/cards/RouteCardList'
import { TripCard } from '../shared/cards/TripCard'
import { useCardStack } from '../shared/cards/useCardStack'
import { HintuanPin } from '../shared/map/HintuanPin'
import { EndTitles } from '../shared/map/EndTitles'
import { useRideTo } from '../shared/map/rideTo'
import { lineOf, listVariants, loadStopsFromSupabase } from './data/live'
import { isDrawn, type VariantRow } from '../shared/model/routes'
import { routeTimeline } from '../shared/model/ride'
import { hotspotCount } from '../shared/model/places'
import { stopLabel, stopRing, type StopRow } from '../shared/model/stops'
import { getSupabase, supabaseConfigError } from './data/supabase'
import { useLitRides } from '../shared/map/useLitRides'
import { useSavedRoutes } from '../shared/map/useSavedRoutes'
import { useSavedStops } from '../shared/map/useSavedStops'
import { CardActions } from './panels/CardActions'
import { RouteFacts } from './panels/RouteFacts'
import { SignboardEditor } from './panels/SignboardEditor'
import { signboardUrl } from './data/signboards'
import { AuthDialogs } from './auth/AuthDialogs'
import { AccountPill } from './panels/AccountPill'
import { NewButtons } from './panels/NewButtons'
import { DrawToolbar } from './drawing/DrawToolbar'
import { HotspotPanel } from './panels/HotspotPanel'
import { SavePanel } from './panels/SavePanel'
import { SignIn } from './auth/SignIn'
import { Toast } from './panels/Toast'
import { deleteVariant } from './data/routesWrite'
import { deleteStop } from './data/stopsWrite'
import { skipSignInForTests } from './auth/testBypass'
import { useDrawing } from './drawing/useDrawing'
import { useFollow } from './drawing/useFollow'
import { useSaveTarget } from './panels/useSaveTarget'
import { usePasswordRecovery } from './auth/usePasswordRecovery'
import { useSession } from './auth/useSession'

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
export default function StudioApp() {
  const session = useSession()
  // Read on the very first render, before supabase-js consumes the reset link.
  const recovery = usePasswordRecovery()
  const [admitted, setAdmitted] = useState(false)

  useEffect(() => {
    if (session) setAdmitted(true)
  }, [session])

  // Still restoring a saved session: show nothing rather than flash the door.
  if (session === undefined && !admitted) {
    return (
      <div className="grid h-full place-items-center bg-neutral-100">
        <p className="text-sm text-neutral-500">Loading…</p>
      </div>
    )
  }

  if (!session && !admitted && !skipSignInForTests()) {
    return (
      <div className="relative h-full w-full bg-neutral-100">
        <SignIn
          title="Sign in to ParaPo Studio"
          notice={recovery.error ? `Reset link problem: ${recovery.error}` : null}
        />
      </div>
    )
  }

  return <Workshop session={session ?? null} recovery={recovery} />
}

/** The map and every editing tool, for a signed-in editor or a test session. */
function Workshop({
  session,
  recovery,
}: {
  session: Session | null
  recovery: ReturnType<typeof usePasswordRecovery>
}) {
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hotspotMenu, setHotspotMenu] = useState(false)
  // One toast at a time, the newest: a save's, or a problem.
  const [toast, setToast] = useState<
    { kind: 'route'; v: VariantRow } | { kind: 'stop'; s: StopRow } | { kind: 'notice'; text: string } | null
  >(null)
  const setNotice = (text: string | null) => setToast(text === null ? null : { kind: 'notice', text })
  const justSaved = toast?.kind === 'route' ? toast.v : null

  // A right-click on a saved line while drawing: decided below, once the
  // saved lines and hotspots are loaded (onFollow).
  const draw = useDrawing(map, { onFollow: (ids, at) => onFollow(ids, at) })
  // The list rows, each with its overview (0009): a direction's full line is
  // read when it is lit or chosen, its drawing when it is opened (below).
  const saved = useSavedRoutes(map, listVariants, {
    drawing: draw.drawing,
    hiddenVariantId: draw.target.variantId,
    loadLine: lineOf,
  })
  const stops = useSavedStops(map, loadStopsFromSupabase, {
    drawing: draw.drawing,
    hiddenStopId: draw.area?.stopId ?? null,
    // While a trip is open, the map lights only the trip, as on the public map.
    muted: !!saved.selected,
  })
  // The route list, a hotspot's card and the trip opened from either, as on
  // the public map (useCardStack).
  const cards = useCardStack(map, saved, stops)
  // A hintuan picked on the trip card: the camera gliding there clear of the
  // card and a circle popping up on it, the route left whole — the public
  // map's (the owner, 2026-09-30: "most of the interaction of public map
  // should be in studio"), the card staying at its height (clearOfSheet).
  const tripDock = useRef<HTMLDivElement>(null)
  const ride = useRideTo(map, saved.selected, stops.stops, {
    onGlide: cards.clearOf(tripDock),
  })

  // What the lit routes wear on the map, as on the public map (useLitRides);
  // none of the orange over the direction being redrawn.
  const rides = useLitRides(map, saved, stops.stops, draw.target.variantId)

  // The pill counts routes, not directions: a route is two rows, one of them
  // perhaps an empty slot, and five routes once read "10 routes" (finding 7).
  const routeCount = useMemo(() => new Set(saved.variants.map((v) => v.route_id)).size, [saved.variants])

  const signedIn = !!session
  const userId = session?.user.id ?? null

  // Signed in from the dialog Done opened: the dialog hides itself on the
  // session, so its flag is cleared here — left set, it kept the drawing keys
  // (Ctrl+Z, Enter, F) off for the rest of the visit (finding 9).
  useEffect(() => {
    if (signedIn) setSigningIn(false)
  }, [signedIn])

  // Back from a valid reset link: the link gave us a session, now set the password.
  const resetting = recovery.recovering && signedIn

  // A rejected reset link (expired, already used) is just a notice; the user
  // is plainly signed out and can ask for another.
  useEffect(() => {
    if (recovery.error) setNotice(`Reset link problem: ${recovery.error}`)
  }, [recovery.error])

  // What the save panel saves into, and where the drawing is headed.
  const target = useSaveTarget(draw, saved.variants, stops.stops)
  const { editing, parentRoute, slotReversed, extendEnds } = target
  // A right-click on saved lines while drawing, and opening a direction's drawing.
  const { onFollow, opening } = useFollow({ draw, variants: saved.variants, stops: stops.stops, target, setNotice })

  const onDone = () => {
    if (!signedIn) setSigningIn(true)
    else setSaving(true)
  }

  // The hotspot being edited, when the area trace came from a saved one.
  const editingStop = draw.area?.stopId
    ? (stops.stops.find((s) => s.id === draw.area?.stopId) ?? null)
    : null

  const onSaved = (v: VariantRow) => {
    setSaving(false)
    draw.cancel()
    void saved.reload()
    // A moved line may have entered or left a hintuan; its links were re-synced.
    void stops.reload()
    setToast({ kind: 'route', v })
  }

  const onSavedStop = (s: StopRow) => {
    setSaving(false)
    draw.cancel()
    void stops.reload()
    // The directions too: their names are generated from the hotspots at
    // their ends when they load, so a renamed end left every card, the list
    // and the pill on the old name until the next route save (finding 8).
    void saved.reload()
    setToast({ kind: 'stop', s })
  }

  const onDeleteStop = async (s: StopRow) => {
    // A route's end cannot go while the route names it: the database refuses
    // (0006's foreign keys), and its refusal was the notice (finding 15).
    const ending = [
      ...new Set(
        saved.variants
          .filter((v) => v.route.head_stop_id === s.id || v.route.tail_stop_id === s.id)
          .map((v) => v.route.name),
      ),
    ]
    if (ending.length > 0) {
      setNotice(
        `"${stopLabel(s)}" is where ${ending.join(', ')} ${ending.length === 1 ? 'ends' : 'end'}. ` +
          `Delete ${ending.length === 1 ? 'that route' : 'those routes'} first.`,
      )
      return
    }
    if (!window.confirm(`Delete ${s.kind} "${stopLabel(s)}"?`)) return
    try {
      await deleteStop(s)
      stops.select(null)
      await stops.reload()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    }
  }

  const { choice, choosing, closeAll, tripLivery, look, height } = cards

  // "Draw the return trip" only while the route still has a way undrawn: after
  // an edit of a route drawn both ways it once started a drawing whose save
  // replaced the other direction's line (review finding 2). The direction
  // just saved is drawn whatever the list says until its reload lands.
  const slotLeft = justSaved
    ? saved.variants.some((v) => v.route_id === justSaved.route_id && v.id !== justSaved.id && v.shape === null)
    : false

  const onDelete = async (v: VariantRow) => {
    if (!window.confirm(`Delete "${v.route?.name}" — ${v.direction_name}?`)) return
    try {
      await deleteVariant(v)
      saved.select(null)
      await saved.reload()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="@container relative h-full w-full overflow-clip">
      <MapView onReady={setMap} />

      {/* A config or load problem is a banner, never a blank page. */}
      {(supabaseConfigError || saved.error || stops.error) && (
        <div
          className="absolute left-1/2 top-4 z-20 max-w-xl -translate-x-1/2 rounded-lg bg-amber-50
                     px-4 py-2 text-xs text-amber-900 shadow ring-1 ring-amber-200"
        >
          {supabaseConfigError ?? `Couldn't load saved routes: ${saved.error ?? stops.error}`}
        </div>
      )}

      {/* Each lit ride's ends, named over their circles. */}
      {map && !draw.drawing && <EndTitles map={map} rides={rides} look={look} />}
      {/* Keyed on the pick: another hintuan pops a fresh circle. */}
      {map && !draw.drawing && ride.pinAt && tripLivery && (
        <HintuanPin key={ride.pickedId} map={map} at={ride.pinAt} label={ride.pickedLabel} livery={tripLivery} />
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
          timeline={routeTimeline(saved.selected, stops.stops, stops.stopsAlong(saved.selected.id))}
          livery={tripLivery}
          onBackToList={cards.backFromTrip}
          onSwitch={(v) => saved.select(v.id, { keepList: true })}
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
                        const v = saved.selected
                        if (!v) return
                        closeAll()
                        void opening(v, draw.load)
                      }}
                      onDelete={() => {
                        if (saved.selected) void onDelete(saved.selected)
                      }}
                      onExtend={
                        isDrawn(saved.selected)
                          ? () => {
                              const v = saved.selected
                              if (!v) return
                              closeAll()
                              void opening(v, draw.startExtend)
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
      {!draw.drawing && stops.selected && (
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
          onSelectVariant={cards.openTrip}
          stops={stops.stops}
          onPickSibling={(id) => {
            saved.highlightCard(null)
            stops.show(id)
          }}
          actions={
            userId !== null &&
            userId === stops.selected.owner_id && (
              <CardActions
                editLabel={stops.selected.kind === 'terminal' ? 'Edit terminal' : 'Edit hintuan'}
                onEdit={() => {
                  const s = stops.selected
                  if (!s) return
                  closeAll()
                  draw.loadArea(s.kind, s.id, stopRing(s))
                }}
                onDelete={() => {
                  if (stops.selected) void onDeleteStop(stops.selected)
                }}
              />
            )
          }
          onClose={cards.closeStop}
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
          stops={stops.candidates}
          back={saved.back}
          onFlip={saved.flip}
          selected={saved.highlight?.where === 'list' ? saved.highlight.from : null}
          onSelect={(p) => saved.highlightCard(p && { where: 'list', ...p })}
          onRoute={cards.openTrip}
          onStop={(s) => cards.openStop(s.id)}
          onClose={closeAll}
        />
      )}
      {!draw.drawing && !saved.selected && !stops.selected && !choosing && (
        <AccountPill
          routes={routeCount}
          hotspots={stops.stops.length > 0 ? hotspotCount(stops.stops) : 0}
          email={signedIn ? (session.user.email ?? '') : null}
          onSignIn={() => setSigningIn(true)}
          onPassword={() => setChangingPassword(true)}
          onSignOut={() => void getSupabase()?.auth.signOut()}
        />
      )}

      {toast?.kind === 'stop' && !draw.drawing && (
        <Toast onDismiss={() => setToast(null)}>
          Saved {toast.s.kind === 'terminal' ? 'terminal' : 'hintuan'} <strong>{stopLabel(toast.s)}</strong>
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
                  const routeId = toast.v.route_id
                  setToast(null)
                  draw.start(routeId)
                }}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-900"
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
          existing={editingStop}
          existingLinks={editingStop ? stops.linkedVariantIds(editingStop.id) : []}
          variants={saved.variants}
          stops={stops.stops}
          onSaved={onSavedStop}
          onCancel={() => setSaving(false)}
        />
      )}

      {saving && draw.drawing && !draw.area && (
        <SavePanel
          draw={draw}
          existing={editing}
          route={parentRoute}
          slotReversed={slotReversed}
          stops={stops.stops}
          variants={saved.variants}
          onSaved={onSaved}
          onCancel={() => setSaving(false)}
        />
      )}
    </div>
  )
}
