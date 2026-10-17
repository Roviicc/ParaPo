import { Button } from '@/design-system/primitives/button';

import { useFocusHeading } from './use-focus-heading';
import { useStackRoom } from './use-stack-room';

interface ConsentPanelProps {
  onAgree: () => void;
  onDecline: () => void;
}

/** The first visit: what the page records and where it goes, before anything is asked of the phone. */
export function ConsentPanel({ onAgree, onDecline }: ConsentPanelProps) {
  const headingRef = useFocusHeading();
  const stackRef = useStackRoom();
  return (
    <section
      ref={stackRef}
      aria-labelledby="consent-heading"
      className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-4 bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] font-sn-pro text-content-primary shadow-bottom-sheet-top-shadow"
    >
      <h1
        id="consent-heading"
        ref={headingRef}
        tabIndex={-1}
        className="text-xl/7 font-extrabold focus:outline-none"
      >
        Before you record
      </h1>
      <p className="text-base/6">
        This page records the route you travel using your phone&apos;s location, while it is open.
        The recording stays on this phone for now. Nothing is sent anywhere.
      </p>
      <div className="flex flex-col gap-2">
        <Button variant="primary" label="Okay, I understand" onClick={onAgree} />
        <Button variant="secondary" label="Not now" onClick={onDecline} />
      </div>
    </section>
  );
}
