// The public map at /, on whatever the published file (public/data/map.json)
// holds today. The dev server serves that file straight from the working
// tree, committed or not — so a passing run here says nothing about whether
// the file was committed; `git status` does.
//
//   npm run dev                          (in another terminal)
//   node scripts/pw/visitor-test.mjs
//
// Everything asserted here is read from the map itself first — source
// features, layer order, the summary pill's own text — and only then
// checked for internal consistency. Nothing is hard-coded about which or
// how many routes/hotspots exist, what they are named, or which vertex
// lands where; a check that needs a shape the data doesn't happen to have
// today (e.g. a route line passing through a hotspot) SKIPs instead of
// failing. Covers: the read-only public page carries none of the studio's
// buttons or sign-in text, ships no draw-* (editor) layers, writes nothing
// to localStorage, never calls the OSRM route snapper or the database (it
// reads the published /data/map.json, once), and tapping a route vs. a
// hotspot — including one hotspot with a route drawn through it — opens the
// right card with the right content.
import { chromium } from 'playwright'

const BASE = (process.env.PARAPO_BASE ?? 'http://localhost:5173').replace(/\/$/, '')
const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
const skip = (name, reason) => console.log(`SKIP  ${name}  ${reason}`)

// ------------------------------------------------------------------ geometry
// Plain point-in-polygon (ray casting) and a handful of "probably inside"
// guesses for a ring, computed here in Node rather than hard-coded, since we
// do not know the shape of today's hotspots ahead of time.
const pointInPolygon = ([x, y], ring) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const centroidOf = (ring) => [
  ring.reduce((a, c) => a + c[0], 0) / ring.length,
  ring.reduce((a, c) => a + c[1], 0) / ring.length,
]
const interiorCandidates = (ring) => {
  const c = centroidOf(ring)
  const uniq = ring.filter((v, i) => i === 0 || v[0] !== ring[i - 1][0] || v[1] !== ring[i - 1][1])
  const pts = [c]
  for (const v of uniq) pts.push([c[0] + (v[0] - c[0]) * 0.5, c[1] + (v[1] - c[1]) * 0.5])
  for (let i = 0; i < uniq.length; i++) {
    const a = uniq[i], b = uniq[(i + 1) % uniq.length]
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    pts.push([c[0] + (mid[0] - c[0]) * 0.75, c[1] + (mid[1] - c[1]) * 0.75])
  }
  return pts.slice(0, 8)
}
const findVertexInsideAnyHotspot = (routeLines, polys) => {
  for (const coords of routeLines) {
    for (const c of coords) {
      for (const p of polys) if (pointInPolygon(c, p.ring)) return { point: c, hotspot: p }
    }
  }
  return null
}
// A route vertex a finger's width clear of every box: ~110 m, so no box edge
// falls inside the tap and the tap means the route alone.
const findVertexOutsideHotspots = (routeLines, polys) => {
  const clear = 0.001
  for (const coords of routeLines) {
    for (const c of coords) {
      const near = polys.some((p) => p.ring.some((v) => Math.hypot(v[0] - c[0], v[1] - c[1]) < clear))
      if (!near) return c
    }
  }
  return null
}
const parsePill = (text) => {
  if (!text) return null
  const both = text.match(/^(\d+) routes? · (\d+) hotspots?$/)
  if (both) return { routes: Number(both[1]), hotspots: Number(both[2]) }
  const routeOnly = text.match(/^(\d+) routes?$/)
  if (routeOnly) return { routes: Number(routeOnly[1]), hotspots: 0 }
  return null
}

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 800 } })
// PARAPO_NODE_FETCH=1: serve every https request through Node fetch. Needed only
// where the browser cannot reach the internet but Node can (sandboxed CI).
if (process.env.PARAPO_NODE_FETCH) {
await page.route(/^https:\/\//, async (route) => { const req = route.request(); try { const h={...req.headers()}; delete h['accept-encoding']; const r = await fetch(req.url(), { method: req.method(), headers: h, body: ['GET','HEAD'].includes(req.method())?undefined:req.postDataBuffer() }); const body=Buffer.from(await r.arrayBuffer()); const hh={}; r.headers.forEach((v,k)=>{ if(!['content-encoding','content-length','transfer-encoding'].includes(k)) hh[k]=v }); await route.fulfill({status:r.status,headers:hh,body}) } catch { await route.abort() } })
}
await page.addInitScript(() => { window.__src = async (id) => { const s = window.__map?.getSource(id); return s ? await s.getData() : null } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
let osrmHit = false
let supabaseHit = false
const mapFileStatuses = []
page.on('request', (req) => {
  if (/router\.project-osrm\.org/.test(req.url())) osrmHit = true
  if (/\.supabase\.co/.test(req.url())) supabaseHit = true
})
// Responses, not requests: a 404 is a request too, and would count as a load.
page.on('response', (res) => {
  if (/\/data\/map\.json/.test(res.url())) mapFileStatuses.push(res.status())
})

const closeCard = () => page.getByRole('button', { name: 'Close' }).first().click().catch(() => {})
const cardKind = async () => {
  const el = page.locator('[data-testid="card"]')
  if ((await el.count()) === 0) return { kind: 'none', text: '' }
  const text = await el.first().innerText()
  if (text.includes('Routes that')) return { kind: 'hotspot', text }
  if (/drawn, not yet ridden|verified by riding/.test(text)) return { kind: 'route', text }
  return { kind: 'unknown', text }
}

await page.goto(`${BASE}/`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 })
await page
  .waitForFunction(async () => ((await window.__src('saved-stops'))?.features?.length ?? 0) > 0, null, { timeout: 20000 })
  .catch(() => {})
await page.waitForTimeout(1200)

// 1. No editor chrome on the visitor page.
check('no + New Route button', (await page.getByRole('button', { name: '+ New Route' }).count()) === 0)
check('no + New hotspot button', (await page.getByRole('button', { name: '+ New hotspot' }).count()) === 0)
check('no Done button', (await page.getByRole('button', { name: 'Done' }).count()) === 0)
check('no "Sign in" text or button', (await page.getByText('Sign in').count()) === 0)
check('no "Sign out" text or button', (await page.getByText('Sign out').count()) === 0)
check('no "Password" text or button', (await page.getByText('Password').count()) === 0)

// 2. Read the map's own data before asserting anything about it.
const snapshot = await page.evaluate(async () => {
  const m = window.__map
  const stopsFC = await window.__src('saved-stops')
  const routesFC = await window.__src('saved-routes')
  const polyFeatures = (stopsFC?.features ?? []).filter((f) => f.geometry.type === 'Polygon')
  const pointFeatures = (stopsFC?.features ?? []).filter((f) => f.geometry.type === 'Point')
  const order = m.getStyle().layers.map((l) => l.id)
  const pillEl = [...document.querySelectorAll('div')].find(
    (d) => d.className.includes('rounded-full') && d.className.includes('bg-white/90'),
  )
  return {
    polys: polyFeatures.map((f) => ({
      id: f.properties.id,
      kind: f.properties.kind,
      name: f.properties.name,
      ring: f.geometry.coordinates[0],
    })),
    labelCount: pointFeatures.length,
    routeLines: (routesFC?.features ?? []).map((f) => f.geometry.coordinates),
    routeCount: routesFC?.features?.length ?? 0,
    order,
    pillText: pillEl ? pillEl.innerText.trim() : null,
  }
})

check(
  'hotspot polygons and label points match, and at least one exists',
  snapshot.polys.length === snapshot.labelCount && snapshot.polys.length > 0,
  `${snapshot.polys.length} polygons, ${snapshot.labelCount} labels`,
)

const fillIdx = snapshot.order.indexOf('saved-stops-fill')
const outlineIdx = snapshot.order.indexOf('saved-stops-outline')
const labelIdx = snapshot.order.indexOf('saved-stops-label')
const casingIdx = snapshot.order.indexOf('saved-routes-casing')
const hitIdx = snapshot.order.indexOf('saved-routes-hit')
check(
  'hotspot fill + outline sit BELOW the route casing',
  fillIdx >= 0 && outlineIdx >= 0 && casingIdx >= 0 && fillIdx < casingIdx && outlineIdx < casingIdx,
  `fill ${fillIdx} outline ${outlineIdx} casing ${casingIdx}`,
)
check(
  'hotspot labels sit ABOVE the route hit layer',
  labelIdx >= 0 && hitIdx >= 0 && labelIdx > hitIdx,
  `label ${labelIdx} hit ${hitIdx}`,
)
const drawLayers = snapshot.order.filter((id) => id.startsWith('draw-'))
check('no editor (draw-*) layers on the public page', drawLayers.length === 0, drawLayers.join(', '))

const pill = parsePill(snapshot.pillText)
if (snapshot.routeCount === 0) {
  check('no summary pill when no routes are drawn', snapshot.pillText === null, snapshot.pillText ?? '')
} else {
  check(
    'summary pill counts match what is drawn',
    !!pill && pill.routes === snapshot.routeCount && pill.hotspots === snapshot.polys.length,
    `pill "${snapshot.pillText}" vs ${snapshot.routeCount} routes / ${snapshot.polys.length} hotspots drawn`,
  )
}

// 3. Tap each hotspot: fly to a point inside it, click, read the card.
for (const [i, p] of snapshot.polys.entries()) {
  const desc = `${p.kind} #${i} "${p.name}"`
  const candidates = interiorCandidates(p.ring)
  let opened = null
  for (const [x, y] of candidates) {
    await page.evaluate(([cx, cy]) => window.__map.jumpTo({ center: [cx, cy], zoom: 18 }), [x, y])
    await page.waitForTimeout(500)
    const pt = await page.evaluate(([cx, cy]) => {
      const q = window.__map.project([cx, cy])
      return [q.x, q.y]
    }, [x, y])
    const box = await page.locator('canvas.maplibregl-canvas').boundingBox()
    await page.mouse.click(box.x + pt[0], box.y + pt[1])
    await page.waitForTimeout(350)
    const chooser = page.locator('[data-testid="chooser"]')
    if ((await chooser.count()) > 0) {
      // The line runs within a finger of this point: the sheet lists the box
      // first and the route after it. Its row opens the box's card.
      const row = chooser.locator('button[data-testid="chooser-item"]').filter({ hasText: p.name }).first()
      if ((await row.count()) > 0) await row.click()
      await page.waitForTimeout(350)
    }
    const state = await cardKind()
    if (state.kind === 'hotspot') { opened = state.text; break }
    if (state.kind === 'route') await closeCard()
  }

  check(`tap ${desc} opens its hotspot card`, !!opened, opened ? '' : `no click point reached the card (tried ${candidates.length})`)
  if (!opened) continue

  check(`  card shows its own name`, opened.includes(p.name))
  const isTerminal = p.kind === 'terminal'
  check(
    `  card shows the ${isTerminal ? 'Terminal' : 'Hintuan'} badge`,
    opened.includes(isTerminal ? 'Terminal · routes start here' : 'Hintuan · wait and board here'),
  )
  check(
    '  no Edit/Delete for a visitor',
    // The studio's buttons read "Edit route", "Edit terminal", "Edit hintuan" and "Delete".
    (await page.locator('[data-testid="card"]').getByRole('button', { name: /^(Edit\b.*|Delete)$/ }).count()) === 0,
  )

  const chips = page.locator('[data-testid="card"]').locator('button[title="Show this direction on the map"]')
  const chipCount = await chips.count()
  if (chipCount > 0) {
    const label = await chips.first().innerText()
    await chips.first().click()
    await page.waitForTimeout(350)
    const after = await cardKind()
    check(`  its first direction chip opens a route card`, after.kind === 'route', `chip "${label}" -> ${after.kind}`)
  } else {
    const noneMsg = isTerminal ? 'None recorded yet.' : 'No saved route passes through here yet.'
    check(`  no linked routes: shows "${noneMsg}"`, opened.includes(noneMsg))
  }
  await closeCard()
  await page.waitForTimeout(200)
}

// 4. A tap on a route line inside a hotspot offers both — since 2026-09-22
// nothing wins outright: the sheet lists the hotspot first, then one row per
// route, and the route's row opens its card. SKIP if no such vertex exists.
const hit = findVertexInsideAnyHotspot(snapshot.routeLines, snapshot.polys)
if (!hit) {
  skip('a tap on a route line inside a hotspot offers both in the sheet', 'no saved-route vertex lies inside any hotspot polygon today')
} else {
  await page.evaluate((c) => window.__map.jumpTo({ center: c, zoom: 18 }), hit.point)
  await page.waitForTimeout(700)
  const box = await page.locator('canvas.maplibregl-canvas').boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(350)
  const chooser = page.locator('[data-testid="chooser"]')
  const has = (await chooser.count()) > 0
  const text = has ? await chooser.first().innerText() : ''
  check('a tap on a route line inside a hotspot offers both in the sheet', has && /hotspot/.test(text) && /route/.test(text), has ? text.split('\n')[0] : `no sheet; card ${(await cardKind()).kind}`)
  if (has) {
    const items = chooser.locator('button[data-testid="chooser-item"]')
    const first = await items.first().innerText()
    check('  the hotspot is listed first', first.includes(hit.hotspot.name), first.split('\n')[0])
    const litWhileAsking = await page.evaluate(() => window.__map.getPaintProperty('saved-routes-line', 'line-opacity'))
    check('  the rest of the map fades while the sheet asks', litWhileAsking < 0.3, String(litWhileAsking))
    await items.last().click()
    await page.waitForTimeout(350)
    const state = await cardKind()
    check("  the route's row opens the route card", state.kind === 'route', state.kind)
    await closeCard()
  }
}

// 4b. Rest and lit: every direction rests light; one route alone under the
// tap opens its card directly, drawn bright while the rest fade; closing the
// card rests everything again.
{
  const opacity = () => page.evaluate(() => window.__map.getPaintProperty('saved-routes-line', 'line-opacity'))
  const rest = await opacity()
  check('the lines rest in a light blue (opacity under 0.6)', typeof rest === 'number' && rest > 0 && rest < 0.6, String(rest))
  const clean = findVertexOutsideHotspots(snapshot.routeLines, snapshot.polys)
  if (!clean) {
    skip('a tap on one route opens its card straight away', 'every route vertex lies inside a hotspot today')
  } else {
    await page.evaluate((c) => window.__map.jumpTo({ center: c, zoom: 17 }), clean)
    await page.waitForTimeout(700)
    const box = await page.locator('canvas.maplibregl-canvas').boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(350)
    const state = await cardKind()
    const chooserCount = await page.locator('[data-testid="chooser"]').count()
    check('a tap on one route opens its card straight away', state.kind === 'route' && chooserCount === 0, `card ${state.kind}, sheet count ${chooserCount}`)
    if (state.kind === 'route') {
      const title = await page.locator('[data-testid="card-direction"]').first().innerText().catch(() => '')
      check('  the card leads with a direction', /→/.test(title), title)
      const faded = await opacity()
      check('  the rest fade while one direction is lit', faded < rest, `${faded} vs rest ${rest}`)
      const litFilter = await page.evaluate(() => JSON.stringify(window.__map.getFilter('saved-routes-selected')))
      check('  the lit layer names exactly one direction', (litFilter.match(/[0-9a-f]{8}-[0-9a-f]{4}-/g) ?? []).length === 1, litFilter)
      // The jeeps: one for every 2 km of the lit direction, sized with the line, driving it.
      const litId = (litFilter.match(/[0-9a-f]{8}-[0-9a-f-]{27}/) ?? [''])[0]
      const km = await page.evaluate(async (id) => {
        const f = ((await window.__src('saved-routes'))?.features ?? []).find((f) => f.properties.id === id)
        if (!f) return null
        const c = f.geometry.coordinates
        const k = Math.PI / 180
        let m = 0
        for (let i = 1; i < c.length; i++) m += Math.hypot((c[i][0] - c[i - 1][0]) * Math.cos(((c[i][1] + c[i - 1][1]) / 2) * k), c[i][1] - c[i - 1][1]) * k * 6371008.8
        return m / 1000
      }, litId)
      const jeepsNow = () => page.evaluate(async () => ((await window.__src('direction-jeep'))?.features ?? []).map((f) => ({ ...f.properties, at: f.geometry.coordinates })))
      await page.waitForTimeout(200)
      const jeeps1 = await jeepsNow()
      await page.waitForTimeout(500)
      const jeeps2 = await jeepsNow()
      const want = km == null ? null : Math.max(1, Math.round(km / 2))
      check('  a jeep for every 2 km of the lit line, sized with it', jeeps1.length > 0 && (want == null || jeeps1.length === want) && jeeps1.every((p) => p.size > 0), `${jeeps1.length} jeep(s) on ${km?.toFixed(2)} km, size ${jeeps1[0]?.size}`)
      check('  and they drive', jeeps2.length === jeeps1.length && JSON.stringify(jeeps2[0]?.at) !== JSON.stringify(jeeps1[0]?.at), `${JSON.stringify(jeeps1[0]?.at)} -> ${JSON.stringify(jeeps2[0]?.at)}`)
      // A tap on a jeep: the screen follows it down to street level and the
      // card stays open; moving the map by hand lets go of it.
      await page.evaluate(() => window.__map.jumpTo({ zoom: 13 }))
      await page.waitForTimeout(400)
      const target = await page.evaluate(async () => {
        const m = window.__map
        const canvas = m.getCanvas()
        const r = canvas.getBoundingClientRect()
        const all = ((await window.__src('direction-jeep'))?.features ?? []).map((f) => ({ k: f.properties.k, p: m.project(f.geometry.coordinates) }))
        const clear = all.find(({ p }) => p.x > 40 && p.y > 40 && p.x < r.width - 40 && p.y < r.height - 40 && document.elementFromPoint(r.left + p.x, r.top + p.y) === canvas)
        return clear ? { k: clear.k, x: r.left + clear.p.x, y: r.top + clear.p.y } : null
      })
      if (!target) {
        skip('  a tap on a jeep makes the screen follow it', 'no jeep in open map at zoom 13')
      } else {
        await page.mouse.click(target.x, target.y)
        await page.waitForTimeout(1500)
        const followed = async () => page.evaluate(async (k) => {
          const m = window.__map
          const canvas = m.getCanvas()
          const all = (await window.__src('direction-jeep'))?.features ?? []
          const f = all.find((f) => f.properties.k === k)
          const p = m.project(f.geometry.coordinates)
          return { dx: p.x - canvas.clientWidth / 2, dy: p.y - canvas.clientHeight * 0.4, zoom: m.getZoom(), bigger: all.every((g) => g === f || g.properties.size < f.properties.size) }
        }, target.k)
        const on = await followed()
        const kind = (await cardKind()).kind
        check('  a tap on a jeep makes the screen follow it, down to street level', Math.hypot(on.dx, on.dy) < 30 && on.zoom > 15.8 && on.bigger, `off by ${on.dx.toFixed(0)},${on.dy.toFixed(0)} px at zoom ${on.zoom.toFixed(2)}; drawn bigger ${on.bigger}`)
        check('  and the card stays open', kind === 'route', kind)
        const box = await page.locator('canvas.maplibregl-canvas').boundingBox()
        await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.3)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height * 0.3 + 60, { steps: 8 })
        await page.mouse.up()
        await page.waitForTimeout(1200)
        const off = await followed()
        check('  moving the map by hand lets go of the jeep', Math.hypot(off.dx, off.dy) > 40, `${off.dx.toFixed(0)},${off.dy.toFixed(0)} px from the follow point`)
      }
      // The orange stretches: where this direction passes a hintuan, on the same "passes" rule as the card's count.
      const stretches = await page.evaluate(async (id) => ((await window.__src('saved-routes-pass'))?.features ?? []).filter((f) => f.properties.id === id).length, litId)
      const passLit = await page.evaluate(() => JSON.stringify(window.__map.getFilter('saved-routes-selected-pass')))
      check('  the orange stretches of the lit direction are lit with it', stretches > 0 && passLit.includes(litId), `${stretches} stretch(es); filter ${passLit}`)
      await closeCard()
      await page.waitForTimeout(300)
      check('  closing the card rests the map again', (await opacity()) === rest, String(await opacity()))
    }
  }
}

// 5. Housekeeping: no storage, no OSRM calls, no errors.
const lsCount = await page.evaluate(() => Object.keys(localStorage).length)
check('localStorage stays empty', lsCount === 0, lsCount ? `${lsCount} key(s)` : '')
check('no request to router.project-osrm.org', !osrmHit)
// Since step 5 the public map is one published file; the database is never asked.
check('no request to the database (*.supabase.co)', !supabaseHit)
check(
  'the map came from /data/map.json, fetched once and served',
  mapFileStatuses.length === 1 && (mapFileStatuses[0] === 200 || mapFileStatuses[0] === 304),
  `${mapFileStatuses.length} response(s): ${mapFileStatuses.join(', ') || 'none'}`,
)
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))

await b.close()
const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
