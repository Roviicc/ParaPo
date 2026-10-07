import { useEffect, useState, useSyncExternalStore } from 'react';

import { fetchIndex, indexIsStale } from './api/fetch-index';

/**
 * How the public map knows its own state: whether there is a network, and
 * how old the map on screen is — what the offline notice says (Notices.tsx).
 * Split from CommuterApp.tsx, 2026-09-29.
 */

/** Whether the browser believes it has a network; `false` is certain, `true` only hopeful. */
export function useOffline(): boolean {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener('online', notify);
      window.addEventListener('offline', notify);
      return () => {
        window.removeEventListener('online', notify);
        window.removeEventListener('offline', notify);
      };
    },
    () => !navigator.onLine,
    () => false,
  );
}

/**
 * When the map on screen was published, and whether it came from a stored
 * copy, from the file both hooks already share. Read again whenever the
 * routes load (`loaded`, their list): read once, a first load that failed
 * and a "Try again" that worked left the notice saying "Offline" with no date.
 */
export function useMapAge(loaded: unknown): MapAge {
  const [age, setAge] = useState<MapAge>({ publishedAt: null, stale: false });
  useEffect(() => {
    let live = true;
    fetchIndex().then(
      (f) =>
        live &&
        setAge((was) => sameAge(was, { publishedAt: f.publishedAt, stale: indexIsStale() })),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [loaded]);
  return age;
}

/** When the map on screen was published, and whether it is a stored copy. */
export interface MapAge {
  publishedAt: string | null;
  stale: boolean;
}

/**
 * `now`, or `was` when it says the same. The public map hands useMapAge its
 * directions, which are a new list at every full line read, and each read
 * set a new age, the same date: one more render of the whole app per line
 * (the cheap-phone plan, step 16 (g), 2026-10-04). Kept, the state is
 * unchanged and React renders nothing; still read again each time, so a
 * load that changes the date or the copy is shown as before.
 */
export function sameAge(was: MapAge, now: MapAge): MapAge {
  return was.publishedAt === now.publishedAt && was.stale === now.stale ? was : now;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "14 Sep", in the phone's own time zone; spelled by hand so every browser agrees. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
