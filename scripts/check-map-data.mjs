// The published map against itself: do its lines, links and ends agree?
//
//   npm run check:data                          public/data/map.json
//   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/check-map-data.mjs [file] [--markdown out.md]
//
// The publish workflow runs this on the file it has just written, before
// the commit. A *problem* is a file the app cannot show honestly — a link to
// a hotspot that is not there, a route whose end hotspot is missing, an id
// twice — and stops the publish. A *warning* is data for the owner to look
// at in the studio — a line that ends far from its terminal, a hintuan the
// line passes without being linked to it, a link to one it never reaches —
// and the map is published as it is, with the warnings on the run's summary
// page and in the issue the workflow keeps (.github/workflows/publish-map.yml).
//
// The rules are the app's own (src/shared/stops.ts and geo.ts): a direction
// passes a hotspot when its line comes within PASS_WITHIN_M of the box,
// which is what the studio links on save and what the public map paints
// orange. Judged here on the published line, which lies within half a metre
// of the drawn one, so a pass is only doubted beyond that half metre.
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { PASS_WITHIN_M, passBounds, stopLabel, stopRing } from '../src/shared/stops.ts'
import { bboxOf, bboxesOverlap, distanceToRingM, firstNearIndex, haversine } from '../src/shared/geo.ts'

/** How far a line's first or last point may sit from the hotspot it leaves from or arrives at. */
export const END_WITHIN_M = 50
/** The published line lies within this of the drawn one: MAX_DEVIATION_M in scripts/publish-map.mjs. */
const PUBLISHED_WITHIN_M = 0.5

/** Metres from a point to a hotspot: to its box's edge (0 inside), or to its point when it has no box. */
function toStopM(p, s) {
  const ring = stopRing(s)
  return ring.length >= 3 ? distanceToRingM(p, ring) : haversine(p, s.point.coordinates)
}

/** The nearest the line comes to the box, sampled every 2 m; only for a warning's wording. */
function nearestM(line, ring) {
  let best = Infinity
  for (let i = 0; i < line.length; i++) {
    best = Math.min(best, distanceToRingM(line[i], ring))
    if (i === 0) continue
    const [a, b] = [line[i - 1], line[i]]
    const steps = Math.ceil(haversine(a, b) / 2)
    for (let t = 1; t < steps; t++) best = Math.min(best, distanceToRingM([a[0] + ((b[0] - a[0]) * t) / steps, a[1] + ((b[1] - a[1]) * t) / steps], ring))
  }
  return best
}

/**
 * Every problem, warning and note about a published map (the parsed file).
 * Problems mean "do not publish"; warnings mean "publish, and tell the owner".
 */
export function checkMapData(file) {
  const problems = []
  const warnings = []
  const notes = []
  const variants = Array.isArray(file?.variants) ? file.variants : null
  const stops = Array.isArray(file?.stops) ? file.stops : null
  const links = Array.isArray(file?.links) ? file.links : null
  if (!variants || !stops || !links) {
    problems.push('not a published map: no variants, stops and links')
    return { problems, warnings, notes, counts: { directions: 0, hotspots: 0, links: 0 } }
  }

  const stopById = new Map()
  for (const s of stops) {
    if (stopById.has(s.id)) problems.push(`hotspot id ${s.id} appears twice`)
    stopById.set(s.id, s)
  }
  const variantById = new Map()
  for (const v of variants) {
    if (variantById.has(v.id)) problems.push(`direction id ${v.id} appears twice`)
    variantById.set(v.id, v)
  }

  for (const s of stops) {
    const label = stopLabel(s)
    if (!Array.isArray(s.point?.coordinates) || s.point.coordinates.length !== 2) problems.push(`hotspot "${label}" (${s.id}) has no point`)
    if (s.area && stopRing(s).length < 3) problems.push(`hotspot "${label}" (${s.id}) has a box with fewer than 3 corners`)
    if (s.kind === 'hintuan' && !s.area) warnings.push(`hintuan "${label}" has no box, so no line can pass it and no timeline will list it`)
  }

  const linksOf = new Map()
  for (const l of links) {
    if (!variantById.has(l.route_variant_id)) problems.push(`a link names direction ${l.route_variant_id}, which is not in the file`)
    if (!stopById.has(l.stop_id)) problems.push(`a link names hotspot ${l.stop_id}, which is not in the file`)
    if (!linksOf.has(l.route_variant_id)) linksOf.set(l.route_variant_id, [])
    linksOf.get(l.route_variant_id).push(l)
  }

  // A pass judged on the published line: sure beyond the half metre either way.
  const surelyNear = PASS_WITHIN_M - PUBLISHED_WITHIN_M
  const surelyFar = PASS_WITHIN_M + PUBLISHED_WITHIN_M
  const hintuans = stops
    .filter((s) => s.kind === 'hintuan' && s.area && stopRing(s).length >= 3)
    .map((s) => ({ s, ring: stopRing(s), bounds: passBounds(stopRing(s), surelyFar) }))

  let unmapped = 0
  for (const v of variants) {
    const name = `${v.route?.name ?? v.route_id} · ${v.direction_name ?? v.id}`
    const head = stopById.get(v.route?.head_stop_id)
    const tail = stopById.get(v.route?.tail_stop_id)
    if (!head) problems.push(`${name}: its route's head hotspot ${v.route?.head_stop_id} is not in the file`)
    if (!tail) problems.push(`${name}: its route's tail hotspot ${v.route?.tail_stop_id} is not in the file`)
    const line = v.shape?.coordinates
    if (v.shape && (!Array.isArray(line) || line.length < 2)) problems.push(`${name}: a line with fewer than 2 points`)
    if (!Array.isArray(line) || line.length < 2) {
      unmapped++
      continue
    }

    // The ends. A line may be drawn from the far end (the save panel allows
    // it, with a warning) and the app turns it round; that is a note.
    if (head && tail && head.point?.coordinates && tail.point?.coordinates) {
      const [from, to] = v.reversed ? [tail, head] : [head, tail]
      const start = line[0]
      const end = line[line.length - 1]
      const straight = [toStopM(start, from), toStopM(end, to)]
      const turned = [toStopM(start, to), toStopM(end, from)]
      if (straight.every((d) => d <= END_WITHIN_M)) {
        // as drawn
      } else if (turned.every((d) => d <= END_WITHIN_M)) {
        notes.push(`${name}: drawn from the far end; the app turns it round`)
      } else {
        if (straight[0] > END_WITHIN_M) warnings.push(`${name}: the line starts ${Math.round(straight[0])} m from ${stopLabel(from)}`)
        if (straight[1] > END_WITHIN_M) warnings.push(`${name}: the line ends ${Math.round(straight[1])} m from ${stopLabel(to)}`)
      }
    }

    // The links against the line, by the studio's own rule.
    const linked = new Map((linksOf.get(v.id) ?? []).map((l) => [l.stop_id, l]))
    const reach = bboxOf(line)
    for (const { s, ring, bounds } of hintuans) {
      const overlaps = bboxesOverlap(reach, bounds)
      if (linked.has(s.id)) {
        if (!overlaps || firstNearIndex(line, ring, surelyFar) < 0) {
          warnings.push(
            `${name}: linked to "${stopLabel(s)}" but the line never comes within ${PASS_WITHIN_M} m of its box ` +
              `(nearest ${Math.round(nearestM(line, ring))} m), so the timeline lists a place the line does not reach`,
          )
        }
      } else if (overlaps && firstNearIndex(line, ring, surelyNear) >= 0) {
        warnings.push(`${name}: passes "${stopLabel(s)}" but is not linked to it, so the timeline leaves it out`)
      }
    }
    for (const l of linked.values()) {
      const s = stopById.get(l.stop_id)
      if (!s || s.kind !== 'terminal') continue
      const ring = stopRing(s)
      const far = ring.length >= 3 ? firstNearIndex(line, ring, END_WITHIN_M) < 0 : Math.min(...line.map((p) => haversine(p, s.point.coordinates))) > END_WITHIN_M
      if (far) warnings.push(`${name}: linked to the terminal "${stopLabel(s)}" but the line stays more than ${END_WITHIN_M} m from it`)
    }
  }
  if (unmapped) notes.push(`${unmapped} direction(s) not mapped yet`)

  return { problems, warnings, notes, counts: { directions: variants.length, hotspots: stops.length, links: links.length } }
}

/** The report as Markdown, for the run's summary page and the issue the workflow keeps. */
export function markdownReport(file, result) {
  const { problems, warnings, notes, counts } = result
  const when = typeof file?.published_at === 'string' ? ` published ${file.published_at}` : ''
  const lines = [`### The map data${when}: ${counts.directions} direction(s), ${counts.hotspots} hotspot(s), ${counts.links} link(s)`, '']
  if (problems.length) {
    lines.push(`**${problems.length} problem(s), so this map was not published:**`, '', ...problems.map((p) => `- ${p}`), '')
  }
  if (warnings.length) {
    lines.push(`**${warnings.length} thing(s) worth a look in the studio:**`, '', ...warnings.map((w) => `- ${w}`), '')
  }
  if (!problems.length && !warnings.length) lines.push('Nothing to report: every link, line and end agrees.', '')
  if (notes.length) lines.push(...notes.map((n) => `_${n}_`), '')
  return lines.join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const mdAt = args.indexOf('--markdown')
  const mdPath = mdAt >= 0 ? args[mdAt + 1] : null
  const path = args.filter((a, i) => a !== '--markdown' && i !== mdAt + 1)[0] ?? 'public/data/map.json'
  let file
  try {
    file = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    console.error(`FAIL  could not read ${path}: ${e.message}`)
    process.exit(1)
  }
  const result = checkMapData(file)
  const md = markdownReport(file, result)
  if (mdPath) writeFileSync(mdPath, md)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n')
  for (const p of result.problems) console.log(`FAIL  ${p}`)
  for (const w of result.warnings) console.log(`WARN  ${w}`)
  for (const n of result.notes) console.log(`      ${n}`)
  const { counts } = result
  console.log(
    `\n${path}: ${counts.directions} direction(s), ${counts.hotspots} hotspot(s), ${counts.links} link(s); ` +
      `${result.problems.length} problem(s), ${result.warnings.length} warning(s)`,
  )
  process.exit(result.problems.length ? 1 : 0)
}
