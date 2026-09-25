import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { MapLibreMap } from 'maplibre-gl'
import { Chooser } from '../shared/Chooser'
import { HotspotCard } from '../shared/HotspotCard'
import { MapView } from '../shared/MapView'
import { RouteCard } from '../shared/RouteCard'
import { listVariants, loadStopsFromSupabase, withDrawing } from './live'
import {
  directionEnds,
  isDrawn,
  otherDirection,
  routeTimeline,
  travelLine,
  variantLine,
  type VariantDrawing,
  type VariantRow,
} from '../shared/routes'
import { placeKey, stopLabel, stopRing, type StopRow } from '../shared/stops'
import type { LngLat } from '../shared/geo'
import { lineToFollow } from './borrow'
import { getSupabase, supabaseConfigError } from '../shared/supabase'
import { useDirectionArrows } from '../shared/directionArrows'
import { usePassStretches } from '../shared/passStretches'
import { useSavedRoutes } from '../shared/useSavedRoutes'
import { useSavedStops } from '../shared/useSavedStops'
import { CardActions } from './CardActions'
import { ChangePassword } from './ChangePassword'
import { DrawToolbar } from './DrawToolbar'
import { HotspotPanel } from './HotspotPanel'
import { ResetPassword } from './ResetPassword'
import { SavePanel } from './SavePanel'
import { SignIn } from './SignIn'
import { deleteVariant } from './routesWrite'
import { deleteStop } from './stopsWrite'
import { skipSignInForTests } from './testBypass'
import { useDrawing } from './useDrawing'
import { usePasswordRecovery } from './usePasswordRecovery'
import { useSession } from './useSession'

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
  const [justSaved, setJustSaved] = useState<VariantRow | null>(null)
  const [justSavedStop, setJustSavedStop] = useState<StopRow | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // A right-click on a saved line while drawing: decided below, once the
  // saved lines and hotspots are loaded (onFollow).
  const draw = useDrawing(map, { onFollow: (ids, at) => onFollow(ids, at) })
  // The list rows: a direction's drawing is read when it is opened (opening, below).
  const saved = useSavedRoutes(map, listVariants, {
    drawing: draw.drawing,
    hiddenVariantId: draw.target.variantId,
  })
  const stops = useSavedStops(map, loadStopsFromSupabase, {
    drawing: draw.drawing,
    hiddenStopId: draw.area?.stopId ?? null,
  })

  // Where a direction passes a hintuan, the line turns orange for that stretch.
  usePassStretches(map, saved.variants, stops.stops, saved.lit, saved.resting, draw.target.variantId)

  // Which way the jeep goes, on what is lit only — the chosen direction, or
  // the routes under a tap the way round the sheet shows them: chevrons
  // flowing inside each line from where the ride starts, and each end a
  // circle with its place's name.
  const rides = useMemo(
    () => saved.litVariants.map((v) => ({ line: travelLine(v, stops.stops), ...directionEnds(v) })),
    [saved.litVariants, stops.stops],
  )
  useDirectionArrows(map, rides)

  const signedIn = !!session
  const userId = session?.user.id ?? null

  // Back from a valid reset link: the link gave us a session, now set the password.
  const resetting = recovery.recovering && signedIn

  // A rejected reset link (expired, already used) is just a notice; the user
  // is plainly signed out and can ask for another.
  useEffect(() => {
    if (recovery.error) setNotice(`Reset link problem: ${recovery.error}`)
  }, [recovery.error])

  // What the save panel is saving into.
  const editing = draw.target.variantId
    ? (saved.variants.find((v) => v.id === draw.target.variantId) ?? null)
    : null
  const parentRoute =
    !editing && draw.target.routeId
      ? (saved.variants.find((v) => v.route_id === draw.target.routeId)?.route ?? null)
      : null
  // The direction this line is for: the route's slot with no line yet. Fixed
  // here rather than read off the drawing, so a return trip started from the
  // wrong end cannot land on top of the direction that already exists.
  const slotReversed = parentRoute
    ? (saved.variants.find((v) => v.route_id === parentRoute.id && v.shape === null)?.reversed ??
      null)
    : null

  // While extending: the places the chosen direction runs between, in travel
  // order, and whether its stored line runs the other way round.
  const extendEnds = useMemo(() => {
    const v = draw.picking?.variant
    if (!v) return null
    const head = stops.stops.find((s) => s.id === v.route.head_stop_id)
    const tail = stops.stops.find((s) => s.id === v.route.tail_stop_id)
    if (!head || !tail) return null
    const [from, to] = v.reversed ? [tail, head] : [head, tail]
    const travel = travelLine(v, stops.stops)
    return { from: stopLabel(from), to: stopLabel(to), backwards: travel[0] !== variantLine(v)[0] }
  }, [draw.picking?.variant, stops.stops])

  // Where the line being drawn is going, when that is known: the far end of
  // the direction being edited, or of the route's slot a return trip fills.
  const destinationStopId = editing
    ? editing.reversed
      ? editing.route.head_stop_id
      : editing.route.tail_stop_id
    : parentRoute && slotReversed !== null
      ? slotReversed
        ? parentRoute.head_stop_id
        : parentRoute.tail_stop_id
      : null
  const placeOfStop = (id: string | null) => {
    const s = id ? stops.stops.find((x) => x.id === id) : undefined
    return s ? placeKey(s) : null
  }

  /**
   * A right-click on saved lines while drawing: join the one going the way
   * the drawing goes — preferring one that ends where the drawing is headed —
   * and follow it to its end. The two directions of a route often share a
   * road, so the click may land on both.
   */
  const onFollow = (ids: string[], at: LngLat) => {
    const gate = draw.joinGate()
    if (!gate.go) {
      if (gate.problem) setNotice(gate.problem)
      return
    }
    const home = placeOfStop(destinationStopId)
    const options = ids
      .map((id) => saved.variants.find((v) => v.id === id))
      .filter((v): v is VariantRow => !!v && isDrawn(v))
      .map((v) => ({
        v,
        travel: travelLine(v, stops.stops),
        endsAtDestination:
          home !== null && placeOfStop(v.reversed ? v.route.head_stop_id : v.route.tail_stop_id) === home,
      }))
    const choice = lineToFollow(options, draw.line, at)
    if (!choice) return
    if ('against' in choice) {
      setNotice(
        `${choice.against.v.direction_name} runs the other way here. Right-click a line going the way you are drawing.`,
      )
      return
    }
    const v = choice.follow.v
    const backwards = choice.follow.travel[0] !== variantLine(v)[0]
    void opening(v, (d) => {
      const problem = draw.connect(d, at, backwards)
      if (problem) setNotice(problem)
    })
  }

  /**
   * A direction's drawing is not in the list (live.ts VARIANT_SELECT): read
   * it for the one being opened, then hand it to the tool. A read that fails
   * is a notice, and the tool is never started on an empty drawing.
   */
  const opening = async (v: VariantRow, then: (d: VariantDrawing) => void) => {
    try {
      then(await withDrawing(v))
    } catch (e) {
      setNotice(`Couldn't open ${v.direction_name ?? 'this direction'}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

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
    setJustSaved(v)
  }

  const onSavedStop = (s: StopRow) => {
    setSaving(false)
    draw.cancel()
    void stops.reload()
    setJustSavedStop(s)
  }

  const onDeleteStop = async (s: StopRow) => {
    if (!window.confirm(`Delete ${s.kind} "${stopLabel(s)}"?`)) return
    try {
      await deleteStop(s)
      stops.select(null)
      await stops.reload()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    }
  }

  // One click, several saved things: the chooser lists them all.
  const choice = [...saved.candidates, ...stops.candidates]
  const choosing = choice.length > 1

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
    <div className="@container relative h-full w-full overflow-hidden">
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

      {/* Several saved things under one click: the same chooser the public map has. */}
      {!draw.drawing && choosing && (
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
          onClose={() => {
            saved.select(null)
            stops.select(null)
          }}
        />
      )}

      {/* Top-left: the card for a tapped route, or the account pill. */}
      {!draw.drawing && saved.selected && (
        <RouteCard
          variant={saved.selected}
          timeline={routeTimeline(saved.selected, stops.stops, stops.stopsAlong(saved.selected.id))}
          onPickStop={(id) => {
            saved.select(null)
            stops.show(id)
          }}
          sibling={otherDirection(saved.variants, saved.selected)}
          onSwitch={(v) => saved.select(v.id)}
          actions={
            userId !== null &&
            userId === saved.selected.owner_id && (
              <CardActions
                editLabel="Edit route"
                onEdit={() => {
                  const v = saved.selected
                  if (!v) return
                  saved.select(null)
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
                        saved.select(null)
                        void opening(v, draw.startExtend)
                      }
                    : undefined
                }
              />
            )
          }
          onClose={() => saved.select(null)}
        />
      )}
      {!draw.drawing && !saved.selected && stops.selected && (
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
          actions={
            userId !== null &&
            userId === stops.selected.owner_id && (
              <CardActions
                editLabel={stops.selected.kind === 'terminal' ? 'Edit terminal' : 'Edit hintuan'}
                onEdit={() => {
                  const s = stops.selected
                  if (!s) return
                  stops.select(null)
                  draw.loadArea(s.kind, s.id, stopRing(s))
                }}
                onDelete={() => {
                  if (stops.selected) void onDeleteStop(stops.selected)
                }}
              />
            )
          }
          onClose={() => stops.select(null)}
        />
      )}
      {!draw.drawing && !saved.selected && !stops.selected && !choosing && (
        <div
          className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full bg-white/90
                     px-3 py-1.5 text-xs text-neutral-600 shadow ring-1 ring-black/5 backdrop-blur"
        >
          {saved.variants.length > 0 && (
            <span className="text-neutral-500">
              {saved.variants.length} {saved.variants.length === 1 ? 'route' : 'routes'}
              {stops.stops.length > 0 && (
                <> · {stops.stops.length} {stops.stops.length === 1 ? 'hotspot' : 'hotspots'}</>
              )}{' '}
              ·
            </span>
          )}
          {signedIn ? (
            <>
              <span className="max-w-[16ch] truncate">{session.user.email}</span>
              <button
                type="button"
                onClick={() => setChangingPassword(true)}
                className="font-medium text-neutral-900 underline underline-offset-2"
              >
                Password
              </button>
              <button
                type="button"
                onClick={() => getSupabase()?.auth.signOut()}
                className="font-medium text-neutral-900 underline underline-offset-2"
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSigningIn(true)}
              className="font-medium text-neutral-900 underline underline-offset-2"
            >
              Sign in
            </button>
          )}
        </div>
      )}

      {justSavedStop && !draw.drawing && (
        <div
          className="absolute bottom-24 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full
                     bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg"
        >
          <span>
            Saved {justSavedStop.kind === 'terminal' ? 'terminal' : 'hintuan'}{' '}
            <strong>{stopLabel(justSavedStop)}</strong>
          </span>
          <button
            type="button"
            onClick={() => setJustSavedStop(null)}
            aria-label="Dismiss"
            className="text-neutral-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* After a save, the other direction is almost always next. */}
      {justSaved && !draw.drawing && (
        <div
          className="absolute bottom-24 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full
                     bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg"
        >
          <span>
            Saved <strong>{justSaved.route?.name}</strong> · {justSaved.direction_name}
          </span>
          <button
            type="button"
            onClick={() => {
              const routeId = justSaved.route_id
              setJustSaved(null)
              draw.start(routeId)
            }}
            className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-900"
          >
            Draw the return trip
          </button>
          <button
            type="button"
            onClick={() => setJustSaved(null)}
            aria-label="Dismiss"
            className="text-neutral-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {notice && (
        <div
          className="absolute bottom-24 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full
                     bg-red-600 px-4 py-2 text-sm text-white shadow-lg"
        >
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {draw.drawing ? (
        <DrawToolbar
          draw={draw}
          onDone={onDone}
          keys={!saving && !signingIn && !changingPassword && !resetting}
          ends={extendEnds}
        />
      ) : (
        /* Drawing needs no account; saving does, and asks for it at Done. */
        <div className="absolute bottom-6 right-6 z-10 flex flex-col items-end gap-2">
          {hotspotMenu && (
            <div
              role="menu"
              className="mb-1 overflow-hidden rounded-xl bg-white text-sm shadow-lg ring-1 ring-black/10"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setHotspotMenu(false)
                  draw.startArea('terminal')
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-neutral-50"
              >
                <span className="h-3 w-3 rounded-sm bg-sky-500" />
                <span>
                  <span className="font-medium text-neutral-900">Terminal</span>
                  <span className="block text-xs text-neutral-500">Where routes start and stage</span>
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setHotspotMenu(false)
                  draw.startArea('hintuan')
                }}
                className="flex w-full items-center gap-2 border-t border-neutral-100 px-4 py-2.5 text-left hover:bg-neutral-50"
              >
                <span className="h-3 w-3 rounded-sm bg-orange-500" />
                <span>
                  <span className="font-medium text-neutral-900">Hintuan</span>
                  <span className="block text-xs text-neutral-500">Where people wait and board</span>
                </span>
              </button>
            </div>
          )}
          <button
            type="button"
            disabled={!map}
            onClick={() => draw.start()}
            title="Draw a route"
            className="rounded-full bg-white px-5 py-3 text-sm font-medium text-neutral-800
                       shadow-lg ring-1 ring-black/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + New Route
          </button>
          <button
            type="button"
            disabled={!map}
            onClick={() => setHotspotMenu((open) => !open)}
            aria-expanded={hotspotMenu}
            title="Trace a terminal or hintuan"
            className="rounded-full bg-white px-5 py-3 text-sm font-medium text-neutral-800
                       shadow-lg ring-1 ring-black/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + New hotspot
          </button>
        </div>
      )}

      {signingIn && !signedIn && <SignIn onDismiss={() => setSigningIn(false)} />}

      {resetting && <ResetPassword onDone={recovery.done} />}

      {changingPassword && session?.user.email && !resetting && (
        <ChangePassword email={session.user.email} onDone={() => setChangingPassword(false)} />
      )}

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
