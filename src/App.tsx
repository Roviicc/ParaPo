import { useEffect, useState } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { ChangePassword } from './components/ChangePassword'
import { DrawToolbar } from './components/DrawToolbar'
import { HotspotCard } from './components/HotspotCard'
import { HotspotPanel } from './components/HotspotPanel'
import { MapView } from './components/MapView'
import { ResetPassword } from './components/ResetPassword'
import { RouteCard } from './components/RouteCard'
import { SavePanel } from './components/SavePanel'
import { SignIn } from './components/SignIn'
import { deleteVariant, type VariantRow } from './lib/routes'
import { deleteStop, stopRing, type StopRow } from './lib/stops'
import { supabase, supabaseConfigError } from './lib/supabase'
import { useDrawing } from './lib/useDrawing'
import { usePasswordRecovery } from './lib/usePasswordRecovery'
import { useSavedRoutes } from './lib/useSavedRoutes'
import { useSavedStops } from './lib/useSavedStops'
import { useSession } from './lib/useSession'

export default function App() {
  const session = useSession()
  const recovery = usePasswordRecovery()
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hotspotMenu, setHotspotMenu] = useState(false)
  const [justSaved, setJustSaved] = useState<VariantRow | null>(null)
  const [justSavedStop, setJustSavedStop] = useState<StopRow | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const draw = useDrawing(map)
  const saved = useSavedRoutes(map, {
    drawing: draw.drawing,
    hiddenVariantId: draw.target.variantId,
  })
  const stops = useSavedStops(map, {
    drawing: draw.drawing,
    hiddenStopId: draw.area?.stopId ?? null,
  })

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
    if (!window.confirm(`Delete ${s.kind} "${s.name}"?`)) return
    try {
      await deleteStop(s)
      stops.select(null)
      await stops.reload()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    }
  }

  const onDelete = async (v: VariantRow) => {
    if (!window.confirm(`Delete "${v.route?.signboard}" — ${v.direction_name}?`)) return
    try {
      await deleteVariant(v)
      saved.select(null)
      await saved.reload()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapView onReady={setMap} />

      {/* A config or load problem is a banner, never a blank page. */}
      {(supabaseConfigError || saved.error) && (
        <div
          className="absolute left-1/2 top-4 z-20 max-w-xl -translate-x-1/2 rounded-lg bg-amber-50
                     px-4 py-2 text-xs text-amber-900 shadow ring-1 ring-amber-200"
        >
          {supabaseConfigError ?? `Couldn't load saved routes: ${saved.error}`}
        </div>
      )}

      {/* Top-left: the card for a tapped route, or the account pill. */}
      {!draw.drawing && saved.selected && (
        <RouteCard
          variant={saved.selected}
          isOwner={userId !== null && userId === saved.selected.owner_id}
          onEdit={() => {
            const v = saved.selected
            if (!v) return
            saved.select(null)
            draw.load(v)
          }}
          onDelete={() => {
            if (saved.selected) void onDelete(saved.selected)
          }}
          onClose={() => saved.select(null)}
        />
      )}
      {!draw.drawing && !saved.selected && stops.selected && (
        <HotspotCard
          stop={stops.selected}
          linkedVariantIds={stops.linkedVariantIds(stops.selected.id)}
          variants={saved.variants}
          isOwner={userId !== null && userId === stops.selected.owner_id}
          onSelectVariant={(v) => {
            stops.select(null)
            saved.select(v.id)
          }}
          onEdit={() => {
            const s = stops.selected
            if (!s) return
            stops.select(null)
            draw.loadArea(s.kind, s.id, stopRing(s))
          }}
          onDelete={() => {
            if (stops.selected) void onDeleteStop(stops.selected)
          }}
          onClose={() => stops.select(null)}
        />
      )}
      {!draw.drawing && !saved.selected && !stops.selected && (
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
                onClick={() => supabase?.auth.signOut()}
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
            <strong>{justSavedStop.name}</strong>
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
            Saved <strong>{justSaved.route?.signboard}</strong> · {justSaved.direction_name}
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
        <DrawToolbar draw={draw} onDone={onDone} />
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
          onSaved={onSavedStop}
          onCancel={() => setSaving(false)}
        />
      )}

      {saving && draw.drawing && !draw.area && (
        <SavePanel
          draw={draw}
          existing={editing}
          route={parentRoute}
          onSaved={onSaved}
          onCancel={() => setSaving(false)}
        />
      )}
    </div>
  )
}
