import type { RideSummary } from '@/features/routes/model/ride-recording';

import { PageButton } from './page-button';
import { RideTotals } from './ride-totals';

interface UnfinishedScreenProps {
  summary: RideSummary;
  onResume: () => void;
  onStop: () => void;
}

/** A recording was left open when the page closed: carry on with it, or stop it where it was. */
export function UnfinishedScreen({ summary, onResume, onStop }: UnfinishedScreenProps) {
  return (
    <section aria-label="Unfinished recording" className="flex flex-col gap-4">
      <p>
        A recording was left open. Resume it, and the time since its last fix is logged as a gap, or
        stop it where it was.
      </p>
      <RideTotals summary={summary} />
      <div className="flex gap-2">
        <PageButton onClick={onResume}>Resume</PageButton>
        <PageButton onClick={onStop}>Stop</PageButton>
      </div>
    </section>
  );
}
