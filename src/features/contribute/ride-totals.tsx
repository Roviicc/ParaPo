import type { RideSummary } from '@/features/routes/model/ride-recording';

import { kmText, minutesText } from './format';

interface RideTotalsProps {
  summary: RideSummary;
  /** Also the minutes the phone lost: the number the field test is for. */
  showLost?: boolean;
}

/** What a recording has come to, as a list of figures. */
export function RideTotals({ summary, showLost = false }: RideTotalsProps) {
  const figures: [string, string][] = [
    ['Distance (km)', kmText(summary.distanceM)],
    ['Minutes moving', minutesText(summary.movingSeconds)],
    ['Minutes standing', minutesText(summary.standingSeconds)],
    ['Hintos', String(summary.hintos.length)],
    ['Gaps', String(summary.gaps.length)],
  ];
  if (showLost) figures.push(['Minutes lost in gaps', minutesText(summary.lostSeconds)]);
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
      {figures.map(([name, value]) => (
        <div key={name} className="contents">
          <dt>{name}</dt>
          <dd className="text-right font-bold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
