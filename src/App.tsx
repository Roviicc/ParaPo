import { useState } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { DrawToolbar } from './components/DrawToolbar'
import { MapView } from './components/MapView'
import { RouteCard } from './components/RouteCard'
import { SavePanel } from './components/SavePanel'
import { SignIn } from './components/SignIn'
import { deleteVariant, type VariantRow } from './lib/routes'
import { supabase, supabaseConfigError } from './lib/supabase'
import { useDrawing } from './lib/useDrawing'
import { useSavedRoutes } from './lib/useSavedRoutes'
import { useSession } from './lib/useSession'

export default function App() {
  const session = useSession()
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState<VariantRow | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const draw = useDrawing(map)
  const saved = useSavedRoutes(map, {
    drawing: draw.drawing,
    hiddenVariantId: draw.target.variantId,
  })

  const signedIn = !!session
  const userId = session?.user.id ?? null

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

  const onSaved = (v: VariantRow) => {
    setSaving(false)
    draw.cancel()
    void saved.reload()
    setJustSaved(v)
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
      {!draw.drawing && !saved.selected && (
        <div
          className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full bg-white/90
                     px-3 py-1.5 text-xs text-neutral-600 shadow ring-1 ring-black/5 backdrop-blur"
        >
          {saved.variants.length > 0 && (
            <span className="text-neutral-500">
              {saved.variants.length} {saved.variants.length === 1 ? 'route' : 'routes'} ·
            </span>
          )}
          {signedIn ? (
            <>
              <span className="max-w-[16ch] truncate">{session.user.email}</span>
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
        <button
          type="button"
          disabled={!map}
          onClick={() => draw.start()}
          title="Draw a route"
          className="absolute bottom-6 right-6 z-10 rounded-full bg-white px-5 py-3
                     text-sm font-medium text-neutral-800 shadow-lg ring-1 ring-black/10
                     disabled:cursor-not-allowed disabled:opacity-50"
        >
          + New Route
        </button>
      )}

      {signingIn && !signedIn && <SignIn onDismiss={() => setSigningIn(false)} />}

      {saving && draw.drawing && (
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
