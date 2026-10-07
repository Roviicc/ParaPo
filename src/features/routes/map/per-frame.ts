/*
 * What arrives in a burst, handed on once a frame (the cheap-phone plan,
 * step 16 (e), 2026-10-04). Pure but for the frame clock, which a unit test
 * replaces.
 */

/** The frame clock: the browser's, or a test's. */
export interface Frames {
  request: (run: () => void) => number;
  cancel: (handle: number) => void;
}

const browserFrames: Frames = {
  request: (run) => requestAnimationFrame(run),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/** What perFrame gives back: `add` an arrival, `clear` what is not handed on yet. */
export interface PerFrame<K, V> {
  add: (key: K, value: V) => void;
  clear: () => void;
}

/**
 * Keyed arrivals, collected and handed to `apply` together at the next
 * frame: one hand-on for whatever came in since the last, the later of two
 * for one key winning. `clear` drops what has not been handed on yet.
 *
 * Why a frame: the directions' full lines come in one fetch at a time, a
 * list of six lit routes six of them, and each made the whole app render
 * again and every lit line's stretches, rides and chevrons be worked out
 * again; nothing of them can reach the screen before the next frame anyway.
 * A hidden page runs no frames, so what arrives while it is hidden is
 * handed on as it comes back — when the map, which draws on frames too,
 * first draws again.
 */
export function perFrame<K, V>(
  apply: (batch: ReadonlyMap<K, V>) => void,
  frames: Frames = browserFrames,
): PerFrame<K, V> {
  let pending = new Map<K, V>();
  let frame: number | null = null;
  return {
    add(key: K, value: V) {
      pending.set(key, value);
      if (frame !== null) return;
      frame = frames.request(() => {
        frame = null;
        const batch = pending;
        pending = new Map();
        apply(batch);
      });
    },
    clear() {
      pending = new Map();
      if (frame !== null) frames.cancel(frame);
      frame = null;
    },
  };
}
