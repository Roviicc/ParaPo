import { useEffect, useRef } from 'react';

/** A ref for a screen's heading, which takes focus as the screen opens so a screen reader starts at its top. */
export function useFocusHeading() {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return ref;
}
