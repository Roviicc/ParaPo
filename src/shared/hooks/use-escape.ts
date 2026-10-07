import { useEffect } from 'react';

/**
 * Escape does what ✕ does, as it does on any dialog — while `active`: a card
 * kept but hidden (a hotspot's under the trip it opened, the route list under
 * a trip) leaves Escape to the card over it. One hook for every card that
 * closes on it; Sheet and BottomSheet each had a copy (the review's 6.5).
 */
export function useEscape(onEscape: () => void, active = true): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onEscape, active]);
}
