import { useEffect, useRef, useState } from 'react'
import { STILL_BELOW_MPS, type Camera, type Fix } from './useLocator'

/*
 * The visitor's dot has moods (the owner's ask, 2026-10-01: "add other
 * emotion ... sad, angry, happy"), each tied to something true of the
 * visitor's location, so the face says what the map knows; and neutral and
 * happy have several faces each, so it never reads as one loop (his "make
 * more faces reaction to that"). The faces are drawn in locator.css.
 */

export type Mood = 'neutral' | 'happy' | 'sad' | 'angry'

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
  | 'droop'
  | 'glare'

/** Taps on the LocatorButton this close together, three of them, make it cross. */
export const ANGRY_TAPS = 3
export const ANGRY_WITHIN_MS = 2000
/** …and it stays cross this long after the third. */
export const ANGRY_FOR_MS = 3000
/** Happy this long when the location first comes, or the camera arrives on the visitor. */
export const HAPPY_FOR_MS = 3000
/** Sad when the fix is this old… */
export const STALE_AFTER_MS = 30_000
/** …or this rough, in metres. */
export const POOR_OVER_M = 80
/** Happy on the move from walking pace up, in metres a second. */
export const MOVING_FROM_MPS = 1
/** Sleepy, a neutral face, after standing still this long. */
export const SLEEPY_AFTER_MS = 60_000

/** How long each neutral face is held before another may come; mostly the wandering glance. */
const NEUTRAL_EVERY_MS = 7000
const NEUTRAL: readonly Face[] = ['glance', 'glance', 'curious', 'glance', 'wink', 'glance', 'surprised']
/** Happy changes face more often: it is short-lived, or the visitor is moving. */
const HAPPY_EVERY_MS = 2500
const HAPPY: readonly Face[] = ['smile', 'hop', 'squee', 'wink-smile']

export type Signals = {
  now: number
  fix: Pick<Fix, 'accuracy' | 'speed' | 'time'> | null
  /** When the location first came, or the camera last arrived on the visitor. */
  arrivedAt: number | null
  /** When the LocatorButton was tapped, oldest first. */
  taps: readonly number[]
}

/** The mood for these signals, the strongest first: cross, then glad, then low, then glad on the move. */
export function moodAt({ now, fix, arrivedAt, taps }: Signals): Mood {
  for (let i = ANGRY_TAPS - 1; i < taps.length; i++) {
    const third = taps[i]
    if (third - taps[i - ANGRY_TAPS + 1] <= ANGRY_WITHIN_MS && now - third < ANGRY_FOR_MS && now >= third) return 'angry'
  }
  if (arrivedAt !== null && now >= arrivedAt && now - arrivedAt < HAPPY_FOR_MS) return 'happy'
  if (fix && (now - fix.time > STALE_AFTER_MS || fix.accuracy > POOR_OVER_M)) return 'sad'
  if (fix && fix.speed >= MOVING_FROM_MPS) return 'happy'
  return 'neutral'
}

/** A small, steady hash: the same slot always shows the same face, slots differ unpredictably. */
function pick<T>(list: readonly T[], slot: number): T {
  const h = Math.imul(slot ^ 0x9e3779b9, 0x85ebca6b) >>> 0
  return list[((h ^ (h >>> 13)) >>> 0) % list.length]
}

/** The face for a mood at `now`; neutral turns sleepy after `stillFor` ms standing still. */
export function faceFor(mood: Mood, now: number, stillFor: number): Face {
  switch (mood) {
    case 'angry':
      return 'glare'
    case 'sad':
      return 'droop'
    case 'happy':
      return pick(HAPPY, Math.floor(now / HAPPY_EVERY_MS))
    case 'neutral':
      return stillFor >= SLEEPY_AFTER_MS ? 'sleepy' : pick(NEUTRAL, Math.floor(now / NEUTRAL_EVERY_MS))
  }
}

/**
 * The dot's mood and face, from the locator: its fix, its camera, and the
 * taps on its button (`taps`, counted by useLocator). Ticks once a second
 * while there is a fix to wear a face, for a fix going stale and the faces
 * taking turns.
 */
export function useLocatorMood({ fix, camera, taps }: { fix: Fix | null; camera: Camera; taps: number }): { mood: Mood; face: Face } {
  const [now, setNow] = useState(() => Date.now())
  // What happened, and when: taps on the button, the visitor arriving, standing still since.
  const [events, setEvents] = useState<{ taps: number[]; arrivedAt: number | null; stillSince: number | null }>({
    taps: [],
    arrivedAt: null,
    stillSince: null,
  })
  const seen = useRef({ taps, hadFix: !!fix, camera })

  // Read as they change, not on the tick: each is an event with a time.
  useEffect(() => {
    const t = Date.now()
    const was = seen.current
    seen.current = { taps, hadFix: !!fix, camera }
    setEvents((e) => ({
      taps: taps > was.taps ? [...e.taps.filter((x) => t - x < ANGRY_WITHIN_MS + ANGRY_FOR_MS), t] : e.taps,
      arrivedAt: (fix && !was.hadFix) || (fix && camera !== 'free' && was.camera === 'free') ? t : e.arrivedAt,
      stillSince: !fix || fix.speed >= STILL_BELOW_MPS ? null : (e.stillSince ?? t),
    }))
    setNow(t)
  }, [taps, fix, camera])

  useEffect(() => {
    if (!fix) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [fix])

  const mood = moodAt({ now, fix, arrivedAt: events.arrivedAt, taps: events.taps })
  return { mood, face: faceFor(mood, now, events.stillSince === null ? 0 : now - events.stillSince) }
}
