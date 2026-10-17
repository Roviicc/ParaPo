import { useEffect, type RefObject } from 'react';

import type { Recording } from './recording-schema';

/**
 * Logs the page hidden as a gap while recording: the phone may stop locating
 * while another app is in front. `keep` writes the recording with the gap.
 */
export function useHiddenGaps(
  isRecording: boolean,
  currentRef: RefObject<Recording | null>,
  keep: (recording: Recording) => void,
): void {
  useEffect(() => {
    if (!isRecording) return;
    let hiddenAt: number | null = null;
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      const from = hiddenAt;
      const recording = currentRef.current;
      hiddenAt = null;
      if (from === null || !recording) return;
      keep({
        ...recording,
        gaps: [...recording.gaps, { from, to: Date.now(), reasons: ['hidden'] }],
      });
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isRecording, currentRef, keep]);
}
