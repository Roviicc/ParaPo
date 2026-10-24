import type { AccountUpload } from './api/account-uploads';
import { RECORDING_VERSION, type Recording } from './recording-schema';

/** An upload no recording on this phone holds, shaped as a recording so History's card can show it. */
function recordingOf(upload: AccountUpload): Recording {
  return {
    version: RECORDING_VERSION,
    id: upload.id,
    status: 'saved',
    startedAt: upload.startedAt,
    stoppedAt: upload.stoppedAt,
    savedAt: upload.stoppedAt,
    gaps: [],
    startPointName: upload.startPointName,
    endPointName: upload.endPointName,
    description: upload.description,
    rideKind: null,
    upload: { state: 'uploaded', at: upload.startedAt, by: '' },
  };
}

/**
 * This phone's recordings with the account's uploads from other phones, newest first. An upload
 * this phone also holds is its recording, not a second card.
 */
export function mergeHistory(
  saved: readonly Recording[],
  accountUploads: readonly AccountUpload[],
): Recording[] {
  const onPhone = new Set(saved.map((recording) => recording.id));
  const elsewhere = accountUploads.filter((upload) => !onPhone.has(upload.id)).map(recordingOf);
  return [...saved, ...elsewhere].sort((a, b) => b.startedAt - a.startedAt);
}
