// Drive the ParaPo editor at /studio/?e2e=1 in headless Chrome and assert it
// behaves. Needs the dev server running (npm run dev); in development only,
// ?e2e=1 skips the sign-in door so the test can draw while signed out.
//
//   node scripts/uitest.mjs [url] [out.png]
//
// Real mouse events over the DevTools protocol: click to add control points,
// drag one, right-click to delete, shift-click to straighten a segment. Reads
// the toolbar back after each step. This exists so drawing changes can be
// verified without asking a human to perform four gestures and describe them.
//
// Requires Node 22+ (global fetch/WebSocket) and Chrome at CHROME below.
import { spawn } from 'node:child_process'
import { writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = (process.env.PARAPO_BASE ?? 'http://localhost:5173').replace(/\/$/, '')
const url = process.argv[2] ?? `${BASE}/studio/?e2e=1`
const out = process.argv[3] ?? 'uitest.png'
const port = 9335
const profile = join(process.env.TEMP ?? '.', 'parapo-uitest-profile')

try { rmSync(profile, { recursive: true, force: true }) } catch {}

const chrome = spawn(CHROME, [
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + profile, '--window-size=1280,800', '--hide-scrollbars',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--remote-debugging-port=' + port, '--remote-allow-origins=*', url,
], { stdio: 'ignore', windowsHide: true })
chrome.on('error', (e) => { console.log('spawn error:', e.message); process.exit(1) })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (label, ok, detail = '') => {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''))
  if (!ok) failures++
}

try {
  let targets = null
  for (let i = 0; i < 80 && !targets; i++) {
    try { targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json() } catch { await sleep(250) }
  }
  if (!targets) throw new Error('DevTools never came up')
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('no page target')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws failed')) })
  let id = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  }
  const send = (method, params = {}) =>
    new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    return r.result?.result?.value
  }
  const text = () => evaluate('document.body.innerText')

  const mouse = (type, x, y, opts = {}) =>
    send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...opts })
  const click = async (x, y, opts = {}) => {
    await mouse('mouseMoved', x, y, { button: 'none', clickCount: 0, ...opts })
    await mouse('mousePressed', x, y, opts)
    await mouse('mouseReleased', x, y, opts)
    await sleep(160)
  }
  const rightClick = async (x, y) => {
    await mouse('mouseMoved', x, y, { button: 'none', clickCount: 0 })
    await mouse('mousePressed', x, y, { button: 'right' })
    await mouse('mouseReleased', x, y, { button: 'right' })
    await sleep(300)
  }
  const drag = async (x1, y1, x2, y2) => {
    await mouse('mouseMoved', x1, y1, { button: 'none', clickCount: 0 })
    await mouse('mousePressed', x1, y1)
    for (let i = 1; i <= 6; i++) {
      await mouse('mouseMoved', x1 + ((x2 - x1) * i) / 6, y1 + ((y2 - y1) * i) / 6, { buttons: 1 })
      await sleep(40)
    }
    await mouse('mouseReleased', x2, y2)
    await sleep(300)
  }
  const buttonRect = (label) => evaluate(`(() => {
    const els = [...document.querySelectorAll('button')].filter(e => e.textContent.includes(${JSON.stringify(label)}));
    const el = els.find(e => e.offsetParent !== null);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, disabled: !!el.disabled };
  })()`)
  const points = async () => {
    const t = await text()
    const m = /(\d+)\s+points?/.exec(t ?? '')
    return m ? Number(m[1]) : -1
  }
  const settle = async (ms = 12000) => {
    const until = Date.now() + ms
    while (Date.now() < until) {
      const t = (await text()) ?? ''
      if (!t.includes('snapping')) return true
      await sleep(400)
    }
    return false
  }

  await send('Page.enable'); await send('Runtime.enable')

  // 1. map ready
  let ready = false
  for (let i = 0; i < 60; i++) {
    const btn = await buttonRect('New Route')
    if (btn && !btn.disabled && !(await text() ?? '').includes('failed to load')) { ready = true; break }
    await sleep(500)
  }
  check('map loads and + New Route becomes enabled', ready)
  if (!ready) throw new Error('map never became ready: ' + (await text()))

  // 1b. the public side: saved routes render and can be tapped.
  // Fit the view to whatever is saved first: a route can be anywhere in the
  // metro, and querySourceFeatures only sees loaded tiles.
  await sleep(1500)
  const fitted = await evaluate(`(async () => {
    const m = window.__map; const src = m && m.getSource('saved-routes'); if (!src) return 'no source';
    const fc = await src.getData(); const cs = fc.features.flatMap(f => f.geometry.coordinates);
    if (!cs.length) return 'no features';
    const xs = cs.map(c => c[0]), ys = cs.map(c => c[1]);
    m.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 100, duration: 0, maxZoom: 13 });
    return 'fitted ' + fc.features.length;
  })()`)
  check('view fitted to the saved routes', typeof fitted === 'string' && fitted.startsWith('fitted'), String(fitted))
  for (let i = 0; i < 30; i++) { if (await evaluate('!!(window.__map && window.__map.areTilesLoaded())')) break; await sleep(300) }
  const t1 = (await text()) ?? ''
  check('pill shows the saved route count', /\d+ routes?/.test(t1), (t1.match(/\d+ routes?/) ?? ['-'])[0])
  const savedPt = await evaluate(`(() => {
    const m = window.__map; if (!m) return null;
    const f = m.querySourceFeatures('saved-routes').find(f => f.geometry.coordinates.length > 1);
    if (!f) return null; const c = f.geometry.coordinates; const p = m.project(c[Math.floor(c.length / 2)]);
    return { x: p.x, y: p.y, signboard: f.properties.signboard };
  })()`)
  check('a saved route is on the map', !!savedPt, savedPt ? savedPt.signboard : 'none')
  if (savedPt) { await click(savedPt.x, savedPt.y); await sleep(400) }
  const tCard = (await text()) ?? ''
  check('tapping it opens the route card', !!savedPt && tCard.includes(savedPt.signboard) && tCard.includes('Direction'),
    tCard.includes('drawn, not yet ridden') ? 'status badge present' : '')
  const closeBtn = await evaluate(`(() => { const b = document.querySelector('button[aria-label="Close"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 } })()`)
  if (closeBtn) await click(closeBtn.x, closeBtn.y)
  check('closing the card brings the pill back', ((await text()) ?? '').includes('Sign in'))

  // 1c. Jump to a street-level view, independent of what happens to be saved
  // today: the middle vertex of an existing saved route, or the Cubao
  // fallback if there are none. Fixed pixels on a bounds-fit view can land on
  // water or inside a block, where OSRM can't snap.
  const jumpTarget = await evaluate(`(async () => {
    const m = window.__map; const src = m && m.getSource('saved-routes');
    const fc = src ? await src.getData() : null;
    const f = fc && fc.features.find((f) => f.geometry.coordinates.length > 1);
    if (f) { const c = f.geometry.coordinates; return c[Math.floor(c.length / 2)]; }
    return [121.0527, 14.6187];
  })()`)
  await evaluate(`(() => { window.__map.jumpTo({ center: ${JSON.stringify(jumpTarget)}, zoom: 15 }); return true })()`)
  for (let i = 0; i < 30; i++) { if (await evaluate('!!(window.__map && window.__map.areTilesLoaded())')) break; await sleep(300) }
  const canvasBox = await evaluate(`(() => {
    const el = document.querySelector('canvas.maplibregl-canvas'); if (!el) return null;
    const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
  })()`)
  check('view jumped to a street-level point', !!canvasBox, JSON.stringify(jumpTarget))
  const centerX = canvasBox ? canvasBox.x + canvasBox.width / 2 : 640
  const centerY = canvasBox ? canvasBox.y + canvasBox.height / 2 : 400

  // 2. enter drawing
  const newRoute = await buttonRect('New Route')
  await click(newRoute.x, newRoute.y)
  await sleep(400)
  const t2 = (await text()) ?? ''
  check('clicking + New Route enters drawing mode', t2.includes('Undo'))

  // Read positions from the map itself (dev builds expose window.__map).
  const cps = () => evaluate(`(() => {
    const m = window.__map; if (!m) return null;
    const byIdx = new Map();
    for (const f of m.querySourceFeatures('draw-points')) byIdx.set(f.properties.index, f.geometry.coordinates);
    return [...byIdx.entries()].sort((a, b) => a[0] - b[0]).map(([i, c]) => { const p = m.project(c); return { i, x: p.x, y: p.y }; });
  })()`)
  const onSegment = (gap) => evaluate(`(() => {
    const m = window.__map; if (!m) return null;
    const f = m.querySourceFeatures('draw-line').find(f => f.properties.index === ${gap} && f.geometry.coordinates.length > 1);
    if (!f) return null;
    // The middle vertex, or halfway along a two-vertex segment, whose vertices are its control points.
    const c = f.geometry.coordinates;
    const mid = c.length > 2 ? c[Math.floor(c.length / 2)] : [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2];
    const p = m.project(mid); return { x: p.x, y: p.y, n: c.length };
  })()`)
  const freehandCount = async () => Number(/(\d+) freehand/.exec((await text()) ?? '')?.[1] ?? 0)

  // 3. add four points on the saved route's own vertices, at least 90 px apart
  // and clear of the cards and the toolbar. They are on roads, so the router
  // (which refuses a click more than 25 m from one) routes every gap; fixed
  // pixel offsets from the centre can land inside a block, and a refused gap is
  // drawn freehand, which would let the freehand check below pass for the
  // wrong reason.
  const roadPts = await evaluate(`(async () => {
    const m = window.__map; const src = m && m.getSource('saved-routes');
    const fc = src ? await src.getData() : null;
    const f = fc && fc.features.find((f) => f.geometry.coordinates.length > 1);
    if (!f) return [];
    const r = m.getCanvas().getBoundingClientRect();
    const picked = [];
    for (const c of f.geometry.coordinates) {
      const p = m.project(c);
      if (p.x < 80 || p.x > r.width - 80 || p.y < 80 || p.y > r.height - 140) continue;
      const last = picked[picked.length - 1];
      if (!last || Math.hypot(p.x - last[0], p.y - last[1]) >= 90) picked.push([p.x, p.y]);
      if (picked.length === 4) break;
    }
    return picked.map(([x, y]) => [r.x + x, r.y + y]);
  })()`)
  check('four on-road click positions found on a saved route', roadPts?.length === 4, `${roadPts?.length ?? 0} found`)
  for (const [x, y] of roadPts ?? []) await click(x, y)
  await settle()
  const afterAdd = await points()
  check('four clicks add four control points', afterAdd === 4, 'got ' + afterAdd)
  check('every segment routed, none freehand', !((await text()) ?? '').includes('failed to load') && (await freehandCount()) === 0,
    `${await freehandCount()} freehand`)
  check('dev build exposes window.__map for tests', await evaluate('!!window.__map'))

  // 4. drag the third point along its own road, onto the middle of segment 2,
  // so the router still has a road to snap it to
  let cp = await cps()
  const p2 = cp?.find((p) => p.i === 2)
  check('control points are queryable from the map', !!p2,
    JSON.stringify(cp?.map((p) => [p.i, Math.round(p.x), Math.round(p.y)])))
  const seg2 = await onSegment(2)
  if (p2 && seg2) await drag(p2.x, p2.y, seg2.x, seg2.y)
  await settle()
  cp = await cps()
  const p2b = cp?.find((p) => p.i === 2)
  const movedPx = p2 && p2b ? Math.hypot(p2b.x - p2.x, p2b.y - p2.y) : 0
  check('dragging a point moves it (not the map)', movedPx > 15, `moved ${Math.round(movedPx)}px`)
  check('dragging keeps the point count', (await points()) === 4, 'got ' + (await points()))
  check('still none freehand after the drag (control for the shift-click)', (await freehandCount()) === 0,
    `${await freehandCount()} freehand`)

  // 5. shift-click ON the routed line of segment 0 to straighten it
  const seg0 = await onSegment(0)
  check('segment 0 geometry is queryable', !!seg0, seg0 ? `${seg0.n} coords` : 'none')
  if (seg0) await click(seg0.x, seg0.y, { modifiers: 8 })
  await settle()
  check('shift-clicking a segment marks it freehand', (await freehandCount()) === 1,
    ((await text()) ?? '').split('\n').find((l) => l.includes('points')) ?? '')
  check('shift-click did not add a point', (await points()) === 4, 'got ' + (await points()))

  // 5b. plain-click ON the (now straight) segment 0 to insert a point into it
  const seg0b = await onSegment(0)
  if (seg0b) await click(seg0b.x, seg0b.y)
  await settle()
  const afterInsert = await points()
  check('clicking the line inserts a point into that segment', afterInsert === 5, 'got ' + afterInsert)
  cp = await cps()
  const inserted = cp?.find((p) => p.i === 1)
  const nearSeg0 = seg0b && inserted ? Math.hypot(inserted.x - seg0b.x, inserted.y - seg0b.y) : 999
  check('inserted point lands where clicked, as index 1', nearSeg0 < 12, `${Math.round(nearSeg0)}px away`)

  // 6. right-click the last point to delete it
  await evaluate('(() => { window.__cm = 0; document.addEventListener("contextmenu", () => { window.__cm++ }, { capture: true }); return true })()')
  cp = await cps()
  const last = cp?.[cp.length - 1]
  if (last) await rightClick(last.x, last.y)
  await settle()
  const afterDelete = await points()
  check('right-clicking a point deletes it', afterDelete === 4,
    `got ${afterDelete}; DOM contextmenu events seen: ${await evaluate('window.__cm')}`)

  // 7. undo
  const undo = await buttonRect('Undo')
  if (undo) { await click(undo.x, undo.y); await settle() }
  const afterUndo = await points()
  check('undo removes the last point', afterUndo === afterDelete - 1, 'got ' + afterUndo)

  // 8. Done asks for sign-in (we are signed out)
  const done = await buttonRect('Done')
  check('Done is enabled with a route drawn', !!done && !done.disabled)
  if (done) { await click(done.x, done.y); await sleep(400) }
  const t8 = (await text()) ?? ''
  check('Done while signed out opens the sign-in dialog', t8.includes('Sign in to save'))
  const cancel = await buttonRect('Cancel')
  if (cancel) await click(cancel.x, cancel.y)

  // 9. a reload restores the unsaved drawing
  const before = await points()
  await send('Page.reload')
  let restored = -1
  for (let i = 0; i < 40; i++) { await sleep(500); restored = await points(); if (restored > 0) break }
  check('reloading the page restores the draft', restored === before, `before ${before}, after ${restored}`)

  // Let tiles land so the screenshot is a map, not a placeholder.
  for (let i = 0; i < 40; i++) { if (await evaluate('!!(window.__map && window.__map.loaded() && window.__map.areTilesLoaded())')) break; await sleep(500) }

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  if (shot.result?.data) {
    const buf = Buffer.from(shot.result.data, 'base64')
    writeFileSync(out, buf)
    console.log('\n  screenshot: ' + out + ' (' + buf.length + ' bytes)')
  }
  console.log('\n  final toolbar: ' + (((await text()) ?? '').split('\n').find((l) => /points?/.test(l)) ?? '(none)'))
  ws.close()
} catch (e) {
  console.log('  ERROR: ' + e.message)
  failures++
} finally {
  try { spawn('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }) } catch {}
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED')
process.exitCode = failures === 0 ? 0 : 1
