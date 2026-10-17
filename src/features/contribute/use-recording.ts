import { useCallback, useEffect, useRef, useState } from 'react';

import {
  summarize,
  type Fix,
  type GapReason,
  type RideSummary,
} from '@/features/routes/model/ride-recording';

import { locationProblem } from './location-problem';
import { downloadRecording, recordingFile } from './recording-file';
import { RECORDING_VERSION, type FixRow, type Recording, type RideKind } from './recording-schema';
import {
  deleteRecording,
  loadFixes,
  loadRecordings,
  putFix,
  putRecording,
} from './recording-store';
import { useGeolocationWatch } from './use-geolocation-watch';
import { useHiddenGaps } from './use-hidden-gaps';
import { useWakeLock } from './use-wake-lock';

export type Phase = 'loading' | 'ready' | 'unfinished' | 'recording' | 'stopped';

/** What the contributor may say about a ride when they save it; all of it optional. */
export interface RecordingDetails {
  startPointName: string;
  endPointName: string;
  description: string;
  rideKind: RideKind | null;
}

export interface RecordingState {
  phase: Phase;
  /** The recording being made, or stopped and not yet saved; null on Ready. */
  current: Recording | null;
  summary: RideSummary | null;
  /** Recordings kept on the phone, newest first. */
  saved: readonly Recording[];
  /** Whether the screen is being kept awake. */
  isAwake: boolean;
  /** Something the contributor should know went wrong, in words. */
  problem: string | null;
  start: () => void;
  stop: () => void;
  /** Stops a recording found open after a reload where its last fix left it. */
  stopAtLastFix: () => void;
  resume: () => void;
  save: (details: RecordingDetails) => void;
  cancel: () => void;
  download: (id: string) => void;
  /** Downloads the recording in hand from memory, for when the phone could not keep its fixes. */
  downloadCurrent: () => void;
  remove: (id: string) => void;
}

const STORE_PROBLEM =
  'This phone could not keep the recording. Close other tabs of this page and try again.';

const toFix = (row: FixRow): Fix => ({
  time: row.time,
  at: [row.lng, row.lat],
  accuracyM: row.accuracyM,
});

/**
 * The page's whole state: what phase it is in, the recording being made and
 * its fixes, the saved ones. Every fix goes to IndexedDB as it arrives; the
 * hook only reads it back on reopen.
 */
export function useRecording(): RecordingState {
  const [phase, setPhase] = useState<Phase>('loading');
  const [saved, setSaved] = useState<Recording[]>([]);
  const [current, setCurrent] = useState<Recording | null>(null);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [now, setNow] = useState(() => Date.now());
  // Two slots, so a location error never hides a storage failure: storage stays
  // until a new recording starts, location clears when the next fix arrives.
  const [storageProblem, setStorageProblem] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  // The recording as the effects below read it, kept beside the state because
  // they write it without waiting for a render.
  const currentRef = useRef<Recording | null>(null);
  const nextSeq = useRef(0);
  const failedFixWrites = useRef(0);

  const reportStore = useCallback((error: unknown) => {
    console.error('IndexedDB failed.', error);
    setStorageProblem(STORE_PROBLEM);
  }, []);

  /** Makes this the recording in hand and writes it to the phone. */
  const keep = useCallback(
    (recording: Recording) => {
      currentRef.current = recording;
      setCurrent(recording);
      putRecording(recording).catch(reportStore);
    },
    [reportStore],
  );

  function forgetCurrent() {
    currentRef.current = null;
    setCurrent(null);
    setFixes([]);
  }

  useEffect(() => {
    let isCancelled = false;
    const load = async () => {
      try {
        const all = await loadRecordings();
        const open = all.find((r) => r.status !== 'saved') ?? null;
        const rows = open ? await loadFixes(open.id) : [];
        if (isCancelled) return;
        setSaved(all.filter((r) => r.status === 'saved'));
        if (open) {
          currentRef.current = open;
          setCurrent(open);
          setFixes(rows.map(toFix));
          nextSeq.current = rows.length > 0 ? rows[rows.length - 1].seq + 1 : 0;
          failedFixWrites.current = open.failedFixWrites ?? 0;
          setPhase(open.status === 'stopped' ? 'stopped' : 'unfinished');
        } else {
          setPhase('ready');
        }
      } catch (error) {
        if (isCancelled) return;
        reportStore(error);
        setPhase('ready');
      }
    };
    void load();
    return () => {
      isCancelled = true;
    };
  }, [reportStore]);

  const isRecording = phase === 'recording';
  const isAwake = useWakeLock(isRecording);

  useGeolocationWatch(isRecording, {
    onFix: (position) => {
      const recording = currentRef.current;
      if (!recording) return;
      const row: FixRow = {
        recordingId: recording.id,
        seq: nextSeq.current++,
        time: position.timestamp,
        lng: position.coords.longitude,
        lat: position.coords.latitude,
        accuracyM: position.coords.accuracy,
      };
      putFix(row).catch((error: unknown) => {
        failedFixWrites.current += 1;
        reportStore(error);
      });
      setFixes((previous) => [...previous, toFix(row)]);
      setLocationError(null);
    },
    onError: (error) => setLocationError(locationProblem(error)),
  });

  // The clock the live totals and the open silence run on.
  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isRecording]);

  useHiddenGaps(isRecording, currentRef, keep);

  function start() {
    const startedAt = Date.now();
    nextSeq.current = 0;
    setFixes([]);
    setNow(startedAt);
    setStorageProblem(null);
    setLocationError(null);
    failedFixWrites.current = 0;
    keep({
      version: RECORDING_VERSION,
      id: crypto.randomUUID(),
      status: 'recording',
      startedAt,
      stoppedAt: null,
      savedAt: null,
      gaps: [],
      startPointName: '',
      endPointName: '',
      description: '',
      rideKind: null,
    });
    setPhase('recording');
  }

  function finish(at: number) {
    const recording = currentRef.current;
    if (!recording) return;
    const failed = failedFixWrites.current;
    keep({
      ...recording,
      status: 'stopped',
      stoppedAt: at,
      ...(failed > 0 && { failedFixWrites: failed }),
    });
    setPhase('stopped');
  }
  const stop = () => finish(Date.now());
  const stopAtLastFix = () => finish(fixes[fixes.length - 1]?.time ?? Date.now());

  function resume() {
    const recording = currentRef.current;
    if (!recording) return;
    const resumedAt = Date.now();
    const missed = (from: number, reason: GapReason): Recording['gaps'] => [
      { from, to: resumedAt, reasons: [reason] },
    ];
    // A recording found open after a reload lost the time since its last fix;
    // one stopped on purpose was paused from the Stop.
    let lost: Recording['gaps'] = [];
    if (phase === 'unfinished') {
      lost = missed(fixes[fixes.length - 1]?.time ?? recording.startedAt, 'resumed');
    } else if (recording.stoppedAt !== null) {
      lost = missed(recording.stoppedAt, 'paused');
    }
    setNow(resumedAt);
    setLocationError(null);
    keep({
      ...recording,
      status: 'recording',
      stoppedAt: null,
      gaps: [...recording.gaps, ...lost],
    });
    setPhase('recording');
  }

  function save(details: RecordingDetails) {
    const recording = currentRef.current;
    if (!recording) return;
    const kept: Recording = { ...recording, ...details, status: 'saved', savedAt: Date.now() };
    putRecording(kept).catch(reportStore);
    setSaved((previous) => [kept, ...previous]);
    forgetCurrent();
    setPhase('ready');
  }

  function cancel() {
    const recording = currentRef.current;
    if (recording) deleteRecording(recording.id).catch(reportStore);
    forgetCurrent();
    setStorageProblem(null);
    setPhase('ready');
  }

  function download(id: string) {
    const recording = saved.find((r) => r.id === id);
    if (!recording) return;
    loadFixes(id)
      .then((rows) => {
        const recorded = rows.map(toFix);
        const end = recording.stoppedAt ?? recording.savedAt ?? recording.startedAt;
        const summary = summarize(recorded, recording.gaps, recording.startedAt, end);
        downloadRecording(recordingFile(recording, recorded, summary));
      })
      .catch(reportStore);
  }

  function remove(id: string) {
    deleteRecording(id).catch(reportStore);
    setSaved((previous) => previous.filter((r) => r.id !== id));
  }

  function downloadCurrent() {
    if (!current) return;
    const end = current.stoppedAt ?? Date.now();
    const summary = summarize(fixes, current.gaps, current.startedAt, end);
    downloadRecording(recordingFile(current, fixes, summary));
  }

  const problem = storageProblem ?? locationError;
  const end = isRecording ? now : (current?.stoppedAt ?? now);
  const summary = current ? summarize(fixes, current.gaps, current.startedAt, end) : null;

  return {
    phase,
    current,
    summary,
    saved,
    isAwake,
    problem,
    start,
    stop,
    stopAtLastFix,
    resume,
    save,
    cancel,
    download,
    downloadCurrent,
    remove,
  };
}
