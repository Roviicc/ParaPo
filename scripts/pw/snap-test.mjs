// Snapping in the studio editor: far clicks, U-turns at joins, street names.
//
//   npm run dev                                (in another terminal)
//   node scripts/pw/snap-test.mjs
//
// Opens /studio/?e2e=1, draws routes on fixed streets, reads the drawn line
// back out of the map (the draw-line source: one feature per segment, with
// `index` and `snap`) and checks three things:
//
//   far click  A click no road is within 25 m of becomes a straight, dashed
//              'freehand' segment, not a routed line to a road far away.
//   U-turns    Where the route turns back on itself at a join, the line is kept
//              as the router drew it and the editor says so: the point is
//              ringed in amber with its doubled-back stretch (the draw-uturns
//              source) and the toolbar counts it. A join that goes on is not
//              flagged. Checked after appending, after dragging a middle point
//              and after inserting a point. The owner chose this on 2026-09-15:
//              a U-turn can be a click past a corner or a jeepney that really
//              turns there, so it is shown, never changed.
//   streets    The routed segments carry the street names the save panel lists
//              as "via A → B". A ?e2e=1 session has no account, so Done opens
//              "Sign in to save" rather than the panel (regression-gestures.mjs
//              checks that); the names are read from the drawing's own draft
//              through routeStreets, as the panel does. The panel itself is in
//              the Studio/SavePanel story.
//
// A turn back is a turn sharper than 150° between the bearing into a vertex and
// the bearing out of it, within 10 m of the join. The detector is a pure
// function and runs first on made-up lines, so a result below cannot come from
// a detector that sees nothing.
//
// Why these coordinates. A U-turn at a join needs a particular street layout,
// so the clicks are fixed rather than taken from saved routes. They were found
// on 2026-09-15: OpenStreetMap roads around Novaliches from Overpass gave
// two-way streets with a T-junction side street, and the public OSRM router
// confirmed the layout: routing the gaps as the router naturally does left a
// 180° turn at a join in all three scenarios below. Every click is the spot
// OSRM snapped that coordinate to, so it is on the road. Sinai Street runs
// east-west; Assyria Street leaves it southwards between A and B, so A→B→C must
// turn around somewhere to reach C. The far point is in the La Mesa watershed
// forest: without radiuses OSRM snaps it to Quirino Highway 1,213 m away, with
// radiuses=25 it answers NoSegment.
//
// The router is the public OSRM demo (about one request a second, shared), so
// after every gesture the script waits for "snapping…" to clear and then 1.5 s.
import { chromium } from 'playwright'

const BASE = (process.env.PARAPO_BASE ?? 'http://localhost:5173').replace(/\/$/, '')
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`) }

// Sinai Street and Assyria Street, Novaliches. The junction is at 121.042397, 14.742005.
const A = [121.043326, 14.742006]  // Sinai Street, 100 m east of the junction
const B = [121.04184, 14.742003]   // Sinai Street, 60 m west of the junction
const C = [121.0424, 14.741507]    // Assyria Street, 55 m south of the junction
const P = [121.042399, 14.741896]  // Assyria Street, 12 m south of the junction: ~5 px off the Sinai line at zoom 16, so a click here lands on that line
const C0 = [121.041282, 14.742004] // Sinai Street, 120 m west of the junction: where C starts before it is dragged
const D = [121.04075, 14.741919]   // Sinai Street, 180 m west of the junction
const E = [121.040297, 14.741603]  // Sinai Street, 240 m west of the junction
// Quirino Highway and the La Mesa watershed.
const Q1 = [121.081741, 14.747459] // Quirino Highway: the spot OSRM snaps W to when no radius is given
const Q2 = [121.080245, 14.746203] // Quirino Highway, 220 m along the road from Q1
const W = [121.09, 14.74]          // forest, 1,213 m from the nearest road
const ZOOM = 16                    // about 2.3 m a pixel here, so 25 m is 11 px

// ------------------------------------------------------------ turn detector
const toRad = (d) => (d * Math.PI) / 180
const metres = ([lng1, lat1], [lng2, lat2]) => {
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(a))
}
const bearing = ([lng1, lat1], [lng2, lat2]) => {
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2))
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1))
  return (Math.atan2(y, x) * 180) / Math.PI
}

/**
 * Turn angles around each join of a line drawn as segments (arrays of
 * [lng, lat], in order). The segments are joined the way joinSegments in
 * src/shared/geo.ts does it: every segment after the first loses its first
 * coordinate, which repeats the previous segment's last. For the join before
 * control point k it reports the worst turn within atM metres along the line.
 * A vertex's turn is the angle, 0–180°, between the bearing in from the last
 * vertex at least minStepM behind it and the bearing out to the first vertex
 * at least minStepM ahead, so repeated points cannot invent one.
 */
function turnsAtJoins(segments, { atM = 10, maxTurn = 150, minStepM = 2 } = {}) {
  const line = [], joins = []
  segments.forEach((s, i) => { if (i > 0) joins.push(line.length - 1); line.push(...(i === 0 ? s : s.slice(1))) })
  const along = [0]
  for (let i = 1; i < line.length; i++) along.push(along[i - 1] + metres(line[i - 1], line[i]))
  const turn = (i) => {
    let p = i - 1; while (p >= 0 && metres(line[p], line[i]) < minStepM) p--
    let q = i + 1; while (q < line.length && metres(line[i], line[q]) < minStepM) q++
    if (p < 0 || q >= line.length) return 0
    const d = Math.abs(bearing(line[i], line[q]) - bearing(line[p], line[i])) % 360
    return d > 180 ? 360 - d : d
  }
  return joins.map((j, k) => {
    let at = 0
    for (let i = 1; i < line.length - 1; i++) if (Math.abs(along[i] - along[j]) <= atM) at = Math.max(at, turn(i))
    return { point: k + 1, at: Math.round(at), turnsBack: at > maxTurn }
  })
}

console.log('== Turn detector, on made-up lines')
// metres east and north of a point in Novaliches, as [lng, lat]
const M = (east, north) => [121.05 + east / (111320 * Math.cos(toRad(14.745))), 14.745 + north / 110574]
let j = turnsAtJoins([[M(0, 0), M(0, 25), M(0, 50)], [M(0, 50), M(0, 75), M(0, 100)]])[0]
check('detector: a straight line due north does not turn back (negative control)', !j.turnsBack, `${j.at}°`)
j = turnsAtJoins([[M(0, 0), M(25, 0), M(50, 0)], [M(50, 0), M(25, 0), M(0, 0)]])[0]
check('detector: 50 m east then 50 m back west turns back at the join (positive control)', j.turnsBack, `${j.at}°`)
j = turnsAtJoins([[M(0, 0), M(25, 0), M(50, 0)], [M(50, 0), M(90, 0), M(60, 0)]])[0]
check('detector: a U-turn 40 m past the join is not at the join', !j.turnsBack, `${j.at}°`)

// ------------------------------------------------------------------ browser
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1280, height: 800 } })
// PARAPO_NODE_FETCH=1: serve every https request through Node fetch. Needed only
// where the browser cannot reach the internet but Node can (sandboxed CI).
if (process.env.PARAPO_NODE_FETCH) {
await page.route(/^https:\/\//, async (route) => { const req = route.request(); try { const h={...req.headers()}; delete h['accept-encoding']; const r = await fetch(req.url(), { method: req.method(), headers: h, body: ['GET','HEAD'].includes(req.method())?undefined:req.postDataBuffer() }); const body=Buffer.from(await r.arrayBuffer()); const hh={}; r.headers.forEach((v,k)=>{ if(!['content-encoding','content-length','transfer-encoding'].includes(k)) hh[k]=v }); await route.fulfill({status:r.status,headers:hh,body}) } catch { await route.abort() } })
}
// NoSegment comes back as HTTP 400 and is an answer; only 429 and 5xx mean the router turned us away.
const isRouter = (u) => /routing\.openstreetmap\.de|route\/v1\/driving/.test(u)
let routerCalls = 0, routerRefused = 0
page.on('request', r => { if (isRouter(r.url())) routerCalls++ })
page.on('response', r => { if (isRouter(r.url()) && (r.status() === 429 || r.status() >= 500)) routerRefused++ })
const errors = []; page.on('pageerror', e => errors.push(String(e)))
await page.addInitScript(() => { window.__src = async (id) => { const s = window.__map?.getSource(id); return s ? await s.getData() : null } })

const proj = async (c) => page.evaluate(c => { const q = window.__map.project(c); return [q.x, q.y] }, c)
const idle = async () => page.waitForFunction(() => !document.body.innerText.includes('snapping…'), null, { timeout: 30000 })
// After a gesture that routes: let the request start, let it finish, then give the shared router a breather.
const settle = async () => { await page.waitForTimeout(400); await idle(); await page.waitForTimeout(1500); await idle() }
const segs = async () => (await page.evaluate(async () => ((await window.__src('draw-line'))?.features ?? []).map(f => ({ index: f.properties.index, snap: f.properties.snap, coords: f.geometry.coordinates }))))
  .filter(s => s.index >= 0).sort((a, b) => a.index - b.index)
const cps = async () => (await page.evaluate(async () => ((await window.__src('draw-points'))?.features ?? []).map(f => ({ index: f.properties.index, c: f.geometry.coordinates }))))
  .sort((a, b) => a.index - b.index).map(p => p.c)
const renderedAt = async (px, layer) => page.waitForFunction(([x, y, l]) => window.__map.queryRenderedFeatures([x, y], { layers: [l] }).length > 0, [px[0], px[1], layer], { timeout: 5000 }).then(() => true).catch(() => false)
const box0 = { x: 0, y: 0 }
const clickAt = async (c) => { const [x, y] = await proj(c); await page.mouse.click(box0.x + x, box0.y + y) }
// Centre the map on a scenario's points at street level; each scenario spans well under the viewport.
const view = async (points) => {
  const lng = points.map(p => p[0]), lat = points.map(p => p[1])
  const center = [(Math.min(...lng) + Math.max(...lng)) / 2, (Math.min(...lat) + Math.max(...lat)) / 2]
  await page.evaluate(([c, z]) => window.__map.jumpTo({ center: c, zoom: z }), [center, ZOOM])
  await page.waitForTimeout(300)
}
const newRoute = async () => { await page.getByRole('button', { name: '+ New Route' }).click(); await page.getByRole('button', { name: /Done/ }).waitFor({ timeout: 5000 }) }
const discard = async () => { await page.getByRole('button', { name: '✕' }).click(); await page.getByRole('button', { name: '+ New Route' }).waitFor({ timeout: 5000 }) }
const drawRoute = async (points) => { await newRoute(); for (const [i, p] of points.entries()) { await clickAt(p); if (i === 0) await page.waitForTimeout(250); else await settle() } }
const snapModes = (s) => s.map(x => x.snap).join(',') || 'none'
const allSnapped = (s, points) => s.length === points - 1 && s.every(x => x.snap === 'snapped')

// What the editor flags: rings (points) and stubs (lines) in draw-uturns, and the toolbar count.
const flagged = async () => {
  const f = await page.evaluate(async () => (await window.__src('draw-uturns'))?.features ?? [])
  return {
    rings: f.filter(x => x.geometry.type === 'Point').map(x => x.properties.point).sort((a, b) => a - b),
    stubs: f.filter(x => x.geometry.type === 'LineString').length,
  }
}
const toolbarCount = async () => Number((await page.locator('body').innerText()).match(/⚠ (\d+) U-turn/)?.[1] ?? 0)

// Three checks per scenario. The first is the positive control: the router's
// line really does turn back, so the two after it cannot pass by flagging nothing.
const uTurnChecks = async (scenario, s, labels) => {
  const snapped = allSnapped(s, labels.length)
  const joins = turnsAtJoins(s.map(x => x.coords))
  const back = joins.filter(x => x.turnsBack).map(x => x.point)
  const f = await flagged()
  const n = await toolbarCount()
  const names = (ps) => ps.map(p => labels[p]).join(', ') || 'none'
  const why = snapped ? '' : `gaps not all snapped: ${snapModes(s)}; `
  check(`${scenario}: the line still turns back where the router drew it (kept, not hidden)`, snapped && back.length > 0,
    why + joins.map(x => `${labels[x.point]} ${x.at}°`).join(', '))
  check(`${scenario}: exactly the joins that turn back are ringed in amber, each with its stretch`,
    snapped && f.rings.join() === back.join() && f.stubs === f.rings.length,
    `turn back: ${names(back)}; ringed: ${names(f.rings)}; stretches: ${f.stubs}`)
  check(`${scenario}: the toolbar counts them`, n === back.length, `toolbar ⚠ ${n}, turn back ${back.length}`)
}

await page.goto(`${BASE}/studio/?e2e=1`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
await page.waitForTimeout(800)
const box = await page.locator('canvas.maplibregl-canvas').boundingBox(); box0.x = box.x; box0.y = box.y

console.log('== Far click (Quirino Highway, La Mesa watershed)')
await view([Q1, Q2, W])
await drawRoute([Q2, Q1])
let s = await segs()
check('far click: an on-road second point is snapped (control)', s.length === 1 && s[0].snap === 'snapped', `gaps ${snapModes(s)}`)
await discard()
await drawRoute([Q2, W])
s = await segs()
const end = s[0]?.coords.at(-1)
check('far click: a point 1.2 km from any road draws freehand, not a line to that road', s.length === 1 && s[0].snap === 'freehand',
  `gaps ${snapModes(s)}, the line ends ${end ? Math.round(metres(end, W)) : '?'} m from the click`)
await discard()

console.log('== Append (Sinai Street, Novaliches)')
await view([A, B, C, D, E])
await drawRoute([A, B, C])
s = await segs(); let pts = await cps()
check('append: A→B→C drawn, 3 points, every gap snapped', pts.length === 3 && allSnapped(s, 3), `${pts.length} points, gaps ${snapModes(s)}`)
await uTurnChecks('append', s, ['A', 'B', 'C'])

console.log('== Street names')
const streets = await page.evaluate(async () => {
  const draft = JSON.parse(localStorage.getItem('parapo.draft.v1') ?? 'null')
  if (!draft) return null
  const { routeStreets } = await import('/src/studio/snap.ts')
  return routeStreets(draft.segments)
})
check('street names: every routed segment carries its streets, and "via …" names at least one',
  !!streets && streets.names.length > 0 && streets.missing === 0,
  streets ? `via ${streets.names.join(' → ')}; missing ${streets.missing}` : 'no draft in localStorage')
await discard()

console.log('== Drag a middle point')
// Five points so the dragged one has an untouched segment on both sides.
await drawRoute([A, B, C0, D, E])
pts = await cps()
const from = await proj(pts[2] ?? C0), to = await proj(C)
await renderedAt(from, 'draw-point-dots')
await page.mouse.move(box0.x + from[0], box0.y + from[1]); await page.mouse.down()
for (let i = 1; i <= 10; i++) await page.mouse.move(box0.x + from[0] + (to[0] - from[0]) * i / 10, box0.y + from[1] + (to[1] - from[1]) * i / 10)
await page.mouse.up(); await settle()
pts = await cps(); s = await segs()
const moved = pts.length === 5 ? metres(pts[2], C) : Infinity
check('drag: C dragged from Sinai onto Assyria Street, 5 points, every gap snapped', pts.length === 5 && moved < 5 && allSnapped(s, 5),
  `${pts.length} points, C is ${Math.round(moved)} m from where it was dropped, gaps ${snapModes(s)}`)
await uTurnChecks('drag', s, ['A', 'B', 'C', 'D', 'E'])
await page.screenshot({ path: 'snap-drag.png' })
await discard()

console.log('== Insert a point on the line')
await drawRoute([A, B, D])
s = await segs()
const straightOn = turnsAtJoins(s.map(x => x.coords))
const noFlags = await flagged()
check('insert, before: A→B→D goes on at B, nothing ringed, no toolbar count (control)',
  allSnapped(s, 3) && straightOn.every(x => !x.turnsBack) && noFlags.rings.length === 0 && noFlags.stubs === 0 && (await toolbarCount()) === 0,
  `B ${straightOn[0]?.at}°, ringed ${noFlags.rings.length}, gaps ${snapModes(s)}`)
const pPx = await proj(P)
const onLine = await renderedAt(pPx, 'draw-line-hit')
await clickAt(P); await settle()
pts = await cps(); s = await segs()
const placed = pts.length === 4 ? metres(pts[1], P) : Infinity
check('insert: clicking the A→B line at Assyria Street inserts P as the second point, every gap snapped', pts.length === 4 && placed < 5 && allSnapped(s, 4),
  `line under the click: ${onLine}, ${pts.length} points, P is ${Math.round(placed)} m from the click, gaps ${snapModes(s)}`)
await uTurnChecks('insert', s, ['A', 'P', 'B', 'D'])
await discard()

check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
await b.close()
console.log(`\nrouter: ${routerCalls} requests${routerRefused ? `, ${routerRefused} turned away (429/5xx): routing checks above may have failed for that reason` : ''}`)
const failed = results.filter(r => !r).length
console.log(`\n${results.length - failed} passed, ${failed} failed`); process.exit(failed ? 1 : 0)
