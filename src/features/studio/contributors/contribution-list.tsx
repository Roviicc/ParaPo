import { cn } from '@/shared/utils/cn';

import {
  contributionName,
  kilometres,
  manilaTime,
  minutes,
  vehicleName,
} from './contribution-format';
import type { Contribution } from '../data/contributions-read';

interface ContributionListProps {
  contributions: readonly Contribution[];
  openedId: string | null;
  onOpen: (id: string) => void;
}

/** The uploads the map shows, the same ones in the same order: the map's text for anyone not looking at it. */
export function ContributionList({ contributions, openedId, onOpen }: ContributionListProps) {
  return (
    <ul aria-label="Uploads" className="divide-y divide-border-primary">
      {contributions.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            aria-current={c.id === openedId ? 'true' : undefined}
            onClick={() => onOpen(c.id)}
            className={cn(
              'flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-content-primary',
              c.id === openedId && 'bg-surface-secondary',
            )}
          >
            <span className="font-bold text-content-primary">
              {c.hiddenAt !== null && 'Hidden · '}
              {contributionName(c)}
            </span>
            <span className="text-content-secondary">
              {manilaTime(c.startedAt)} · {vehicleName(c.vehicle)} · {kilometres(c.distanceM)} ·{' '}
              {minutes(c.movingSeconds + c.standingSeconds)}
            </span>
            <span className="text-xs text-content-quaternary">
              {c.contributorName ? `${c.contributorName} · ` : ''}Phone {c.phoneCode ?? 'unknown'} ·{' '}
              {c.pointCount} points
              {!c.line && !c.box && ' · nothing to draw on the map'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
