import { Button } from '@/design-system/primitives/button';

import type { UploadStatus } from './use-uploads';

export type Asking = 'remove-upload' | 'delete-from-phone' | null;

/** What the out-in-the-open button says where it is not Try again. */
const UPLOAD_LABEL: Partial<Record<UploadStatus['state'], string>> = {
  removed: 'Upload again',
  held: 'Upload',
};

interface RideActionsProps {
  /** The card's recording in words, so each button's name says which one it acts on. */
  fullName: string;
  status: UploadStatus;
  canRemove: boolean;
  /** False for an upload from another phone: there is no copy here to download or delete. */
  isOnPhone: boolean;
  isMenuOpen: boolean;
  /** The id the card's dots button controls. */
  menuId: string;
  onDownload: () => void;
  onUpload: () => void;
  onAsk: (question: Exclude<Asking, null>) => void;
}

/**
 * What a card can do: Try again, Upload again or Upload out in the open where it would help, and Download
 * and the two deletes behind the card's dots, quiet until asked for.
 */
export function RideActions({
  fullName,
  status,
  canRemove,
  isOnPhone,
  isMenuOpen,
  menuId,
  onDownload,
  onUpload,
  onAsk,
}: RideActionsProps) {
  const isBusy = status.state === 'uploading' || status.state === 'removing';
  const canUploadNow =
    status.state === 'failed' || status.state === 'removed' || status.state === 'held';
  const uploadLabel = UPLOAD_LABEL[status.state] ?? 'Try again';

  return (
    <>
      {canUploadNow && (
        <div>
          <Button
            variant="secondary"
            size="small"
            label={uploadLabel}
            aria-label={`${uploadLabel}, ${fullName}`}
            onClick={onUpload}
          />
        </div>
      )}
      <div id={menuId} hidden={!isMenuOpen} className="flex flex-wrap gap-2">
        {isOnPhone && (
          <Button
            variant="secondary"
            size="small"
            label="Download"
            aria-label={`Download, ${fullName}`}
            onClick={onDownload}
          />
        )}
        {canRemove && (
          <Button
            variant="secondary"
            size="small"
            label="Remove upload"
            aria-label={`Remove upload, ${fullName}`}
            onClick={() => onAsk('remove-upload')}
          />
        )}
        {isOnPhone && !isBusy && (
          <Button
            variant="secondary"
            size="small"
            label="Delete from phone"
            aria-label={`Delete from phone, ${fullName}`}
            onClick={() => onAsk('delete-from-phone')}
          />
        )}
      </div>
    </>
  );
}
