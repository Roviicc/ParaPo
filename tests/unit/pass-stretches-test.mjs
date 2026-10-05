// The orange stretches (src/shared/geo/pass.ts, passStretches) with the bounds
// checks of 2026-09-25, against the same walk without them.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/pass-stretches-test.mjs
//
// Why this exists: with 1,000 directions and 500 hotspots the public map took
// 142 s to open, all of it measuring every vertex of every line against every
// box. Two cheap questions now come first — is this vertex inside the box's
// padded bounds, and does this line's box reach this box's at all — and
// this proves they change nothing about what is painted: the stretches of
// every direction past every box in the committed map are the same, and a
// pair the caller skips has no stretch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PASS_WITHIN_M, passBounds, passStretches } from '../../src/shared/geo/pass.ts'
import { stopRing } from '../../src/shared/model/stops.ts'
import { bboxOf, bboxesOverlap, haversine } from '../../src/shared/geo/geo.ts'
import { distanceToRingM } from '../../src/shared/geo/ring.ts'
import { fileURLToPath } from 'node:url'
import { readPublished } from '../../scripts/checks/check-map-data.mjs'

/** The committed map, every line in full: the index and its lines/ (check-map-data.mjs). */
const published = () => readPublished(fileURLToPath(new URL('../../public/data/index.v4.json', import.meta.url))).file

const file = published()
const lines = file.variants.filter((v) => v.shape).map((v) => ({ id: v.id, line: v.shape.coordinates }))
const rings = file.stops.filter((s) => s.area).map((s) => ({ id: s.id, ring: stopRing(s) }))

/** The walk as it was before the bounds checks: the ring distance for every vertex, samples only near the box. */
function slowStretches(line, ring, withinM = PASS_WITHIN_M, stepM = 1) {
  if (ring.length < 3 || line.length < 2) return []
  const k = Math.cos((ring[0][1] * Math.PI) / 180)
  const padLat = (withinM + 2 * stepM) / 111_000
  const padLng = padLat / k
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of ring) {
    if (x < w) w = x
    if (x > e) e = x
    if (y < s) s = y
    if (y > n) n = y
  }
  ;[w, s, e, n] = [w - padLng, s - padLat, e + padLng, n + padLat]
  const nearBox = (a, b) => Math.max(a[0], b[0]) >= w && Math.min(a[0], b[0]) <= e && Math.max(a[1], b[1]) >= s && Math.min(a[1], b[1]) <= n
  const near = (p) => distanceToRingM(p, ring) <= withinM
  const out = []
  // A one-point stretch as pass.ts draws it since 2026-10-03: from the sample before it, or to the one after.
  const st = { cur: null, pending: null, before: null, last: null }
  const close = (after) => {
    if (!st.cur) return
    if (st.pending) st.cur.push(st.pending)
    if (st.cur.length > 1) out.push(st.cur)
    else out.push(st.before ? [st.before, st.cur[0]] : [st.cur[0], after ?? st.cur[0]])
    st.cur = null
    st.pending = null
  }
  const take = (p, isVertex) => {
    const before = st.last
    st.last = p
    if (!near(p)) return close(p)
    if (!st.cur) {
      st.cur = [p]
      st.before = before
    } else if (isVertex) st.cur.push(p)
    st.pending = isVertex ? null : st.cur[0] === p ? null : p
  }
  take(line[0], true)
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]]
    if (nearBox(a, b)) {
      const steps = Math.max(1, Math.ceil(haversine(a, b) / stepM))
      for (let t = 1; t < steps; t++) take([a[0] + ((b[0] - a[0]) * t) / steps, a[1] + ((b[1] - a[1]) * t) / steps], false)
    }
    take(b, true)
  }
  close()
  return out
}

test('the committed map has lines and boxes to check against', () => {
  assert.ok(lines.length >= 2, `${lines.length} line(s)`)
  assert.ok(rings.length >= 10, `${rings.length} box(es)`)
})

test('every direction past every box: the same stretches with the bounds checks as without', () => {
  let pairs = 0
  let stretches = 0
  for (const { id, line } of lines) {
    for (const { id: box, ring } of rings) {
      const fast = passStretches(line, ring)
      const slow = slowStretches(line, ring)
      assert.deepEqual(fast, slow, `direction ${id} past box ${box}`)
      pairs++
      stretches += fast.length
    }
  }
  assert.ok(stretches > 0, 'no stretch anywhere in the committed map')
  console.log(`  ${pairs} pairs, ${stretches} stretch(es), identical`)
})

test('a pair whose bounds do not overlap has no stretch, so the caller may skip it', () => {
  let skipped = 0
  for (const { line } of lines) {
    const reach = bboxOf(line)
    for (const { ring } of rings) {
      if (bboxesOverlap(reach, passBounds(ring))) continue
      skipped++
      assert.deepEqual(passStretches(line, ring), [])
    }
  }
  console.log(`  ${skipped} of ${lines.length * rings.length} pairs skippable today`)
})

test('a line through a box is painted; one 100 m away is not', () => {
  // A 40 m box at Tala, and a straight line west to east through its middle.
  const [x, y] = [121.06, 14.735]
  const d = 20 / 111_000
  const ring = [[x - d, y - d], [x + d, y - d], [x + d, y + d], [x - d, y + d]]
  const through = [[x - 10 * d, y], [x + 10 * d, y]]
  const stretch = passStretches(through, ring)
  assert.equal(stretch.length, 1)
  assert.ok(stretch[0].length >= 2)
  for (const p of [stretch[0][0], stretch[0][stretch[0].length - 1]]) assert.ok(distanceToRingM(p, ring) <= PASS_WITHIN_M + 1, `end ${distanceToRingM(p, ring).toFixed(1)} m from the box`)
  const far = [[x - 10 * d, y + 5 * d], [x + 10 * d, y + 5 * d]]
  assert.deepEqual(passStretches(far, ring), [])
})

// Review of 2026-10-03, finding 14: a line whose only point near the box is
// a vertex — its end, coming straight at the box — was passed (passIndex)
// but painted nothing, its one-point stretch dropped.
test('a line that only comes near at its end vertex gets a stub of a stretch, as passIndex lists it', async () => {
  const { passIndex } = await import('../../src/shared/geo/pass.ts')
  const m = 1 / 111_000
  const ring = [[121.04, 14.7], [121.0401, 14.7], [121.0401, 14.7001], [121.04, 14.7001]]
  // Coming up from the south, ending 4.5 m below the box's lower edge.
  const end = [121.04005, 14.7 - 4.5 * m]
  const line = [[121.04005, 14.7 - 40 * m], end]
  assert.ok(passIndex(line, ring) >= 0)
  const out = passStretches(line, ring)
  assert.equal(out.length, 1)
  assert.equal(out[0].length, 2)
  assert.deepEqual(out[0][1], end)
  assert.ok(haversine(out[0][0], end) <= 1.01)
  // The other way round: the line starts there and leaves.
  const back = passStretches([...line].reverse(), ring)
  assert.equal(back.length, 1)
  assert.deepEqual(back[0][0], end)
})

// The cheap-phone plan, step 16 (a), 2026-10-04: each direction's stretches
// worked out once per list of boxes and kept (passStretches.ts, stretchesOf),
// against the hook's memo as it was, kept word for word here.
import { passBoxes, stretchesOf, stretchesPast } from '../../src/shared/geo/passStretches.ts'
import { servedBy, variantLine } from '../../src/shared/model/routes.ts'

/** usePassStretches' features before step 16, word for word (but for types). */
function oldFeatures(variants, stops) {
  const boxes = stops
    .filter((s) => s.kind === 'hintuan' && s.area)
    .map((s) => {
      const ring = stopRing(s)
      return { stop: s, ring, bounds: passBounds(ring) }
    })
  return variants.flatMap((v) => {
    const line = variantLine(v)
    if (line.length < 2) return []
    const reach = bboxOf(line)
    return boxes.filter((b) => bboxesOverlap(reach, b.bounds) && servedBy(b.stop, v.route)).flatMap(({ ring }) =>
      passStretches(line, ring).map((coordinates) => ({
        type: 'Feature',
        properties: { id: v.id, route_id: v.route_id },
        geometry: { type: 'LineString', coordinates },
      })),
    )
  })
}

test('step 16 (a): the stretches kept per direction are the ones worked out before, for every direction', () => {
  const variants = file.variants
  const boxes = passBoxes(file.stops)
  const kept = variants.flatMap((v) => stretchesOf(v, boxes))
  assert.deepStrictEqual(kept, oldFeatures(variants, file.stops))
  assert.ok(kept.length > 50, `${kept.length} stretches`)
  // A direction with no line yet (an overview-less slot) has none.
  assert.deepStrictEqual(stretchesOf({ ...variants[0], shape: null }, boxes), [])
})

test('step 16 (a): asked again with the same direction and boxes, the very same array; a new line or new boxes, worked out anew', () => {
  const boxes = passBoxes(file.stops)
  const v = file.variants.find((x) => x.shape && stretchesPast(x, boxes).length > 0)
  const first = stretchesOf(v, boxes)
  assert.equal(stretchesOf(v, boxes), first, 'the same direction and boxes: kept')
  // A line arriving makes the direction a new object (useSavedRoutes' withLine): never the old stretches.
  const turned = { ...v, shape: { ...v.shape, coordinates: [...v.shape.coordinates].reverse() } }
  const again = stretchesOf(turned, boxes)
  assert.notEqual(again, first)
  assert.deepStrictEqual(again, stretchesPast(turned, boxes))
  assert.notDeepStrictEqual(again, first, 'the stretches of the line turned round run the other way')
  // Another list of stops makes other boxes: nothing kept from the last.
  const moved = file.stops.map((s) => (s.kind === 'hintuan' && s.area ? { ...s, area: { ...s.area, coordinates: [s.area.coordinates[0].map(([x, y]) => [x + 0.01, y])] } } : s))
  const otherBoxes = passBoxes(moved)
  assert.notEqual(stretchesOf(v, otherBoxes), first)
  assert.deepStrictEqual(stretchesOf(v, otherBoxes), stretchesPast(v, otherBoxes))
  assert.notDeepStrictEqual(stretchesOf(v, otherBoxes), first, 'the boxes moved, and so did their stretches')
  // The same stops again, a new list: worked out anew, the same stretches.
  const sameAgain = passBoxes(file.stops)
  assert.notEqual(stretchesOf(v, sameAgain), first)
  assert.deepStrictEqual(stretchesOf(v, sameAgain), first)
})

// The cheap-phone plan, step 13, 2026-10-05: each line file carries its
// direction's stretches, worked out by the publish (scripts/publish/lineFile.mjs,
// src/shared/geo/linePass.ts), with a key: the hintuans they were worked out
// against. The app takes them only when the index it has gives the same key,
// and works them out as before otherwise.
import { PASS_RULE, keepLinePass, linePass, passKey, publishedStretches, boxesReached } from '../../src/shared/geo/linePass.ts'
import { lineFileText } from '../../scripts/publish/lineFile.mjs'
import { checkMapData } from '../../scripts/checks/check-map-data.mjs'
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

// A flat patch of Tala: metres east and north of a corner, as lng/lat.
const [X0, Y0] = [121.05, 14.73]
const at = (eastM, northM) => [X0 + eastM / (111_320 * Math.cos((Y0 * Math.PI) / 180)), Y0 + northM / 110_574]
const squareAt = (eastM, northM, halfM = 15) => ({
  type: 'Polygon',
  coordinates: [[at(eastM - halfM, northM - halfM), at(eastM + halfM, northM - halfM), at(eastM + halfM, northM + halfM), at(eastM - halfM, northM + halfM), at(eastM - halfM, northM - halfM)]],
})
const hotspot = (id, kind, eastM, northM, extra = {}) => ({
  id,
  name: id,
  informal: null,
  aliases: [],
  kind,
  point: { type: 'Point', coordinates: at(eastM, northM) },
  area: squareAt(eastM, northM),
  note: null,
  created_at: '2026-10-05T00:00:00Z',
  ...extra,
})
/** A jeep down the road, west to east, every 25 m for a kilometre, with a hintuan beside the road at 300 m and one on it at 700 m. */
const smallMap = () => {
  const line = Array.from({ length: 41 }, (_, i) => at(i * 25, 0))
  const v = {
    id: 'd',
    route_id: 'r',
    direction_name: 'West → East',
    origin_terminal: null,
    destination_terminal: null,
    shape: { type: 'LineString', coordinates: line },
    reversed: false,
    confidence: 'drawn',
    route: { id: 'r', mode: 'jeepney', head_stop_id: 'West', tail_stop_id: 'East' },
  }
  const stops = [
    hotspot('West', 'terminal', 0, 0),
    hotspot('Beside', 'hintuan', 300, 18),
    hotspot('On', 'hintuan', 700, 0),
    hotspot('East', 'terminal', 1000, 0),
  ]
  return { v, stops }
}
/** The direction as the app holds it once its line file is read: the line object the file brought (loadLine, useSavedRoutes' withLine). */
const asRead = (v, text) => {
  const file = JSON.parse(text)
  keepLinePass(file.shape, file)
  return { file, v: { ...v, shape: file.shape } }
}
const coordsOf = (features) => features.map((f) => f.geometry.coordinates)

test('step 13: the publish writes the stretches the app works out, the same points exactly, and their key', () => {
  const { v, stops } = smallMap()
  const boxes = passBoxes(stops)
  const { pass, passKey: key } = linePass(v, boxes)
  assert.deepStrictEqual(pass, coordsOf(stretchesPast(v, boxes)))
  assert.equal(pass.length, 2, 'one stretch past each hintuan')
  assert.match(key, /^[0-9a-z]{1,11}$/, 'a short key')
  assert.equal(key, passKey(boxesReached(v, v.shape.coordinates, boxes)))
  // The file: the line as it was, then the stretches. JSON carries every number exactly.
  const text = lineFileText(v, boxes)
  assert.ok(text.startsWith(JSON.stringify({ schema: 2, id: 'd', shape: v.shape }).slice(0, -1) + ','), text.slice(0, 80))
  assert.ok(text.endsWith('}\n'))
  assert.deepStrictEqual(JSON.parse(text).pass, pass)
})

test('step 13: a line file whose key is the index\'s own: its stretches are the ones painted, equal to those worked out', () => {
  const { v, stops } = smallMap()
  const boxes = passBoxes(stops)
  const { file, v: read } = asRead(v, lineFileText(v, boxes))
  const taken = publishedStretches(read, boxes)
  assert.ok(taken, 'taken from the file')
  assert.deepStrictEqual(taken, stretchesPast(read, boxes))
  // stretchesOf takes them (the very arrays the file brought), not a walk of its own.
  const kept = stretchesOf(read, boxes)
  assert.deepStrictEqual(kept, stretchesPast(read, boxes))
  kept.forEach((f, i) => assert.equal(f.geometry.coordinates, file.pass[i], `stretch ${i} is the file's own`))
  // A file's stretches are taken as they are when the key holds: proof that it is the file's that are painted.
  const made = { ...file, pass: [[at(0, 1), at(1, 1)]] }
  const { v: trusted } = asRead(v, JSON.stringify(made))
  assert.deepStrictEqual(coordsOf(stretchesOf(trusted, boxes)), made.pass)
})

test('step 13: a hintuan moved, added, gone, of another id, or no longer stopped at: another key, and the stretches are worked out', () => {
  const { v, stops } = smallMap()
  const { file, v: read } = asRead(v, lineFileText(v, passBoxes(stops)))
  const changed = {
    'a hintuan moved 2 m': stops.map((s) => (s.id === 'On' ? { ...s, area: squareAt(702, 0) } : s)),
    'a hintuan added on the road': [...stops, hotspot('New', 'hintuan', 500, 0)],
    'a hintuan gone': stops.filter((s) => s.id !== 'Beside'),
    'a hintuan of another id in the same box': stops.map((s) => (s.id === 'On' ? { ...s, id: 'On2' } : s)),
    'a hintuan made a station the jeep does not stop at': stops.map((s) => (s.id === 'On' ? { ...s, line: 'LRT-1' } : s)),
    'a hintuan made a terminal': stops.map((s) => (s.id === 'Beside' ? { ...s, kind: 'terminal' } : s)),
  }
  for (const [what, other] of Object.entries(changed)) {
    const boxes = passBoxes(other)
    assert.equal(publishedStretches(read, boxes), null, what)
    const kept = stretchesOf(read, boxes)
    assert.deepStrictEqual(kept, stretchesPast(read, boxes), what)
    assert.ok(kept.every((f, i) => f.geometry.coordinates !== file.pass[i]), `${what}: worked out, not the file's`)
  }
  // The route made a train: it stops at none of the jeep's hintuans.
  const train = { ...read, route: { ...read.route, mode: 'lrt', route_code: 'LRT-1' } }
  assert.equal(publishedStretches(train, passBoxes(stops)), null)
  assert.deepStrictEqual(stretchesOf(train, passBoxes(stops)), [])
})

test('step 13: what does not change the stretches does not change the key', () => {
  const { v, stops } = smallMap()
  const key = linePass(v, passBoxes(stops)).passKey
  const same = {
    'a hintuan 2 km away': [...stops, hotspot('Far', 'hintuan', 3000, 2000)],
    'a station on the road the jeep does not stop at': [...stops, hotspot('Station', 'hintuan', 500, 0, { line: 'LRT-1' })],
    'a hintuan renamed': stops.map((s) => (s.id === 'On' ? { ...s, name: 'Renamed', informal: 'Elsewhere' } : s)),
    'a hintuan without a box': [...stops, { ...hotspot('Loose', 'hintuan', 500, 0), area: null }],
    'a terminal moved': stops.map((s) => (s.id === 'East' ? { ...s, area: squareAt(990, 0) } : s)),
  }
  for (const [what, other] of Object.entries(same)) assert.equal(linePass(v, passBoxes(other)).passKey, key, what)
})

test('step 13: a line file without stretches, or with them unreadable, is worked out as before', () => {
  const { v, stops } = smallMap()
  const boxes = passBoxes(stops)
  const good = JSON.parse(lineFileText(v, boxes))
  const files = {
    'no pass (every line file before step 13)': { schema: 2, id: 'd', shape: v.shape },
    'a key and no stretches': { ...good, pass: undefined },
    'stretches and no key': { ...good, passKey: undefined },
    'a key that is not a string': { ...good, passKey: 42 },
    'a one-point stretch': { ...good, pass: [[good.pass[0][0]]] },
    'a point of three numbers': { ...good, pass: [[[1, 2, 3], [1, 2]]] },
    'a point that is not a number': { ...good, pass: [[['1', 2], [1, 2]]] },
    'stretches that are not a list': { ...good, pass: { 0: good.pass[0] } },
  }
  for (const [what, file] of Object.entries(files)) {
    const { v: read } = asRead(v, JSON.stringify(file))
    assert.equal(publishedStretches(read, boxes), null, what)
    assert.deepStrictEqual(stretchesOf(read, boxes), stretchesPast(v, boxes), what)
  }
  // The studio's lines, and a line made anew from one read (a turned line, a redraw): never the file's.
  const { v: read } = asRead(v, JSON.stringify(good))
  assert.ok(publishedStretches(read, boxes))
  assert.equal(publishedStretches({ ...read, shape: { ...read.shape } }, boxes), null)
  assert.equal(publishedStretches(v, boxes), null)
})

/**
 * What the rule paints on made-up lines past made-up boxes: lines straight
 * through, alongside within five metres, past at six, ending just short,
 * and at slants. Pinned per PASS_RULE, so that a change to what
 * passStretches paints cannot ship with line files of the old rule taken
 * as the new one's.
 */
const RULE_PINS = { 1: '98b51ed8c48d8b963612264f438fac24fa51e755' }
test('step 13: the rule\'s fingerprint is pinned to PASS_RULE', () => {
  const stops = [
    hotspot('A', 'hintuan', 100, 0),
    hotspot('B', 'hintuan', 300, 19.5),
    hotspot('C', 'hintuan', 500, 21),
    hotspot('D', 'hintuan', 700, -10, { area: squareAt(700, -10, 6) }),
    hotspot('E', 'hintuan', 940, 0, { area: squareAt(940, 0, 8) }),
  ]
  const lines = [
    Array.from({ length: 21 }, (_, i) => at(i * 50, 0)).slice(0, 19).concat([at(928, 0)]),
    [at(0, -40), at(260, 30), at(520, -30), at(760, 25), at(1000, -5)],
    [at(950, 30), at(300, 10), at(90, -12)],
  ]
  const boxes = passBoxes(stops)
  const painted = lines.map((line, i) => linePass({ id: `l${i}`, route: { mode: 'jeepney' }, shape: { type: 'LineString', coordinates: line } }, boxes).pass)
  assert.ok(painted.flat().length >= 6, `${painted.flat().length} stretches`)
  const fingerprint = createHash('sha1').update(JSON.stringify(painted)).digest('hex')
  assert.equal(
    fingerprint,
    RULE_PINS[PASS_RULE],
    'what passStretches paints has changed: bump PASS_RULE in src/shared/geo/linePass.ts, so line files published by the old rule are worked out again, and pin this fingerprint under the new number',
  )
})

test('step 13: the publish imports nothing from npm, all the way down (its workflow has no npm ci)', () => {
  const root = new URL('../../', import.meta.url)
  const seen = new Set()
  const outside = []
  const walk = (url) => {
    if (seen.has(url.href)) return
    seen.add(url.href)
    const text = readFileSync(url, 'utf8')
    // Type-only imports are stripped before Node runs the file.
    for (const m of text.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'"]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)) {
      const spec = m[1] ?? m[2]
      if (spec.startsWith('node:')) continue
      if (!spec.startsWith('.')) {
        outside.push(`${url.pathname.slice(root.pathname.length)}: ${spec}`)
        continue
      }
      let next = new URL(spec, url)
      if (!/\.[a-z]+$/i.test(spec)) next = [new URL(spec + '.ts', url), new URL(spec + '.tsx', url)].find((u) => { try { readFileSync(u); return true } catch { return false } })
      walk(next)
    }
  }
  walk(new URL('scripts/publish/publish-map.mjs', root))
  assert.ok([...seen].some((u) => u.endsWith('/src/shared/geo/linePass.ts')), 'the publish reaches linePass.ts')
  assert.deepEqual(outside, [])
})

// The committed map, as the next publish would write it: a copy of
// public/data in a temporary folder (TMPDIR), every line file written with
// its stretches by the publish's own lineFileText, then read back the ways
// the app and the check read it.
test('step 13: on a copy of public/data, every line file written with its stretches is read by the app and painted as it works them out', async () => {
  const committed = fileURLToPath(new URL('../../public/data/', import.meta.url))
  const dir = mkdtempSync(join(tmpdir(), 'parapo-pass-'))
  try {
    cpSync(committed, dir, { recursive: true })
    const indexPath = join(dir, 'index.v4.json')
    const index = readPublished(indexPath).file
    const boxes = passBoxes(index.stops)
    let before = 0
    let after = 0
    for (const v of index.variants.filter((x) => x.shape)) {
      const path = join(dir, 'lines', `${v.id}.json`)
      const old = readFileSync(path, 'utf8')
      const text = lineFileText(v, boxes)
      // The line is the file's as it was, byte for byte: the stretches are added after it.
      assert.ok(text.startsWith(old.slice(0, -2) + ','), `${v.id}: the line is as it was`)
      writeFileSync(path, text)
      before += old.length
      after += text.length
    }
    console.log(`  ${index.variants.filter((x) => x.shape).length} line files, ${before} -> ${after} bytes`)

    // The check reads them back: the stretches are its own, and nothing is said of them.
    const { file: back, problems } = readPublished(indexPath)
    assert.deepEqual(problems, [])
    assert.ok(back.variants.filter((x) => x.shape).every((x) => typeof x.passKey === 'string' && Array.isArray(x.pass)))
    const r = checkMapData(back)
    assert.deepEqual(r.problems, [])
    assert.equal(r.notes.some((n) => /orange stretches/.test(n)), false, r.notes.join(' | '))

    // The app reads them (mapFile.ts, over a fetch that serves the copy) and paints the file's, equal to what it works out.
    globalThis.fetch = async (url) => {
      try {
        return new Response(readFileSync(join(dir, String(url).replace(/^\/data\//, ''))), { headers: { 'content-type': 'application/json' } })
      } catch {
        return new Response('not here', { status: 404 })
      }
    }
    const { loadMapFile, loadLine } = await import(`../../src/commuter/mapFile.ts?pass=${Date.now()}`)
    const map = await loadMapFile()
    const appBoxes = passBoxes(map.stops)
    let taken = 0
    let stretches = 0
    for (const row of map.variants.filter((x) => x.shape)) {
      const v = { ...row, shape: await loadLine(row.id) }
      const fromFile = publishedStretches(v, appBoxes)
      assert.ok(fromFile, `${v.id}: the file's stretches are taken`)
      assert.deepStrictEqual(fromFile, stretchesPast(v, appBoxes), `${v.id}: the same as worked out`)
      assert.deepStrictEqual(stretchesOf(v, appBoxes), fromFile)
      taken++
      stretches += fromFile.length
    }
    assert.ok(taken >= 2 && stretches > 50, `${taken} directions, ${stretches} stretches`)

    // Against an older index (shape 3: no ferry), only lines whose hintuans it has all are taken; the rest are worked out, the same.
    const v3 = readPublished(join(dir, 'index.v3.json')).file
    const v3Boxes = passBoxes(v3.stops)
    for (const row of v3.variants.filter((x) => x.shape)) {
      const v = { ...row, shape: await loadLine(row.id) }
      assert.deepStrictEqual(stretchesOf(v, v3Boxes), stretchesPast(v, v3Boxes), `${v.id} against shape 3`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("step 13: the committed line files, which carry no stretches, are worked out as before", async () => {
  const data = fileURLToPath(new URL('../../public/data/', import.meta.url))
  globalThis.fetch = async (url) => {
    try {
      return new Response(readFileSync(join(data, String(url).replace(/^\/data\//, ''))), { headers: { 'content-type': 'application/json' } })
    } catch {
      return new Response('not here', { status: 404 })
    }
  }
  const { loadMapFile, loadLine } = await import(`../../src/commuter/mapFile.ts?committed=${Date.now()}`)
  const map = await loadMapFile()
  const boxes = passBoxes(map.stops)
  for (const row of map.variants.filter((x) => x.shape)) {
    const line = await loadLine(row.id)
    const file = JSON.parse(readFileSync(join(data, 'lines', `${row.id}.json`), 'utf8'))
    const v = { ...row, shape: line }
    if (!('pass' in file)) assert.equal(publishedStretches(v, boxes), null, `${row.id}: nothing taken from a file without stretches`)
    assert.deepStrictEqual(stretchesOf(v, boxes), stretchesPast(v, boxes))
  }
})
