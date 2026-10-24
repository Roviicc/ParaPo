import { useSyncExternalStore } from 'react';

export interface HashView {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

/**
 * A screen that shows while the URL's hash is `hash`, so a reload stays on it and the browser's
 * Back returns to the screen under it. A hash never reaches the service worker, which answers
 * the page by its path alone. Each screen has its own store; the hook is made once per screen.
 */
export function createHashView(hash: string): () => HashView {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  // Whether opening the screen added a history entry this page load, so the in-page back button
  // can pop it. After a reload there is none to pop: Back would leave the page.
  let hasPushedEntry = false;

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    window.addEventListener('hashchange', listener);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('hashchange', listener);
    };
  };

  const isOpenNow = (): boolean => window.location.hash === hash;

  const open = () => {
    if (isOpenNow()) return;
    hasPushedEntry = true;
    window.location.hash = hash;
  };

  const close = () => {
    if (!isOpenNow()) return;
    if (hasPushedEntry) {
      hasPushedEntry = false;
      window.history.back();
      return;
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    notify();
  };

  function useHashView(): HashView {
    const isOpen = useSyncExternalStore(subscribe, isOpenNow);
    return { isOpen, open, close };
  }
  return useHashView;
}
