import { lazy, Suspense, useEffect, useRef, useState, type Ref } from 'react';

import { BottomToolbar } from './bottom-toolbar';
import { HelpButton } from './help-button';
import { StartBar } from './start-bar';
import { useStackRoom } from '../common/use-stack-room';
import { EarlierRecordingsPanel, type EarlierQuestion } from '../consent/earlier-recordings-panel';
import { CreditsButton } from '../map/credits-button';

// The update gate exists in the Android app's build only: on the web this is null and the chunk is
// never built, so the page's first load does not carry it.
const AppUpdateGate =
  import.meta.env.MODE === 'apk'
    ? lazy(() =>
        import('../app-update/app-update-gate').then((module) => ({
          default: module.AppUpdateGate,
        })),
      )
    : null;

// Start in the app asks for the permissions first; the web build never builds it.
const StartGate =
  import.meta.env.MODE === 'apk'
    ? lazy(() => import('../native/start-gate').then((module) => ({ default: module.StartGate })))
    : null;

interface ReadyScreenProps {
  earlierQuestion: EarlierQuestion | null;
  onStart: () => void;
  onOpenHistory: () => void;
  /** Opens Account from the Account tab; left out in a build with no accounts. */
  onOpenAccount?: () => void;
  /** The tab whose screen was open before this one: focus goes back to it. */
  backFrom: 'history' | 'account' | null;
  /** The ⓘ: opens the map's credits, the Map Data Source sheet. */
  onOpenCredits: () => void;
  /** The ⓘ, for focus to come back to when the credits close. */
  creditsButtonRef: Ref<HTMLButtonElement>;
  /** The ?: opens the tutorial, once there is one to open (HAS_TUTORIAL). */
  onOpenTutorial?: () => void;
}

// TODO: true once the tutorial screens exist: the ? at the top left (Figma 4520:3471) opens them.
// Until then nothing stands there, and nothing else moves for it: the ? is laid over the map.
const HAS_TUTORIAL = false;

/**
 * Before a recording, Figma's Record (4520:3197): at the foot, Start tracking over the Record,
 * History and Account tabs, on the map fading into white, and the map's ⓘ (4494:10300) in the
 * bottom left corner. The map-type and locator column stands at the right, 20 in and 24 over
 * Start tracking. The top left holds the tutorial's ?, once there is a tutorial (HAS_TUTORIAL).
 */
export function ReadyScreen({
  earlierQuestion,
  onStart,
  onOpenHistory,
  onOpenAccount,
  backFrom,
  onOpenCredits,
  creditsButtonRef,
  onOpenTutorial,
}: ReadyScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const historyRef = useRef<HTMLButtonElement>(null);
  const accountRef = useRef<HTMLButtonElement>(null);
  // Decided once, as the screen opens: a later change must not move focus again.
  const [focusTab] = useState(backFrom);
  useEffect(() => {
    const tabRefs = { history: historyRef, account: accountRef };
    ((focusTab && tabRefs[focusTab].current) ?? headingRef.current)?.focus();
  }, [focusTab]);
  const stackRef = useStackRoom();

  // Figma's Record stands the right-hand column 20 in and 24 over Start tracking.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--dock-right', '1.25rem');
    root.style.setProperty('--dock-gap', '1.5rem');
    return () => {
      root.style.removeProperty('--dock-right');
      root.style.removeProperty('--dock-gap');
    };
  }, []);
  const startBar = StartGate ? <StartGate onStart={onStart} /> : <StartBar onClick={onStart} />;

  return (
    <>
      {HAS_TUTORIAL && onOpenTutorial && (
        <div className="absolute top-[calc(env(safe-area-inset-top)+1.5rem)] left-5 z-20">
          <HelpButton onClick={onOpenTutorial} />
        </div>
      )}
      <section
        ref={stackRef}
        aria-labelledby={earlierQuestion ? undefined : 'ready-heading'}
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col"
      >
        {!earlierQuestion && (
          <h1 id="ready-heading" ref={headingRef} tabIndex={-1} className="sr-only">
            Record a route
          </h1>
        )}
        {/* The map fades into white under Start tracking and the tabs (Figma's Frame 393). The
            tabs stay over the question too: History and Account are always a tap away. */}
        <div className="relative flex flex-col gap-3 bg-linear-to-b from-transparent to-surface pb-[max(2rem,env(safe-area-inset-bottom))]">
          {/* Figma's ⓘ, 12 in from the frame's left and foot; lifted over the gesture bar where
              the phone has one, so the bar does not take its taps. */}
          <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-10 flex">
            <CreditsButton ref={creditsButtonRef} onClick={onOpenCredits} />
          </div>
          {/* Nothing stands in for Start while the app's gates load: a plain Start would skip the
              permissions. */}
          {!earlierQuestion && AppUpdateGate && (
            <Suspense fallback={null}>
              <AppUpdateGate>{startBar}</AppUpdateGate>
            </Suspense>
          )}
          {!earlierQuestion && !AppUpdateGate && startBar}
          <BottomToolbar
            historyRef={historyRef}
            accountRef={accountRef}
            onOpenHistory={onOpenHistory}
            onOpenAccount={onOpenAccount}
          />
        </div>
        {earlierQuestion && <EarlierRecordingsPanel {...earlierQuestion} />}
      </section>
    </>
  );
}
