// The published map against itself: do its lines, links and ends agree?
//
//   npm run check:data                          public/data/index.v4.json and its lines/
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs scripts/checks/check-map-data.mjs [file] [--markdown out.md]
//
// The file is the index (schema 2 since 2026-09-29; 3, the train lines in,
// and 4, the ferry too, since 2026-10-03): each direction's line is read from lines/<id>.json beside it, and a direction whose line file is
// missing or is not its own is a problem. A schema 1 file (map.json, every
// line in it) is read as it is.
//
// The publish workflow runs this on the file it has just written, before
// the commit. A *problem* is a file the app cannot show honestly — a link to
// a hotspot that is not there, a route whose end hotspot is missing, an id
// twice — and stops the publish. A *warning* is data for the owner to look
// at in the studio — a line that ends far from its terminal, a hintuan the
// line passes without being linked to it, a link to one it never reaches —
// or, for line files whose orange stretches the app will not take (below),
// the publish to look at, listed apart; either way the map is published as
// it is, with the warnings on the run's summary page and in the issue the
// workflow keeps (.github/workflows/publish-map.yml).
//
// The rules are the app's own (src/features/routes/geo/pass.ts): a direction
// passes a hotspot when its line comes within PASS_WITHIN_M of the box,
// which is what the studio links on save and what the public map paints
// orange. Judged here on the published line, which lies within half a metre
// of the drawn one, so a pass is only doubted beyond that half metre.
//
// A line file that carries its orange stretches (`pass`, since 2026-10-05,
// the cheap-phone plan, step 13: src/features/routes/geo/line-pass.ts) has them worked
// out again here, against this file's hotspots, as the app would. Where
// their key is the one this file's hotspots give, the app paints them as
// they are: stretches that are not the ones the line and the hotspots make,
// beyond a unit of the sixth decimal (what the publish rounds everything
// else to), are a problem. Stretches under another key, or unreadable, the
// app does not take: it works them out itself, on the phone, as before
// step 13. Against the index the app reads (MAP_FILE_SCHEMA's,
// index.v4.json) that is a warning, so the owner's issue opens (the owner's
// answer to question T of the cheap-phone report, 2026-10-06): the publish
// writes every line file against that very index, so in its run only a
// fault in the publish can make them differ; on the committed map (npm run
// check:data), a line file changed by hand or kept from another publish
// too. Against an older index, shape 3's or 2's, it stays a note: the line
// files are written for the newest, and an older one may lack a hintuan
// they were worked out against (none on the map of 2026-10-05).
import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PASS_WITHIN_M, passBounds } from '../../src/features/routes/geo/pass.ts';
import { hotspotLabel, hotspotRing } from '../../src/features/routes/model/hotspots.ts';
import {
  FERRY_LINES,
  LINES,
  RAIL_LINES,
  isFerry,
  isRail,
  servedBy,
} from '../../src/features/routes/model/routes.ts';
import { stationIndex } from '../../src/features/routes/model/rail-fares.ts';
import { bboxOf, bboxesOverlap, haversine, lineLength } from '../../src/shared/utils/geo.ts';
import { distanceToRingM } from '../../src/features/routes/geo/ring.ts';
import { firstNearIndex } from '../../src/features/routes/geo/pass.ts';
import { linePass, passBoxes, readablePass } from '../../src/features/routes/geo/line-pass.ts';
import { MAP_FILE_SCHEMA } from '../../src/features/published-map/map-file.ts';

/** How far a line's first or last point may sit from the hotspot it leaves from or arrives at. */
export const END_WITHIN_M = 50;
/** The published line lies within this of the drawn one: MAX_DEVIATION_M in scripts/publish/publish-map.mjs. */
const PUBLISHED_WITHIN_M = 0.5;

/** Metres from a point to a hotspot: to its box's edge (0 inside), or to its point when it has no box. */
function toHotspotM(p, s) {
  const ring = hotspotRing(s);
  return ring.length >= 3 ? distanceToRingM(p, ring) : haversine(p, s.point.coordinates);
}

/** How far a stored stretch's point may be from the one worked out again: a unit of the sixth decimal, about 0.1 m. */
export const PASS_TOLERANCE = 1e-6;

/** True when two lists of stretches are the same, point for point, within PASS_TOLERANCE. */
export function sameStretches(a, b) {
  return (
    a.length === b.length &&
    a.every(
      (s, i) =>
        s.length === b[i].length &&
        s.every(
          (p, j) =>
            Math.abs(p[0] - b[i][j][0]) <= PASS_TOLERANCE &&
            Math.abs(p[1] - b[i][j][1]) <= PASS_TOLERANCE,
        ),
    )
  );
}

/** The nearest the line comes to the box, sampled every 2 m; only for a warning's wording. */
function nearestM(line, ring) {
  let best = Infinity;
  for (let i = 0; i < line.length; i++) {
    best = Math.min(best, distanceToRingM(line[i], ring));
    if (i === 0) continue;
    const [a, b] = [line[i - 1], line[i]];
    const steps = Math.ceil(haversine(a, b) / 2);
    for (let t = 1; t < steps; t++)
      best = Math.min(
        best,
        distanceToRingM(
          [a[0] + ((b[0] - a[0]) * t) / steps, a[1] + ((b[1] - a[1]) * t) / steps],
          ring,
        ),
      );
  }
  return best;
}

/**
 * How the one warning that is the publish's to look at, not the studio's,
 * ends: a line file's orange stretches the app will not take against the
 * index it reads (the owner's answer to question T of the cheap-phone
 * report, 2026-10-06). markdownReport lists it under a heading of its own.
 */
const FOR_THE_PUBLISH = 'the publish to look at (scripts/publish/lineFile.mjs), not the studio';

/**
 * Every problem, warning and note about a published map (the parsed file).
 * Problems mean "do not publish"; warnings mean "publish, and tell the owner".
 */
export function checkMapData(file) {
  const problems = [];
  const warnings = [];
  const notes = [];
  const variants = Array.isArray(file?.variants) ? file.variants : null;
  const stops = Array.isArray(file?.stops) ? file.stops : null;
  const links = Array.isArray(file?.links) ? file.links : null;
  if (!variants || !stops || !links) {
    problems.push('not a published map: no variants, stops and links');
    return { problems, warnings, notes, counts: { directions: 0, hotspots: 0, links: 0 } };
  }

  const hotspotById = new Map();
  for (const s of stops) {
    if (hotspotById.has(s.id)) problems.push(`hotspot id ${s.id} appears twice`);
    hotspotById.set(s.id, s);
  }
  const directionById = new Map();
  for (const v of variants) {
    if (directionById.has(v.id)) problems.push(`direction id ${v.id} appears twice`);
    directionById.set(v.id, v);
  }

  for (const s of stops) {
    const label = hotspotLabel(s);
    if (!Array.isArray(s.point?.coordinates) || s.point.coordinates.length !== 2)
      problems.push(`hotspot "${label}" (${s.id}) has no point`);
    if (s.area && hotspotRing(s).length < 3)
      problems.push(`hotspot "${label}" (${s.id}) has a box with fewer than 3 corners`);
    if (s.kind === 'hintuan' && !s.area)
      warnings.push(
        `hintuan "${label}" has no box, so no line can pass it and no timeline will list it`,
      );
    if (s.line != null && s.kind !== 'hintuan')
      problems.push(
        `hotspot "${label}" (${s.id}) is a ${s.kind} with a line; a station is a hintuan`,
      );
    if (s.line != null) {
      if (!LINES.includes(s.line))
        problems.push(
          `hotspot "${label}" (${s.id}) is a station of "${s.line}", which is not a line`,
        );
      // A train's station is priced by the name the card shows (rail-fares.ts): one the table does not know has no fare.
      // The ferry's ride is free, so its stations need no table.
      else if (RAIL_LINES.includes(s.line) && stationIndex(s.line, label) < 0) {
        warnings.push(
          `station "${label}" is not in the ${s.line} fare table, so a ride to or from it shows no fare`,
        );
      }
    }
  }

  const linksOf = new Map();
  for (const l of links) {
    if (!directionById.has(l.route_variant_id))
      problems.push(`a link names direction ${l.route_variant_id}, which is not in the file`);
    if (!hotspotById.has(l.stop_id))
      problems.push(`a link names hotspot ${l.stop_id}, which is not in the file`);
    if (!linksOf.has(l.route_variant_id)) linksOf.set(l.route_variant_id, []);
    linksOf.get(l.route_variant_id).push(l);
  }

  // A pass judged on the published line: sure beyond the half metre either way.
  const surelyNear = PASS_WITHIN_M - PUBLISHED_WITHIN_M;
  const surelyFar = PASS_WITHIN_M + PUBLISHED_WITHIN_M;
  const hintuans = stops
    .filter((s) => s.kind === 'hintuan' && s.area && hotspotRing(s).length >= 3)
    .map((s) => ({ s, ring: hotspotRing(s), bounds: passBounds(hotspotRing(s), surelyFar) }));

  // The orange stretches' boxes, as the app makes them from this file's hotspots (line-pass.ts).
  const boxes = passBoxes(stops);
  /** The directions whose line file carries stretches the app will not take (by name, with the file). */
  const passOther = [];
  let unmapped = 0;
  for (const v of variants) {
    const name = `${v.route?.name ?? v.route_id} · ${v.direction_name ?? v.id}`;
    const head = hotspotById.get(v.route?.head_stop_id);
    const tail = hotspotById.get(v.route?.tail_stop_id);
    if (!head)
      problems.push(
        `${name}: its route's head hotspot ${v.route?.head_stop_id} is not in the file`,
      );
    if (!tail)
      problems.push(
        `${name}: its route's tail hotspot ${v.route?.tail_stop_id} is not in the file`,
      );
    if (isFerry(v.route?.mode) && !FERRY_LINES.includes(v.route?.route_code)) {
      problems.push(
        `${name}: a ferry route whose line ("${v.route?.route_code ?? ''}") is not a ferry line, so it stops at no station`,
      );
    } else if (isRail(v.route?.mode) && !RAIL_LINES.includes(v.route?.route_code)) {
      problems.push(
        `${name}: a train route whose line ("${v.route?.route_code ?? ''}") is not a train line, so it stops at no station`,
      );
    } else if (isRail(v.route?.mode)) {
      // The whole ride is priced from end to end by the ends' names (rail-fares.ts).
      for (const end of [head, tail]) {
        if (end && stationIndex(v.route.route_code, hotspotLabel(end)) < 0) {
          warnings.push(
            `${name}: ends at "${hotspotLabel(end)}", which is not in the ${v.route.route_code} fare table, so its card shows no fare`,
          );
        }
      }
    }
    const line = v.shape?.coordinates;
    if (v.shape && (!Array.isArray(line) || line.length < 2))
      problems.push(`${name}: a line with fewer than 2 points`);
    if (!Array.isArray(line) || line.length < 2) {
      unmapped++;
      continue;
    }

    // The ends. A line may be drawn from the far end (the save panel allows
    // it, with a warning) and the app turns it round; that is a note.
    if (head && tail && head.point?.coordinates && tail.point?.coordinates) {
      const [from, to] = v.reversed ? [tail, head] : [head, tail];
      const start = line[0];
      const end = line[line.length - 1];
      const straight = [toHotspotM(start, from), toHotspotM(end, to)];
      const turned = [toHotspotM(start, to), toHotspotM(end, from)];
      if (straight.every((d) => d <= END_WITHIN_M)) {
        // as drawn
      } else if (turned.every((d) => d <= END_WITHIN_M)) {
        notes.push(`${name}: drawn from the far end; the app turns it round`);
      } else {
        if (straight[0] > END_WITHIN_M)
          warnings.push(
            `${name}: the line starts ${Math.round(straight[0])} m from ${hotspotLabel(from)}`,
          );
        if (straight[1] > END_WITHIN_M)
          warnings.push(
            `${name}: the line ends ${Math.round(straight[1])} m from ${hotspotLabel(to)}`,
          );
      }
    }

    // The links against the line, by the studio's own rule.
    const linked = new Map((linksOf.get(v.id) ?? []).map((l) => [l.stop_id, l]));
    const reach = bboxOf(line);
    for (const { s, ring, bounds } of hintuans) {
      // A hintuan this route does not stop at — a jeep's under a train's
      // track, a station over a jeep's road — is neither owed nor allowed a link.
      if (v.route && !servedBy(s, v.route)) {
        if (linked.has(s.id))
          warnings.push(
            `${name}: linked to "${hotspotLabel(s)}", which it does not stop at, so the timeline lists it wrongly`,
          );
        continue;
      }
      const overlaps = bboxesOverlap(reach, bounds);
      if (linked.has(s.id)) {
        if (!overlaps || firstNearIndex(line, ring, surelyFar) < 0) {
          warnings.push(
            `${name}: linked to "${hotspotLabel(s)}" but the line never comes within ${PASS_WITHIN_M} m of its box ` +
              `(nearest ${Math.round(nearestM(line, ring))} m), so the timeline lists a place the line does not reach`,
          );
        }
      } else if (overlaps && firstNearIndex(line, ring, surelyNear) >= 0) {
        warnings.push(
          `${name}: passes "${hotspotLabel(s)}" but is not linked to it, so the timeline leaves it out`,
        );
      }
    }
    for (const l of linked.values()) {
      const s = hotspotById.get(l.stop_id);
      if (!s || s.kind !== 'terminal') continue;
      const ring = hotspotRing(s);
      const far =
        ring.length >= 3
          ? firstNearIndex(line, ring, END_WITHIN_M) < 0
          : Math.min(...line.map((p) => haversine(p, s.point.coordinates))) > END_WITHIN_M;
      if (far)
        warnings.push(
          `${name}: linked to the terminal "${hotspotLabel(s)}" but the line stays more than ${END_WITHIN_M} m from it`,
        );
    }

    // The orange stretches its line file carries, if any (readPublished), as the app would read them.
    if (v.pass !== undefined || v.passKey !== undefined) {
      const own = linePass(v, boxes);
      if (typeof v.passKey !== 'string' || !readablePass(v.pass) || v.passKey !== own.passKey)
        passOther.push(`${name} (lines/${v.id}.json)`);
      else if (!sameStretches(v.pass, own.pass)) {
        problems.push(
          `${name}: the orange stretches in lines/${v.id}.json are not the ones its line and this file's hintuans make, ` +
            'and the app would paint them as they are',
        );
      }
    }
  }
  if (unmapped) notes.push(`${unmapped} direction(s) not mapped yet`);
  if (passOther.length && file.schema === MAP_FILE_SCHEMA) {
    warnings.push(
      `${passOther.length} line file(s) carry orange stretches worked out against other hintuans than this index's, or unreadable, ` +
        `so every phone that lights them works them out itself: ${passOther.join('; ')}. ` +
        `The publish writes them against this very index: ${FOR_THE_PUBLISH}`,
    );
  } else if (passOther.length) {
    notes.push(
      `${passOther.length} line file(s) carry orange stretches worked out against other hintuans than this file's, or unreadable: the app works those out itself`,
    );
  }

  return {
    problems,
    warnings,
    notes,
    counts: { directions: variants.length, hotspots: stops.length, links: links.length },
  };
}

/**
 * The report as Markdown, for the run's summary page and the issue the
 * workflow keeps. The warnings the studio can answer under one heading, and
 * the one the publish must (FOR_THE_PUBLISH) under its own: under "worth a
 * look in the studio" it said "not the studio" (review of T, 2026-10-06).
 */
export function markdownReport(file, result) {
  const { problems, warnings, notes, counts } = result;
  const when = typeof file?.published_at === 'string' ? ` published ${file.published_at}` : '';
  const lines = [
    `### The map data${when}: ${counts.directions} direction(s), ${counts.hotspots} hotspot(s), ${counts.links} link(s)`,
    '',
  ];
  if (problems.length) {
    lines.push(
      `**${problems.length} problem(s), so this map was not published:**`,
      '',
      ...problems.map((p) => `- ${p}`),
      '',
    );
  }
  const forThePublish = warnings.filter((w) => w.endsWith(FOR_THE_PUBLISH));
  const forTheStudio = warnings.filter((w) => !w.endsWith(FOR_THE_PUBLISH));
  if (forTheStudio.length) {
    lines.push(
      `**${forTheStudio.length} thing(s) worth a look in the studio:**`,
      '',
      ...forTheStudio.map((w) => `- ${w}`),
      '',
    );
  }
  if (forThePublish.length) {
    lines.push(
      `**${forThePublish.length} thing(s) worth a look in the publish:**`,
      '',
      ...forThePublish.map((w) => `- ${w}`),
      '',
    );
  }
  if (!problems.length && !warnings.length)
    lines.push('Nothing to report: every link, line and end agrees.', '');
  if (notes.length) lines.push(...notes.map((n) => `_${n}_`), '');
  return lines.join('\n');
}

/**
 * The published map with every line in full: an index's directions each take
 * their line from lines/<id>.json beside it; a schema 1 file has them already.
 * Returns the problems met on the way, which checkMapData adds to its own.
 */
export function readPublished(path) {
  const file = JSON.parse(readFileSync(path, 'utf8'));
  if (![2, 3, 4].includes(file.schema)) return { file, problems: [] };
  const problems = [];
  const variants = (file.variants ?? []).map(({ overview, ...v }) => {
    if (!overview) return { ...v, shape: null };
    const linePath = join(dirname(path), 'lines', `${v.id}.json`);
    if (!existsSync(linePath)) {
      problems.push(`${v.direction_name ?? v.id}: its line file is missing (lines/${v.id}.json)`);
      return { ...v, shape: overview };
    }
    const line = JSON.parse(readFileSync(linePath, 'utf8'));
    if (line.id !== v.id || line.shape?.type !== 'LineString') {
      problems.push(`${v.direction_name ?? v.id}: lines/${v.id}.json is not this direction's line`);
      return { ...v, shape: overview };
    }
    // The trip card prices the ride from the index's length: it must be its line's.
    if (
      typeof v.metres !== 'number' ||
      Math.abs(v.metres - lineLength(line.shape.coordinates)) > 0.05
    ) {
      problems.push(
        `${v.direction_name ?? v.id}: the index says ${v.metres} m, its line is ${lineLength(line.shape.coordinates).toFixed(2)} m`,
      );
    }
    // Its orange stretches, when the file carries them: checked by checkMapData.
    const pass =
      'pass' in line || 'passKey' in line ? { pass: line.pass, passKey: line.passKey } : {};
    return { ...v, shape: line.shape, ...pass };
  });
  return { file: { ...file, variants }, problems };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const mdAt = args.indexOf('--markdown');
  const mdPath = mdAt >= 0 ? args[mdAt + 1] : null;
  const path =
    args.filter((a, i) => a !== '--markdown' && !(mdAt >= 0 && i === mdAt + 1))[0] ??
    'public/data/index.v4.json';
  let file;
  let reading = [];
  try {
    ({ file, problems: reading } = readPublished(path));
  } catch (e) {
    console.error(`FAIL  could not read ${path}: ${e.message}`);
    process.exit(1);
  }
  const result = checkMapData(file);
  result.problems.unshift(...reading);
  const md = markdownReport(file, result);
  if (mdPath) writeFileSync(mdPath, md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  for (const p of result.problems) console.log(`FAIL  ${p}`);
  for (const w of result.warnings) console.log(`WARN  ${w}`);
  for (const n of result.notes) console.log(`      ${n}`);
  const { counts } = result;
  console.log(
    `\n${path}: ${counts.directions} direction(s), ${counts.hotspots} hotspot(s), ${counts.links} link(s); ` +
      `${result.problems.length} problem(s), ${result.warnings.length} warning(s)`,
  );
  process.exit(result.problems.length ? 1 : 0);
}
