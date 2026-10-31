import type { Fix } from '@/features/routes/model/ride-recording';

import type { RecordingFigures } from './recording-figures';
import type { Mode } from './recording-rules';
import type { Recording, RideKind } from '../storage/recording-schema';

/**
 * Where the page is. Recording and paused are one screen (Pause pauses, Resume
 * carries on); form is the Save form, however it was reached; saved is the
 * thank-you.
 */
export type Phase = 'loading' | 'ready' | 'unfinished' | 'recording' | 'paused' | 'form' | 'saved';

/** What the contributor may say about a ride when they save it; all of it optional. */
export interface RecordingDetails {
  startPointName: string;
  endPointName: string;
  description: string;
  rideKind: RideKind | null;
  /** Left out when no fare was typed, or one the form could not read. */
  farePhp?: number;
}

export interface RecordingState {
  phase: Phase;
  /** The recording being made, or stopped and not yet saved; null on Ready. */
  current: Recording | null;
  /** Every fix the phone reported for it, in order. */
  fixes: readonly Fix[];
  /** The fixes that count, worked out once per fix. */
  kept: readonly Fix[];
  /** Time recorded (pauses left out) and distance so far; null on Ready. */
  figures: RecordingFigures | null;
  /** The mode the recording is on now: walk is Lakad, ride is Sakay. */
  mode: Mode;
  /** The recording just saved, until the contributor records again. */
  lastSaved: Recording | null;
  /** Every recording saved on this phone, newest first. */
  saved: readonly Recording[];
  /** Whether the screen is being kept awake. */
  isAwake: boolean;
  /** Something the contributor should know went wrong, in words. */
  problem: string | null;
  /** What a screen reader hears once: a switch of mode, a mark, or recording again. */
  announcement: string;
  start: () => void;
  /** Pauses the recording; Resume carries on. */
  stop: () => void;
  /** Stops a recording found open after a reload where its last fix left it, as Pause does: paused, with Finish and Resume. */
  stopAtLastFix: () => void;
  resume: () => void;
  switchMode: () => void;
  /** Marks the place the ride is at: the time of the tap, nothing more. */
  markPlace: () => void;
  /** Stops a running recording, then opens the Save form. */
  openSave: () => void;
  /** From the Save form, back to recording as Resume does: the time on the form is a gap. */
  keepRecording: () => void;
  /** Where focus goes as the recording screen opens: its heading, or the Pause bar after Keep recording. */
  focusTarget: 'heading' | 'pause';
  /** Saves the recording; with no details, as it is. */
  save: (details: RecordingDetails | null) => void;
  cancel: () => void;
  /** Back to Ready after a save. */
  recordAgain: () => void;
  /** Deletes a saved recording and its fixes from this phone. An uploaded copy is not touched. */
  deleteSaved: (recording: Recording) => void;
}
