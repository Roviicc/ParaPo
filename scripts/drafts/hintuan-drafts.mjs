// Hintuan drafts from OpenStreetMap's stops, for one area: written
// 2026-10-06 when the owner asked for drafts around Caloocan only. Every stop
// OpenStreetMap has (a bus stop, or a jeepney shelter or station) that lies
// in the area, on one of the published jeepney lines and clear of every saved
// hotspot becomes a box the size of the owner's own, on the stop's side of
// the road. The studio lists them under + New hotspot, "From a draft", and
// opens one as an outline with its name filled in; nothing is saved until
// the owner saves it (src/studio/drafts/).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs \
//     scripts/drafts/hintuan-drafts.mjs [--area Caloocan]
//
// It reads the published file, public/data/index.v4.json, and the lines
// beside it, never the database. It asks Nominatim (OpenStreetMap) once for
// the area's boundary, under a User-Agent that names it, and OpenFreeMap for
// the zoom-14 tiles under the jeepney lines, one at a time; the stops are the
// tiles' `poi` layer, OpenStreetMap's data as OpenMapTiles carries it.
//
// A draft is OpenStreetMap's word, not the ground's: a stop mapped years ago,
// a jeep that stops a little further on, a name nobody says. The owner checks
// each before saving it.
//
// Writes src/studio/drafts/hintuanDrafts.trial.json, replacing it.
import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { inArea } from '../walk/walkParts.mjs'
import { candidates, draftRecord, mergeNear } from './draftParts.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DATA = join(root, 'public', 'data')
const OUT = join(root, 'src', 'studio', 'drafts', 'hintuanDrafts.trial.json')
const HEADERS = { 'user-agent': 'ParaPo hintuan-drafts (editor one-off script)' }
const Z = 14

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const area = arg('area', 'Caloocan')

const get = async (url) => {
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`${res.status} from ${url}`)
  return res
}

const index = JSON.parse(readFileSync(join(DATA, 'index.v4.json'), 'utf8'))
const jeepney = index.variants.filter((v) => v.route.mode === 'jeepney' && v.overview)
const lines = jeepney.map((v) => JSON.parse(readFileSync(join(DATA, 'lines', `${v.id}.json`), 'utf8')).shape.coordinates)

const found = await (
  await get(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: area, countrycodes: 'ph', format: 'geojson', polygon_geojson: '1', limit: '5' })}`)
).json()
const boundary = found.features.find((f) => f.properties.category === 'boundary' && /Polygon$/.test(f.geometry.type))
if (!boundary) throw new Error(`Nominatim has no boundary for "${area}"`)
const p = boundary.properties
console.log(`${area}: ${p.display_name} (OpenStreetMap ${p.osm_type} ${p.osm_id})`)

// The tiles under the jeepney lines inside the area, padded about 100 m.
const n = 2 ** Z
const tx = (lng) => Math.floor(((lng + 180) / 360) * n)
const ty = (lat) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)
}
const tiles = new Set()
for (const line of lines) {
  for (const [lng, lat] of line) {
    if (!inArea([lng, lat], boundary.geometry)) continue
    for (const dx of [-0.001, 0, 0.001]) for (const dy of [-0.001, 0, 0.001]) tiles.add(`${tx(lng + dx)}/${ty(lat + dy)}`)
  }
}
const tileJson = await (await get('https://tiles.openfreemap.org/planet')).json()
const template = tileJson.tiles[0]
console.log(`${jeepney.length} jeepney directions; ${tiles.size} tiles under them in ${area} (${template})`)

const pois = new Map()
for (const t of tiles) {
  const [x, y] = t.split('/').map(Number)
  let bytes = Buffer.from(await (await get(template.replace('{z}', Z).replace('{x}', x).replace('{y}', y))).arrayBuffer())
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes)
  const layer = new VectorTile(new PbfReader(bytes)).layers.poi
  for (let i = 0; i < (layer?.length ?? 0); i++) {
    const feature = layer.feature(i)
    const g = feature.toGeoJSON(x, y, Z).geometry
    if (g.type !== 'Point' || !inArea(g.coordinates, boundary.geometry)) continue
    const { class: cls, subclass, name } = feature.properties
    const key = `${name}|${g.coordinates[0].toFixed(6)}|${g.coordinates[1].toFixed(6)}`
    if (!pois.has(key)) pois.set(key, { class: cls, subclass, name, at: g.coordinates })
  }
}

// North to south, so a list reads down the map; a bus stop before a shelter
// at the same spot, so the stop's name is the one kept.
const stopsFirst = (c) => (c.class === 'bus' ? 0 : 1)
const stops = candidates([...pois.values()], { lines, hotspots: index.stops })
  .sort((a, b) => stopsFirst(a) - stopsFirst(b) || b.at[1] - a.at[1])
const drafts = mergeNear(stops)
  .sort((a, b) => b.at[1] - a.at[1])
  .map(draftRecord)
console.log(`${pois.size} POIs in ${area} under the lines; ${stops.length} stops clear of the saved hotspots; ${drafts.length} drafts`)
for (const d of drafts) {
  console.log(`  ${d.name}${d.osm_names.length > 1 ? ` (also ${d.osm_names.slice(1).join(', ')})` : ''}${d.on_road ? ', on the road' : ''} — ${d.route_m} m from the line, ${d.nearest?.metres} m from ${d.nearest?.name}`)
}

const file = {
  trial: 'Hintuan drafts from OpenStreetMap\'s stops: not checked on the ground. See scripts/drafts/hintuan-drafts.mjs.',
  area,
  area_osm: `${p.osm_type}/${p.osm_id}`,
  source: `OpenStreetMap's stops, as OpenFreeMap's tiles carry them (${template.split('/')[4]})`,
  licence: 'ODbL 1.0: © OpenStreetMap contributors',
  made_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  published_at: index.published_at,
  drafts,
}
// One draft to a line, so a run's changes read as a diff of drafts.
const list = (xs) => (xs.length ? `[\n${xs.map((x) => `  ${JSON.stringify(x)}`).join(',\n')}\n ]` : '[]')
const head = Object.entries(file).map(([k, v]) => ` ${JSON.stringify(k)}: ${Array.isArray(v) ? list(v) : JSON.stringify(v)}`)
writeFileSync(OUT, `{\n${head.join(',\n')}\n}\n`)
console.log(`→ ${OUT.slice(root.length + 1)}`)
