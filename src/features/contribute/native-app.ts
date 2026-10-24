let isNative = false;

/**
 * Loads Capacitor's JavaScript in the Android app's build (`--mode apk`) and does nothing on
 * the web, whose bundle then carries none of it (check-build.mjs proves it). Android injects only
 * the low-level bridge (`window.androidBridge`); `window.Capacitor` and `registerPlugin` come
 * from this import, so the entry point waits for it before the page renders.
 */
export async function prepareNativeApp(): Promise<void> {
  if (import.meta.env.MODE !== 'apk') return;
  const { Capacitor } = await import('@capacitor/core');
  isNative = Capacitor.isNativePlatform();
}

/** Whether the page runs inside the Android app. */
export function isNativeApp(): boolean {
  return isNative;
}
