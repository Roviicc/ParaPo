/**
 * The published map's contract, as the public map reads it (since 2026-09-29,
 * stage 7 of the clean-up; docs/review-2026-09-29.md section 8, shape A): an
 * index, written by scripts/publish/publish-map.mjs and served as a static
 * file, holding every route, hotspot and link and each direction's
 * *overview* — its line thinned at 5 m — and a file per direction with its
 * full line, thinned to within half a metre, read when the direction is lit
 * or opened. At a thousand directions the index is a fifth of the one file
 * it replaces, and the map draws from it at once. Visitors never ask the
 * database; the studio keeps reading the live tables.
 *
 * This file holds the names: where the index and the lines are, what shape
 * the app reads, the banner's message, the early request's name and the
 * worker's store. Reading is api/fetch-index.ts and api/fetch-line.ts; the
 * shape itself is schemas/index-schema.ts and schemas/line-file-schema.ts
 * (ticket 08 of the restructure follow-ups, 2026-10-07). vite.config.ts and
 * scripts/checks/check-build.mjs read MAP_FILE_URL and EARLY_MAP_FILE off
 * this file's text (scripts/node/map-file-constants.ts), so each stays a
 * single-quoted string constant on a line of its own.
 */

/** No hash in the name, so it keeps revalidating headers; never make it immutable. */
export const MAP_FILE_URL = '/data/index.v4.json';
/** A direction's full line: `${LINES_URL}${id}.json`. The worker keeps every one seen. */
export const LINES_URL = '/data/lines/';

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
 *     `routeCode` and a station's `line` change which hintuans a line stops
 *     at (servedBy), so a shape-2 app would draw a jeep stopping at a
 *     station. Shape 4, `/data/index.v4.json`, is shape 3 with the ferry
 *     in (the same day): a shape-3 app knows only the trains as lines, and
 *     would draw the ferry stopping at every jeep hintuan by the river. The
 *     publish writes shape 3 without the ferry and shapes 1 and 2 without
 *     any line (scripts/publish/withoutLines.mjs), each a month at least
 *     after the next ships. The line files under `/data/lines/` are the
 *     same for all.
 */
export const MAP_FILE_SCHEMA = 4;

/** The load error for a file of a shape this app does not know. The banner reads it. */
export const MAP_FILE_TOO_NEW = 'This map was published for a newer version of the app.';

/**
 * Set by the service worker (vite.config.ts, the map-file rule) on a copy it
 * served from its store because the network was slow or gone. Absent on an
 * answer from the network, and on every page with no worker.
 */
export const SERVED_FROM_HEADER = 'x-parapo-served-from';

/**
 * The older indexes, newest first: shape 3, without the ferry, and shape 2,
 * without any line. An app updated from one kept its last copy in the
 * worker's store (the map-file rule matched that path then), and has no copy
 * of the new one until it reaches the network: offline, that copy is the
 * map, not the load error. Each older shape is a newer one with fewer lines,
 * so it reads as is.
 */
export const STORED_OLD = [
  { url: '/data/index.v3.json', schema: 3 },
  { url: '/data/index.json', schema: 2 },
] as const;
/** The worker's store for the map file (vite.config.ts, the map-file rule). */
export const MAP_FILE_CACHE = 'map-file';

/**
 * Where index.html's own script leaves its request for this file (the
 * cheap-phone plan, step 20, 2026-10-04): vite.config.ts writes that script
 * into the page's <head>, with MAP_FILE_URL, so the file is asked for as the
 * page is read rather than once the app's script has come and run — 355 kB
 * on the wire before it when this was written, about 3.3 s of a slow phone
 * network; 385 kB since step 14 (2026-10-05). The script leaves a promise
 * of the answer and, for an ok one, of its body read as JSON (undefined for
 * a body that is not); it asks with `no-cache`, as fetchIndex does, and at
 * low priority, so the app's own script keeps the link first.
 */
export const EARLY_MAP_FILE = '__parapoMapFile';

/** What index.html's script leaves under EARLY_MAP_FILE. */
export type EarlyMapFile = Promise<{ res: Response; body: Promise<unknown> | null }>;
