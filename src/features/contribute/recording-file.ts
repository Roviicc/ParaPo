import type { Fix, RideSummary } from '@/features/routes/model/ride-recording';

import { RECORDING_VERSION, type Recording } from './recording-schema';

/** The JSON a contributor downloads: the recording, what it came to, and every fix as the phone reported it. */
export interface RecordingFile {
  version: typeof RECORDING_VERSION;
  id: string;
  startedAt: string;
  stoppedAt: string | null;
  savedAt: string | null;
  startPointName: string;
  endPointName: string;
  description: string;
  rideKind: string | null;
  /** Fixes the phone reported but could not keep, so the file is missing that many. */
  failedFixWrites: number;
  summary: {
    distanceM: number;
    movingSeconds: number;
    standingSeconds: number;
    lostSeconds: number;
    pausedSeconds: number;
    hintoCount: number;
    gapCount: number;
    fixCount: number;
    keptCount: number;
  };
  hintos: { from: string; to: string; lng: number; lat: number }[];
  gaps: { from: string; to: string; reasons: readonly string[] }[];
  fixes: { time: number; lng: number; lat: number; accuracyM: number }[];
}

const iso = (ms: number) => new Date(ms).toISOString();

/** Puts a recording, its fixes and its summary into the file's shape. Every fix goes in, ignored ones too. */
export function recordingFile(
  recording: Recording,
  fixes: readonly Fix[],
  summary: RideSummary,
): RecordingFile {
  return {
    version: RECORDING_VERSION,
    id: recording.id,
    startedAt: iso(recording.startedAt),
    stoppedAt: recording.stoppedAt === null ? null : iso(recording.stoppedAt),
    savedAt: recording.savedAt === null ? null : iso(recording.savedAt),
    startPointName: recording.startPointName,
    endPointName: recording.endPointName,
    description: recording.description,
    rideKind: recording.rideKind,
    failedFixWrites: recording.failedFixWrites ?? 0,
    summary: {
      distanceM: Math.round(summary.distanceM),
      movingSeconds: Math.round(summary.movingSeconds),
      standingSeconds: Math.round(summary.standingSeconds),
      lostSeconds: Math.round(summary.lostSeconds),
      pausedSeconds: Math.round(summary.pausedSeconds),
      hintoCount: summary.hintos.length,
      gapCount: summary.gaps.length,
      fixCount: summary.fixCount,
      keptCount: summary.keptCount,
    },
    hintos: summary.hintos.map((h) => ({
      from: iso(h.from),
      to: iso(h.to),
      lng: h.at[0],
      lat: h.at[1],
    })),
    gaps: summary.gaps.map((g) => ({ from: iso(g.from), to: iso(g.to), reasons: g.reasons })),
    fixes: fixes.map((f) => ({
      time: f.time,
      lng: f.at[0],
      lat: f.at[1],
      accuracyM: f.accuracyM,
    })),
  };
}

const MANILA_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });

/** Hands the browser the file to save, named by the ride's day in Manila and the start of its id. */
export function downloadRecording(file: RecordingFile): void {
  const blob = new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const day = MANILA_DAY.format(new Date(file.startedAt));
  link.download = `parapo-ride-${day}-${file.id.slice(0, 8)}.json`;
  link.click();
  // The browser reads the blob after the click returns, so it is let go a moment later.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
