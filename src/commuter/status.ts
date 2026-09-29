import { useEffect, useState, useSyncExternalStore } from 'react'
import { loadMapFile, mapFileIsStale } from './mapFile'

/**
 * How the public map knows its own state: whether there is a network, and
 * how old the map on screen is — what the offline notice says (Notices.tsx).
 * Split from CommuterApp.tsx, 2026-09-29.
 */

/** Whether the browser believes it has a network; `false` is certain, `true` only hopeful. */
export function useOffline(): boolean {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener('online', notify)
      window.addEventListener('offline', notify)
      return () => {
        window.removeEventListener('online', notify)
        window.removeEventListener('offline', notify)
      }
    },
    () => !navigator.onLine,
    () => false,
  )
}

/**
 * When the map on screen was published, and whether it came from a stored
 * copy, from the file both hooks already share. Read again whenever the
 * routes load (`loaded`, their list): read once, a first load that failed
 * and a "Try again" that worked left the notice saying "Offline" with no date.
 */
export function useMapAge(loaded: unknown): { publishedAt: string | null; stale: boolean } {
  const [age, setAge] = useState<{ publishedAt: string | null; stale: boolean }>({ publishedAt: null, stale: false })
  useEffect(() => {
    let live = true
    loadMapFile().then((f) => live && setAge({ publishedAt: f.published_at, stale: mapFileIsStale() }), () => {})
    return () => {
      live = false
    }
  }, [loaded])
  return age
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "14 Sep", in the phone's own time zone; spelled by hand so every browser agrees. */
export function shortDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]}`
}
