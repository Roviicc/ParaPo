import { useEffect, useRef, useState } from 'react';

import { ConfirmDelete } from './confirm-delete';
import { OTHER_WAY, type Way } from './recording-rules';
import { StatsStrip } from './stats-strip';
import { TrackingButton } from './tracking-button';
import type { RecordingFigures } from './use-recording';
import { useStackRoom } from './use-stack-room';

interface RecordingScreenProps {
  figures: RecordingFigures;
  way: Way;
  /** Stopped for now: Resume replaces Stop. */
  isPaused: boolean;
  /** Whether the screen is being kept awake. */
  isAwake: boolean;
  /** Focus the Stop bar as the screen opens, not its heading: back from Keep recording. */
  shouldFocusStop: boolean;
  onStop: () => void;
  onResume: () => void;
  onWaySwitch: () => void;
  onSave: () => void;
  onCancel: () => void;
}

/** The leg button's variant: named for the way a tap switches TO. */
const NEXT_WAY = { outbound: 'papunta', return: 'pabalik' } satisfies Record<
  Way,
  'papunta' | 'pabalik'
>;

/** While recording, or stopped for a while: the figures over Stop (or Resume), and the row of Pabalik, Save and Cancel. */
export function RecordingScreen({
  figures,
  way,
  isPaused,
  isAwake,
  shouldFocusStop,
  onStop,
  onResume,
  onWaySwitch,
  onSave,
  onCancel,
}: RecordingScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stackRef = useStackRoom();
  // The heading takes focus as the screen opens, a screen reader starting at its top; back from
  // Keep recording it is the Stop bar, where the contributor was before.
  useEffect(() => {
    const section = headingRef.current?.closest('section');
    const stop = section?.querySelector<HTMLButtonElement>('button[aria-label="Stop"]');
    (shouldFocusStop ? stop : headingRef.current)?.focus();
    // Once, as the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a change of the prop alone must not move focus
  }, []);
  const [isAsking, setIsAsking] = useState(false);
  const cancelRef = useRef<HTMLDivElement>(null);
  const wasAsking = useRef(false);

  // Back from the question, focus returns to the button that asked it.
  useEffect(() => {
    if (wasAsking.current && !isAsking) {
      cancelRef.current?.querySelector<HTMLButtonElement>('button[aria-label="Cancel"]')?.focus();
    }
    wasAsking.current = isAsking;
  }, [isAsking]);

  return (
    <section
      ref={stackRef}
      aria-labelledby="recording-heading"
      className="absolute inset-x-0 bottom-0 z-10 flex flex-col pb-[env(safe-area-inset-bottom)]"
    >
      <h1 id="recording-heading" ref={headingRef} tabIndex={-1} className="sr-only">
        {isPaused ? 'Recording stopped' : 'Recording a route'}
      </h1>
      {!isAwake && !isPaused && (
        <p className="mx-4 mb-2 bg-surface p-2 font-sn-pro text-sm/5 text-content-primary">
          The screen could not be kept awake, so it may sleep and the location may stop.
        </p>
      )}
      <StatsStrip
        elapsedSeconds={figures.elapsedSeconds}
        distanceM={figures.distanceM}
        way={way}
        isPaused={isPaused}
      />
      {isPaused ? (
        <TrackingButton variant="resume" onClick={onResume} />
      ) : (
        <TrackingButton variant="stop" isActive onClick={onStop} />
      )}
      {isAsking ? (
        <ConfirmDelete
          question="Throw this recording away?"
          onConfirm={onCancel}
          onKeep={() => setIsAsking(false)}
        />
      ) : (
        <div ref={cancelRef} className="flex">
          <TrackingButton variant={NEXT_WAY[OTHER_WAY[way]]} onClick={onWaySwitch} />
          <TrackingButton variant="save" onClick={onSave} />
          <TrackingButton variant="cancel" onClick={() => setIsAsking(true)} />
        </div>
      )}
    </section>
  );
}
