// Publishes the public map as files, so visitors never ask the database.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs scripts/publish/publish-map.mjs
//                                                   writes public/data/
//
// Five things (shape A of docs/review-2026-09-29.md, section 8, stage 7 of the
// clean-up; since 2026-09-29; the train lines' shape and the ferry's since
// 2026-10-03):
//   data/index.v4.json      schema 4, what the app reads (MAP_FILE_URL): the
//                           index below with every line in, the trains and
//                           the ferry — a line's `route_code`, a station's
//                           `line` — read by servedBy (src/features/routes/model/routes.ts).
//   data/index.v3.json      schema 3: the same without the ferry
//                           (withoutLines.mjs), for an app that knows the
//                           trains but would take the ferry for a jeep. Kept
//                           a month at least after shape 4 ships.
//   data/index.json         schema 2: every route, its names, every hotspot,
//                           the links, and each direction's *overview* — its
//                           line thinned at 5 m with 5-decimal coordinates,
//                           a quarter of the points, invisible at the zooms
//                           the whole map is seen at — and its length in
//                           metres, measured on the full line, so a trip's
//                           Kilometer and fare never read an overview. The
//                           map draws from it. Without any line
//                           (withoutLines.mjs): an app installed before
//                           servedBy would draw a jeep stopping at a station.
//                           Kept a month at least after shape 3 ships.
//   data/lines/<id>.json    each direction's full line (below), fetched when
//                           the direction is lit or opened, with its orange
//                           stretches worked out (`pass`, and `passKey`, what
//                           they were worked out against: src/features/routes/geo/line-pass.ts),
//                           since 2026-10-05.
//   data/map.json           schema 1, everything in full as before (without
//                           any line, as the index), for one
//                           release: an installed app that has not updated
//                           reads it. Drop it a month at least after the
//                           index ships (src/features/published-map/map-file.ts has the
//                           rule), with its commit line in the workflow.
// A line file of a direction that no longer exists is removed.
//
// Reads the public tables over Supabase's REST API with the publishable key
// (from .env.production, or SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY in the
// environment), exactly the columns the public map shows: no owner ids, no
// control points, no segments. Each direction's line is thinned to within
// half a metre of the original and rounded to 6 decimals (about 0.1 m): the
// router's points every metre or two on a straight road go, the bends
// stay. It was 5 m and 5 decimals until 2026-09-25, when the owner zoomed
// to a street and saw the lines cut the corners and the two routes that
// share the road out of Tala braid across each other, each thinned on its
// own; at zoom 20 five metres is sixty pixels. A hotspot's point and box
// are rounded to 6 decimals as well: the editor saves them with 15 or
// more, and those digits were half the file.
//
// The file is written the same way every time: fixed key order, fixed row
// order, and `published_at` is carried over from the previous file when
// nothing else changed. So a run on unchanged data writes a byte-identical
// file, and the workflow that runs this daily commits only real changes.
//
// The script checks its own work before writing: every original point must
// lie within half a metre of the thinned line, or it fails. And it refuses to
// publish a map that shrank suddenly — a table that answers with no rows is a
// normal HTTP 200, so without this a policy slip would blank the public map
// and deploy it. The signboards are held the same way (boardGuard.mjs,
// 2026-10-03): many of the boards directions name gone from the bucket at
// once, or every one of them.
// `--force` overrides these checks, for a deliberate removal.
//
// The rules are the app's own, imported from src/ as check-map-data does —
// the thinning, the rounding, a hotspot's label, the route and direction
// names, the index's schema — so the file and the app cannot drift (the
// review's 6.5: they were written here a second time). TypeScript, which
// Node strips; ts-resolve.mjs finds the .ts behind an extensionless import.
// Nothing from npm: Node's own fetch, zlib and fs, so the workflow still
// needs no `npm ci`.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OVERVIEW_M,
  lineLength,
  overviewOf,
  pointToSegmentM,
  round6,
  roundLngLat,
  simplifyLine,
} from '../../src/shared/utils/geo.ts';
import { directionName, isLineMode, routeName } from '../../src/features/routes/model/routes.ts';
import { hotspotLabel } from '../../src/features/routes/model/hotspots.ts';
import { passBoxes } from '../../src/features/routes/geo/line-pass.ts';
import { MAP_FILE_SCHEMA } from '../../src/features/published-map/map-file.ts';
import { cleanSignboardSvg } from '../../src/features/routes/model/signboard-svg.ts';
import { EVERY_LINE, FERRY, withoutLines } from './withoutLines.mjs';
import { boardsRefusal } from './boardGuard.mjs';
import { lineFileText } from './lineFile.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Says why, sets the exit code and stops. Not process.exit(): on Windows, Node 24 asserts when that runs with a fetch timeout still pending. */
function fail(message) {
  console.error(message);
  process.exitCode = 1;
  throw new Stop();
}
class Stop extends Error {}
process.on('uncaughtException', (e) => {
  if (!(e instanceof Stop)) {
    console.error(e);
    process.exitCode = 1;
  }
});
const DATA = join(root, 'public', 'data');
const OUT = join(DATA, 'map.json');
const INDEX = join(DATA, 'index.json');
const INDEX_V3 = join(DATA, 'index.v3.json');
const INDEX_V4 = join(DATA, 'index.v4.json');
const LINES = join(DATA, 'lines');
const SIGNBOARDS = join(DATA, 'signboards');
/** A board's name in the bucket, as the studio writes it (signboards.ts): a uuid. Anything else is not read. */
const BOARD_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.svg$/;
const FORCE = process.argv.includes('--force');

/**
 * Douglas–Peucker tolerance. With 6-decimal rounding (≤ 0.08 m) the total
 * stays under half a metre: the lit line is 10 px wide at zoom 20, where a
 * pixel is 7 cm, so the drawn line never leaves its own width.
 */
const SIMPLIFY_M = 0.3;
const MAX_DEVIATION_M = 0.5;
/**
 * The overview in the index: OVERVIEW_M (5 m) and 5 decimals (about 1 m),
 * the file's diet before 2026-09-25 — geo.ts's overviewOf, which the editor's
 * list draws too. Below zoom 15 a pixel here is more than 2 m, so it is the
 * full line to the eye; closer in, and for a lit direction, the map reads
 * the full line.
 */
const OVERVIEW_MAX_DEVIATION_M = 7;
/** A collection that lost more than this share of its rows since the last file is not published without --force. */
const MAX_SHRINK = 0.3;
/** PostgREST answers at most this many rows per request; ask page by page. */
const PAGE = 1000;
const TIMEOUT_MS = 30_000;

/** map.json's shape, the one before the index: fixed, since installed apps read it as it is (src/features/published-map/map-file.ts has the rules). */
const SCHEMA = 1;
/** The old index's shape, before the train lines: fixed, as map.json's, for installed apps. */
const INDEX_SCHEMA = 2;
/** The index with the trains but not the ferry: fixed, for installed apps. */
const INDEX_V3_SCHEMA = 3;
/** The index the app reads now: its own MAP_FILE_SCHEMA. */
const INDEX_V4_SCHEMA = MAP_FILE_SCHEMA;
/** The data's licence, written into the file itself. See README.md, "Data and licence". */
const LICENSE = 'ODbL-1.0';
const ATTRIBUTION =
  'Route data © ParaPo contributors, ODbL (https://opendatacommons.org/licenses/odbl/1-0/). ' +
  'Derived from OpenStreetMap, © OpenStreetMap contributors.';

// ------------------------------------------------------------------ config

/** KEY=value lines; a quoted value keeps what is inside the quotes; # starts a comment. */
function readEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#]*?))\s*(?:#.*)?$/.exec(line);
    if (m) out[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

const envFile = readEnvFile(join(root, '.env.production'));
const URL_BASE = process.env.SUPABASE_URL ?? envFile.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? envFile.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!URL_BASE || !KEY) {
  fail('No Supabase URL and publishable key: set them in .env.production or the environment.');
}

/** One page of a table, with a timeout and one retry: a hung connection must not hold the daily job. */
async function page(path, from) {
  const attempt = async () => {
    const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + PAGE - 1}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok && res.status !== 206)
      throw new Error(`${path.split('?')[0]}: HTTP ${res.status} ${await res.text()}`);
    return res.json();
  };
  try {
    return await attempt();
  } catch (e) {
    if (e instanceof Error && /HTTP 4\d\d/.test(e.message)) throw e;
    return attempt();
  }
}

/** Every row of a table, however many. */
async function rest(path) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const chunk = await page(path, from);
    rows.push(...chunk);
    if (chunk.length < PAGE) return rows;
  }
}

/**
 * A signboard from the bucket, cleaned again before it lands on the map's own
 * domain (features/routes/model/signboard-svg.ts): null when it is gone from the bucket,
 * `{ refused }` when the clean says no. The bucket keeps whatever an editor's
 * session sent (the studio's own clean runs in the browser), so a refused
 * board is left out and said, never published, and never stops the map.
 */
async function board(name) {
  const attempt = async () => {
    const res = await fetch(`${URL_BASE}/storage/v1/object/public/signboards/${name}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 400 || res.status === 404) return null;
    if (!res.ok) throw new Error(`signboards/${name}: HTTP ${res.status}`);
    return res.text();
  };
  const text = await attempt().catch(attempt);
  if (text === null) return null;
  const clean = cleanSignboardSvg(text);
  if ('error' in clean) return { refused: clean.error };
  return clean.svg + '\n';
}

// ---------------------------------------------------------------- geometry

/** A Point or Polygon with every coordinate rounded to 6 decimals; anything else as it came. */
function roundGeometry(g) {
  if (!g || typeof g !== 'object') return g;
  if (g.type === 'Point' && Array.isArray(g.coordinates)) {
    return { ...g, coordinates: g.coordinates.map(round6) };
  }
  if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
    return { ...g, coordinates: g.coordinates.map((ring) => ring.map((c) => c.map(round6))) };
  }
  return g;
}

/**
 * The largest distance from any original point to the simplified line. Every
 * segment is tried for every point: a route that doubles back on itself has
 * its nearest segment anywhere, and a few hundred by a hundred is nothing.
 */
function maxDeviation(original, simplified) {
  let worst = 0;
  for (const p of original) {
    let best = Infinity;
    for (let i = 0; i + 1 < simplified.length; i++) {
      const d = pointToSegmentM(p, simplified[i], simplified[i + 1]);
      if (d < best) best = d;
    }
    if (best > worst) worst = best;
  }
  return worst;
}

// ------------------------------------------------------------------- fetch

// Rows ordered by id, not by when they were saved: re-saving a direction with
// the same geometry must not reorder the file and commit a change nobody can
// see. (The map draws them in file order, which nothing depends on.)
const [variantRows, hotspotRows, linkRows] = await Promise.all([
  rest(
    'route_variant?select=id,route_id,direction_name,origin_terminal,destination_terminal,shape,confidence,reversed,signboards,' +
      'route:route(id,signboard,route_code,long_name,mode,fare_note,head_stop_id,tail_stop_id,via)&order=id.asc',
  ),
  rest('stop?select=id,name,informal,aliases,kind,point,area,note,created_at,line&order=id.asc'),
  rest(
    'route_stop?select=route_variant_id,stop_id,stop_sequence&order=route_variant_id.asc,stop_sequence.asc,stop_id.asc',
  ),
]);

// Each direction's signboards, in its order, as files (0010, the owner's ask
// of 2026-10-01). One the bucket no longer holds is left out, said, and the
// rest still publish; a name not the studio's is never asked for.
const boardText = new Map();
const boardsOf = new Map();
let boardsMissing = 0;
for (const v of variantRows) {
  const names = (Array.isArray(v.signboards) ? v.signboards : []).filter((n) => BOARD_NAME.test(n));
  for (const n of names) if (!boardText.has(n)) boardText.set(n, null);
  if (names.length) boardsOf.set(v.id, names);
}
await Promise.all([...boardText.keys()].map(async (n) => boardText.set(n, await board(n))));
const boardsRefused = [...boardText].filter(([, t]) => t?.refused);
for (const [n, t] of boardsRefused) {
  console.warn(`::warning::signboards/${n} was refused by the clean and left out: ${t.refused}`);
  boardText.set(n, null);
}
// A board the bucket answers 400 or 404 for is gone, and left out: said
// one by one, as a refused one is. Many boards gone at once is far more
// likely a bucket made private than a clear-out (a board taken off in the
// studio is unlisted first, so it is not named), and the files would then
// be deleted from the map below: refused unless told, as a shrunk map is
// (review of 2026-10-03, finding 8; boardGuard.mjs).
const boardsGone = [...boardText]
  .filter(([n, t]) => t === null && !boardsRefused.some(([r]) => r === n))
  .map(([n]) => n);
for (const n of boardsGone)
  console.warn(
    `::warning::signboards/${n} is named by a direction but gone from the bucket; left out`,
  );
for (const [id, names] of boardsOf) {
  const kept = names.filter((n) => boardText.get(n) !== null);
  boardsMissing += names.length - kept.length;
  if (kept.length) boardsOf.set(id, kept);
  else boardsOf.delete(id);
}
if (!FORCE) {
  const refusal = boardsRefusal({
    named: boardText.size,
    gone: boardsGone.length,
    published: boardsGone.filter((n) => existsSync(join(SIGNBOARDS, n))).length,
    maxShrink: MAX_SHRINK,
  });
  if (refusal) fail(`FAIL  ${refusal}`);
}

// ---------------------------------------------------------------- assemble

// Names are generated from the hotspots at each route's ends and never stored
// (PLAN.md, "Naming and creating a route", 2026-09-21). The file carries the
// generated strings so visitors need no join; a renamed hotspot shows on the
// next publish: routeName and directionName, from a hotspot's hotspotLabel — its
// informal name, what people say, or the name on the ground (0007).
const hotspotName = new Map(hotspotRows.map((s) => [s.id, hotspotLabel(s)]));

const stats = [];
/** Each direction's overview, by id: its line at 5 m, 5 decimals. */
const overviews = new Map();
const variants = variantRows.map((v) => {
  if (!v.route) {
    fail(`FAIL  direction ${v.id} came without its route: is the route table still readable?`);
  }
  const head = hotspotName.get(v.route.head_stop_id);
  const tail = hotspotName.get(v.route.tail_stop_id);
  if (!head || !tail) {
    // The foreign keys make this impossible unless the stop table was not fully readable.
    fail(
      `FAIL  route ${v.route.id}: an end hotspot is missing from the stop rows (${v.route.head_stop_id}, ${v.route.tail_stop_id})`,
    );
  }
  const name = routeName(head, tail, v.route.via);
  const direction = directionName(head, tail, v.reversed);
  const coords = Array.isArray(v.shape?.coordinates) ? v.shape.coordinates : [];
  let shape = null;
  if (coords.length > 1) {
    const slim = simplifyLine(coords, SIMPLIFY_M).map(roundLngLat);
    const dev = maxDeviation(coords, slim);
    if (dev > MAX_DEVIATION_M) {
      fail(
        `FAIL  "${name}" ${direction}: simplified line strays ${dev.toFixed(1)} m from the original`,
      );
    }
    // The overview is thinned from the original, not from the full line, and
    // checked the same way against its own, looser bound.
    const rough = overviewOf(coords);
    const roughDev = maxDeviation(coords, rough);
    if (roughDev > OVERVIEW_MAX_DEVIATION_M) {
      fail(
        `FAIL  "${name}" ${direction}: its overview strays ${roughDev.toFixed(1)} m from the original`,
      );
    }
    stats.push({
      name: `${name} · ${direction}`,
      before: coords.length,
      after: slim.length,
      overview: rough.length,
      dev,
    });
    shape = { type: 'LineString', coordinates: slim };
    overviews.set(v.id, { type: 'LineString', coordinates: rough });
  }
  // Key order is the file's contract; keep it fixed. A direction with no line
  // yet is published as it is — shape null — so a card can offer the flip and
  // say the return trip is not mapped yet.
  return {
    id: v.id,
    route_id: v.route_id,
    direction_name: direction,
    origin_terminal: v.origin_terminal,
    destination_terminal: v.destination_terminal,
    shape,
    reversed: v.reversed,
    confidence: v.confidence,
    route: {
      id: v.route.id,
      signboard: v.route.signboard,
      long_name: v.route.long_name,
      mode: v.route.mode,
      fare_note: v.route.fare_note,
      head_stop_id: v.route.head_stop_id,
      tail_stop_id: v.route.tail_stop_id,
      via: v.route.via,
      name,
      // The line (0011, 0012), only on a train's or the ferry's: every other
      // route's file stays byte for byte what it was.
      ...(v.route.route_code && isLineMode(v.route.mode) ? { route_code: v.route.route_code } : {}),
    },
  };
});

const stops = hotspotRows.map((s) => ({
  id: s.id,
  name: s.name,
  informal: s.informal ?? null,
  aliases: Array.isArray(s.aliases) ? s.aliases : [],
  kind: s.kind,
  point: roundGeometry(s.point),
  area: roundGeometry(s.area),
  note: s.note,
  created_at: s.created_at,
  // A station's line (0011), only on a station.
  ...(s.line ? { line: s.line } : {}),
}));

const links = linkRows.map((l) => ({
  route_variant_id: l.route_variant_id,
  stop_id: l.stop_id,
  stop_sequence: l.stop_sequence,
}));

// The old shapes, for installed apps, without the lines they do not know
// (withoutLines.mjs): an app from before servedBy would paint a jeep's
// stretches at the stations over its road, and a line's at every jeep
// hintuan under its track; one reading shape 3 takes the ferry for a jeep.
const all = { variants, stops, links };
const v3 = withoutLines(all, FERRY);
const old = withoutLines(all, EVERY_LINE);
for (const [name, cut] of [
  ['shape 3', v3],
  ['shapes 1 and 2', old],
]) {
  if (cut.ids.variants.size || cut.ids.stops.size) {
    console.log(
      `Left out of ${name}: ${cut.ids.variants.size} line direction(s), ${cut.ids.stops.size} station(s).`,
    );
  }
}
const body = { variants: old.variants, stops: old.stops, links: old.links };

const readJson = (path) => {
  try {
    const text = readFileSync(path, 'utf8');
    return { text, json: JSON.parse(text) };
  } catch {
    return { text: null, json: null };
  }
};
const { text: previousText, json: previous } = readJson(OUT);
const { json: previousV3 } = readJson(INDEX_V3);
const { json: previousV4 } = readJson(INDEX_V4);

// A map that shrank suddenly is far more likely a read that went wrong (a
// policy change, a table made private) than a clear-out. Refuse it unless told.
// The new index against its last copy, every line in; until it has one, the
// newest older file against the whole map, which is never more than the whole.
if (!FORCE) {
  const was = previousV4 ?? previousV3 ?? previous;
  const now = all;
  for (const key of was ? ['variants', 'stops', 'links'] : []) {
    const before = Array.isArray(was[key]) ? was[key].length : 0;
    const after = now[key].length;
    if (before > 0 && after < before * (1 - MAX_SHRINK)) {
      fail(
        `FAIL  ${key}: ${before} → ${after} rows, more than ${MAX_SHRINK * 100}% fewer than the published file. ` +
          'Not publishing. If the removal is deliberate, run with --force.',
      );
    }
  }
}

// The index's rows: each line's overview in place of the line, under its
// own key — the reader knows an overview when it sees one.
const indexRows = (rows) => ({
  variants: rows.variants.map(({ shape, ...v }) => {
    const { route, ...rest } = v;
    // Its signboards only when it has some: a direction without keeps the shape it had.
    const signboards = boardsOf.get(v.id);
    return {
      ...rest,
      overview: overviews.get(v.id) ?? null,
      metres: shape ? Math.round(lineLength(shape.coordinates) * 100) / 100 : null,
      ...(signboards ? { signboards } : {}),
      route,
    };
  }),
  stops: rows.stops,
  links: rows.links,
});

// `published_at` is carried over when nothing else changed, so an unchanged
// map is a byte-identical file and the daily workflow has nothing to commit.
// Read off the new index, which has everything; until there is one, a new stamp.
const indexV4Body = indexRows(all);
const sameText = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const same =
  previousV4 &&
  sameText(
    { variants: previousV4.variants, stops: previousV4.stops, links: previousV4.links },
    indexV4Body,
  );
const published_at = same
  ? previousV4.published_at
  : new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

// The terms travel inside each file, so no copy can arrive without them. The
// shape number first: an installed app reads whatever its path serves, and
// checks the number against the one it knows (src/features/published-map/map-file.ts has the
// rules for changing it — a new shape goes to a new path).
const stamp = (schema, rows) =>
  JSON.stringify({ schema, published_at, license: LICENSE, attribution: ATTRIBUTION, ...rows }) +
  '\n';
const file = stamp(SCHEMA, body);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, file);
const indexFile = stamp(INDEX_SCHEMA, indexRows(body));
const previousIndex = existsSync(INDEX) ? readFileSync(INDEX, 'utf8') : null;
writeFileSync(INDEX, indexFile);
const indexV3File = stamp(INDEX_V3_SCHEMA, indexRows(v3));
const previousIndexV3 = existsSync(INDEX_V3) ? readFileSync(INDEX_V3, 'utf8') : null;
writeFileSync(INDEX_V3, indexV3File);
const indexV4File = stamp(INDEX_V4_SCHEMA, indexV4Body);
const previousIndexV4 = existsSync(INDEX_V4) ? readFileSync(INDEX_V4, 'utf8') : null;
writeFileSync(INDEX_V4, indexV4File);

// A line per drawn direction, written only when it changed, and the files of
// directions gone removed, so an unchanged map touches nothing.
//
// With its orange stretches, worked out here once rather than by every
// phone that lights the line (lineFile.mjs; the cheap-phone plan, step 13,
// 2026-10-05): by the app's own rule (src/features/routes/geo/line-pass.ts: passBoxes,
// passBounds, passStretches, hotspotRing, bboxOf, servedBy), on what the app
// reads — the line as written and the hotspots as rounded in the index,
// shape 4's, every line in — with the key the app checks them by.
const passBoxesOfIndex = passBoxes(stops);
mkdirSync(LINES, { recursive: true });
const lineFiles = new Set();
let linesWritten = 0;
for (const v of variants) {
  if (!v.shape) continue;
  const path = join(LINES, `${v.id}.json`);
  const text = lineFileText(v, passBoxesOfIndex);
  lineFiles.add(`${v.id}.json`);
  if (existsSync(path) && readFileSync(path, 'utf8') === text) continue;
  writeFileSync(path, text);
  linesWritten++;
}
let linesRemoved = 0;
for (const f of readdirSync(LINES)) {
  if (f.endsWith('.json') && !lineFiles.has(f)) {
    rmSync(join(LINES, f));
    linesRemoved++;
  }
}

// The boards, beside the lines: written when changed, removed when no
// direction shows them. Names are uuids, so a board's file never changes
// under the same name — an edit in the studio is a new one.
mkdirSync(SIGNBOARDS, { recursive: true });
let boardsWritten = 0;
for (const [n, text] of boardText) {
  if (text === null) continue;
  const path = join(SIGNBOARDS, n);
  if (existsSync(path) && readFileSync(path, 'utf8') === text) continue;
  writeFileSync(path, text);
  boardsWritten++;
}
const boardFiles = new Set([...boardsOf.values()].flat());
let boardsRemoved = 0;
for (const f of readdirSync(SIGNBOARDS)) {
  if (f.endsWith('.svg') && !boardFiles.has(f)) {
    rmSync(join(SIGNBOARDS, f));
    boardsRemoved++;
  }
}

// ------------------------------------------------------------------ report

for (const s of stats)
  console.log(
    `  ${s.name}: ${s.before} → ${s.after} points, within ${s.dev.toFixed(1)} m; overview ${s.overview}`,
  );
const gz = gzipSync(Buffer.from(file)).length;
console.log(
  // By the bytes, not the map content: new terms in an unchanged map are still a change to commit.
  `${previousText === file ? 'Unchanged' : 'Wrote'} public/data/map.json: ${body.variants.length} direction(s), ${body.stops.length} hotspot(s), ` +
    `${body.links.length} link(s); ${file.length} bytes, ${gz} gzipped; published_at ${published_at}`,
);
const indexGz = gzipSync(Buffer.from(indexFile)).length;
console.log(
  `${previousIndex === indexFile ? 'Unchanged' : 'Wrote'} public/data/index.json: ${indexFile.length} bytes, ${indexGz} gzipped`,
);
const indexV3Gz = gzipSync(Buffer.from(indexV3File)).length;
console.log(
  `${previousIndexV3 === indexV3File ? 'Unchanged' : 'Wrote'} public/data/index.v3.json: ${indexV3File.length} bytes, ${indexV3Gz} gzipped`,
);
const indexV4Gz = gzipSync(Buffer.from(indexV4File)).length;
console.log(
  `${previousIndexV4 === indexV4File ? 'Unchanged' : 'Wrote'} public/data/index.v4.json: ${variants.length} direction(s), ` +
    `${stops.length} hotspot(s), ${links.length} link(s); ${indexV4File.length} bytes, ${indexV4Gz} gzipped; ` +
    `lines/: ${lineFiles.size} file(s), ${linesWritten} written, ${linesRemoved} removed`,
);
console.log(
  `signboards/: ${boardFiles.size} file(s), ${boardsWritten} written, ${boardsRemoved} removed` +
    (boardsMissing ? `; ${boardsMissing} named but gone from the bucket or refused, left out` : ''),
);
