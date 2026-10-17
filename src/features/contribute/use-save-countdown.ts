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
 * zero. `touch` starts the count again: any hand on the form calls it.
 */
export function useSaveCountdown(onExpire: () => void): SaveCountdown {
  const [secondsLeft, setSecondsLeft] = useState(SAVE_FORM_SECONDS);
  const lastTouch = useRef(0);
  const latestExpire = useRef(onExpire);
  const hasExpired = useRef(false);

  useEffect(() => {
    latestExpire.current = onExpire;
  });

  useEffect(() => {
    lastTouch.current = Date.now();
    const timer = setInterval(() => {
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
