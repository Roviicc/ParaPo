import type { RideSummary } from '@/features/routes/model/ride-recording';

import { PageButton } from './page-button';
import { RideTotals } from './ride-totals';

interface RecordingScreenProps {
  summary: RideSummary;
  /** Whether the screen is being kept awake. */
  isAwake: boolean;
  onStop: () => void;
}

/** While recording: the live figures and Stop. */
export function RecordingScreen({ summary, isAwake, onStop }: RecordingScreenProps) {
  return (
    <section aria-label="Recording" className="flex flex-col gap-4">
      <p>Recording. Keep this page open.</p>
      <RideTotals summary={summary} />
      {!isAwake && (
        <p>The screen could not be kept awake, so it may sleep and the location may stop.</p>
      )}
      <PageButton onClick={onStop}>Stop</PageButton>
    </section>
  );
}
