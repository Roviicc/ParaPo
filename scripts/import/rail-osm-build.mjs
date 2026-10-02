// The train lines from OpenStreetMap, as studio rows: LRT-1, LRT-2 and MRT-3,
// each a route with its two directions drawn freehand on the track, and its
// stations as hintuans of that line (0011). Reads the draft extracted from
// api.openstreetmap.org (ODbL), checks the result with the publish's own
// check, and writes the rows as JSON for the import to send.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs scripts/import/rail-osm-build.mjs <draft.json> <rows.json> <owner uuid>
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { haversine, joinSegments, overviewOf, roundLngLat } from '../../src/shared/geo/geo.ts'
import { ringCentroid, ringToPolygon } from '../../src/shared/geo/ring.ts'
import { hintuansAlong } from '../../src/shared/model/timeline.ts'
import { directionName, nameVariants, routeName } from '../../src/shared/model/routes.ts'
import { checkMapData } from '../checks/check-map-data.mjs'

const [draftPath, outPath, owner] = process.argv.slice(2)
if (!draftPath || !outPath || !/^[0-9a-f-]{36}$/.test(owner ?? '')) {
  console.error('usage: rail-osm-build.mjs <draft.json> <rows.json> <owner uuid>')
  process.exit(2)
}
const draft = JSON.parse(readFileSync(draftPath, 'utf8'))

const LINES = { 'lrt-1': { code: 'LRT-1', mode: 'lrt' }, 'lrt-2': { code: 'LRT-2', mode: 'lrt' }, 'mrt-3': { code: 'MRT-3', mode: 'mrt' } }
/**
 * What people say, where it differs from the sign: the sponsor's name off
 * (the owner's default of 2026-10-02, plain names), and LRT-2's Cubao the
 * same place as MRT-3's, so the interchange reads as one.
 */
const SAID = { 'Yamaha Monumento': 'Monumento', 'GMA Kamuning': 'Kamuning', 'Araneta Center - Cubao': 'Cubao' }
/** Freehand stretches are straight between the track's own points, as the studio draws them; set a step in metres to fill them. */
const STEP_M = Infinity

const stopRows = []
const byKey = new Map()
for (const s of draft.stations) {
  const line = LINES[s.lines[0]]
  if (!line || s.lines.length !== 1) throw new Error(`station ${s.key}: one line expected, got ${s.lines}`)
  const ring = s.ring.map(roundLngLat)
  const row = {
    id: randomUUID(),
    owner_id: owner,
    name: `${line.code} ${s.name} Station`,
    informal: SAID[s.name] ?? s.name,
    aliases: SAID[s.name] ? [s.name] : [],
    kind: 'hintuan',
    point: { type: 'Point', coordinates: roundLngLat(ringCentroid(ring)) },
    area: ringToPolygon(ring),
    note: `OpenStreetMap ${s.osm_station ?? s.osm_stop_area?.[0] ?? ''}, ${draft.extracted}${s.issues.length ? ` — check: ${s.issues.join('; ')}` : ''}`,
    line: line.code,
  }
  stopRows.push(row)
  byKey.set(`${s.lines[0]}|${s.name}`, row)
}

/** Straight freehand stretches between the track's own points, each filled every STEP_M. */
function freehand(coords) {
  const pts = coords.map(roundLngLat)
  const control = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1])
  const segments = []
  for (let i = 1; i < control.length; i++) {
    const [a, b] = [control[i - 1], control[i]]
    const n = Math.max(1, Math.ceil(haversine(a, b) / STEP_M))
    const c = [a]
    for (let k = 1; k < n; k++) c.push(roundLngLat([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]))
    c.push(b)
    segments.push({ snap: 'freehand', coordinates: c })
  }
  return { control, segments }
}

const routeRows = []
const variantRows = []
const linkRows = []
for (const L of draft.lines) {
  const line = LINES[L.key]
  const [out, back] = L.directions
  if (out.from !== back.to || out.to !== back.from) throw new Error(`${L.name}: the two directions do not share ends`)
  const head = byKey.get(`${L.key}|${out.from}`)
  const tail = byKey.get(`${L.key}|${out.to}`)
  const route = {
    id: randomUUID(),
    owner_id: owner,
    signboard: null,
    route_code: line.code,
    mode: line.mode,
    fare_note: null,
    head_stop_id: head.id,
    tail_stop_id: tail.id,
    via: null,
  }
  routeRows.push(route)
  for (const [dir, reversed] of [[out, false], [back, true]]) {
    const { control, segments } = freehand(dir.coordinates)
    const coordinates = joinSegments(segments)
    const v = {
      id: randomUUID(),
      route_id: route.id,
      owner_id: owner,
      reversed,
      control_points: control,
      segments,
      shape: { type: 'LineString', coordinates },
      overview: { type: 'LineString', coordinates: overviewOf(coordinates) },
      confidence: 'drawn',
    }
    variantRows.push(v)
    for (const { stop, index } of hintuansAlong(coordinates, stopRows, route)) {
      linkRows.push({ route_variant_id: v.id, stop_id: stop.id, stop_sequence: index })
    }
  }
}

// The publish's own check, on the rows as the file would carry them.
const named = nameVariants(
  variantRows.map((v) => ({ ...v, direction_name: null, origin_terminal: null, destination_terminal: null, route: routeRows.find((r) => r.id === v.route_id) })),
  stopRows,
)
const report = checkMapData({ schema: 1, published_at: draft.extracted, variants: named, stops: stopRows, links: linkRows })
for (const p of report.problems) console.log('PROBLEM', p)
for (const w of report.warnings) console.log('warning', w)
for (const n of report.notes ?? []) console.log('note', n)
for (const v of named) {
  const n = linkRows.filter((l) => l.route_variant_id === v.id).length
  console.log(`${v.route.name} · ${v.direction_name}: ${v.control_points.length} points, ${v.shape.coordinates.length} on the line, ${n} stations`)
}
writeFileSync(outPath, JSON.stringify({ source: draft.source, extracted: draft.extracted, stops: stopRows, routes: routeRows, variants: variantRows, links: linkRows }))
console.log(`${stopRows.length} stations, ${routeRows.length} routes, ${variantRows.length} directions, ${linkRows.length} links → ${outPath}`)
