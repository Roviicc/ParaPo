import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { MAP_FILE_URL } from '../shared/mapFile'
import { STYLE_URL } from '../shared/MapView'

/**
 * The service worker, registered from the public page only. The studio never
 * runs this, and the plugin injects no registration script of its own
 * (vite.config.ts, `injectRegister: false`), so /studio/ stays a plain page.
 *
 * A new version is never applied on its own: it waits, `needRefresh` turns
 * true, and the page shows "New version · Reload". Under `npm run dev` the
 * virtual module is a no-op, so the headless checks never meet a worker.
 */

let needRefresh = false
let applyUpdate: (() => Promise<void>) | null = null
const listeners = new Set<() => void>()

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  // A page nobody controls yet is a first visit: see warmCaches. Read before
  // registering, so a worker that claims the page meanwhile cannot hide it.
  const firstVisit = !navigator.serviceWorker.controller
  applyUpdate = registerSW({
    onNeedRefresh() {
      needRefresh = true
      for (const l of listeners) l()
    },
    onRegisteredSW(_url, registration) {
      // The browser re-checks the worker on a navigation, but an installed app
      // can stay open for days; ask once an hour as well.
      if (registration) window.setInterval(() => void registration.update(), 60 * 60 * 1000)
      if (firstVisit) void warmCaches()
    },
  })
}

/**
 * On the first visit the page fetches the map file and the basemap's style
 * before the new worker has taken control, so none of it reaches the worker's
 * caches — and an install followed by airplane mode would open to a map with
 * no routes. Once the worker controls the page, ask for those few small files
 * again: a conditional request each, answered 304, and this time the worker
 * stores them. Tiles and glyphs are many and are left to normal use. From the
 * second visit on the page's own requests go through the worker, so this is
 * not run again.
 */
async function warmCaches(): Promise<void> {
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) =>
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }),
    )
  }
  const quiet = (url: string) => fetch(url).catch(() => undefined)
  const [, style] = await Promise.all([quiet(MAP_FILE_URL), quiet(STYLE_URL)])
  const json = (await style?.json().catch(() => null)) as
    | { sprite?: string; sources?: Record<string, { url?: string }> }
    | null
  if (!json) return
  const urls: string[] = []
  for (const s of Object.values(json.sources ?? {})) if (s.url) urls.push(s.url)
  if (json.sprite) {
    const scale = window.devicePixelRatio > 1 ? '@2x' : ''
    urls.push(`${json.sprite}${scale}.json`, `${json.sprite}${scale}.png`)
  }
  await Promise.all(urls.map(quiet))
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** True once a newer version is waiting. */
export function useNeedRefresh(): boolean {
  return useSyncExternalStore(subscribe, () => needRefresh, () => false)
}

/**
 * Tells the waiting worker to take over, and reloads once it has. The reload
 * is our own: the plugin's helper only reloads when the page was already
 * controlled when it registered, which a first visit is not.
 */
export function reloadToUpdate(): void {
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
  void applyUpdate?.()
}
