import { useEffect, useMemo, useState } from 'react'
import { bboxOf, bboxesOverlap, OVERVIEW_M } from '../../shared/geo/geo'
import { variantLine, type VariantRow } from '../../shared/model/routes'
import { PASS_WITHIN_M } from '../../shared/geo/pass'
import { parseAliases, stopLabel, type StopRow } from '../../shared/model/stops'
import { linesOf } from '../data/live'
import { saveStop } from '../data/stopsWrite'
import { linksThrough, variantsStartingIn } from '../data/stopsGeometry'
import type { Drawing } from '../drawing/useDrawing'
import { coarse } from '../../shared/map/MapView'
import { FIELD_TEXT, FOOTER, OVERLAY, PANEL } from './sheet'

type Props = {
  draw: Drawing
  /** The hotspot being edited, or null for a new one. */
  existing: StopRow | null
  /** For an existing terminal: the directions currently linked to it. */
  existingLinks: string[]
  /** Every saved direction — the terminal checklist and the hintuan preview. */
  variants: VariantRow[]
  /** Every saved hotspot, so the informal-name box can offer the names already in use. */
  stops?: StopRow[]
  onSaved: (s: StopRow) => void
  onCancel: () => void
}

const field =
  `mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 ${FIELD_TEXT} outline-none ` +
  'focus:border-neutral-900'

/** Directions grouped under their route's generated name, for both lists. */
function groupBySignboard(variants: VariantRow[]) {
  const groups = new Map<string, { signboard: string; directions: VariantRow[] }>()
  for (const v of variants) {
    const key = v.route_id
    const g = groups.get(key) ?? { signboard: v.route?.name ?? '(unnamed)', directions: [] }
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
export function HotspotPanel({
  draw,
  existing,
  existingLinks,
  variants,
  stops = [],
  onSaved,
  onCancel,
}: Props) {
  const area = draw.area
  const kind = area?.kind ?? 'hintuan'
  const ring = draw.controlPoints

  const [name, setName] = useState(existing?.name ?? '')
  const [informal, setInformal] = useState(existing?.informal ?? '')
  // Also called and Note are off the form for now; a box that has them keeps them.
  const [aliasText] = useState(existing?.aliases?.join(', ') ?? '')
  const [note] = useState(existing?.note ?? '')

  // The informal names already in use, offered as suggestions so a second box
  // for the same place joins the group instead of starting "SM  Fairview".
  const knownInformal = useMemo(() => {
    const seen = new Map<string, string>()
    for (const s of stops) {
      if (s.id === existing?.id) continue
      const label = stopLabel(s)
      seen.set(label.toLowerCase(), label)
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b))
  }, [stops, existing?.id])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The list holds overviews (0009); a link's sequence is an index into the
  // full line, so the directions the outline can reach are read in full
  // before anything is worked out on them, and Save waits for them.
  const [lined, setLined] = useState<VariantRow[] | null>(null)
  useEffect(() => {
    let live = true
    // Reach: the starts-here distance, the pass rule and the overview's own slack.
    const reach = bboxOf(ring, 100 + PASS_WITHIN_M + OVERVIEW_M)
    const near = variants.filter((v) => {
      const line = variantLine(v)
      return line.length > 1 && bboxesOverlap(bboxOf(line), reach)
    })
    linesOf(near).then(
      (full) => {
        if (!live) return
        const byId = new Map(full.map((v) => [v.id, v]))
        setLined(variants.map((v) => byId.get(v.id) ?? v))
      },
      (e: unknown) => live && setError(`Couldn't read the lines near this outline: ${e instanceof Error ? e.message : String(e)}`),
    )
    return () => {
      live = false
    }
  }, [ring, variants])
  const lines = lined ?? variants

  const station = existing?.line ?? null
  const through = useMemo(() => linksThrough(ring, lines, station), [ring, lines, station])
  const throughIds = useMemo(() => new Set(through.map((l) => l.variantId)), [through])

  // A terminal's checklist is pre-ticked from the full lines, once they are
  // in; a box the owner ticks or unticks before then keeps the owner's
  // choice over the pre-tick.
  const [startTicks, setStartTicks] = useState<Set<string> | null>(() => (existing ? new Set(existingLinks) : null))
  useEffect(() => {
    if (lined && startTicks === null) setStartTicks(new Set(variantsStartingIn(ring, lined)))
  }, [lined, startTicks, ring])
  const [chosen, setChosen] = useState<ReadonlyMap<string, boolean>>(() => new Map())
  const ticked = useMemo(() => {
    const t = new Set(startTicks ?? [])
    for (const [id, on] of chosen) {
      if (on) t.add(id)
      else t.delete(id)
    }
    return t
  }, [startTicks, chosen])

  const groups = useMemo(() => groupBySignboard(lines), [lines])
  const hintuanGroups = useMemo(
    () => groupBySignboard(lines.filter((v) => throughIds.has(v.id))),
    [lines, throughIds],
  )

  function toggle(id: string) {
    setChosen((m) => new Map(m).set(id, !ticked.has(id)))
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
        informal,
        aliases: parseAliases(aliasText, [name, informal]),
        note,
        ring,
        variantIds: kind === 'terminal' ? [...ticked] : undefined,
        variants: lines,
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
    <div className={OVERLAY}>
      <form
        onSubmit={submit}
        className={PANEL}
      >
        <h2 className="flex items-center gap-2 text-base font-medium text-neutral-900">
          <span className={`inline-block h-3 w-3 rounded-sm ${swatch}`} />
          {existing ? `Update this ${label.toLowerCase()}` : `Save this ${label.toLowerCase()}`}
        </h2>
        <p className="mt-1 text-xs text-neutral-500">{ring.length} corners</p>

        <label className="mt-4 block text-xs font-medium text-neutral-700">
          Ground name <span className="text-neutral-400">(as written on the ground)</span>
          <input
            required
            autoFocus={!coarse}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'terminal' ? 'SM Fairview Terminal A' : 'SM Fairview Ilalim'}
            className={field}
          />
        </label>

        <label className="mt-3 block text-xs font-medium text-neutral-700">
          Stop name <span className="text-neutral-400">(what people say — optional)</span>
          <input
            value={informal}
            onChange={(e) => setInformal(e.target.value)}
            list="parapo-informal-names"
            placeholder="SM Fairview"
            className={field}
          />
          <datalist id="parapo-informal-names">
            {knownInformal.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <span className="mt-1 block text-[11px] font-normal text-neutral-400">
            Boxes that share a stop name are one stop, whatever is written on each. Route names read it
            {kind === 'terminal' ? '; a stop has one terminal.' : '.'}
          </span>
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
                          <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700 pointer-coarse:min-h-11">
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

        <div className={FOOTER}>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-600 ring-1 ring-neutral-300"
          >
            Back to map
          </button>
          <button
            type="submit"
            disabled={busy || ring.length < 3 || !lined}
            className="flex-1 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : existing ? 'Save changes' : `Save ${label.toLowerCase()}`}
          </button>
        </div>
      </form>
    </div>
  )
}
