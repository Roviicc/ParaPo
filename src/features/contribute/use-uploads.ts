import { useEffect, useRef, useState } from 'react';

import type { Fix } from '@/features/routes/model/ride-recording';

import { canUpload } from './api/contribute-client';
import { turnstileSiteKey } from './api/env';
import { packRecording, type PackRefusal } from './api/pack-recording';
import {
  currentIdentity,
  ensureSignedIn,
  removeUpload,
  uploadContribution,
  uploadsStillThere,
} from './api/upload-contribution';
import { UploadError, type UploadProblem } from './api/upload-problem';
import { CONSENT_VERSION, isEarlierRecording } from './consent-version';
import type { Recording } from './recording-schema';
import { loadFixes, updateRecording } from './recording-store';
import type { EarlierChoice } from './use-earlier-choice';

/** Where a saved recording's upload stands. */
export type UploadStatus =
  | { state: 'waiting' }
  /** Waiting for the check that a person is uploading, before this phone's first upload. */
  | { state: 'checking' }
  | { state: 'uploading' }
  | { state: 'uploaded'; at: number; by: string; problem?: string }
  /** `message` is the whole sentence; `brief` is its reason alone, for History, whose layout says the rest. */
  | { state: 'failed'; message: string; brief: string; willRetry: boolean }
  | { state: 'removing' }
  | { state: 'removed'; byEditor?: boolean }
  /** Not sent on its own: made before the current consent text, and the person kept it on the phone. */
  | { state: 'held' }
  | { state: 'unavailable' };

/** What lets a recording go: consent to the current text, and for earlier recordings the person's answer. */
export interface UploadGate {
  hasConsent: boolean;
  earlier: EarlierChoice | null;
}

export interface Uploads {
  statusOf: (recording: Recording) => UploadStatus;
  /** Saved recordings not yet uploaded and not removed. */
  waitingCount: number;
  /** Sends one now: a retry after a failure, or again after its upload was removed. */
  upload: (recording: Recording) => void;
  /** Removes the uploaded copy from ParaPo. The phone's copy stays. */
  removeUploaded: (recording: Recording) => void;
  /** Whether this phone's identity made the upload, so it may remove it. */
  canRemove: (recording: Recording) => boolean;
  /** The bot check before this phone's first upload, while one is needed. */
  check: UploadCheck | null;
}

export interface UploadCheck {
  siteKey: string;
  /** Bumped for a fresh widget after a refused check. */
  round: number;
  onToken: (token: string | null) => void;
}

const FAILED: Record<
  UploadProblem | PackRefusal,
  { message: string; brief: string; willRetry: boolean }
> = {
  offline: {
    message: 'Not uploaded yet: no signal. It tries again when the phone is back online.',
    brief: 'No signal',
    willRetry: true,
  },
  'day-cap': {
    message: 'Not uploaded yet: this phone has sent 20 recordings today. It tries again later.',
    brief: '20 recordings sent today',
    willRetry: true,
  },
  refused: {
    message: "ParaPo's checks refused this recording. It stays on this phone.",
    brief: "Refused by ParaPo's checks",
    willRetry: false,
  },
  blocked: {
    message: 'This phone cannot upload recordings.',
    brief: 'This phone cannot upload',
    willRetry: false,
  },
  'check-failed': {
    message: 'The check that you are a person did not pass. Try again.',
    brief: 'Person check not passed',
    willRetry: false,
  },
  unavailable: {
    message: 'Uploading is not available on this page.',
    brief: 'Uploading is not available here',
    willRetry: false,
  },
  'not-accepting': {
    message:
      'Not uploaded yet: ParaPo cannot take uploads right now. It stays on this phone. It tries again later.',
    brief: "ParaPo isn't taking uploads now",
    willRetry: true,
  },
  'too-long': {
    message: 'Longer than 6 hours, so it cannot be uploaded. It stays on this phone.',
    brief: 'Longer than 6 hours',
    willRetry: false,
  },
  'too-many-points': {
    message: 'Too large to upload. It stays on this phone.',
    brief: 'Too large to upload',
    willRetry: false,
  },
  'line-too-large': {
    message: 'Too large to upload. It stays on this phone.',
    brief: 'Too large to upload',
    willRetry: false,
  },
};

const problemOfError = (error: unknown): UploadProblem =>
  error instanceof UploadError ? error.problem : 'offline';

const toFix = (row: { time: number; lng: number; lat: number; accuracyM: number }): Fix => ({
  time: row.time,
  at: [row.lng, row.lat],
  accuracyM: row.accuracyM,
});

/**
 * Sends saved recordings to ParaPo and remembers which arrived. A recording is
 * sent on its own when it is saved, when the page opens, and when the phone
 * comes back online or to the front; one that failed for want of signal is
 * tried again then too. The phone's copy is never deleted here.
 */
export function useUploads(saved: readonly Recording[], gate: UploadGate): Uploads {
  const [overlay, setOverlay] = useState<Record<string, UploadStatus>>({});
  const [identity, setIdentity] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());
  const savedRef = useRef(saved);
  const gateRef = useRef(gate);
  const overlayRef = useRef(overlay);
  const isAvailable = canUpload();
  const [isCheckNeeded, setIsCheckNeeded] = useState(false);
  const [checkRound, setCheckRound] = useState(0);
  const tokenRef = useRef<string | null>(null);
  const signingIn = useRef<Promise<string> | null>(null);

  /**
   * This phone's identity, signing in once for every send waiting on it. Null
   * when the first sign-in needs the bot check and no token is in hand yet.
   */
  async function identityForUpload(): Promise<string | null> {
    if (signingIn.current) return signingIn.current;
    const known = await currentIdentity();
    if (known) return known;
    if (signingIn.current) return signingIn.current;
    if (turnstileSiteKey && !tokenRef.current) return null;
    const token = tokenRef.current ?? undefined;
    tokenRef.current = null;
    signingIn.current = ensureSignedIn(token).finally(() => {
      signingIn.current = null;
    });
    return signingIn.current;
  }

  const setStatus = (id: string, status: UploadStatus) => {
    overlayRef.current = { ...overlayRef.current, [id]: status };
    setOverlay(overlayRef.current);
  };

  /** Whether this recording is sent without being asked for: only under consent to the current text. */
  function isSentOnItsOwn(recording: Recording): boolean {
    if (!gate.hasConsent) return false;
    return !isEarlierRecording(recording.consentVersion) || gate.earlier === 'send';
  }

  function statusOf(recording: Recording): UploadStatus {
    const shown = overlay[recording.id];
    if (shown) return shown;
    if (recording.upload?.state === 'uploaded') return { ...recording.upload };
    if (recording.upload?.state === 'removed') {
      return { state: 'removed', byEditor: recording.upload.byEditor === true };
    }
    if (!isAvailable) return { state: 'unavailable' };
    return isSentOnItsOwn(recording) ? { state: 'waiting' } : { state: 'held' };
  }

  async function send(recording: Recording) {
    // Nothing leaves the phone without consent to the current text, whoever asks.
    if (!gateRef.current.hasConsent || inFlight.current.has(recording.id)) return;
    inFlight.current.add(recording.id);
    setStatus(recording.id, { state: 'uploading' });
    try {
      const rows = await loadFixes(recording.id);
      const packed = packRecording(
        recording,
        rows.map(toFix),
        // Sent under the text it was made with; an earlier recording the person chose to send is
        // sent under the current one they agreed to.
        recording.consentVersion ?? CONSENT_VERSION,
        Date.now(),
      );
      if (!packed.ok) {
        setStatus(recording.id, { state: 'failed', ...FAILED[packed.reason] });
        return;
      }
      const by = await identityForUpload();
      if (!by) {
        setIsCheckNeeded(true);
        setStatus(recording.id, { state: 'checking' });
        return;
      }
      setIdentity(by);
      await uploadContribution(packed.payload);
      const mark = { state: 'uploaded', at: Date.now(), by } as const;
      // The answer arrived; if keeping the mark fails, the next send answers 'already saved'.
      await updateRecording(recording.id, (stored) => ({ ...stored, upload: mark }));
      setStatus(recording.id, { ...mark });
    } catch (error) {
      if (!(error instanceof UploadError)) console.error('An upload failed.', error);
      if (problemOfError(error) === 'check-failed') {
        // The token was refused: a fresh check, then this one waits on it again.
        setCheckRound((round) => round + 1);
        setIsCheckNeeded(true);
        setStatus(recording.id, { state: 'checking' });
      } else {
        setStatus(recording.id, { state: 'failed', ...FAILED[problemOfError(error)] });
      }
    } finally {
      inFlight.current.delete(recording.id);
    }
  }

  async function remove(recording: Recording) {
    const before = statusOf(recording);
    if (before.state !== 'uploaded' || inFlight.current.has(recording.id)) return;
    inFlight.current.add(recording.id);
    setStatus(recording.id, { state: 'removing' });
    try {
      await removeUpload(recording.id);
      await updateRecording(recording.id, (stored) => ({
        ...stored,
        upload: { state: 'removed', at: Date.now() },
      }));
      setStatus(recording.id, { state: 'removed' });
    } catch (error) {
      if (!(error instanceof UploadError)) console.error('Removing an upload failed.', error);
      const { brief } = FAILED[problemOfError(error)];
      setStatus(recording.id, { ...before, problem: `Not removed. ${brief}` });
    } finally {
      inFlight.current.delete(recording.id);
    }
  }

  // The list and the overlay as the window's events read them.
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  useEffect(() => {
    gateRef.current = { hasConsent: gate.hasConsent, earlier: gate.earlier };
  }, [gate.hasConsent, gate.earlier]);

  // A recording not tried yet is sent as soon as the list holds it: the page
  // opened, or one was just saved, or consent or the answer about earlier ones
  // arrived. A change to the list for any other reason (a delete) retries nothing.
  useEffect(() => {
    if (!isAvailable) return;
    for (const recording of saved) {
      const isNew = recording.upload === undefined && !overlayRef.current[recording.id];
      if (isNew && isSentOnItsOwn(recording)) void send(recording);
    }
    // send reads only refs and setters; a new list or gate is what should send.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [saved, isAvailable, gate.hasConsent, gate.earlier]);

  // One that failed for want of signal (or the day's limit, or ParaPo not taking
  // uploads) is tried again when the phone comes back online or the page comes
  // back to the front.
  useEffect(() => {
    if (!isAvailable) return;
    const sendAgain = () => {
      for (const recording of savedRef.current) {
        const shown = overlayRef.current[recording.id];
        if (shown?.state === 'failed' && shown.willRetry) void send(recording);
      }
    };
    const handleVisible = () => {
      if (document.visibilityState === 'visible') sendAgain();
    };
    window.addEventListener('online', sendAgain);
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      window.removeEventListener('online', sendAgain);
      document.removeEventListener('visibilitychange', handleVisible);
    };
    // send reads only refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [isAvailable]);

  // Who this phone is, so the list can say which uploads it may remove, and
  // which of its uploads an editor has since deleted in the studio. Only asked
  // once something was uploaded: the client is loaded on first need.
  const hasUploads = saved.some((r) => r.upload?.state === 'uploaded');
  useEffect(() => {
    // Nothing is asked of the database before consent to the current text.
    if (!isAvailable || !hasUploads || !gate.hasConsent) return;
    let isCurrent = true;
    const settle = async () => {
      const id = await currentIdentity();
      if (!isCurrent) return;
      setIdentity(id);
      if (!id) return;
      const there = await uploadsStillThere();
      for (const recording of savedRef.current) {
        const mark = recording.upload;
        if (mark?.state !== 'uploaded' || mark.by !== id || there.has(recording.id)) continue;
        if (inFlight.current.has(recording.id) || overlayRef.current[recording.id]) continue;
        await updateRecording(recording.id, (stored) => ({
          ...stored,
          upload: { state: 'removed', at: Date.now(), byEditor: true },
        }));
        if (isCurrent) setStatus(recording.id, { state: 'removed', byEditor: true });
      }
    };
    // With no signal the list stays as this phone last knew it.
    settle().catch((error: unknown) =>
      console.warn('The phone could not check its uploads.', error),
    );
    return () => {
      isCurrent = false;
    };
  }, [isAvailable, hasUploads, gate.hasConsent]);

  const waitingCount = saved.filter((r) => {
    const state = statusOf(r).state;
    return (
      state === 'waiting' || state === 'checking' || state === 'uploading' || state === 'failed'
    );
  }).length;

  return {
    statusOf,
    waitingCount,
    upload: (recording) => void send(recording),
    removeUploaded: (recording) => void remove(recording),
    canRemove: (recording) => {
      const status = statusOf(recording);
      return status.state === 'uploaded' && identity !== null && status.by === identity;
    },
    check:
      turnstileSiteKey && isCheckNeeded
        ? {
            siteKey: turnstileSiteKey,
            round: checkRound,
            onToken: (token) => {
              tokenRef.current = token;
              if (!token) return;
              setIsCheckNeeded(false);
              for (const recording of savedRef.current) {
                if (overlayRef.current[recording.id]?.state === 'checking') void send(recording);
              }
            },
          }
        : null,
  };
}
