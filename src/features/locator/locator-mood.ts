import { useCallback, useEffect, useRef, useState } from 'react';

import { STILL_BELOW_MPS, type Camera, type Fix } from './use-locator';

/*
 * The visitor's dot has moods (the owner's ask, 2026-10-01: "add other
 * emotion ... sad, angry, happy"; sad since dropped, "we remove the sad, only
 * neutral, happy and angry"): glad as the visitor arrives or moves, a
 * reaction to a tap, and left to itself its mood swings; and neutral and
 * happy have several faces each, so it never reads as one loop (the owner's
 * "make more faces reaction to that"). The faces are drawn in locator.css.
 */

export type Mood = 'neutral' | 'happy' | 'angry';

/** One face of a mood: what locator.css draws for `data-face`. */
export type Face =
  | 'glance'
  | 'curious'
  | 'wink'
  | 'surprised'
  | 'sleepy'
  | 'smile'
  | 'hop'
  | 'squee'
  | 'wink-smile'
  | 'glare'
  | 'boing'
  | 'huff';

/** Taps on the LocatorButton this close together, three of them, make it cross. */
export const ANGRY_TAPS = 3;
export const ANGRY_WITHIN_MS = 2000;
/** …and it stays cross this long after the third. */
export const ANGRY_FOR_MS = 3000;
/**
 * A tap on the LocatorButton gets a reaction, this long (the owner's ask,
 * 2026-10-01: "if the user tapped the locator it should be happy then
 * sometimes angry, make an animation for it"): glad, a boing; now and then,
 * one tap in ANGRY_ODDS, cross, a huff. Never cross at the first tap.
 */
export const REACT_FOR_MS = 2500;
export const ANGRY_ODDS = 4;

/** How the dot takes a tap: the `count`th (from 1), with `roll` a random number in [0, 1). */
export function reactionTo(count: number, roll: number): 'happy' | 'angry' {
  return count > 1 && roll < 1 / ANGRY_ODDS ? 'angry' : 'happy';
}

/** Happy this long when the location first comes, or the camera arrives on the visitor. */
export const HAPPY_FOR_MS = 3000;
/** Happy on the move from walking pace up, in metres a second. */
export const MOVING_FROM_MPS = 1;
/** Sleepy, a neutral face, after standing still this long. */
export const SLEEPY_AFTER_MS = 60_000;

/**
 * With nothing going on, the dot's mood swings (the owner's ask, 2026-10-01:
 * "back and forth between neutral and happy ... then sometimes sad and
 * angry"): a face every AMBIENT_EVERY_MS from this list, half of them
 * neutral, nearly all the rest happy, one in forty cross — for one turn
 * only, where a run of taps holds cross as long as it lasts, so that one
 * still reads as real (halved from one in twenty at the owner's "make
 * neutral and happy more", the same day; sad dropped later that day).
 */
const AMBIENT_EVERY_MS = 5000;
const NEUTRAL_SWINGS = [
  'glance',
  'glance',
  'glance',
  'glance',
  'glance',
  'glance',
  'curious',
  'curious',
  'wink',
  'surprised',
] as const;
const HAPPY_SWINGS = [
  'smile',
  'smile',
  'hop',
  'hop',
  'squee',
  'wink-smile',
  'wink-smile',
  'smile',
  'hop',
] as const;
const AMBIENT: readonly Face[] = [
  ...NEUTRAL_SWINGS,
  ...NEUTRAL_SWINGS,
  ...HAPPY_SWINGS,
  ...HAPPY_SWINGS,
  'glare',
];

/** The mood each face wears: what `data-mood` says, for its breathing. */
export const MOOD_OF: Record<Face, Mood> = {
  glance: 'neutral',
  curious: 'neutral',
  wink: 'neutral',
  surprised: 'neutral',
  sleepy: 'neutral',
  smile: 'happy',
  hop: 'happy',
  squee: 'happy',
  'wink-smile': 'happy',
  boing: 'happy',
  glare: 'angry',
  huff: 'angry',
};
/** Happy changes face more often: it is short-lived, or the visitor is moving. */
const HAPPY_EVERY_MS = 2500;
const HAPPY: readonly Face[] = ['smile', 'hop', 'squee', 'wink-smile'];

export type Signals = {
  now: number;
  fix: Pick<Fix, 'accuracy' | 'speed' | 'time'> | null;
  /** When the location first came, or the camera last arrived on the visitor. */
  arrivedAt: number | null;
  /** When the LocatorButton was tapped, oldest first. */
  taps: readonly number[];
  /** The last tap's reaction, and when (reactionTo). */
  reaction?: { at: number; mood: 'happy' | 'angry' } | null;
};

/** Whether a tap's reaction is showing at `now`. */
export const reacting = ({ now, reaction }: Pick<Signals, 'now' | 'reaction'>): boolean =>
  !!reaction && now >= reaction.at && now - reaction.at < REACT_FOR_MS;

/** Whether a run of ANGRY_TAPS quick taps has the dot cross at `now`. */
export function inATemper({ now, taps }: Pick<Signals, 'now' | 'taps'>): boolean {
  for (let i = ANGRY_TAPS - 1; i < taps.length; i++) {
    const third = taps[i];
    if (
      third - taps[i - ANGRY_TAPS + 1] <= ANGRY_WITHIN_MS &&
      now - third < ANGRY_FOR_MS &&
      now >= third
    )
      return true;
  }
  return false;
}

/**
 * The mood for these signals, the strongest first: cross at a run of taps,
 * then a tap's own reaction, then glad as the visitor arrives, then glad on
 * the move. Never low for the location itself: an old fix (a browser sends
 * none while the visitor stands still) or a rough one (common indoors) made
 * it sad most of the time (the owner, 2026-10-01: "can we drop the bad
 * location for now"), and sad is gone altogether.
 */
export function moodAt(s: Signals): Mood {
  const { now, fix, arrivedAt } = s;
  if (inATemper(s)) return 'angry';
  if (reacting(s)) return s.reaction!.mood;
  if (arrivedAt !== null && now >= arrivedAt && now - arrivedAt < HAPPY_FOR_MS) return 'happy';
  if (fix && fix.speed >= MOVING_FROM_MPS) return 'happy';
  return 'neutral';
}

/** A small, steady hash: the same slot always shows the same face, slots differ unpredictably. */
function pick<T>(list: readonly T[], slot: number): T {
  const h = Math.imul(slot ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return list[((h ^ (h >>> 13)) >>> 0) % list.length];
}

/**
 * The face for a mood at `now`. Neutral is the dot left to itself: its mood
 * swings (AMBIENT), and it dozes after `stillFor` ms standing still.
 * `tapped`: the mood is a tap's reaction — a boing, or a huff. `taps`: how
 * many times it has been tapped; each tap rolls its swings afresh, so after
 * the reaction it comes back in another mood (the owner, 2026-10-01:
 * "tapping may change the mood").
 */
export function faceFor(mood: Mood, now: number, stillFor: number, tapped = false, taps = 0): Face {
  if (tapped && mood === 'happy') return 'boing';
  if (tapped && mood === 'angry') return 'huff';
  switch (mood) {
    case 'angry':
      return 'glare';
    case 'happy':
      return pick(HAPPY, Math.floor(now / HAPPY_EVERY_MS));
    case 'neutral':
      return stillFor >= SLEEPY_AFTER_MS
        ? 'sleepy'
        : pick(AMBIENT, Math.floor(now / AMBIENT_EVERY_MS) + taps * 7919);
  }
}

/**
 * The dot's mood and face, from the locator: its fix, its camera, and the
 * taps on its button (`taps`, counted by useLocator). Ticks once a second
 * while there is a fix to wear a face, for the faces
 * taking turns.
 */
export function useLocatorMood({
  fix,
  camera,
  taps,
}: {
  fix: Fix | null;
  camera: Camera;
  taps: number;
}): {
  mood: Mood;
  face: Face;
  /** The last tap's time: a new one plays the reaction again, even with the face unchanged. */
  beat: number;
  /** A tap on the dot itself: the same reaction as one on the button (the owner, 2026-10-01). */
  poke: () => void;
} {
  const [now, setNow] = useState(() => Date.now());
  // Taps on the dot itself, counted with the button's.
  const [pokes, setPokes] = useState(0);
  const poke = useCallback(() => setPokes((n) => n + 1), []);
  const touches = taps + pokes;
  // What happened, and when: taps on the button, the visitor arriving, standing still since.
  const [events, setEvents] = useState<{
    taps: number[];
    count: number;
    reaction: Signals['reaction'];
    arrivedAt: number | null;
    stillSince: number | null;
  }>({ taps: [], count: 0, reaction: null, arrivedAt: null, stillSince: null });
  const seen = useRef({ taps: touches, hadFix: !!fix, camera });

  // Read as they change, not on the tick: each is an event with a time.
  useEffect(() => {
    const t = Date.now();
    const was = seen.current;
    seen.current = { taps: touches, hadFix: !!fix, camera };
    // Taps quicker than a render come in one batch: each counts, or three
    // quick ones on a slow phone could read as two and never make it cross.
    const tapped = Math.max(0, touches - was.taps);
    // Rolled here, with the tap, not while rendering: the reaction is the tap's.
    const roll = Math.random();
    setEvents((e) => ({
      taps: tapped
        ? [
            ...e.taps.filter((x) => t - x < ANGRY_WITHIN_MS + ANGRY_FOR_MS),
            ...Array<number>(tapped).fill(t),
          ]
        : e.taps,
      count: e.count + tapped,
      reaction: tapped ? { at: t, mood: reactionTo(e.count + tapped, roll) } : e.reaction,
      arrivedAt:
        (fix && !was.hadFix) || (fix && camera !== 'free' && was.camera === 'free')
          ? t
          : e.arrivedAt,
      stillSince: !fix || fix.speed >= STILL_BELOW_MPS ? null : (e.stillSince ?? t),
    }));
    setNow(t);
  }, [touches, fix, camera]);

  useEffect(() => {
    if (!fix) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [fix]);

  const signals: Signals = {
    now,
    fix,
    arrivedAt: events.arrivedAt,
    taps: events.taps,
    reaction: events.reaction,
  };
  const tapped = reacting(signals) && !inATemper(signals);
  const face = faceFor(
    moodAt(signals),
    now,
    events.stillSince === null ? 0 : now - events.stillSince,
    tapped,
    events.count,
  );
  return {
    // The mood the face shows: a neutral dot's swings included.
    mood: MOOD_OF[face],
    face,
    beat: events.reaction?.at ?? 0,
    poke,
  };
}
