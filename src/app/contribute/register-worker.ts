import { hasOpenRecording, isNativeApp } from '@/features/contribute';

const WORKER_URL = '/contribute/sw.js';
const SCOPE = '/contribute/';
/** How often a waiting update looks again for a moment with no recording open. */
const RETRY_MS = 30_000;

// Set once this page has told a waiting worker to take over, so the page reloads for that
// update and not for the first worker, which claims the page on a first visit.
let isApplying = false;

/**
 * Sends the waiting worker on its way if no recording is open. Whether to reload is asked
 * again when it takes over (see `listenForTakeover`).
 */
async function applyIfIdle(registration: ServiceWorkerRegistration): Promise<boolean> {
  const waiting = registration.waiting;
  if (!waiting) return true;
  if (await hasOpenRecording()) return false;
  isApplying = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

function applyWhenIdle(registration: ServiceWorkerRegistration): void {
  const attempt = () =>
    void applyIfIdle(registration).then((isDone) => {
      if (isDone) window.clearInterval(timer);
    });
  const timer = window.setInterval(attempt, RETRY_MS);
  attempt();
}

function listenForTakeover(): void {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!isApplying) return;
    // The new files are about to replace the ones this page loaded; a recording that
    // opened in between keeps this page as it is.
    void hasOpenRecording().then((isOpen) => {
      if (!isOpen) window.location.reload();
    });
  });
}

function watchForUpdates(registration: ServiceWorkerRegistration): void {
  applyWhenIdle(registration);
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed') applyWhenIdle(registration);
    });
  });
}

async function register(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.register(WORKER_URL, { scope: SCOPE });
    watchForUpdates(registration);
  } catch (error) {
    console.error('The contributor page could not be set up to open with no signal.', error);
  }
}

/**
 * Registers the contributor page's own service worker, so the page opens and records with no
 * signal after one visit. Production builds only: the file does not exist under `npm run dev`,
 * where the headless checks must never meet a worker. Waits for the page's load so the worker's
 * downloads never compete with the page opening. A new version waits until no recording is
 * open, then takes over and the page reloads once.
 */
export function registerContributeWorker(): void {
  // The app carries its own files, so it has no worker.
  if (!import.meta.env.PROD || isNativeApp() || !('serviceWorker' in navigator)) return;
  listenForTakeover();
  if (document.readyState === 'complete') {
    void register();
  } else {
    window.addEventListener('load', () => void register(), { once: true });
  }
}
