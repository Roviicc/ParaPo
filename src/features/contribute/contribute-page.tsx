import { useEffect, useState } from 'react';

import { AccountGate } from './account/account-gate';
import { useAccountGate } from './account/use-account-gate';
import { useAccountQuery } from './api/use-account-query';
import { ContributeMap, type ContributeLocatorSlot } from './contribute-map';
import { HistoryScreen } from './history-screen';
import { MarkButton } from './mark-button';
import { ReadyScreen } from './ready-screen';
import { MAX_MARKS } from './recording-marks';
import { RecordingScreen } from './recording-screen';
import { SaveForm } from './save-form';
import { SavedScreen } from './saved-screen';
import { UnfinishedScreen } from './unfinished-screen';
import { UploadCheck } from './upload-check';
import { uploadStatusText } from './upload-status';
import { useConsent } from './use-consent';
import { useEarlierQuestion } from './use-earlier-question';
import { useHistoryView } from './use-history-view';
import { useRecording } from './use-recording';
import { useRecordingTrack } from './use-recording-track';
import { useUploads } from './use-uploads';

interface ContributePageProps {
  /** The locator on the map: the shell's, since this feature may not import the locator's. */
  locator?: ContributeLocatorSlot;
}

/** The contributor's page: a map with the recording drawn on it, and the screen for where the recording is. */
export function ContributePage({ locator }: ContributePageProps) {
  const recording = useRecording();
  const accountId = useAccountQuery().data?.id ?? null;
  const { hasConsent, giveConsent } = useConsent(accountId);
  const earlier = useEarlierQuestion(recording.saved, hasConsent, accountId);
  const accountGate = useAccountGate();
  // Nothing is sent until an account is signed in: recordings made before wait on the phone.
  const uploads = useUploads(recording.saved, {
    hasConsent: hasConsent && accountGate === 'ready',
    earlier: earlier.choice,
  });
  const track = useRecordingTrack(
    recording.kept,
    recording.current?.switches,
    recording.current?.marks,
  );
  const history = useHistoryView();
  const { phase, figures } = recording;
  const isHistoryShown = phase === 'ready' && hasConsent && history.isOpen;

  // A stale #history (a reload mid-recording, or before consent was given) must not open History
  // later, when Record again or Okay is pressed.
  useEffect(() => {
    if (history.isOpen && (!hasConsent || (phase !== 'loading' && phase !== 'ready'))) {
      history.close();
    }
  }, [phase, hasConsent, history]);

  // Once History has been opened from Ready's button, Ready hands focus back to that button.
  const [hasOpenedHistory, setHasOpenedHistory] = useState(false);
  const handleOpenHistory = () => {
    setHasOpenedHistory(true);
    history.open();
  };

  return (
    <main className="relative h-dvh overflow-hidden bg-surface-secondary font-sn-pro">
      {/* inert while History covers it: no map control can be tabbed to behind the screen. */}
      <div inert={isHistoryShown} className="contents">
        <ContributeMap
          track={track}
          isRecording={phase === 'recording' || phase === 'paused'}
          locator={locator}
          mark={
            phase === 'recording' ? (
              <MarkButton
                canMark={(recording.current?.marks?.length ?? 0) < MAX_MARKS}
                onMark={recording.markPlace}
              />
            ) : null
          }
        />
      </div>
      {(accountGate === 'needs-account' || accountGate === 'needs-profile') && (
        <AccountGate needsProfile={accountGate === 'needs-profile'} />
      )}
      {accountGate === 'ready' && (
        <>
          {recording.problem && (
            <p
              role="alert"
              className="absolute inset-x-4 top-[calc(max(1rem,env(safe-area-inset-top))+3.5rem)] z-30 bg-surface p-2 text-sm/5 text-content-primary"
            >
              {recording.problem}
            </p>
          )}
          {uploads.check && (phase === 'ready' || phase === 'saved') && (
            <UploadCheck check={uploads.check} />
          )}
          <p role="status" className="sr-only">
            {recording.announcement}
          </p>
          {phase === 'ready' && !isHistoryShown && (
            <ReadyScreen
              hasConsent={hasConsent}
              onConsent={giveConsent}
              earlierQuestion={earlier.question}
              onStart={recording.start}
              onOpenHistory={handleOpenHistory}
              shouldFocusHistoryButton={hasOpenedHistory}
            />
          )}
          {isHistoryShown && (
            <HistoryScreen
              recordings={recording.saved}
              uploads={uploads}
              onBack={history.close}
              onDownload={recording.downloadSaved}
              onDeleteFromPhone={recording.deleteSaved}
            />
          )}
          {phase === 'unfinished' && figures && (
            <UnfinishedScreen
              figures={figures}
              way={recording.way}
              onResume={recording.resume}
              onStop={recording.stopAtLastFix}
            />
          )}
          {(phase === 'recording' || phase === 'paused') && figures && (
            <RecordingScreen
              figures={figures}
              way={recording.way}
              isPaused={phase === 'paused'}
              isAwake={recording.isAwake}
              shouldFocusStop={recording.focusTarget === 'stop'}
              onStop={recording.stop}
              onResume={recording.resume}
              onWaySwitch={recording.switchWay}
              onSave={recording.openSave}
              onCancel={recording.cancel}
              onLeave={recording.flushFixes}
            />
          )}
          {phase === 'form' && (
            <SaveForm
              failedFixWrites={recording.current?.failedFixWrites ?? 0}
              onDownload={recording.downloadCurrent}
              onKeepRecording={recording.keepRecording}
              onSave={recording.save}
            />
          )}
          {phase === 'saved' && (
            <SavedScreen
              failedFixWrites={recording.lastSaved?.failedFixWrites ?? 0}
              uploadText={
                recording.lastSaved
                  ? uploadStatusText(
                      uploads.statusOf(recording.lastSaved),
                      uploads.canRemove(recording.lastSaved),
                    )
                  : ''
              }
              onRecordAgain={recording.recordAgain}
              onDownload={recording.downloadLastSaved}
            />
          )}
        </>
      )}
    </main>
  );
}
