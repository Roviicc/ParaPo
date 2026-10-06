// Walking links between nearby hotspots in one area: a trial, written
// 2026-10-06 when the owner asked to try walking features on Caloocan's
// hintuans. Each pair of hotspots in the area within --within metres of each
// other in a straight line gets the walk between them as a pedestrian router
// finds it, and what that walk is on: road, footpath, a crossing, stairs, a
// footbridge. The studio draws the result (src/studio/walk/useWalkLinks.ts).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs \
//     scripts/walk/walk-links.mjs [--area Caloocan] [--within 450]
//
// It reads the published file, public/data/index.v4.json, and never the
// database: the hotspots are the ones the public map has. Then it asks two
// public services, one request at a time and a second apart, as their rules
// ask, under a User-Agent that names it:
//
//   Nominatim (OpenStreetMap)  once, for the area's boundary
//   Valhalla (FOSSGIS's server, pedestrian costing)
//                              per pair, the walk (route), then the ground
//                              each stretch of it is on (trace_attributes)
//
// Both are free for light use like this, an editor's one-off run; neither is
// for a visitor's every tap (docs/research/ph-commute-apps-feature-bank.md,
// F09). The walk is the router's suggestion from OpenStreetMap's data, not
// ground truth: at Zabarte (2026-10-06) OSRM's foot profile crossed Camarin
// Road on the footbridge and Valhalla at the corner. An editor checks each.
//
// Writes src/studio/walk/walkLinks.trial.json, replacing it.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inArea, linkRecord, pairsWithin } from './walkParts.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const INDEX = join(root, 'public', 'data', 'index.v4.json')
const OUT = join(root, 'src', 'studio', 'walk', 'walkLinks.trial.json')
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const VALHALLA = 'https://valhalla1.openstreetmap.de'
const HEADERS = { 'user-agent': 'ParaPo walk-links (editor one-off script)', 'content-type': 'application/json' }
const GAP_MS = 1100

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const area = arg('area', 'Caloocan')
const withinM = Number(arg('within', '450'))
if (!(withinM > 0)) throw new Error(`--within must be a number of metres, not ${arg('within')}`)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let last = 0
/** One request, no sooner than GAP_MS after the one before. */
async function ask(url, init) {
  const wait = last + GAP_MS - Date.now()
  if (wait > 0) await sleep(wait)
  last = Date.now()
  const res = await fetch(url, { ...init, headers: HEADERS })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}: ${JSON.stringify(body)}`)
  return body
}

const index = JSON.parse(readFileSync(INDEX, 'utf8'))

const found = await ask(`${NOMINATIM}?${new URLSearchParams({ q: area, countrycodes: 'ph', format: 'geojson', polygon_geojson: '1', limit: '5' })}`)
const boundary = found.features.find(
  (f) => f.properties.category === 'boundary' && /Polygon$/.test(f.geometry.type),
)
if (!boundary) throw new Error(`Nominatim has no boundary for "${area}"`)
const p = boundary.properties
console.log(`${area}: ${p.display_name} (OpenStreetMap ${p.osm_type} ${p.osm_id})`)

const hotspots = index.stops.filter((s) => inArea(s.point.coordinates, boundary.geometry))
const pairs = pairsWithin(hotspots, withinM)
console.log(`${hotspots.length} of the published file's ${index.stops.length} hotspots are in it; ${pairs.length} pairs within ${withinM} m`)

const links = []
const skipped = []
for (const pair of pairs) {
  const { a, b } = pair
  const locations = [a, b].map((s) => ({ lon: s.point.coordinates[0], lat: s.point.coordinates[1] }))
  try {
    const route = await ask(`${VALHALLA}/route`, {
      method: 'POST',
      body: JSON.stringify({ locations, costing: 'pedestrian' }),
    })
    const { shape, summary } = route.trip.legs[0]
    const traced = await ask(`${VALHALLA}/trace_attributes`, {
      method: 'POST',
      body: JSON.stringify({
        encoded_polyline: shape,
        shape_match: 'edge_walk',
        costing: 'pedestrian',
        filters: { attributes: ['edge.use', 'edge.bridge', 'edge.tunnel', 'edge.length'], action: 'include' },
      }),
    })
    const link = linkRecord(pair, { shape, lengthKm: summary.length, timeS: summary.time }, traced.edges ?? [])
    links.push(link)
    const on = Object.entries(link.on).filter(([, m]) => m > 0).map(([k, m]) => `${k} ${m}`).join(', ')
    console.log(`  ${String(link.straight_m).padStart(4)} m apart, ${String(link.walk_m).padStart(4)} m walk (${on})  ${a.name} ↔ ${b.name}`)
  } catch (e) {
    skipped.push({ from: a.id, to: b.id, from_name: a.name, to_name: b.name, reason: e instanceof Error ? e.message : String(e) })
    console.log(`  skipped ${a.name} ↔ ${b.name}: ${skipped.at(-1).reason}`)
  }
}

const file = {
  trial: 'Walking links between nearby hotspots, suggested by a router: not checked on the ground. See scripts/walk/walk-links.mjs.',
  area,
  area_osm: `${p.osm_type}/${p.osm_id}`,
  router: 'Valhalla, pedestrian costing (valhalla1.openstreetmap.de), OpenStreetMap data',
  licence: 'ODbL 1.0: the walks © OpenStreetMap contributors, the hotspots © ParaPo contributors',
  made_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  published_at: index.published_at,
  within_m: withinM,
  links,
  skipped,
}
// One link to a line, so a run's changes read as a diff of links.
const list = (xs) => (xs.length ? `[\n${xs.map((x) => `  ${JSON.stringify(x)}`).join(',\n')}\n ]` : '[]')
const head = Object.entries(file).map(([k, v]) => ` ${JSON.stringify(k)}: ${Array.isArray(v) ? list(v) : JSON.stringify(v)}`)
writeFileSync(OUT, `{\n${head.join(',\n')}\n}\n`)
console.log(`${links.length} links${skipped.length ? `, ${skipped.length} skipped` : ''} → ${OUT.slice(root.length + 1)}`)
