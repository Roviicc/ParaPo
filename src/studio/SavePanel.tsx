import { useMemo, useState } from 'react'
import type { Drawing } from './useDrawing'
import { haversine, type LngLat } from '../shared/geo'
import {
  MODES,
  directionName,
  nameVariants,
  routeName,
  type RouteRow,
  type TransportMode,
  type VariantRow,
} from '../shared/routes'
import { stopLabel, type StopRow } from '../shared/stops'
import { saveVariant } from './routesWrite'
import { routeStreets } from './snap'
import { syncHintuanLinks } from './stopsWrite'

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
  onSaved: (v: VariantRow) => void
  onCancel: () => void
}

const field =
  'mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none ' +
  'focus:border-neutral-900 disabled:bg-neutral-100 disabled:text-neutral-500'

/** The hotspot nearest a point, by centroid. Only a starting guess for the picker. */
function nearestStop(stops: StopRow[], to: LngLat | undefined): string {
  if (!to || stops.length === 0) return ''
  let best = stops[0]
  let bestD = haversine(best.point.coordinates, to)
  for (const s of stops.slice(1)) {
    const d = haversine(s.point.coordinates, to)
    if (d < bestD) {
      best = s
      bestD = d
    }
  }
  return best.id
}

/**
 * A place a route can end at. A route ends at SM Fairview, not at one of the
 * five boxes drawn there: boxes that share the name people say are one place
 * (H3), so the pickers list places and the owner never sees a box name.
 * Case-folded, because "SM fairview" typed once must not become a second
 * place in the list. The row a route actually references is `boxFor`.
 */
type Place = { key: string; label: string; boxes: StopRow[]; terminal: StopRow | null }

function placeKey(s: StopRow): string {
  return stopLabel(s).trim().toLowerCase()
}

/** Every place, the ones with a terminal first, then by name. */
function groupPlaces(stops: StopRow[]): Place[] {
  const byKey = new Map<string, Place>()
  for (const s of stops) {
    const key = placeKey(s)
    const place = byKey.get(key) ?? { key, label: stopLabel(s), boxes: [], terminal: null }
    place.boxes.push(s)
    // The terminal's spelling names the place; it is the one box per place
    // the database holds to a single row (H4).
    if (s.kind === 'terminal' && !place.terminal) {
      place.terminal = s
      place.label = stopLabel(s)
    }
    byKey.set(key, place)
  }
  return [...byKey.values()].sort(
    (a, b) => Number(!!b.terminal) - Number(!!a.terminal) || a.label.localeCompare(b.label),
  )
}

/**
 * The box a chosen place stands on, since `route.head_stop_id` references one
 * row: its terminal when it has one, else the box nearest that end of the
 * line — the one the jeep actually stops at.
 */
function boxFor(place: Place, to: LngLat | undefined): string {
  return place.terminal?.id ?? nearestStop(place.boxes, to)
}

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
  onSaved,
  onCancel,
}: Props) {
  const parent = existing?.route ?? route
  const line = draw.controlPoints
  const places = useMemo(() => groupPlaces(stops), [stops])
  const placeOf = (id: string) => places.find((p) => p.boxes.some((s) => s.id === id))
  const lineStart = line[0]
  const lineEnd = line[line.length - 1]

  const [signboard, setSignboard] = useState(parent?.signboard ?? '')
  const [mode, setMode] = useState<TransportMode>(parent?.mode ?? 'jeepney')
  const [fareNote, setFareNote] = useState(parent?.fare_note ?? '')
  const [via, setVia] = useState(parent?.via ?? '')
  // The ends are the route's, so an existing route fixes them; a new one is
  // guessed from where the line actually starts and finishes — the nearest
  // box, then that box's place, then the place's own box — and corrected by
  // hand when the guess is wrong.
  const guess = (to: LngLat | undefined) => {
    const place = placeOf(nearestStop(stops, to))
    return place ? boxFor(place, to) : ''
  }
  const [headId, setHeadId] = useState(parent?.head_stop_id ?? guess(lineStart))
  const [tailId, setTailId] = useState(parent?.tail_stop_id ?? guess(lineEnd))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const routeLocked = !!parent
  const streets = routeStreets(draw.segments)
  const head = stops.find((s) => s.id === headId)
  const tail = stops.find((s) => s.id === tailId)
  const headPlace = head ? placeOf(head.id) : undefined
  const tailPlace = tail ? placeOf(tail.id) : undefined

  const pickPlace = (key: string, to: LngLat | undefined) => {
    const place = places.find((p) => p.key === key)
    return place ? boxFor(place, to) : ''
  }

  /**
   * Which way round this line runs, read off the geometry: whichever end it
   * starts nearest to is the end it starts from. Only a guess, and only used
   * for a brand-new route — an existing direction, or a route's empty slot,
   * already knows.
   */
  const drawnReversed = useMemo(() => {
    if (!head || !tail || line.length === 0) return null
    return haversine(line[0], tail.point.coordinates) < haversine(line[0], head.point.coordinates)
  }, [head, tail, line])
  const reversed = existing ? existing.reversed : (slotReversed ?? drawnReversed ?? false)
  // The slot says "SM Fairview → Tala" but the line starts at Tala: drawn the
  // wrong way round, or drawn as the outbound again. Say so; do not block —
  // a line can honestly begin nearer the far end than the near one.
  const wrongWayRound =
    !existing && slotReversed !== null && drawnReversed !== null && drawnReversed !== slotReversed

  const name = head && tail ? routeName(stopLabel(head), stopLabel(tail), via) : ''
  const direction = head && tail ? directionName(stopLabel(head), stopLabel(tail), reversed) : ''

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
    setBusy(true)
    setError(null)
    try {
      const saved = await saveVariant({
        routeId: parent?.id ?? null,
        variantId: existing?.id ?? null,
        signboard,
        mode,
        fare_note: fareNote,
        head_stop_id: headId,
        tail_stop_id: tailId,
        via,
        reversed,
        control_points: draw.controlPoints,
        segments: draw.segments,
      })
      // Every hintuan's route list is a fact about geometry, so a changed
      // line re-checks itself against all of them. Terminal links are the
      // owner's and are left alone.
      const named = nameVariants([saved], stops)[0]
      await syncHintuanLinks(named)
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
        </p>
        {/* For a jeepney the street list says more than the two terminals do. */}
        {streets.names.length > 0 && (
          <p data-testid="save-streets" className="mt-2 text-xs text-neutral-700">
            via {streets.names.join(' → ')}
            {streets.straight > 0 && (
              <span className="text-neutral-400">
                {' '}
                · and {streets.straight} straight {streets.straight === 1 ? 'stretch' : 'stretches'}
              </span>
            )}
          </p>
        )}
        {streets.missing > 0 && (
          <p className="mt-1 text-[11px] text-neutral-400">
            No street names yet for {streets.missing === 1 ? 'one stretch' : `${streets.missing} stretches`}{' '}
            routed before they were recorded. Moving a point re-routes its stretches and fills them in.
          </p>
        )}
        {draw.uTurns.length > 0 && (
          <p
            data-testid="save-uturns"
            className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            This route turns back on itself at{' '}
            {draw.uTurns.length === 1 ? 'one point' : `${draw.uTurns.length} points`}, ringed in amber
            on the map. Save anyway if the jeep really turns there; otherwise go back and drag the
            point to the corner.
          </p>
        )}
        {wrongWayRound && head && tail && (
          <p
            data-testid="save-wrong-way"
            className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            This is the slot for <strong>{direction}</strong>, but the line starts nearer{' '}
            {stopLabel(reversed ? head : tail)}. If you drew it from the wrong end, go back and
            redraw it starting at {stopLabel(reversed ? tail : head)}; if the jeep really leaves
            from there, save anyway.
          </p>
        )}

        {stops.length === 0 && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            No hotspots yet. A route is named after the hotspots at its two ends, so draw a terminal
            at each end of this line first — then come back and save.
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-neutral-700">
            Head <span className="text-neutral-400">(where the jeeps wait)</span>
            <select
              required
              disabled={routeLocked}
              value={headPlace?.key ?? ''}
              onChange={(e) => setHeadId(pickPlace(e.target.value, lineStart))}
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
              onChange={(e) => setTailId(pickPlace(e.target.value, lineEnd))}
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
            {routeLocked ? 'of the route ' : 'of a new route, '}
            <span data-testid="save-name" className="font-medium text-neutral-700">
              {name || '—'}
            </span>
          </span>
          <br />
          <span className="text-[11px] text-neutral-400">
            Both names are generated from the two ends. Rename a hotspot to change them.
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
