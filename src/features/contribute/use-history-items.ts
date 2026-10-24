import { useQueryClient } from '@tanstack/react-query';

import { accountKeys } from './api/account-keys';
import { UploadError } from './api/upload-problem';
import { useAccountUploadsQuery } from './api/use-account-uploads-query';
import { useRemoveAccountUploadMutation } from './api/use-remove-account-upload-mutation';
import { mergeHistory } from './history-merge';
import type { Recording } from './recording-schema';
import type { UploadStatus, Uploads } from './use-uploads';

/** Whether the account's uploads from the database have arrived, with the one line if they could not. */
export interface HistoryLoad {
  state: 'loading' | 'ready' | 'error';
  message: string | null;
  onRetry: () => void;
}

export interface HistoryItems {
  recordings: readonly Recording[];
  uploads: Uploads;
  /** Whether the recording is kept on this phone; an upload from another phone is not. */
  isOnPhone: (recording: Recording) => boolean;
  load: HistoryLoad;
}

/** A build with no database never asks (the query is idle), so there is nothing to wait for. */
function loadStateOf(query: {
  isError: boolean;
  isPending: boolean;
  fetchStatus: string;
}): HistoryLoad['state'] {
  if (query.isError) return 'error';
  if (query.isPending && query.fetchStatus !== 'idle') return 'loading';
  return 'ready';
}

const loadMessageOf = (error: unknown): string =>
  error instanceof UploadError && error.problem === 'offline'
    ? "No signal — can't load your uploads"
    : "Can't load your uploads right now";

const removeBriefOf = (error: unknown): string =>
  error instanceof UploadError && error.problem === 'offline'
    ? 'No signal'
    : "ParaPo isn't taking this now";

/**
 * What History lists: this phone's recordings merged with the account's uploads from the
 * database, whichever phone sent them. Any upload the account owns can be removed.
 */
export function useHistoryItems(saved: readonly Recording[], uploads: Uploads): HistoryItems {
  const queryClient = useQueryClient();
  const query = useAccountUploadsQuery();
  const removal = useRemoveAccountUploadMutation();
  const accountUploads = query.data ?? [];
  const ownedIds = new Set(accountUploads.map((upload) => upload.id));
  const onPhoneIds = new Set(saved.map((recording) => recording.id));

  const isOnPhone = (recording: Recording) => onPhoneIds.has(recording.id);

  const statusOf = (recording: Recording): UploadStatus => {
    if (isOnPhone(recording)) return uploads.statusOf(recording);
    const status: UploadStatus = { state: 'uploaded', at: recording.startedAt, by: '' };
    if (removal.variables !== recording.id) return status;
    if (removal.isPending) return { state: 'removing' };
    if (removal.isError)
      return { ...status, problem: `Not removed. ${removeBriefOf(removal.error)}` };
    return status;
  };

  const canRemove = (recording: Recording): boolean =>
    uploads.canRemove(recording) ||
    (ownedIds.has(recording.id) && statusOf(recording).state === 'uploaded');

  const removeUploaded = async (recording: Recording): Promise<void> => {
    if (!isOnPhone(recording)) {
      removal.mutate(recording.id);
      return;
    }
    await uploads.removeUploaded(recording);
    await queryClient.invalidateQueries({ queryKey: accountKeys.uploads() });
  };

  return {
    recordings: mergeHistory(saved, accountUploads),
    uploads: { ...uploads, statusOf, canRemove, removeUploaded },
    isOnPhone,
    load: {
      state: loadStateOf(query),
      message: query.isError ? loadMessageOf(query.error) : null,
      onRetry: () => void query.refetch(),
    },
  };
}
