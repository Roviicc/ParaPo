import { useEffect, useState } from 'react';

/**
 * A callback ref for the stack of bars along the bottom of the screen. Its
 * height is kept in `--stack-room` on the page, which contribute.css lifts the
 * map's bottom corners by, so the credits and the scale stay above the bars.
 * A callback ref, so a stack that appears later (Start, after the first-visit
 * panel) is measured as it arrives.
 */
export function useStackRoom(): (stack: HTMLElement | null) => void {
  const [stack, setStack] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!stack) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty('--stack-room', `${stack.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stack);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--stack-room');
    };
  }, [stack]);
  return setStack;
}
