import { useEffect, type RefObject } from 'react';

/**
 * Focus into a card when it is shown, and back to where it was when it goes:
 * the cards are dialogs to a screen reader, and one that opened and closed
 * with the focus left on the map behind it could not be found by keyboard
 * (the review's 3c). The card is focused itself, not its first control, so
 * nothing is pressed by accident and nothing scrolls; a card kept but hidden
 * (a hotspot under the trip it opened) gives the focus up until it is shown
 * again.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, hidden: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (hidden || !el) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
    return () => {
      // Only when the focus is still ours to give back: a tap elsewhere
      // already moved it where the visitor wanted it.
      const now = document.activeElement;
      if ((now === null || now === document.body || el.contains(now)) && before?.isConnected)
        before.focus({ preventScroll: true });
    };
  }, [ref, hidden]);
}
