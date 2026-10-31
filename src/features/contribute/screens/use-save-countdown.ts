import { useEffect, useRef, useState } from 'react';

/** How long the Save form waits for a hand before it saves the recording with what was typed. */
export const SAVE_FORM_SECONDS = 120;

interface SaveCountdown {
  secondsLeft: number;
  /** Starts the two minutes again. */
  touch: () => void;
}

/**
 * Counts down from SAVE_FORM_SECONDS and calls `onExpire` once it reaches
 * zero. `touch` starts the count again: any hand on the form calls it. While
 * `isHeld` (a sheet or a question open over the form) the count stays full:
 * the form never saves itself under something the contributor is answering.
 */
export function useSaveCountdown(onExpire: () => void, isHeld = false): SaveCountdown {
  const [secondsLeft, setSecondsLeft] = useState(SAVE_FORM_SECONDS);
  const lastTouch = useRef(0);
  const latestExpire = useRef(onExpire);
  const hasExpired = useRef(false);
  const isHeldNow = useRef(isHeld);

  useEffect(() => {
    latestExpire.current = onExpire;
    isHeldNow.current = isHeld;
  });

  useEffect(() => {
    lastTouch.current = Date.now();
    const timer = setInterval(() => {
      if (isHeldNow.current) lastTouch.current = Date.now();
      const left = SAVE_FORM_SECONDS - (Date.now() - lastTouch.current) / 1000;
      setSecondsLeft(Math.max(0, left));
      if (left <= 0 && !hasExpired.current) {
        hasExpired.current = true;
        latestExpire.current();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const touch = () => {
    lastTouch.current = Date.now();
    setSecondsLeft(SAVE_FORM_SECONDS);
  };

  return { secondsLeft, touch };
}
