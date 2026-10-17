import type { Way } from './recording-rules';
import { StatsStrip } from './stats-strip';
import { TrackingButton } from './tracking-button';
import { useFocusHeading } from './use-focus-heading';
import type { RecordingFigures } from './use-recording';
import { useStackRoom } from './use-stack-room';

interface UnfinishedScreenProps {
  figures: RecordingFigures;
  way: Way;
  onResume: () => void;
  onStop: () => void;
}

/** A recording was left open when the page closed: carry on with it, or stop it where it was. */
export function UnfinishedScreen({ figures, way, onResume, onStop }: UnfinishedScreenProps) {
  const headingRef = useFocusHeading();
  const stackRef = useStackRoom();
  return (
    <section
      ref={stackRef}
      aria-labelledby="unfinished-heading"
      className="absolute inset-x-0 bottom-0 z-10 flex flex-col pb-[env(safe-area-inset-bottom)]"
    >
      <div className="bg-surface px-4 pt-4 font-sn-pro text-content-primary">
        <h1
          id="unfinished-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-xl/7 font-extrabold focus:outline-none"
        >
          A recording was left open
        </h1>
        <p className="py-2 text-base/6">
          Resume it, and the time since its last fix is logged as a gap, or stop it where it was.
        </p>
      </div>
      <StatsStrip
        elapsedSeconds={figures.elapsedSeconds}
        distanceM={figures.distanceM}
        way={way}
        isPaused
      />
      <TrackingButton variant="resume" onClick={onResume} />
      <TrackingButton variant="stop" onClick={onStop} />
    </section>
  );
}
