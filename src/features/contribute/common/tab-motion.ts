import './tab-motion.css';

/**
 * Where each screen sits in the toolbar's order, by its hash: Record (no hash), History, Account,
 * and Account settings inside Account. Moving to a higher one goes right, to a lower one left.
 */
const SCREEN_ORDER: Readonly<Record<string, number>> = {
  '': 0,
  '#history': 1,
  '#profile': 2,
  '#account-settings': 3,
};

/** How long a move waits for its screen to be drawn before it is shown anyway. */
const SETTLE_MS = 150;

/** How long after a move a screen that mounts still counts as arriving by it. */
const MOVE_MS = 500;

export type MotionDirection = 'forward' | 'back';

/** The owner's Motion tokens a move uses (tokens.css), by what moves. */
const MOTION_TOKENS = {
  /** A screen arriving. */
  arrive: ['--transition-duration-base', '--ease-enter'],
  /** Something already on screen changing place: the toolbar's pill, the Start pill opening. */
  move: ['--transition-duration-gentle', '--ease-move'],
  /** Something on its way out, quickly: Start tracking folding into its pill. */
  leave: ['--transition-duration-quick', '--ease-exit'],
} as const;

/**
 * A move's timing, read from the same Motion tokens tab-motion.css uses, so the script's
 * fallbacks and the view transitions can never part.
 */
export function motionOf(kind: keyof typeof MOTION_TOKENS): { duration: number; easing: string } {
  const style = getComputedStyle(document.documentElement);
  const [duration, easing] = MOTION_TOKENS[kind];
  return {
    duration: Number.parseFloat(style.getPropertyValue(duration)) || 0,
    easing: style.getPropertyValue(easing).trim() || 'ease-out',
  };
}

/** How far a screen slides on its way in, as tab-motion.css has it: `--tab-motion-shift`. */
export const tabShift = (sign: 1 | -1): string =>
  `translateX(calc(${sign} * ${getComputedStyle(document.documentElement).getPropertyValue('--tab-motion-shift').trim() || '0px'}))`;

/** Whether the person asked their phone for less motion: then screens and the pill just switch. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const directionOf = (from: string, to: string): MotionDirection | null => {
  const a = SCREEN_ORDER[from];
  const b = SCREEN_ORDER[to];
  if (a === undefined || b === undefined || a === b) return null;
  return b > a ? 'forward' : 'back';
};

/*
 * Every move between the screens, however it came (a tab, a button, the browser's Back), as the
 * hash changes: heard before the screens' own stores, as this module loads before them.
 */
let shownHash = window.location.hash;
let lastMove: { direction: MotionDirection; at: number } | null = null;
window.addEventListener('hashchange', () => {
  const direction = directionOf(shownHash, window.location.hash);
  shownHash = window.location.hash;
  lastMove = direction ? { direction, at: performance.now() } : null;
  // The view transition's slides read it (tab-motion.css).
  if (direction) document.documentElement.dataset.tabMotion = direction;
  else delete document.documentElement.dataset.tabMotion;
});

/** True while a view transition is drawing its new state: what mounts now, it shows moving. */
let isCapturing = false;

/**
 * The way a toolbar screen mounting now should come in, or null when it should just appear: no
 * move just now, less motion asked for, or a view transition already showing it come in.
 */
export function screenEntryDirection(): MotionDirection | null {
  if (!lastMove || isCapturing || prefersReducedMotion()) return null;
  return performance.now() - lastMove.at < MOVE_MS ? lastMove.direction : null;
}

/** Settles once the hash has changed and React has drawn the screen for it, or soon after. */
function hashSettled(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('hashchange', done);
      window.clearTimeout(timer);
      // React draws the screen in the task after the change.
      window.setTimeout(resolve, 0);
    };
    const timer = window.setTimeout(done, SETTLE_MS);
    window.addEventListener('hashchange', done);
  });
}

let running: ViewTransition | null = null;

/**
 * Moves between the toolbar's screens with `change`, which changes the URL's hash, when
 * `willChange` says it would. Where the browser can, the move is a view transition: the screen over the map slides
 * the way the tabs run, a short way, and fades, while the map stays put (tab-motion.css). A move during
 * another skips the first to its end, so a second tap always lands where it points. Nothing waits
 * on it: focus and input go to the new screen as it is drawn.
 */
export function moveBetweenScreens(willChange: () => boolean, change: () => void): void {
  running?.skipTransition();
  // No slide left over from the last move; this one's way is set as its hash changes.
  delete document.documentElement.dataset.tabMotion;
  // Nothing to move to (the screen already showing, a second tap): nothing to show.
  if (!willChange()) return;
  if (!('startViewTransition' in document) || prefersReducedMotion()) {
    change();
    return;
  }
  const transition = document.startViewTransition(async () => {
    // Listened for from before the change: replacing the URL tells the screens at once.
    const settled = hashSettled();
    isCapturing = true;
    try {
      change();
      await settled;
    } finally {
      isCapturing = false;
    }
  });
  running = transition;
  // A move skipped by the next one rejects its `ready` with AbortError: that is the skip itself.
  transition.ready.catch((error: unknown) => {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    console.warn(
      'The move between screens could not be shown; the screen changed all the same.',
      error,
    );
  });
  void transition.finished.finally(() => {
    if (running === transition) running = null;
  });
}
