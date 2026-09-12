import { useMemo, useState } from 'react'
import type { VariantRow } from '../lib/routes'
import {
  linksThrough,
  saveStop,
  variantsStartingIn,
  type StopRow,
} from '../lib/stops'
import type { Drawing } from '../lib/useDrawing'

type Props = {
  draw: Drawing
  /** The hotspot being edited, or null for a new one. */
  existing: StopRow | null
  /** For an existing terminal: the directions currently linked to it. */
  existingLinks: string[]
  /** Every saved direction — the terminal checklist and the hintuan preview. */
  variants: VariantRow[]
  onSaved: (s: StopRow) => void
  onCancel: () => void
}

const field =
  'mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none ' +
  'focus:border-neutral-900'

/** Directions grouped under their route's signboard, for both lists. */
function groupBySignboard(variants: VariantRow[]) {
  const groups = new Map<string, { signboard: string; directions: VariantRow[] }>()
  for (const v of variants) {
    const key = v.route_id
    const g = groups.get(key) ?? { signboard: v.route?.signboard ?? '(unnamed)', directions: [] }
    g.directions.push(v)
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => a.signboard.localeCompare(b.signboard))
}

/**
 * The save form for a hotspot outline. Name is the only required field.
 *
 * Terminal: a checklist of every direction, pre-ticked with the ones that
 * start inside the outline; the owner decides. Hintuan: a read-only preview of
 * the directions that pass under the outline — the polygon decides, and this
 * shows exactly what the save will write.
 */
export function HotspotPanel({ draw, existing, existingLinks, variants, onSaved, onCancel }: Props) {
  const area = draw.area
  const kind = area?.kind ?? 'hintuan'
  const ring = draw.controlPoints

  const [name, setName] = useState(existing?.name ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const through = useMemo(() => linksThrough(ring, variants), [ring, variants])
  const throughIds = useMemo(() => new Set(through.map((l) => l.variantId)), [through])

  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(existing ? existingLinks : variantsStartingIn(ring, variants)),
  )

  const groups = useMemo(() => groupBySignboard(variants), [variants])
  const hintuanGroups = useMemo(
    () => groupBySignboard(variants.filter((v) => throughIds.has(v.id))),
    [variants, throughIds],
  )

  function toggle(id: string) {
    setTicked((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const saved = await saveStop({
        stopId: existing?.id ?? area?.stopId ?? null,
        kind,
        name,
        note,
        ring,
        variantIds: kind === 'terminal' ? [...ticked] : undefined,
        variants,
      })
      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const label = kind === 'terminal' ? 'Terminal' : 'Hintuan'
  const swatch = kind === 'terminal' ? 'bg-sky-500' : 'bg-orange-500'

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/30 p-4">
      <form
        onSubmit={submit}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 className="flex items-center gap-2 text-base font-medium text-neutral-900">
          <span className={`inline-block h-3 w-3 rounded-sm ${swatch}`} />
          {existing ? `Update this ${label.toLowerCase()}` : `Save this ${label.toLowerCase()}`}
        </h2>
        <p className="mt-1 text-xs text-neutral-500">{ring.length} corners</p>

        <label className="mt-4 block text-xs font-medium text-neutral-700">
          Name
          <input
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'terminal' ? 'SM Fairview terminal' : 'Commonwealth – Tandang Sora'}
            className={field}
          />
        </label>

        <label className="mt-3 block text-xs font-medium text-neutral-700">
          Note <span className="text-neutral-400">(optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={
              kind === 'terminal'
                ? 'Loading bays along the east side; dispatcher after 5 am'
                : 'Jeeps wait here until full, especially after 6 pm'
            }
            className={field}
          />
        </label>

        {kind === 'terminal' ? (
          <fieldset className="mt-4">
            <legend className="text-xs font-medium text-neutral-700">
              Routes that stage here{' '}
              <span className="font-normal text-neutral-400">
                — pre-ticked: routes starting inside the outline
              </span>
            </legend>
            {groups.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">No saved routes yet.</p>
            ) : (
              <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
                {groups.map((g) => (
                  <li key={g.signboard}>
                    <p className="text-sm font-medium text-neutral-900">{g.signboard}</p>
                    <ul className="mt-1 space-y-1">
                      {g.directions.map((v) => (
                        <li key={v.id}>
                          <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
                            <input
                              type="checkbox"
                              checked={ticked.has(v.id)}
                              onChange={() => toggle(v.id)}
                              className="h-4 w-4 accent-neutral-900"
                            />
                            <span>{v.direction_name}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        ) : (
          <div className="mt-4">
            <p className="text-xs font-medium text-neutral-700">
              Passes through{' '}
              <span className="font-normal text-neutral-400">— decided by the outline</span>
            </p>
            {hintuanGroups.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">
                No saved route passes under this outline yet. It will pick up routes drawn
                through it later.
              </p>
            ) : (
              <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1 text-sm">
                {hintuanGroups.map((g) => (
                  <li key={g.signboard} className="text-neutral-700">
                    <span className="font-medium text-neutral-900">{g.signboard}</span>
                    <span className="text-neutral-500">
                      {' '}
                      · {g.directions.map((v) => v.direction_name).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-600 ring-1 ring-neutral-300"
          >
            Back to map
          </button>
          <button
            type="submit"
            disabled={busy || ring.length < 3}
            className="flex-1 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : existing ? 'Save changes' : `Save ${label.toLowerCase()}`}
          </button>
        </div>
      </form>
    </div>
  )
}
