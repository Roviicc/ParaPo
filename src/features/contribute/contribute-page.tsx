import { useEffect, useRef } from 'react';

import { ReadyScreen } from './ready-screen';
import { RecordingScreen } from './recording-screen';
import { StoppedScreen } from './stopped-screen';
import { UnfinishedScreen } from './unfinished-screen';
import { useRecording } from './use-recording';

/** The field-test page: records a ride on the phone and keeps it there. */
export function ContributePage() {
  const recording = useRecording();
  const { phase, summary } = recording;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousPhase = useRef(phase);

  // A screen change moves focus to the title, so a screen reader starts the new screen from its top.
  useEffect(() => {
    if (previousPhase.current !== phase && phase !== 'loading') headingRef.current?.focus();
    previousPhase.current = phase;
  }, [phase]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <h1 ref={headingRef} tabIndex={-1} className="text-xl font-bold focus:outline-none">
        Record a ride
      </h1>
      {recording.problem && <p role="alert">{recording.problem}</p>}
      {phase === 'loading' && <p>Loading…</p>}
      {phase === 'ready' && (
        <ReadyScreen
          saved={recording.saved}
          onStart={recording.start}
          onDownload={recording.download}
          onRemove={recording.remove}
        />
      )}
      {phase === 'unfinished' && summary && (
        <UnfinishedScreen
          summary={summary}
          onResume={recording.resume}
          onStop={recording.stopAtLastFix}
        />
      )}
      {phase === 'recording' && summary && (
        <RecordingScreen summary={summary} isAwake={recording.isAwake} onStop={recording.stop} />
      )}
      {phase === 'stopped' && summary && (
        <StoppedScreen
          summary={summary}
          failedFixWrites={recording.current?.failedFixWrites ?? 0}
          onDownload={recording.downloadCurrent}
          onSave={recording.save}
          onResume={recording.resume}
          onCancel={recording.cancel}
        />
      )}
    </main>
  );
}
