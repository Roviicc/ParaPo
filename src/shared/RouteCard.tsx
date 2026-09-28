import type { ReactNode } from 'react'
import { fareFor, hasFareRule, manilaDate, peso, pesoRange, ruleOn } from './fares'
import { lineLength } from './geo'
import { MODES, routeName, variantLine, type VariantSummary } from './routes'
import { Sheet } from './Sheet'
import { StopTimeline, passesThrough } from './StopTimeline'
import { SwitchIcon } from './SwitchIcon'
import type { Timeline } from './stops'

type Props = {
  variant: VariantSummary
  /**
   * The direction as a string of places, when the caller has the links:
   * shown collapsed under the title, the way a train app lists a line's
   * stops. Tapping a hintuan previews the ride up to it — the owner's ask
   * of 2026-09-28 — with the length and fare of that stretch.
   */
  timeline?: Timeline
  /** The ride-to preview (useRideTo): the row ridden to, and that stretch's metres. */
  rideTo?: { stopId: string; metres: number } | null
  /** A timeline row was tapped: preview the ride up to it, or null for the whole route. */
  onRideTo?: (stopId: string | null) => void
  /**
   * The route's other direction, when the caller knows it: drawn or not.
   * `undefined` when the caller has no idea (no switch is offered); `null`
   * when the route has only this one (no switch either).
   */
  sibling?: VariantSummary | null
  /** Show the other direction instead. Only called with a sibling that has a line. */
  onSwitch?: (sibling: VariantSummary) => void
  /** Buttons along the bottom. The editor passes Edit and Delete; the public map passes nothing. */
  actions?: ReactNode
  onClose: () => void
}

/**
 * What anyone sees when they tap a route. The card does not know who is
 * looking: whoever renders it decides which actions to offer.
 *
 * `Sheet` decides the shape — a floating card on a wide screen, a bottom sheet
 * on a phone. The peek is the direction and the route, which is the least a
 * commuter needs to know whether this is the right jeep.
 *
 * The title is the *direction* — `SM Fairview → Tala` — not the route, since
 * 2026-09-22: the owner opened both cards of his first route, saw "Tala – SM
 * Fairview" on each, and read them as the same thing. The route's name stays,
 * one line down, because it is what the chooser, the share title and the
 * hotspot chips call it. The switch beside the title shows the other
 * direction; when that one has no line yet the card says so instead of
 * offering an empty one.
 */
export function RouteCard({ variant, timeline, rideTo, onRideTo, sibling, onSwitch, actions, onClose }: Props) {
  const r = variant.route
  const metres = lineLength(variantLine(variant))
  const km = (metres / 1000).toFixed(1)
  // The ride being looked at: the whole route, or the stretch up to the
  // picked hintuan. Length and fare both speak about this ride.
  const rideLabel = (rideTo && timeline?.between.find((s) => s.id === rideTo.stopId)?.label) || null
  const rideMetres = rideLabel && rideTo ? rideTo.metres : metres
  // LTFRB's rule for a traditional jeepney, and this ride priced by it.
  const today = hasFareRule(r?.mode) ? ruleOn(manilaDate()) : null
  const fare = today && { ...today, whole: fareFor(rideMetres, today.rule) }
  const mode = MODES.find((m) => m.value === r?.mode)?.label ?? r?.mode ?? ''
  const siblingDrawn = !!sibling && variantLine(sibling).length > 1
  const hintuanCount = timeline?.between.length ?? 0

  return (
    <Sheet
      onClose={onClose}
      peek={
        <>
          <div className="flex items-start gap-2">
            <p
              data-testid="card-direction"
              className="min-w-0 flex-1 truncate text-base font-semibold text-neutral-900"
            >
              {variant.direction_name ?? r?.name}
            </p>
            {sibling && onSwitch && (
              <button
                type="button"
                data-testid="card-switch"
                disabled={!siblingDrawn}
                onClick={() => siblingDrawn && onSwitch(sibling)}
                aria-label={
                  siblingDrawn
                    ? `Switch to ${sibling.direction_name}`
                    : `${sibling.direction_name} is not mapped yet`
                }
                title={
                  siblingDrawn
                    ? `Switch to ${sibling.direction_name}`
                    : `${sibling.direction_name} is not mapped yet`
                }
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-700
                           hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <SwitchIcon />
              </button>
            )}
          </div>
          {/* The route read the way this direction rides it — "SM Fairview – Tala"
              under "SM Fairview → Tala", the owner's note of 2026-09-22 — and
              the signboard when known: what to look for on the jeep. */}
          <p className="truncate text-xs text-neutral-500">
            {timeline?.from && timeline.to ? routeName(timeline.from.label, timeline.to.label, r?.via) : r?.name}
            {r?.signboard && <> · Signboard: {r.signboard}</>}
          </p>
          {sibling && !siblingDrawn && (
            <p className="mt-1 truncate text-xs text-amber-700">
              {sibling.direction_name} is not mapped yet.
            </p>
          )}
        </>
      }
    >
      {timeline && (timeline.from || timeline.to || hintuanCount > 0) && (
        /* Collapsed by default: the title already says the ends; this is the way between them. */
        <details data-testid="card-timeline" className="mt-3 rounded-lg bg-neutral-50 px-3 py-2">
          <summary className="cursor-pointer select-none text-xs font-medium text-neutral-600">
            {hintuanCount === 0 ? 'No hintuan on the way yet' : passesThrough(hintuanCount)}
          </summary>
          <StopTimeline timeline={timeline} onPick={onRideTo} pickedId={rideTo?.stopId ?? null} />
        </details>
      )}
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-neutral-500">Mode</dt>
        <dd className="text-neutral-900">{mode}</dd>
        <dt className="text-neutral-500">Length</dt>
        <dd className="text-neutral-900">
          {rideLabel ? `${(rideMetres / 1000).toFixed(1)} km to ${rideLabel} · ${km} km end to end` : `${km} km`}
        </dd>
        {fare ? (
          <>
            <dt className="text-neutral-500">Fare</dt>
            <dd data-testid="card-fare" className="text-neutral-900">
              {peso(fare.rule.minimum)} for the first {fare.rule.minimumKm} km, then {peso(fare.rule.perKm)} per km
              <p className="mt-0.5 text-xs text-neutral-600">
                {/* "From Tala": the estimate boards at the head, and a rider
                    standing mid-route must not read it as theirs (§4.2 C). */}
                {rideLabel
                  ? `${timeline?.from ? `From ${timeline.from.label} to` : 'To'} ${rideLabel}, about`
                  : 'Whole ride about'}{' '}
                {pesoRange(fare.whole.low.regular, fare.whole.high.regular)} · students, seniors, PWDs{' '}
                {pesoRange(fare.whole.low.discounted, fare.whole.high.discounted)}
              </p>
              {fare.previous && (
                <p className="mt-0.5 text-xs text-amber-700">
                  Some jeeps still charge the old {peso(fare.previous.minimum)} until they post the new fare guide.
                </p>
              )}
              {r?.fare_note && <p className="mt-0.5 text-xs text-neutral-600">{r.fare_note}</p>}
              <p className="mt-0.5 text-xs text-neutral-400">Estimate · {fare.rule.source} · length of this line</p>
            </dd>
          </>
        ) : (
          r?.fare_note && (
            <>
              <dt className="text-neutral-500">Fare</dt>
              <dd className="text-neutral-900">{r.fare_note}</dd>
            </>
          )
        )}
        <dt className="text-neutral-500">Status</dt>
        <dd>
          <span
            className={
              'rounded-full px-2 py-0.5 text-xs ' +
              (variant.confidence === 'verified'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-700')
            }
          >
            {variant.confidence === 'verified' ? 'verified by riding' : 'drawn, not yet ridden'}
          </span>
        </dd>
      </dl>

      {actions && <div className="mt-4 flex gap-2">{actions}</div>}
    </Sheet>
  )
}
