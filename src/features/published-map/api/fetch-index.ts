import type { Direction } from '@/features/routes/model/direction-schema';

import {
  EARLY_MAP_FILE,
  MAP_FILE_CACHE,
  MAP_FILE_SCHEMA,
  MAP_FILE_TOO_NEW,
  MAP_FILE_URL,
  SERVED_FROM_HEADER,
  STORED_OLD,
  type EarlyMapFile,
} from '../map-file';
import { indexOutlineSchema, indexSchema, type Index } from '../schemas/index-schema';

/**
 * The published index, fetched, validated and shared: the public map's one
 * read of its data (ADR 0001; the contract is map-file.ts, the shape
 * schemas/index-schema.ts). Fetched once per page; a failure is not cached,
 * so a reload can try again. `no-cache` asks the server whether the file
 * changed rather than trusting a stale copy: the answer is a cheap 304 when
 * it has not. With no answer and no copy of this file in store, the copy an
 * older version of the app stored is shown, marked stale. The first load
 * reads the request index.html made (ask).
 */

let inFlight: Promise<Index> | null = null;
let stale = false;
/** How the last load ended, once it has: its index, or null for a failure; null while it is on its way (openingDirections). */
let settled: { file: Index | null } | null = null;

/**
 * index.html's request, taken once: the first load reads it, and a load
 * after a failed one asks the network itself, as every load did before.
 * Null on a page without one (the studio's, a test's).
 */
function takeEarly(): EarlyMapFile | null {
  const page = globalThis as { [EARLY_MAP_FILE]?: EarlyMapFile };
  const early = page[EARLY_MAP_FILE];
  if (!early) return null;
  delete page[EARLY_MAP_FILE];
  return typeof early.then === 'function' ? early : null;
}

/**
 * The network's answer for the map file, and how to read it as JSON:
 * index.html's when it made one, else asked here. A request of index.html's
 * that failed (no network as the page was read) is asked again here, as the
 * page always did, so what follows is today's either way.
 */
function ask(): Promise<{ res: Response; json: () => Promise<unknown> }> {
  const own = () =>
    fetch(MAP_FILE_URL, { cache: 'no-cache' }).then((res) => ({ res, json: () => res.json() }));
  const early = takeEarly();
  if (!early) return own();
  return early.then(
    ({ res, body }) => ({
      res,
      // Read by the page's script from a copy of the answer, so the answer's
      // own body is still there for an early answer that brought none.
      json: () =>
        body
          ? body.then((raw) => {
              if (raw === undefined) throw new SyntaxError(`${MAP_FILE_URL} is not JSON`);
              return raw;
            })
          : res.json(),
    }),
    own,
  );
}

/**
 * A file read off `url` as the index of shape `schema`, its overviews as the
 * lines the map draws first. The refusals, in order: not a map at all
 * (whatever number it carries), a shape this app does not know (the banner's
 * message, MAP_FILE_TOO_NEW), another shape than asked for, and a row the
 * schema cannot read.
 */
export function parseIndex(raw: unknown, url: string, schema: number): Index {
  const outline = indexOutlineSchema.safeParse(raw);
  if (!outline.success) throw new Error(`${url} is not a published map`);
  const { schema: shape } = outline.data;
  if (((shape as number | undefined) ?? 1) > MAP_FILE_SCHEMA) throw new Error(MAP_FILE_TOO_NEW);
  if (shape !== schema)
    throw new Error(`${url} is shape ${(shape as number | undefined) ?? 1}, not the index`);
  const parsed = indexSchema.safeParse(raw);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    const at = issue?.path.map(String).join('.') ?? '';
    throw new Error(
      `${url} has a row this app cannot read: ${at} ${issue?.message ?? ''}`.trimEnd(),
    );
  }
  return parsed.data;
}

/**
 * The copy the worker kept of the index itself, else the newest older one.
 * The worker falls back to its copy only when the network fails outright: a
 * server's 500 is an answer, and came to the page as one (review of
 * 2026-10-03, finding 16).
 */
async function storedCopy(): Promise<Index | null> {
  return (
    (await storedOldCopy([{ url: MAP_FILE_URL, schema: MAP_FILE_SCHEMA }])) ??
    (await storedOldCopy())
  );
}

/** The newest older copy the worker kept, if any (STORED_OLD). A copy that does not read is passed over. */
async function storedOldCopy(
  candidates: readonly { url: string; schema: number }[] = STORED_OLD,
): Promise<Index | null> {
  if (typeof caches === 'undefined') return null;
  for (const { url, schema } of candidates) {
    const res = await caches.match(url, { cacheName: MAP_FILE_CACHE }).catch(() => undefined);
    if (!res?.ok) continue;
    try {
      return parseIndex(await res.json(), url, schema);
    } catch {
      continue;
    }
  }
  return null;
}

/** The published index, fetched once per page and shared by both hooks. */
export function fetchIndex(): Promise<Index> {
  if (inFlight) return inFlight;
  settled = null;
  inFlight = ask()
    .then(
      async ({ res, json }) => {
        // The server answered, but not with the map — an error, or the
        // page itself, 200, which the host sends for a file it does not
        // have (wrangler.jsonc): the stored copy, marked stale.
        const kept = async (why: string) => {
          const copy = await storedCopy();
          if (!copy) throw new Error(`${MAP_FILE_URL}: ${why}`);
          stale = true;
          return copy;
        };
        if (!res.ok) return kept(`HTTP ${res.status}`);
        let raw: unknown;
        try {
          raw = await json();
        } catch {
          return kept('not JSON');
        }
        stale = res.headers.get(SERVED_FROM_HEADER) === 'cache';
        // A file that reads but is not this app's (too new, another shape, a
        // row it cannot read) is said as it is: the banner's Reload is the
        // answer to that, never a stored copy in its place.
        return parseIndex(raw, MAP_FILE_URL, MAP_FILE_SCHEMA);
      },
      async (e: unknown) => {
        // No network and nothing stored under this path: an update made offline.
        const old = await storedOldCopy();
        if (!old) throw e;
        stale = true;
        return old;
      },
    )
    .then(
      (file) => {
        settled = { file };
        return file;
      },
      (e: unknown) => {
        inFlight = null;
        settled = { file: null };
        throw e;
      },
    );
  return inFlight;
}

/**
 * The directions the public map opens framed on (the owner's Q1,
 * 2026-10-04; MapView's `openOn`), asked as the map is about to be made:
 * the index's, when its load has ended by then; the copy the worker kept on
 * an earlier visit when it has not (storedCopy, read only then: it costs a
 * parse of the whole file), unless the file comes while it is read; and
 * with no copy kept, the file once it comes. MapView waits for it no more
 * than a second (OPENING_WAIT_MS), and opens as it always did without it,
 * the routes framed as they come; as it does after a load that failed.
 * Without that wait a visit with no worker — a first one whose script beat
 * the file, a second one before the worker was installed — opened at zoom
 * 11 while the file was asked again (a 304, a round trip), and fetched that
 * view's tiles only to throw them away. When the copy kept and the file
 * then brought differ, the routes' own fit takes the camera on to the
 * file's framing, unless the visitor has moved the map by then (framing.ts,
 * framesRoutes).
 */
export async function openingDirections(): Promise<Direction[] | null> {
  // The load's end as it is now: undefined while it is on its way.
  const ended = () => (settled ? (settled.file?.directions ?? null) : undefined);
  const now = ended();
  if (now !== undefined) return now;
  const copy = await storedCopy().catch(() => null);
  const since = ended();
  if (since !== undefined) return since;
  if (copy) return copy.directions;
  return inFlight
    ? inFlight.then(
        (file) => file.directions,
        () => null,
      )
    : null;
}

/** True when the last load was answered from a stored copy rather than the network. Meaningful once `fetchIndex()` has resolved. */
export const indexIsStale = () => stale;

/** Loaders in the shape the two hooks take. Module-level, so they never change between renders. */
export const loadDirectionsFromFile = () => fetchIndex().then((f) => f.directions);
export const loadHotspotsFromFile = () =>
  fetchIndex().then((f) => ({ hotspots: f.hotspots, links: f.links }));
