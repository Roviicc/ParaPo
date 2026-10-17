import { useEffect, useId, useRef, useState } from 'react';

import type { Hinto, RideSummary } from '@/features/routes/model/ride-recording';

import { ConfirmDelete } from './confirm-delete';
import { clockText, minutesText } from './format';
import { PageButton } from './page-button';
import { RIDE_KINDS, type RideKind } from './recording-schema';
import { RideTotals } from './ride-totals';
import type { RecordingDetails } from './use-recording';

interface StoppedScreenProps {
  summary: RideSummary;
  /** Fixes the phone could not keep; above zero, the recording is incomplete and can be downloaded now. */
  failedFixWrites: number;
  onDownload: () => void;
  onSave: (details: RecordingDetails) => void;
  onResume: () => void;
  onCancel: () => void;
}

const FIELD = 'rounded border-2 px-2 py-2 focus-visible:outline-2 focus-visible:outline-offset-2';

const isRideKind = (value: string): value is RideKind => RIDE_KINDS.some((kind) => kind === value);

interface HintoListProps {
  hintos: readonly Hinto[];
}

function HintoList({ hintos }: HintoListProps) {
  if (hintos.length === 0) return <p>No hintos.</p>;
  return (
    <ul className="flex flex-col gap-1">
      {hintos.map((hinto) => (
        <li key={hinto.from}>
          {clockText(hinto.from)} · {minutesText((hinto.to - hinto.from) / 1000)} min
        </li>
      ))}
    </ul>
  );
}

/** After Stop: the totals, the hintos, four optional fields, and Save, Resume or Cancel. */
export function StoppedScreen({
  summary,
  failedFixWrites,
  onDownload,
  onSave,
  onResume,
  onCancel,
}: StoppedScreenProps) {
  const ids = useId();
  const [details, setDetails] = useState<RecordingDetails>({
    startPointName: '',
    endPointName: '',
    description: '',
    rideKind: null,
  });
  const [isAsking, setIsAsking] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const wasAsking = useRef(false);

  // Back from the question, focus returns to the button that asked it.
  useEffect(() => {
    if (wasAsking.current && !isAsking) cancelRef.current?.focus();
    wasAsking.current = isAsking;
  }, [isAsking]);

  return (
    <section aria-label="Stopped" className="flex flex-col gap-4">
      <RideTotals summary={summary} showLost />
      {summary.pausedSeconds > 0 && (
        <p>Paused: {minutesText(summary.pausedSeconds)} min, not counted as lost.</p>
      )}
      {failedFixWrites > 0 && (
        <div className="flex flex-col gap-2">
          <p>
            The phone could not keep {failedFixWrites} fixes. Download this ride now, before you
            close the page.
          </p>
          <PageButton onClick={onDownload}>Download this ride</PageButton>
        </div>
      )}
      <h2 className="font-bold">Hintos</h2>
      <HintoList hintos={summary.hintos} />
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(details);
        }}
      >
        <label className="flex flex-col gap-1" htmlFor={`${ids}-start`}>
          Start point name (optional)
          <input
            id={`${ids}-start`}
            className={FIELD}
            value={details.startPointName}
            onChange={(event) => setDetails({ ...details, startPointName: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1" htmlFor={`${ids}-end`}>
          End point name (optional)
          <input
            id={`${ids}-end`}
            className={FIELD}
            value={details.endPointName}
            onChange={(event) => setDetails({ ...details, endPointName: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1" htmlFor={`${ids}-description`}>
          Description (optional)
          <textarea
            id={`${ids}-description`}
            className={FIELD}
            rows={3}
            value={details.description}
            onChange={(event) => setDetails({ ...details, description: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1" htmlFor={`${ids}-kind`}>
          What did you ride? (optional)
          <select
            id={`${ids}-kind`}
            className={FIELD}
            value={details.rideKind ?? ''}
            onChange={(event) =>
              setDetails({
                ...details,
                rideKind: isRideKind(event.target.value) ? event.target.value : null,
              })
            }
          >
            <option value="">Not said</option>
            {RIDE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        {isAsking ? (
          <ConfirmDelete
            question="Delete this recording?"
            onConfirm={onCancel}
            onKeep={() => setIsAsking(false)}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            <PageButton type="submit">Save</PageButton>
            <PageButton onClick={onResume}>Resume</PageButton>
            <PageButton ref={cancelRef} onClick={() => setIsAsking(true)}>
              Cancel
            </PageButton>
          </div>
        )}
      </form>
    </section>
  );
}
