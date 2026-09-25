import type { VariantSummary } from './routes'
import type { StopLink, StopSummary } from './stops'

/**
 * The published map: one file, written by scripts/publish-map.mjs and served
 * as a static file. It holds exactly what the public map shows, with each
 * direction's line simplified to within 5 m and rounded to 5 decimals, and
 * each hotspot's point and box rounded to 6. Visitors read this and never
 * ask the database; the studio keeps reading the live tables.
 */
export type MapFile = {
  /**
   * The shape of this file, `MAP_FILE_SCHEMA` when written. Absent on files
   * published before 2026-09-25, which have shape 1. See `MAP_FILE_SCHEMA`.
   */
  schema?: number
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
 * The shape of the map file this app reads: the numbers a reader must know
 * to make sense of the file. An installed app keeps running for months with
 * the code it was installed with, and fetches whatever this URL serves; so
 * the file says what shape it is, and a reader that meets a number it does
 * not know says so (`MAP_FILE_TOO_NEW`) instead of drawing nonsense or a
 * blank map.
 *
 * The rules, so the number means something:
 *   - Adding a field is not a new shape: readers ignore fields they do not
 *     know, and a file with extra fields is still `1`.
 *   - Renaming or removing a field, or changing what a value means, is a
 *     new shape. Bump this number, and publish the new shape to a new path
 *     (`/data/map.v2.json`) while the old path keeps the old shape for as
 *     long as installed apps might still read it — a month at least. The
 *     service worker's map-file rule and the publish workflow's `git add`
 *     both name the path.
 *   - A file with no number is shape 1: every file published before the
 *     number existed, including copies stored offline on visitors' phones.
 */
export const MAP_FILE_SCHEMA = 1

/** The load error for a file of a shape this app does not know. The banner reads it. */
export const MAP_FILE_TOO_NEW = 'This map was published for a newer version of the app.'

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
      // Checked after the shape: a file that is not a map at all is that
      // error, whatever number it carries.
      if (file.schema !== undefined && file.schema !== MAP_FILE_SCHEMA) {
        throw new Error(MAP_FILE_TOO_NEW)
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
