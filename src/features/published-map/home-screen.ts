import { useSyncExternalStore } from 'react';

/**
 * The iPhone's side of the install prompt: an iPhone or iPad that has not put
 * Para Po on its home screen yet. Safari on iOS has no install a page can
 * start (no `beforeinstallprompt`, install-offer.ts): the visitor taps Share,
 * then "Add to Home Screen", themselves. So there is no offer to hold, only
 * the device to recognise.
 *
 * Written 2026-10-13, ahead of its design: what the card says, and in which
 * browsers it shows, are the owner's to draw. So this reports the browser
 * rather than deciding — Safari, another browser (Chrome, Edge and Firefox on
 * iOS add to the home screen from their own Share menus since iOS 16.4), or an
 * app's built-in browser (Facebook, Messenger, Instagram), which cannot add to
 * the home screen at all and can only hand the page to Safari.
 */

export type HomeScreenBrowser = 'safari' | 'other-browser' | 'in-app';

/** What the browser says about itself, read once from `navigator` and `matchMedia`. */
export interface Device {
  userAgent: string;
  maxTouchPoints: number;
  /** Safari's own `navigator.standalone`: true when opened from the home screen. */
  isStandalone: boolean;
  /** `(display-mode: standalone)`: the manifest's display, when opened as the app. */
  isDisplayStandalone: boolean;
}

const IPHONE = /iPhone|iPod|iPad/;
// iPadOS 13 on asks for the desktop site and says "Macintosh"; a Mac has no touch screen.
const MAC = /Macintosh/;
const IN_APP = /FBAN|FBAV|Instagram|Line\/|musical_ly|BytedanceWebview/;
const OTHER_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS/;

/** True on an iPhone or iPad, including an iPad that asks for the desktop site. */
export function isAppleTouchDevice(device: Device): boolean {
  if (IPHONE.test(device.userAgent)) return true;
  return MAC.test(device.userAgent) && device.maxTouchPoints > 1;
}

/**
 * The browser Para Po could be added to the home screen from, or null: not an
 * iPhone or iPad, or already opened from the home screen.
 */
export function homeScreenBrowserOf(device: Device): HomeScreenBrowser | null {
  if (!isAppleTouchDevice(device)) return null;
  if (device.isStandalone || device.isDisplayStandalone) return null;
  if (IN_APP.test(device.userAgent)) return 'in-app';
  if (OTHER_BROWSER.test(device.userAgent)) return 'other-browser';
  return 'safari';
}

const STANDALONE = '(display-mode: standalone)';

const standaloneQuery = (): MediaQueryList | null =>
  typeof window.matchMedia === 'function' ? window.matchMedia(STANDALONE) : null;

const readDevice = (): Device => ({
  userAgent: navigator.userAgent,
  maxTouchPoints: navigator.maxTouchPoints,
  // Only Safari has it; TypeScript's DOM types do not.
  isStandalone: 'standalone' in navigator && navigator.standalone === true,
  isDisplayStandalone: standaloneQuery()?.matches ?? false,
});

// The display mode is the one part that can change while the page is open.
const subscribe = (listener: () => void) => {
  const query = standaloneQuery();
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
};

/** The browser to add Para Po to the home screen from, on an iPhone or iPad not added yet. */
export function useHomeScreenOffer(): HomeScreenBrowser | null {
  return useSyncExternalStore(
    subscribe,
    () => homeScreenBrowserOf(readDevice()),
    () => null,
  );
}
