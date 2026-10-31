import { useEffect, useId, useRef } from 'react';

import { Button } from '@/design-system/primitives/button';
import { useEscape } from '@/shared/hooks/use-escape';
import { cn } from '@/shared/utils/cn';

import stopHand from './stop-hand.svg';
import { distanceFigure, timeFigure, type Figure } from '../common/format';
import type { RecordingFigures } from '../recorder/recording-figures';

interface StopRecordingScreenProps {
  /** The recording so far, live: it is paused under this screen. */
  figures: RecordingFigures;
  /** Keep recording, and Escape: back to the recording as it was before ✕. */
  onKeep: () => void;
  /**
   * The safe answer's words: "Keep recording" over a recording; "Keep it" over the Save form,
   * whose Discard asks the same question and goes back to the form.
   */
  keepLabel?: string;
  /** Stop without saving: the recording is thrown away. */
  onStop: () => void;
}

/**
 * Figma's Stopping (4501:19658): ✕ asks over the whole screen, frosted white over the recording
 * paused under it. The hand, the question with the distance recorded so far, Keep recording and
 * Stop without saving; at the foot, "Recording Paused" with its time and distance.
 *
 * An alertdialog: focus starts on Keep recording and goes round inside it, Escape keeps
 * recording, and the page under it is inert (the page's).
 *
 * The question stands 40 over the screen's middle, as the frame has it, and the paused figures at
 * its foot. Where they do not both fit (a short phone, a phone on its side) the whole screen
 * scrolls, the figures last, as the owner chose.
 */
export function StopRecordingScreen({
  figures,
  onKeep,
  keepLabel = 'Keep recording',
  onStop,
}: StopRecordingScreenProps) {
  const screenRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const textId = useId();
  useEscape(onKeep);

  // Focus on the safe answer as it opens, and Tab round inside.
  useEffect(() => {
    const screen = screenRef.current;
    if (!screen) return;
    screen.querySelector('button')?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const buttons = [...screen.querySelectorAll('button')];
      const first = buttons.at(0);
      const last = buttons.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    screen.addEventListener('keydown', handleKeyDown);
    return () => screen.removeEventListener('keydown', handleKeyDown);
  }, []);

  const distance = distanceFigure(figures.distanceM);

  return (
    <div
      ref={screenRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={textId}
      className="absolute inset-0 z-50 overflow-y-auto bg-surface/80 font-sn-pro backdrop-blur-md motion-safe:animate-fade-in"
    >
      {/* The room above the question and the room below it grow alike, the room below from 80:
          so the question's middle is 40 over the screen's. Short of room, the space above gives
          way first, keeping 24 between the question and the figures, then the screen scrolls. */}
      <div className="flex min-h-full flex-col">
        <div className="min-h-5 grow" />
        <div data-testid="stop-question" className="flex flex-col gap-12 px-5">
          <div className="flex flex-col items-center gap-4 text-center">
            <img src={stopHand} alt="" className="size-20" />
            <div className="flex flex-col gap-2">
              <h2 id={titleId} className="text-2xl/8 font-semibold text-content-primary">
                Stop and delete this ride?
              </h2>
              <p id={textId} className="text-base/6 text-content-quaternary">
                You’ve recorded {distance.value} {distance.unit} so far. It will be lost if you
                leave now.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Button variant="primary" label={keepLabel} onClick={onKeep} />
            <Button variant="error" label="Stop without saving" onClick={onStop} />
          </div>
        </div>
        <div className="flex grow basis-20 flex-col justify-end pt-6">
          <div data-testid="stop-paused" className="flex flex-col items-center gap-4 px-5 pb-12">
            <p className="text-2xl/8 font-semibold text-content-disabled">Recording Paused</p>
            <dl className="flex w-full gap-2">
              <PausedFigure figure={timeFigure(figures.elapsedSeconds)} name="Time" />
              <PausedFigure figure={distance} name="Distance" isEnd />
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PausedFigureProps {
  figure: Figure;
  name: string;
  /** Distance, at the right: its words right-aligned. */
  isEnd?: boolean;
}

/** One of the paused recording's figures: the number, its unit greyed, and its name under it. */
function PausedFigure({ figure, name, isEnd = false }: PausedFigureProps) {
  return (
    <div className={cn('flex min-w-0 flex-1 flex-col-reverse', isEnd && 'text-right')}>
      <dt className="text-sm/5 text-content-quaternary">{name}</dt>
      <dd className="text-2xl/8 font-semibold text-content-primary">
        {figure.value} <span className="text-content-quaternary">{figure.unit}</span>
      </dd>
    </div>
  );
}
