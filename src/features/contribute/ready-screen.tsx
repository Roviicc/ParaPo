import { useEffect, useRef, useState } from 'react';

import { IconButton } from '@/design-system/primitives/icon-button';

import { BackToMapButton, goBackToMap } from './back-to-map-button';
import { ConsentPanel } from './consent-panel';
import { EarlierRecordingsPanel, type EarlierQuestion } from './earlier-recordings-panel';
import { TrackingButton } from './tracking-button';
import { HistoryIcon, ProfileIcon } from './tracking-icons';
import { useStackRoom } from './use-stack-room';

interface ReadyScreenProps {
  hasConsent: boolean;
  onConsent: () => void;
  earlierQuestion: EarlierQuestion | null;
  onStart: () => void;
  onOpenHistory: () => void;
  /** Absent when this build has no accounts, so no Profile. */
  onOpenProfile?: () => void;
  /** The screen that was open before this one: focus goes back to the button that opened it. */
  returnFocusTo: 'history' | 'profile' | null;
}

/**
 * Before a recording: back to the map, Profile and History, and one Start bar (or, on a first visit, what the
 * page does). History is a screen of its own, so nothing of it shows here.
 */
export function ReadyScreen({
  hasConsent,
  onConsent,
  earlierQuestion,
  onStart,
  onOpenHistory,
  onOpenProfile,
  returnFocusTo,
}: ReadyScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const historyRef = useRef<HTMLButtonElement>(null);
  const profileRef = useRef<HTMLButtonElement>(null);
  // Decided once, as the screen opens: a later change must not move focus again.
  const [focusTarget] = useState(returnFocusTo);
  useEffect(() => {
    const buttons = { history: historyRef.current, profile: profileRef.current };
    (focusTarget ? buttons[focusTarget] : headingRef.current)?.focus();
  }, [focusTarget]);
  const stackRef = useStackRoom();

  return (
    <>
      <BackToMapButton>
        {onOpenProfile && (
          <IconButton
            ref={profileRef}
            tooltip="top"
            size="large"
            label="Profile"
            icon={<ProfileIcon />}
            onClick={onOpenProfile}
          />
        )}
        {hasConsent && (
          <IconButton
            ref={historyRef}
            tooltip="top"
            size="large"
            label="History"
            icon={<HistoryIcon />}
            onClick={onOpenHistory}
          />
        )}
      </BackToMapButton>
      {hasConsent && earlierQuestion && <EarlierRecordingsPanel {...earlierQuestion} />}
      {hasConsent && !earlierQuestion && (
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
      )}
      {!hasConsent && <ConsentPanel onAgree={onConsent} onDecline={goBackToMap} />}
    </>
  );
}
