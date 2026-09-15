import type { VariantSummary } from './routes'
import type { StopLink, StopSummary } from './stops'

/**
 * The published map: one file, written by scripts/publish-map.mjs and served
 * as a static file. It holds exactly what the public map shows, with each
 * direction's line simplified to within 5 m. Visitors read this and never
 * ask the database; the studio keeps reading the live tables.
 */
export type MapFile = {
  /** When this content was published. Step 6's offline notice reads it. */
  published_at: string
  /** The data's licence, `ODbL-1.0`. Carried in the file so every copy has it. */
  license?: string
  /** The credit a reuser has to keep. */
  attribution?: string
  variants: VariantSummary[]
  stops: StopSummary[]
  links: StopLink[]
}

/** No hash in the name, so it keeps revalidating headers; never make it immutable. */
export const MAP_FILE_URL = '/data/map.json'

/**
 * Set by the service worker (vite.config.ts, the map-file rule) on a copy it
 * served from its store because the network was slow or gone. Absent on an
 * answer from the network, and on every page with no worker.
 */
const SERVED_FROM_HEADER = 'x-parapo-served-from'

let inFlight: Promise<MapFile> | null = null
let stale = false

/**
 * The published map, fetched once per page and shared by both hooks. A
 * failure is not cached, so a reload can try again. `no-cache` asks the
 * server whether the file changed rather than trusting a stale copy: the
 * answer is a cheap 304 when it has not.
 */
export function loadMapFile(): Promise<MapFile> {
  inFlight ??= fetch(MAP_FILE_URL, { cache: 'no-cache' })
    .then(async (res) => {
      if (!res.ok) throw new Error(`${MAP_FILE_URL}: HTTP ${res.status}`)
      stale = res.headers.get(SERVED_FROM_HEADER) === 'cache'
      const file = (await res.json()) as Partial<MapFile>
      if (
        typeof file.published_at !== 'string' ||
        !Array.isArray(file.variants) ||
        !Array.isArray(file.stops) ||
        !Array.isArray(file.links)
      ) {
        throw new Error(`${MAP_FILE_URL} is not a published map`)
      }
      return file as MapFile
    })
    .catch((e: unknown) => {
      inFlight = null
      throw e
    })
  return inFlight
}

/** True when the last load was answered from a stored copy rather than the network. Meaningful once `loadMapFile()` has resolved. */
export const mapFileIsStale = () => stale

/** Loaders in the shape the two hooks take. Module-level, so they never change between renders. */
export const loadVariantsFromFile = () => loadMapFile().then((f) => f.variants)
export const loadStopsFromFile = () => loadMapFile().then((f) => ({ stops: f.stops, links: f.links }))
