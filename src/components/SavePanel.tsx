import { useState } from 'react'
import type { Drawing } from '../lib/useDrawing'
import {
  MODES,
  saveVariant,
  type RouteRow,
  type TransportMode,
  type VariantRow,
} from '../lib/routes'
import { syncHintuanLinks } from '../lib/stops'

type Props = {
  draw: Drawing
  /** The direction being edited, when this is an edit rather than a new save. */
  existing: VariantRow | null
  /** The parent route, when adding another direction to a route that exists. */
  route: RouteRow | null
  onSaved: (v: VariantRow) => void
  onCancel: () => void
}

const field =
  'mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none ' +
  'focus:border-neutral-900 disabled:bg-neutral-100 disabled:text-neutral-500'

/**
 * The one form in the app. Appears once, at ✓ Done. Signboard and direction
 * are the only required fields: they are what make a line into a route.
 */
export function SavePanel({ draw, existing, route, onSaved, onCancel }: Props) {
  const parent = existing?.route ?? route
  const [signboard, setSignboard] = useState(parent?.signboard ?? '')
  const [longName, setLongName] = useState(parent?.long_name ?? '')
  const [mode, setMode] = useState<TransportMode>(parent?.mode ?? 'jeepney')
  const [fareNote, setFareNote] = useState(parent?.fare_note ?? '')
  const [direction, setDirection] = useState(existing?.direction_name ?? '')
  const [origin, setOrigin] = useState(existing?.origin_terminal ?? '')
  const [destination, setDestination] = useState(existing?.destination_terminal ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const routeLocked = !!parent

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const saved = await saveVariant({
        routeId: parent?.id ?? null,
        variantId: existing?.id ?? null,
        signboard,
        long_name: longName,
        mode,
        fare_note: fareNote,
        direction_name: direction,
        origin_terminal: origin,
        destination_terminal: destination,
        control_points: draw.controlPoints,
        segments: draw.segments,
      })
      // Every hintuan's route list is a fact about geometry, so a changed
      // line re-checks itself against all of them. Terminal links are the
      // owner's and are left alone.
      await syncHintuanLinks(saved)
      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/30 p-4">
      <form
        onSubmit={submit}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-base font-medium text-neutral-900">
          {existing ? 'Update this direction' : route ? 'Add a direction' : 'Save this route'}
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          {draw.controlPoints.length} points · {(draw.metres / 1000).toFixed(2)} km
          {routeLocked && ' · route details are shared by all its directions'}
        </p>

        <label className="mt-4 block text-xs font-medium text-neutral-700">
          Signboard <span className="text-neutral-400">(what is painted on the jeep)</span>
          <input
            required
            autoFocus={!routeLocked}
            disabled={routeLocked}
            value={signboard}
            onChange={(e) => setSignboard(e.target.value)}
            placeholder="Cubao – Montalban"
            className={field}
          />
        </label>

        <label className="mt-3 block text-xs font-medium text-neutral-700">
          Route name <span className="text-neutral-400">(optional)</span>
          <input
            disabled={routeLocked}
            value={longName}
            onChange={(e) => setLongName(e.target.value)}
            placeholder="Cubao – Montalban via Aurora Blvd"
            className={field}
          />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-neutral-700">
            Mode
            <select
              disabled={routeLocked}
              value={mode}
              onChange={(e) => setMode(e.target.value as TransportMode)}
              className={field}
            >
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-neutral-700">
            Fare note <span className="text-neutral-400">(optional)</span>
            <input
              disabled={routeLocked}
              value={fareNote}
              onChange={(e) => setFareNote(e.target.value)}
              placeholder="₱13 first 4 km"
              className={field}
            />
          </label>
        </div>

        <hr className="my-4 border-neutral-200" />

        <label className="block text-xs font-medium text-neutral-700">
          Direction <span className="text-neutral-400">(name it by where it is going)</span>
          <input
            required
            autoFocus={routeLocked}
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            placeholder="to Montalban"
            className={field}
          />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-neutral-700">
            From terminal
            <input
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="Cubao (Araneta)"
              className={field}
            />
          </label>
          <label className="block text-xs font-medium text-neutral-700">
            To terminal
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Montalban"
              className={field}
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-600 ring-1 ring-neutral-300"
          >
            Back to map
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : existing ? 'Update' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
