import { useId, useState } from 'react';

import { Button } from '@/design-system/primitives/button';

import { countdownText } from './format';
import { RIDE_KINDS, type RideKind } from './recording-schema';
import { useFocusHeading } from './use-focus-heading';
import type { RecordingDetails } from './use-recording';
import { useSaveCountdown } from './use-save-countdown';

interface SaveFormProps {
  /** Fixes the phone could not keep; above zero, the recording is incomplete and can be downloaded now. */
  failedFixWrites: number;
  onDownload: () => void;
  /** Back to recording, for a stop that was a mistake. */
  onKeepRecording: () => void;
  /** Continue, and the form's two minutes running out, save what was said; Skip saves without. */
  onSave: (details: RecordingDetails | null) => void;
}

const FIELD =
  'rounded-lg border border-border-secondary bg-surface px-3 py-2 text-base/6 font-normal text-content-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-primary';

const isRideKind = (value: string): value is RideKind => RIDE_KINDS.some((kind) => kind === value);

/**
 * What the contributor may say about the recording, every field optional. Left
 * alone for two minutes it saves the recording with what was typed, so a phone put
 * away after the recording does not keep a recording open.
 */
export function SaveForm({ failedFixWrites, onDownload, onKeepRecording, onSave }: SaveFormProps) {
  const ids = useId();
  const headingRef = useFocusHeading();
  const [details, setDetails] = useState<RecordingDetails>({
    startPointName: '',
    endPointName: '',
    description: '',
    rideKind: null,
  });
  const { secondsLeft, touch } = useSaveCountdown(() => onSave(details));

  return (
    <form
      aria-labelledby={`${ids}-heading`}
      onPointerDownCapture={touch}
      onKeyDownCapture={touch}
      onChangeCapture={touch}
      onSubmit={(event) => {
        event.preventDefault();
        onSave(details);
      }}
      className="absolute inset-0 z-20 flex flex-col gap-4 overflow-y-auto bg-surface p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] font-sn-pro text-content-primary"
    >
      <div className="flex flex-col gap-1">
        <h1
          id={`${ids}-heading`}
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl/8 font-extrabold focus:outline-none"
        >
          About this route
        </h1>
        <p className="text-base/6 text-content-quaternary">
          Everything here is optional. Saving in {countdownText(secondsLeft)}
        </p>
      </div>
      {failedFixWrites > 0 && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-base/6">
            The phone could not keep {failedFixWrites} fixes. Download this recording now, before
            you close the page.
          </p>
          <Button variant="secondary" label="Download this recording" onClick={onDownload} />
        </div>
      )}
      <label className="flex flex-col gap-1 text-base/6 font-bold" htmlFor={`${ids}-start`}>
        Start point name
        <input
          id={`${ids}-start`}
          className={FIELD}
          value={details.startPointName}
          onChange={(event) => setDetails({ ...details, startPointName: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-base/6 font-bold" htmlFor={`${ids}-end`}>
        End point name
        <input
          id={`${ids}-end`}
          className={FIELD}
          value={details.endPointName}
          onChange={(event) => setDetails({ ...details, endPointName: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-base/6 font-bold" htmlFor={`${ids}-description`}>
        Description
        <textarea
          id={`${ids}-description`}
          className={FIELD}
          rows={3}
          value={details.description}
          onChange={(event) => setDetails({ ...details, description: event.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-base/6 font-bold" htmlFor={`${ids}-kind`}>
        What did you ride?
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
      <div className="mt-auto flex flex-col gap-2">
        <Button variant="primary" type="submit" label="Continue" />
        <Button variant="secondary" label="Skip" onClick={() => onSave(null)} />
        {/* The design system has no tertiary or ghost Button: a quiet text button in tokens, 44 px tall. */}
        <button
          type="button"
          onClick={onKeepRecording}
          className="min-h-11 text-base/6 font-bold text-content-quaternary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-primary"
        >
          Keep recording
        </button>
      </div>
    </form>
  );
}
