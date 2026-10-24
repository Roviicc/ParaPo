import { useEffect, useId, useRef, useState } from 'react';

import { IconButton } from '@/design-system/primitives/icon-button';
import { useEscape } from '@/shared/hooks/use-escape';
import { cn } from '@/shared/utils/cn';

import { ConfirmDelete } from './confirm-delete';
import { dateTimeText, durationText, fullDateTimeText } from './format';
import { HISTORY_HEADING_ID, statusLineOf } from './history-groups';
import { MoreIcon } from './history-icons';
import type { Recording } from './recording-schema';
import { RideActions } from './ride-actions';
import type { Asking } from './ride-actions';
import { RideStatusLine } from './ride-status-line';
import { REMOVE_UPLOAD_QUESTION, deleteFromPhoneQuestion } from './upload-status';
import type { UploadStatus } from './use-uploads';

interface SavedRideRowProps {
  recording: Recording;
  status: UploadStatus;
  canRemove: boolean;
  /** False for an upload from another phone, which has no copy here. */
  isOnPhone?: boolean;
  onDownload: () => void;
  onUpload: () => void;
  onRemoveUpload: () => void;
  onDeleteFromPhone: () => void;
}

const rideName = (r: Recording): string =>
  [r.startPointName, r.endPointName].filter(Boolean).join(' to ') || r.description;

/**
 * One saved recording as a card: when, what it was called, how long, and the one line its upload
 * needs, if any. Try again shows when it would help; Download and the deletes sit behind the
 * dots, and each delete is asked first.
 */
export function SavedRideRow({
  recording,
  status,
  canRemove,
  isOnPhone = true,
  onDownload,
  onUpload,
  onRemoveUpload,
  onDeleteFromPhone,
}: SavedRideRowProps) {
  const [asking, setAsking] = useState<Asking>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const shouldReturnFocus = useRef(false);
  const name = rideName(recording);
  const when = dateTimeText(recording.startedAt);
  const fullName = `the recording of ${fullDateTimeText(recording.startedAt)}${name ? `, ${name}` : ''}`;
  const seconds = ((recording.stoppedAt ?? recording.startedAt) - recording.startedAt) / 1000;

  // The question took the card's place, so Keep it hands focus back to the dots that led to it.
  useEffect(() => {
    if (asking || !shouldReturnFocus.current) return;
    shouldReturnFocus.current = false;
    moreRef.current?.focus();
  }, [asking]);

  const closeMenu = () => {
    setIsMenuOpen(false);
    moreRef.current?.focus();
  };
  useEscape(closeMenu, isMenuOpen);

  const handleConfirm = () => {
    if (asking === 'remove-upload') onRemoveUpload();
    if (asking === 'delete-from-phone') onDeleteFromPhone();
    setAsking(null);
    // The question and, for a delete, the card are gone: History's heading is the nearest steady place.
    document.getElementById(HISTORY_HEADING_ID)?.focus();
  };

  const handleKeep = () => {
    shouldReturnFocus.current = true;
    setAsking(null);
  };

  const ask = (question: Asking) => {
    setIsMenuOpen(false);
    setAsking(question);
  };

  return (
    <li className="rounded-xl border border-border-primary bg-surface">
      <div className={cn('flex flex-col gap-2 p-4', asking && 'pb-0')}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-base/6 font-bold">
              <time dateTime={new Date(recording.startedAt).toISOString()}>{when}</time>
            </h3>
            {name && <p className="line-clamp-2 text-base/6 break-words">{name}</p>}
            <p className="text-sm/5 text-content-quaternary">{durationText(seconds)}</p>
          </div>
          <IconButton
            ref={moreRef}
            size="small"
            tooltip="top"
            label={`More actions for ${fullName}`}
            icon={<MoreIcon />}
            disabled={asking !== null}
            aria-expanded={isMenuOpen}
            aria-controls={menuId}
            onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
          />
        </div>
        <RideStatusLine line={statusLineOf(status, canRemove)} />
        {!asking && (
          <>
            <RideActions
              fullName={fullName}
              status={status}
              canRemove={canRemove}
              isOnPhone={isOnPhone}
              isMenuOpen={isMenuOpen}
              menuId={menuId}
              onDownload={onDownload}
              onUpload={onUpload}
              onAsk={ask}
            />
          </>
        )}
      </div>
      {asking && (
        // Clips the question's own square surface to the card's rounded corners.
        <div className="overflow-hidden rounded-b-xl">
          <ConfirmDelete
            question={
              asking === 'remove-upload' ? REMOVE_UPLOAD_QUESTION : deleteFromPhoneQuestion(status)
            }
            confirmLabel={asking === 'remove-upload' ? 'Remove' : 'Delete'}
            onConfirm={handleConfirm}
            onKeep={handleKeep}
          />
        </div>
      )}
    </li>
  );
}
