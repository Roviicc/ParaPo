import { IconButton } from '@/design-system/primitives/icon-button';
import { ChevronLeftIcon } from '@/shared/ui/route-icons';

import { ConsentPanel } from './consent-panel';
import { TrackingButton } from './tracking-button';
import { useConsent } from './use-consent';
import { useFocusHeading } from './use-focus-heading';
import { useStackRoom } from './use-stack-room';

interface ReadyScreenProps {
  onStart: () => void;
}

const goBackToMap = () => window.location.assign('/');

/** Before a recording: back to the map, and one Start bar (or, on a first visit, what the page does). */
export function ReadyScreen({ onStart }: ReadyScreenProps) {
  const { hasConsent, giveConsent } = useConsent();
  const headingRef = useFocusHeading();
  const stackRef = useStackRoom();

  return (
    <>
      <div className="absolute top-0 left-0 z-10 pt-[max(1rem,env(safe-area-inset-top))] pl-[max(1rem,env(safe-area-inset-left))]">
        <IconButton
          tooltip="top"
          label="Back to the map"
          icon={<ChevronLeftIcon />}
          onClick={goBackToMap}
        />
      </div>
      {hasConsent ? (
        <section
          ref={stackRef}
          aria-labelledby="ready-heading"
          className="absolute inset-x-0 bottom-0 z-10 pb-[env(safe-area-inset-bottom)]"
        >
          <h1 id="ready-heading" ref={headingRef} tabIndex={-1} className="sr-only">
            Record a route
          </h1>
          <TrackingButton variant="start" onClick={onStart} />
        </section>
      ) : (
        <ConsentPanel onAgree={giveConsent} onDecline={goBackToMap} />
      )}
    </>
  );
}
