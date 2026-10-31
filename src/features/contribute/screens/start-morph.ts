import { motionOf, prefersReducedMotion } from '../common/tab-motion';

/** The attribute Start tracking carries (start-bar.tsx): where the morph begins. */
export const START_BUTTON_ATTR = 'data-start-tracking';
/** The attribute the recording card's place carries (recording-screen.tsx): where it ends. */
export const RECORDING_CARD_ATTR = 'data-recording-card';
/** The ghost's own attribute, so a suite can find it while it runs. */
export const START_MORPH_ATTR = 'data-start-morph';

/** How long, after the fold, the morph waits for the card to be drawn before it gives up. */
const CARD_WAIT_MS = 300;
/** Start tracking's radius (rounded-full at 48 tall) and the card's (rounded-4xl). */
const PILL_RADIUS_PX = 24;
const CARD_RADIUS_PX = 32;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const boxOf = (el: Element): Box => {
  const { left, top, width, height } = el.getBoundingClientRect();
  return { left, top, width, height };
};

/** `inner` inside `outer` as clip-path's inset(), rounded at `radius`. */
const insetOf = (outer: Box, inner: Box, radius: number): string =>
  `inset(${inner.top - outer.top}px ${outer.left + outer.width - inner.left - inner.width}px ` +
  `${outer.top + outer.height - inner.top - inner.height}px ${inner.left - outer.left}px ` +
  `round ${radius}px)`;

const place = (el: HTMLElement, box: Box) => {
  el.style.position = 'fixed';
  el.style.left = `${box.left}px`;
  el.style.top = `${box.top}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
};

/** Holds `el` at opacity 0 until the returned function lets it go: no inline style is left. */
const hide = (el: Element): (() => void) => {
  const hold = el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'forwards' });
  return () => hold.cancel();
};

/** A copy of `el` for the ghost to draw: never focused, never read out, never pressed. */
const copyOf = (el: HTMLElement): HTMLElement => {
  const copy = el.cloneNode(true);
  if (!(copy instanceof HTMLElement)) throw new Error('A copy of an element is an element.');
  copy.removeAttribute('id');
  copy.removeAttribute(START_BUTTON_ATTR);
  copy.removeAttribute(RECORDING_CARD_ATTR);
  copy.setAttribute('aria-hidden', 'true');
  copy.inert = true;
  return copy;
};

/**
 * The card's place as soon as it is drawn and shown, hidden from that very frame (`showCard` lets
 * it go), or null if it is not there within `waitMs`.
 */
function cardDrawn(waitMs: number): Promise<{ card: HTMLElement; showCard: () => void } | null> {
  const giveUpAt = performance.now() + waitMs;
  return new Promise((resolve) => {
    const look = () => {
      const card = document.querySelector<HTMLElement>(`[${RECORDING_CARD_ATTR}]`);
      if (card && card.getBoundingClientRect().height > 0) resolve({ card, showCard: hide(card) });
      else if (performance.now() >= giveUpAt) resolve(null);
      else requestAnimationFrame(look);
    };
    look();
  });
}

/**
 * Start tracking becoming the recording card (Record, 4520:3197, to Recording): its words and
 * icon fade as it folds from the left into a pill at its right end (duration-quick, ease-exit),
 * then the pill opens into the card in the card's own place (duration-gentle, ease-move), the
 * brand's colour giving way to the card. About 450 ms in all.
 *
 * Called as the tap starts the recording, never before it: the recording is not held for it.
 * One surface does it all, a ghost over the page that takes no taps: what it covers works under
 * it, so Pause can be pressed mid-way. Transform-free: clip-path and opacity only. If the start
 * failed (the button is still there and no card comes), the pill opens back into the button.
 * With reduced motion the card only fades in, quickly.
 */
export function morphStartIntoCard(button: HTMLElement): void {
  if (prefersReducedMotion()) {
    const quick = motionOf('leave');
    void cardDrawn(CARD_WAIT_MS).then((drawn) => {
      if (!drawn) return;
      drawn.showCard();
      drawn.card.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: quick.duration,
        easing: 'linear',
      });
    });
    return;
  }
  const fold = motionOf('leave');
  const open = motionOf('move');
  const from = boxOf(button);
  const pill: Box = {
    left: from.left + from.width - from.height,
    top: from.top,
    width: from.height,
    height: from.height,
  };

  const ghost = document.createElement('div');
  ghost.setAttribute(START_MORPH_ATTR, '');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.pointerEvents = 'none';
  ghost.style.zIndex = '25';
  place(ghost, from);
  const face = copyOf(button);
  place(face, { left: 0, top: 0, width: from.width, height: from.height });
  face.style.position = 'absolute';
  // The words and icon, wrapped so they fade while the button's colour stays.
  const words = document.createElement('span');
  words.style.display = 'contents';
  words.append(...face.childNodes);
  const wordsBox = document.createElement('span');
  wordsBox.className = 'flex items-center justify-center gap-1';
  wordsBox.append(words);
  face.append(wordsBox);
  ghost.append(face);
  document.body.append(ghost);
  const showButton = hide(button);

  const finish = (showCard?: () => void) => {
    ghost.remove();
    showButton();
    showCard?.();
  };

  const folding = ghost.animate(
    [
      { clipPath: insetOf(from, from, PILL_RADIUS_PX) },
      { clipPath: insetOf(from, pill, PILL_RADIUS_PX) },
    ],
    { duration: fold.duration, easing: fold.easing, fill: 'forwards' },
  );
  wordsBox.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: fold.duration,
    easing: fold.easing,
    fill: 'forwards',
  });

  // Watched for from the tap, so the card is hidden under the ghost from the frame it is drawn.
  void Promise.all([folding.finished, cardDrawn(fold.duration + CARD_WAIT_MS)]).then(
    ([, drawn]) => {
      if (!drawn) {
        if (!button.isConnected) {
          finish();
          return;
        }
        // The start did not happen: the pill opens back into the button, its words back.
        const back = ghost.animate(
          [
            { clipPath: insetOf(from, pill, PILL_RADIUS_PX) },
            { clipPath: insetOf(from, from, PILL_RADIUS_PX) },
          ],
          { duration: fold.duration, easing: open.easing, fill: 'forwards' },
        );
        wordsBox.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: fold.duration,
          fill: 'forwards',
        });
        void back.finished.then(
          () => finish(),
          () => finish(),
        );
        return;
      }

      const { card, showCard } = drawn;
      const to = boxOf(card);
      // One box round the pill and the card, so both are insets of it.
      const left = Math.min(pill.left, to.left);
      const top = Math.min(pill.top, to.top);
      const room: Box = {
        left,
        top,
        width: Math.max(pill.left + pill.width, to.left + to.width) - left,
        height: Math.max(pill.top + pill.height, to.top + to.height) - top,
      };
      const brand = document.createElement('div');
      brand.className = 'absolute inset-0 bg-brand-surface';
      const cardFace = copyOf(card);
      place(cardFace, {
        left: to.left - room.left,
        top: to.top - room.top,
        width: to.width,
        height: to.height,
      });
      cardFace.style.position = 'absolute';
      cardFace.style.opacity = '0';
      folding.cancel();
      ghost.replaceChildren(brand, cardFace);
      place(ghost, room);

      const timing = { duration: open.duration, easing: open.easing, fill: 'forwards' } as const;
      const opening = ghost.animate(
        [
          { clipPath: insetOf(room, pill, PILL_RADIUS_PX) },
          { clipPath: insetOf(room, to, CARD_RADIUS_PX) },
        ],
        timing,
      );
      brand.animate([{ opacity: 1 }, { opacity: 0 }], timing);
      cardFace.animate([{ opacity: 0 }, { opacity: 1 }], timing);
      void opening.finished.then(
        () => finish(showCard),
        () => finish(showCard),
      );
    },
  );
}
