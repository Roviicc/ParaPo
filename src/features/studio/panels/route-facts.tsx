import type { ReactNode } from 'react';

import {
  hasFareRule,
  manilaDate,
  peso,
  pesoRange,
  ruleOn,
  fareFor,
} from '@/features/routes/model/fares';
import { MODES, directionLine, type Direction } from '@/features/routes/model/routes';
import { lineLength } from '@/shared/utils/geo';

/**
 * What only the editor sees of a direction, under the trip card the public
 * map opens (the owner's pick, 2026-09-30: the public trip card, with the
 * editor's extras below it). The trip card carries the ride — its ends, its
 * hintuans, its kilometres and pesos; this carries what the old studio card
 * said besides: whether it has been ridden, its mode and signboard, and the
 * fare's small print — the discounted price, the rule, the grace for the old
 * minimum, the route's own fare note and where the estimate comes from. Then
 * Edit, Extend and Delete, when the direction is the editor's own.
 */
export function RouteFacts({ direction, actions }: { direction: Direction; actions?: ReactNode }) {
  const r = direction.route;
  const mode = MODES.find((m) => m.value === r?.mode)?.label ?? r?.mode ?? '';
  const today = hasFareRule(r?.mode) ? ruleOn(manilaDate()) : null;
  // The whole ride's, as the trip card's Expected fare prices it.
  const whole =
    today && fareFor(direction.metres ?? lineLength(directionLine(direction)), today.rule);
  const verified = direction.confidence === 'verified';

  return (
    <div data-testid="route-facts" className="flex w-full flex-col gap-3 px-3 pb-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-2xl bg-surface-secondary p-4 text-sm">
        <dt className="text-content-tertiary">Status</dt>
        <dd>
          <span
            className={
              'rounded-full px-2 py-0.5 text-xs ' +
              (verified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')
            }
          >
            {verified ? 'verified by riding' : 'drawn, not yet ridden'}
          </span>
        </dd>
        <dt className="text-content-tertiary">Mode</dt>
        <dd className="text-content-primary">{mode}</dd>
        {r?.signboard && (
          <>
            <dt className="text-content-tertiary">Signboard</dt>
            <dd className="text-content-primary">{r.signboard}</dd>
          </>
        )}
        {(today || r?.fare_note) && (
          <>
            <dt className="text-content-tertiary">Fare</dt>
            <dd data-testid="facts-fare" className="text-xs text-content-quaternary">
              {whole && (
                <p>
                  Students, seniors, PWDs {pesoRange(whole.low.discounted, whole.high.discounted)}
                </p>
              )}
              {today && (
                <p>
                  {peso(today.rule.minimum)} first {today.rule.minimumKm} km, then{' '}
                  {peso(today.rule.perKm)} per km
                </p>
              )}
              {today?.previous && (
                <p className="text-amber-700">
                  Some jeeps still charge the old {peso(today.previous.minimum)} until they post the
                  new fare guide.
                </p>
              )}
              {r?.fare_note && <p>{r.fare_note}</p>}
              {today && (
                <p className="text-neutral-400">
                  Estimate · {today.rule.source} · length of this line
                </p>
              )}
            </dd>
          </>
        )}
      </dl>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
