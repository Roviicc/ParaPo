import type { LineStringGeoJSON, VariantSummary } from '../shared/model/routes'
import type { StopLink, StopSummary } from '../shared/model/stops'

/**
 * The published map, as the public map reads it (since 2026-09-29, stage 7 of
 * the clean-up; docs/review-2026-09-29.md section 8, shape A): an index,
 * written by scripts/publish/publish-map.mjs and served as a static file,
 * holding every route, hotspot and link and each direction's *overview* — its
 * line thinned at 5 m — and a file per direction with its full line, thinned
 * to within half a metre, read when the direction is lit or opened. At a
 * thousand directions the index is a fifth of the one file it replaces, and
 * the map draws from it at once. Visitors never ask the database; the studio
 * keeps reading the live tables.
 */
export type MapFile = {
  /** The shape of this file, `MAP_FILE_SCHEMA` when written. See `MAP_FILE_SCHEMA`. */
  schema?: number
  /** When this content was published. The offline notice reads it. */
  published_at: string
  /** The data's licence, `ODbL-1.0`. Carried in the file so every copy has it. */
  license?: string
  /** The credit a reuser has to keep. */
  attribution?: string
  /** Each with its overview as `shape`: the full line is `loadLine`'s. */
  variants: VariantSummary[]
  stops: StopSummary[]
  links: StopLink[]
}

/** A direction as the index carries it: its overview under its own name. */
type IndexVariant = Omit<VariantSummary, 'shape'> & { overview?: LineStringGeoJSON | null }

/** No hash in the name, so it keeps revalidating headers; never make it immutable. */
export const MAP_FILE_URL = '/data/index.v4.json'
/** A direction's full line: `${LINES_URL}${id}.json`. The worker keeps every one seen. */
const LINES_URL = '/data/lines/'

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
 *     while the old path keeps the old shape for as long as installed apps
 *     might still read it — a month at least. The service worker's map-file
 *     rule and the publish workflow's `git add` both name the path.
 *   - Shape 1 is `/data/map.json`, one file with every line in full; the
 *     publish keeps writing it for one release after shape 2, the index at
 *     its own path, so an app installed before still loads.
 *   - Shape 2 is `/data/index.json`; shape 3, `/data/index.v3.json`, is the
 *     same index with the train lines in (2026-10-03): a train's
 *     `route_code` and a station's `line` change which hintuans a line stops
 *     at (servedBy), so a shape-2 app would draw a jeep stopping at a
 *     station. Shape 4, `/data/index.v4.json`, is shape 3 with the ferry
 *     in (the same day): a shape-3 app knows only the trains as lines, and
 *     would draw the ferry stopping at every jeep hintuan by the river. The
 *     publish writes shape 3 without the ferry and shapes 1 and 2 without
 *     any line (scripts/publish/withoutLines.mjs), each a month at least
 *     after the next ships. The line files under `/data/lines/` are the
 *     same for all.
 */
export const MAP_FILE_SCHEMA = 4

/** The load error for a file of a shape this app does not know. The banner reads it. */
export const MAP_FILE_TOO_NEW = 'This map was published for a newer version of the app.'

/**
 * Set by the service worker (vite.config.ts, the map-file rule) on a copy it
 * served from its store because the network was slow or gone. Absent on an
 * answer from the network, and on every page with no worker.
 */
const SERVED_FROM_HEADER = 'x-parapo-served-from'

/**
 * The older indexes, newest first: shape 3, without the ferry, and shape 2,
 * without any line. An app updated from one kept its last copy in the
 * worker's store (the map-file rule matched that path then), and has no copy
 * of the new one until it reaches the network: offline, that copy is the
 * map, not the load error. Each older shape is a newer one with fewer lines,
 * so it reads as is.
 */
const STORED_OLD = [
  { url: '/data/index.v3.json', schema: 3 },
  { url: '/data/index.json', schema: 2 },
] as const
/** The worker's store for the map file (vite.config.ts, the map-file rule). */
const MAP_FILE_CACHE = 'map-file'

let inFlight: Promise<MapFile> | null = null
let stale = false

type RawFile = Partial<Omit<MapFile, 'variants'>> & { variants?: IndexVariant[] }

/** A file read off `url` as a map of shape `schema`, its overviews as the lines the map draws first. */
function asMap(file: RawFile, url: string, schema: number): MapFile {
  if (
    typeof file.published_at !== 'string' ||
    !Array.isArray(file.variants) ||
    !Array.isArray(file.stops) ||
    !Array.isArray(file.links)
  ) {
    throw new Error(`${url} is not a published map`)
  }
  // Checked after the shape: a file that is not a map at all is that
  // error, whatever number it carries.
  if ((file.schema ?? 1) > MAP_FILE_SCHEMA) throw new Error(MAP_FILE_TOO_NEW)
  if (file.schema !== schema) throw new Error(`${url} is shape ${file.schema ?? 1}, not the index`)
  // The overview is what the map draws until the line itself is read.
  const variants = file.variants.map(({ overview, ...v }) => ({ ...v, shape: overview ?? null }) as VariantSummary)
  return { ...file, variants } as MapFile
}

/** The newest older copy the worker kept, if any (STORED_OLD). */
async function storedOldCopy(): Promise<MapFile | null> {
  if (typeof caches === 'undefined') return null
  for (const { url, schema } of STORED_OLD) {
    const res = await caches.match(url, { cacheName: MAP_FILE_CACHE }).catch(() => undefined)
    if (!res?.ok) continue
    try {
      return asMap((await res.json()) as RawFile, url, schema)
    } catch {
      continue
    }
  }
  return null
}

/**
 * The published map, fetched once per page and shared by both hooks. A
 * failure is not cached, so a reload can try again. `no-cache` asks the
 * server whether the file changed rather than trusting a stale copy: the
 * answer is a cheap 304 when it has not. With no answer and no copy of this
 * file in store, the copy an older version of the app stored is shown,
 * marked stale.
 */
export function loadMapFile(): Promise<MapFile> {
  inFlight ??= fetch(MAP_FILE_URL, { cache: 'no-cache' })
    .then(
      async (res) => {
        if (!res.ok) throw new Error(`${MAP_FILE_URL}: HTTP ${res.status}`)
        stale = res.headers.get(SERVED_FROM_HEADER) === 'cache'
        return asMap((await res.json()) as RawFile, MAP_FILE_URL, MAP_FILE_SCHEMA)
      },
      async (e: unknown) => {
        // No network and nothing stored under this path: an update made offline.
        const old = await storedOldCopy()
        if (!old) throw e
        stale = true
        return old
      },
    )
    .catch((e: unknown) => {
      inFlight = null
      throw e
    })
  return inFlight
}

const lines = new Map<string, Promise<LineStringGeoJSON | null>>()

/**
 * A direction's full line, read once a page and shared. Null for a
 * direction with no line; a failure is not kept, so the next light tries
 * again — until then the map keeps the overview, which is the same road.
 */
export function loadLine(id: string): Promise<LineStringGeoJSON | null> {
  let line = lines.get(id)
  if (!line) {
    line = fetch(`${LINES_URL}${encodeURIComponent(id)}.json`, { cache: 'no-cache' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${LINES_URL}${id}.json: HTTP ${res.status}`)
        const file = (await res.json()) as { id?: string; shape?: LineStringGeoJSON | null }
        if (file.id !== id) throw new Error(`${LINES_URL}${id}.json is not that direction's line`)
        return file.shape?.type === 'LineString' && Array.isArray(file.shape.coordinates) ? file.shape : null
      })
      .catch((e: unknown) => {
        lines.delete(id)
        throw e
      })
    lines.set(id, line)
  }
  return line
}

/** True when the last load was answered from a stored copy rather than the network. Meaningful once `loadMapFile()` has resolved. */
export const mapFileIsStale = () => stale

/** Loaders in the shape the two hooks take. Module-level, so they never change between renders. */
export const loadVariantsFromFile = () => loadMapFile().then((f) => f.variants)
export const loadStopsFromFile = () => loadMapFile().then((f) => ({ stops: f.stops, links: f.links }))
