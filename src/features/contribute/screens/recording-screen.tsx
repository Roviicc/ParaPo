import { useEffect, useId, useRef, type Ref } from 'react';

import { IconButton } from '@/design-system/primitives/icon-button';
import { CloseIcon } from '@/shared/ui/route-icons';
import { cn } from '@/shared/utils/cn';

import { FoldButton } from './fold-button';
import { RecordingCard, type RecordingCardState } from './recording-card';
import { RecordingTint } from './recording-tint';
import { TrackingButton } from './tracking-button';
import { useStackRoom } from '../common/use-stack-room';
import { CreditsButton } from '../map/credits-button';
import type { RecordingFigures } from '../recorder/recording-figures';
import type { Mode } from '../recorder/recording-rules';

interface RecordingScreenProps {
  figures: RecordingFigures;
  mode: Mode;
  /** Paused for now: Resume and Finish replace Pause and the mode button. */
  isPaused: boolean;
  /** Whether the screen is being kept awake. */
  isAwake: boolean;
  /** Focus the Pause bar as the screen opens, not its heading: back from Keep recording. */
  shouldFocusPause: boolean;
  onPause: () => void;
  onResume: () => void;
  onModeSwitch: () => void;
  /** Ends the recording and opens the Save form. */
  onFinish: () => void;
  /** ✕: pauses the recording and asks, over the whole screen, whether to throw it away. */
  onAskToStop: () => void;
  /** ✕, for focus to come back to when the question is answered Keep recording. */
  discardButtonRef: Ref<HTMLButtonElement>;
  /** The card folded away: the map has the screen, and the recording goes on. */
  isCardFolded: boolean;
  onCardFoldedChange: (isFolded: boolean) => void;
  /** The ⓘ: opens the map's credits, the Map Data Source sheet. */
  onOpenCredits: () => void;
  /** The ⓘ, for focus to come back to when the credits close. */
  creditsButtonRef: Ref<HTMLButtonElement>;
}

const CARD_STATE = { walk: 'lakad', ride: 'sakay' } satisfies Record<Mode, RecordingCardState>;

/**
 * While recording, or paused (Figma's "Recording" frames 4494:2038, 4494:2134
 * and 4494:2233): the map's edges tinted for the state, ✕ at the top left, the
 * recording card with Pause and the mode button, or Resume and Finish, 20 in
 * and 40 over the screen's foot, and the map's ⓘ under it. A chevron over the
 * card's left folds it away (4496:10784, 4496:10906): the right-hand column
 * slides down to where the card was, and the chevron, turned up, brings it back.
 */
export function RecordingScreen({
  figures,
  mode,
  isPaused,
  isAwake,
  shouldFocusPause,
  onPause,
  onResume,
  onModeSwitch,
  onFinish,
  onAskToStop,
  discardButtonRef,
  isCardFolded,
  onCardFoldedChange,
  onOpenCredits,
  creditsButtonRef,
}: RecordingScreenProps) {
  const cardId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stackRef = useStackRoom();
  const pauseRef = useRef<HTMLButtonElement>(null);
  // The heading takes focus as the screen opens, a screen reader starting at its top; back from
  // Keep recording it is the Pause bar, where the contributor was before, unless the card is
  // folded away with it.
  useEffect(() => {
    (shouldFocusPause && !isCardFolded ? pauseRef.current : headingRef.current)?.focus();
    // Once, as the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a change of the prop alone must not move focus
  }, []);
  const state: RecordingCardState = isPaused ? 'paused' : CARD_STATE[mode];

  // The recording frames stand the right-hand column 20 in, where Start keeps 16.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--dock-right', '1.25rem');
    return () => {
      root.style.removeProperty('--dock-right');
    };
  }, []);

  return (
    <>
      <RecordingTint state={state} />
      <div className="absolute top-0 left-0 z-30 pt-[calc(env(safe-area-inset-top)+1.0625rem)] pl-[max(1.25rem,env(safe-area-inset-left))]">
        <IconButton
          tooltip="top"
          size="large"
          label="Discard recording"
          icon={<CloseIcon />}
          ref={discardButtonRef}
          onClick={onAskToStop}
        />
      </div>
      <FoldButton isFolded={isCardFolded} controls={cardId} onFoldedChange={onCardFoldedChange} />
      <section
        ref={stackRef}
        aria-labelledby="recording-heading"
        // The stack takes no taps itself, only what it holds: its padding is the map's, and
        // the ⓘ's under it.
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 px-5 *:pointer-events-auto',
          // Open, the card stands 40 over the screen's foot; folded, the column does, its 16 over
          // the stack taken off.
          isCardFolded
            ? 'pb-[calc(max(2.125rem,env(safe-area-inset-bottom))-0.625rem)]'
            : 'pb-[calc(0.375rem+max(2.125rem,env(safe-area-inset-bottom)))]',
        )}
      >
        <h1 id="recording-heading" ref={headingRef} tabIndex={-1} className="sr-only">
          {isPaused ? 'Recording paused' : 'Recording a route'}
        </h1>
        {!isAwake && !isPaused && (
          <p className="bg-surface p-2 font-sn-pro text-sm/5 text-content-primary">
            The screen could not be kept awake, so it may sleep and the location may stop.
          </p>
        )}
        <div id={cardId} hidden={isCardFolded} data-recording-card>
          <RecordingCard
            elapsedSeconds={figures.elapsedSeconds}
            distanceM={figures.distanceM}
            state={state}
          >
            {isPaused ? (
              <>
                <TrackingButton variant="resume" corner="bottom-left" onClick={onResume} />
                <TrackingButton variant="finish" corner="bottom-right" onClick={onFinish} />
              </>
            ) : (
              <>
                <TrackingButton
                  ref={pauseRef}
                  variant="pause"
                  corner="bottom-left"
                  onClick={onPause}
                />
                <TrackingButton
                  variant={mode === 'walk' ? 'sakay' : 'lakad'}
                  corner="bottom-right"
                  onClick={onModeSwitch}
                />
              </>
            )}
          </RecordingCard>
        </div>
      </section>
      {/* Figma's ⓘ, 12 in from the frame's left and foot, over the stack's padding; lifted over
          the gesture bar where the phone has one, so the bar does not take its taps. */}
      <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-20 flex">
        <CreditsButton ref={creditsButtonRef} onClick={onOpenCredits} />
      </div>
    </>
  );
}
