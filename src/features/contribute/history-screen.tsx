import { Button } from '@/design-system/primitives/button';
import { IconButton } from '@/design-system/primitives/icon-button';
import { ChevronLeftIcon } from '@/shared/ui/route-icons';

import { HISTORY_HEADING_ID, groupRecordings } from './history-groups';
import { HistoryLoadLine } from './history-load-line';
import type { Recording } from './recording-schema';
import { SavedRideRow } from './saved-ride-row';
import { useFocusHeading } from './use-focus-heading';
import type { HistoryItems } from './use-history-items';

interface HistoryScreenProps {
  items: HistoryItems;
  onBack: () => void;
  onDownload: (recording: Recording) => void;
  onDeleteFromPhone: (recording: Recording) => void;
}

/**
 * The account's recordings, on a screen of their own with no Start bar and no map behind it: the
 * ones kept on this phone and the uploads of its other phones, grouped by where their upload
 * stands, so a card needs no label for it.
 */
export function HistoryScreen({
  items: { recordings, uploads, isOnPhone, load },
  onBack,
  onDownload,
  onDeleteFromPhone,
}: HistoryScreenProps) {
  const headingRef = useFocusHeading();
  const groups = groupRecordings(recordings, uploads.statusOf);

  return (
    <section
      aria-labelledby={HISTORY_HEADING_ID}
      className="absolute inset-0 z-20 flex flex-col bg-surface-secondary font-sn-pro text-content-primary"
    >
      <header className="flex items-center gap-3 pt-[max(1rem,env(safe-area-inset-top))] pr-4 pb-3 pl-[max(1rem,env(safe-area-inset-left))]">
        <IconButton
          tooltip="top"
          size="large"
          label="Back"
          icon={<ChevronLeftIcon />}
          onClick={onBack}
        />
        <h1
          id={HISTORY_HEADING_ID}
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl/8 font-extrabold focus:outline-none"
        >
          History
        </h1>
      </header>
      {groups.length === 0 && load.state === 'ready' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
          <p className="text-base/6 text-content-quaternary">No recordings yet.</p>
          <Button variant="primary" label="Record a route" onClick={onBack} />
        </div>
      )}
      {groups.length === 0 && load.state !== 'ready' && (
        <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
          <HistoryLoadLine load={load} />
        </div>
      )}
      {groups.length > 0 && (
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {load.state !== 'ready' && <HistoryLoadLine load={load} />}
          {groups.map(({ group, items }) => (
            <section key={group.key} aria-labelledby={`history-${group.key}`}>
              <h2 id={`history-${group.key}`} className="pb-2 text-base/6 font-bold">
                {group.title}
              </h2>
              <ul className="flex flex-col gap-2">
                {items.map(({ recording, status }) => (
                  <SavedRideRow
                    key={recording.id}
                    recording={recording}
                    status={status}
                    canRemove={uploads.canRemove(recording)}
                    isOnPhone={isOnPhone(recording)}
                    onDownload={() => onDownload(recording)}
                    onUpload={() => uploads.upload(recording)}
                    onRemoveUpload={() => void uploads.removeUploaded(recording)}
                    onDeleteFromPhone={() => onDeleteFromPhone(recording)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
