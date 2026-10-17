import { useEffect, useRef, useState } from 'react';

import { ConfirmDelete } from './confirm-delete';
import { dayText } from './format';
import { PageButton } from './page-button';
import type { Recording } from './recording-schema';

interface SavedListProps {
  recordings: readonly Recording[];
  onDownload: (id: string) => void;
  onRemove: (id: string) => void;
}

/** The recordings kept on the phone, each to download or delete (after one question). */
export function SavedList({ recordings, onDownload, onRemove }: SavedListProps) {
  const [askingAbout, setAskingAbout] = useState<string | null>(null);
  const deleteButtons = useRef(new Map<string, HTMLButtonElement>());
  const askedAbout = useRef<string | null>(null);

  // Back from the question on a Keep it, focus returns to that row's Delete.
  useEffect(() => {
    if (askingAbout === null && askedAbout.current !== null) {
      deleteButtons.current.get(askedAbout.current)?.focus();
    }
    askedAbout.current = askingAbout;
  }, [askingAbout]);

  if (recordings.length === 0) return <p>No saved recordings yet.</p>;
  return (
    <section aria-label="Saved recordings" className="flex flex-col gap-2">
      <h2 className="font-bold">Saved on this phone</h2>
      <ul className="flex flex-col gap-3">
        {recordings.map((recording) => (
          <li key={recording.id} className="flex flex-col gap-2 border-t pt-2">
            <p>
              {dayText(recording.startedAt)}
              {recording.rideKind ? ` · ${recording.rideKind}` : ''}
              {recording.startPointName || recording.endPointName
                ? ` · ${recording.startPointName || '?'} → ${recording.endPointName || '?'}`
                : ''}
            </p>
            {recording.failedFixWrites ? (
              <p>The phone could not keep {recording.failedFixWrites} fixes of this ride.</p>
            ) : null}
            {askingAbout === recording.id ? (
              <ConfirmDelete
                question="Delete this recording from the phone?"
                onConfirm={() => {
                  onRemove(recording.id);
                  setAskingAbout(null);
                }}
                onKeep={() => setAskingAbout(null)}
              />
            ) : (
              <div className="flex gap-2">
                <PageButton onClick={() => onDownload(recording.id)}>Download</PageButton>
                <PageButton
                  ref={(button) => {
                    if (button) deleteButtons.current.set(recording.id, button);
                    else deleteButtons.current.delete(recording.id);
                  }}
                  onClick={() => setAskingAbout(recording.id)}
                >
                  Delete
                </PageButton>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
