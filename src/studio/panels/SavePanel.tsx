import { useMemo, useState } from 'react'
import type { Drawing } from '../drawing/useDrawing'
import { haversine, type LngLat } from '../../shared/geo/geo'
import { MODES, type RouteRow, type TransportMode, type VariantRow } from '../../shared/model/routes'
import { stopLabel, type StopRow } from '../../shared/model/stops'
import { StopTimeline, passesThrough } from '../../shared/cards/StopTimeline'
import { ENDS_TAKEN } from '../data/routesWrite'
import { saveRouteAndLinks } from '../data/saveRoute'
import { SaveNotices } from './SaveNotices'
import { boxFor, groupPlaces, nearestStop } from './places'
import { useSaveFacts } from './useSaveFacts'

type Props = {
  draw: Drawing
  /** The direction being edited, when this is an edit rather than a new save. */
  existing: VariantRow | null
  /** The parent route, when adding another direction to a route that exists. */
  route: RouteRow | null
  /**
   * Which way round the route's empty slot runs, when there is one: the
   * direction this line is being drawn *for*. Null when there is no slot to
   * fill. Not inferred from the line — a return trip drawn from the wrong end
   * must not overwrite the direction that is already there.
   */
  slotReversed?: boolean | null
  /** Every hotspot, for the two end pickers and for generating the name. */
  stops: StopRow[]
  /**
   * Every saved direction: for what an Extend borrowed from, for noticing
   * that the chosen ends already make a route whose empty slot this fills,
   * and, in Edit route, for refusing ends another route already has.
   */
  variants?: VariantRow[]
  onSaved: (v: VariantRow) => void
  onCancel: () => void
}

const field =
  'mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none ' +
  'focus:border-neutral-900 disabled:bg-neutral-100 disabled:text-neutral-500'

/**
 * The one form in the app. Appears once, at ✓ Done.
 *
 * Since 2026-09-21 it asks for a route's two ends rather than its name: the
 * name is generated from them and cannot be typed over, so a hotspot renamed
 * once fixes every route through it. Nothing here is required except the two
 * ends — the signboard is an observed fact and can wait until it is known.
 */
export function SavePanel({
  draw,
  existing,
  route,
  slotReversed = null,
  stops,
  variants = [],
  onSaved,
  onCancel,
}: Props) {
  const parent = existing?.route ?? route
  const line = draw.controlPoints
  const places = useMemo(() => groupPlaces(stops), [stops])
  const placeOf = (id: string) => places.find((p) => p.boxes.some((s) => s.id === id))
  const lineStart = line[0]
  const lineEnd = line[line.length - 1]
  // Where a picked end's box is looked for: at the end of the line nearer
  // the route's head, and the tail at the other — whichever way it was
  // drawn; a new route's line starts at its head.
  const headNow = existing ? stops.find((s) => s.id === existing.route.head_stop_id) : undefined
  const startsAtHead =
    !headNow || !lineStart || !lineEnd || haversine(lineStart, headNow.point.coordinates) <= haversine(lineEnd, headNow.point.coordinates)
  const [nearHead, nearTail] = startsAtHead ? [lineStart, lineEnd] : [lineEnd, lineStart]

  const [signboard, setSignboard] = useState(parent?.signboard ?? '')
  const [mode, setMode] = useState<TransportMode>(parent?.mode ?? 'jeepney')
  const [fareNote, setFareNote] = useState(parent?.fare_note ?? '')
  const [via, setVia] = useState(parent?.via ?? '')
  // The ends are the route's: a return trip takes them as they are, and Edit
  // route starts from them; a new route's are guessed from where the line
  // actually starts and finishes — the nearest box, then that box's place,
  // then the place's own box — and corrected by hand when the guess is wrong.
  const guess = (to: LngLat | undefined) => {
    const place = placeOf(nearestStop(stops, to))
    return place ? boxFor(place, to) : ''
  }
  // The guess reads the line's own order: it starts at the head. A return trip
  // starts at the tail, so when the guessed pair is already a route the other
  // way round, that route is the one meant — the head is where its jeeps wait.
  const [firstGuess] = useState(() => {
    const [h, t] = [guess(lineStart), guess(lineEnd)]
    const swapped = variants.some((v) => v.route.head_stop_id === t && v.route.tail_stop_id === h)
    return swapped ? [t, h] : [h, t]
  })
  const [headId, setHeadId] = useState(parent?.head_stop_id ?? firstGuess[0])
  const [tailId, setTailId] = useState(parent?.tail_stop_id ?? firstGuess[1])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The direction as a save wrote it, when the link sync after it failed.
  // Saves are two steps, not one transaction (PLAN.md's known risk #3): a
  // second press inserted the route again, met its own row and was refused as
  // "already drawn" (review finding 13). Now it updates the row it wrote.
  const [written, setWritten] = useState<{ routeId: string; variantId: string } | null>(null)

  // A return trip fills its route's slot and leaves the route as it is; Edit
  // route may change the route's facts, for both its directions. A new
  // route's are fixed once a save has written it: the retry finishes that
  // row and would ignore a changed end.
  const routeLocked = !existing && (!!parent || !!written)
  const head = stops.find((s) => s.id === headId)
  const tail = stops.find((s) => s.id === tailId)
  const headPlace = head ? placeOf(head.id) : undefined
  const tailPlace = tail ? placeOf(tail.id) : undefined

  const pickPlace = (key: string, to: LngLat | undefined) => {
    const place = places.find((p) => p.key === key)
    return place ? boxFor(place, to) : ''
  }

  // What this line is, as the panel and the save see it.
  const facts = useSaveFacts({ draw, existing, parent, slotReversed, stops, variants, head, tail, headId, tailId, via })
  const { reversed, wrongWayRound, sameEnds, endsTaken, turnedRound, borrowParent, borrowPart, borrowedM, name, direction, preview } =
    facts

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!headId || !tailId) {
      setError('Pick the place at each end. The route is named after them.')
      return
    }
    if (headPlace && headPlace === tailPlace) {
      setError('The two ends have to be different places.')
      return
    }
    if (endsTaken) {
      setError(ENDS_TAKEN)
      return
    }
    if (turnedRound) {
      setError('Head and tail swapped would turn the route round, which Edit route cannot do: its directions keep their way round. Change one end at a time.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // The borrow on the parent's full line, read now if it has not come.
      const borrowed = await facts.borrowedForSave()
      const named = await saveRouteAndLinks(
        {
          routeId: written?.routeId ?? parent?.id ?? null,
          variantId: written?.variantId ?? existing?.id ?? null,
          writeRoute: !!existing,
          signboard,
          mode,
          fare_note: fareNote,
          head_stop_id: headId,
          tail_stop_id: tailId,
          via,
          reversed,
          control_points: draw.controlPoints,
          segments: draw.segments,
          // A parent deleted since, or a borrowed part redrawn away, borrows nothing.
          borrowed_from: borrowParent && borrowed > 0 ? borrowParent.id : null,
          borrowed_part: borrowPart,
          borrowed_m: borrowed > 0 ? Math.round(borrowed) : null,
        },
        stops,
        setWritten,
      )
      onSaved(named)
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
          {existing ? 'Update this direction' : route ? 'Draw the return trip' : 'Save this route'}
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          {draw.controlPoints.length} points · {(draw.metres / 1000).toFixed(2)} km
          {routeLocked && ' · the ends belong to the route, so both directions share them'}
          {existing && " · the ends, via, signboard, mode and fare note are the route's: a change here is a change to both directions"}
        </p>
        <SaveNotices
          segments={draw.segments}
          uTurns={draw.uTurns}
          stopsCount={stops.length}
          wrongWay={wrongWayRound && head && tail ? { direction, startsAt: stopLabel(reversed ? head : tail), from: stopLabel(reversed ? tail : head) } : null}
          borrowed={borrowParent && borrowedM > 0 ? { metres: borrowedM, parent: borrowParent } : null}
          sameEnds={sameEnds}
          direction={direction}
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-neutral-700">
            Head <span className="text-neutral-400">(where the jeeps wait)</span>
            <select
              required
              disabled={routeLocked}
              value={headPlace?.key ?? ''}
              onChange={(e) => setHeadId(pickPlace(e.target.value, nearHead))}
              className={field}
              data-testid="save-head"
            >
              <option value="">Pick a place…</option>
              {places.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-neutral-700">
            Tail <span className="text-neutral-400">(the far end)</span>
            <select
              required
              disabled={routeLocked}
              value={tailPlace?.key ?? ''}
              onChange={(e) => setTailId(pickPlace(e.target.value, nearTail))}
              className={field}
              data-testid="save-tail"
            >
              <option value="">Pick a place…</option>
              {places.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* What the line passes, by the rule the save will apply: seen first, stored the same. */}
        {head && tail && (
          <div data-testid="save-timeline" className="mt-3 rounded-lg bg-neutral-50 px-3 py-2">
            <p className="text-xs font-medium text-neutral-600">
              {preview.between.length === 0
                ? 'Passes through no hintuan yet — draw one across the road and it appears here'
                : `${passesThrough(preview.between.length)}, in this order`}
            </p>
            <StopTimeline timeline={preview} />
          </div>
        )}

        <label className="mt-3 block text-xs font-medium text-neutral-700">
          Via <span className="text-neutral-400">(only if another route shares both ends)</span>
          <input
            disabled={routeLocked}
            value={via}
            onChange={(e) => setVia(e.target.value)}
            placeholder="Zabarte"
            className={field}
          />
        </label>

        <p className="mt-3 rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-600">
          <span className="text-xs text-neutral-400">This line is the direction</span>
          <br />
          <strong data-testid="save-direction" className="text-neutral-900">
            {direction || '—'}
          </strong>
          <br />
          <span className="text-xs text-neutral-500">
            {parent ? 'of the route ' : 'of a new route, '}
            <span data-testid="save-name" className="font-medium text-neutral-700">
              {name || '—'}
            </span>
          </span>
          <br />
          <span className="text-[11px] text-neutral-400">
            {existing
              ? 'Both names are generated from the two ends: pick another place above to change them.'
              : 'Both names are generated from the two ends. Rename a hotspot to change them.'}
          </span>
        </p>

        <hr className="my-4 border-neutral-200" />

        <label className="block text-xs font-medium text-neutral-700">
          Signboard <span className="text-neutral-400">(what is painted on the jeep — optional)</span>
          <input
            disabled={routeLocked}
            value={signboard}
            onChange={(e) => setSignboard(e.target.value)}
            placeholder="Fairview – Tala"
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
