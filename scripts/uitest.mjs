// Drive the ParaPo editor in headless Chrome and assert it behaves.
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
const url = process.argv[2] ?? 'http://localhost:5173/'
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

  // 2. enter drawing
  const newRoute = await buttonRect('New Route')
  await click(newRoute.x, newRoute.y)
  await sleep(400)
  const t2 = (await text()) ?? ''
  check('clicking + New Route enters drawing mode', t2.includes('Undo'),
    t2.includes('Sign in to draw') || t2.includes('Send link') ? 'a sign-in dialog opened instead' : '')

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
    const c = f.geometry.coordinates; const mid = c[Math.floor(c.length / 2)];
    const p = m.project(mid); return { x: p.x, y: p.y, n: c.length };
  })()`)

  // 3. add four points along a corridor
  const pts = [[420, 300], [520, 340], [620, 380], [720, 420]]
  for (const [x, y] of pts) await click(x, y)
  await settle()
  const afterAdd = await points()
  check('four clicks add four control points', afterAdd === 4, 'got ' + afterAdd)
  check('segments routed without error', !((await text()) ?? '').includes('failed to load'))
  check('dev build exposes window.__map for tests', await evaluate('!!window.__map'))

  // 4. drag the third point by its real screen position
  let cp = await cps()
  const p2 = cp?.find((p) => p.i === 2)
  check('control points are queryable from the map', !!p2,
    JSON.stringify(cp?.map((p) => [p.i, Math.round(p.x), Math.round(p.y)])))
  if (p2) await drag(p2.x, p2.y, p2.x - 20, p2.y + 80)
  await settle()
  cp = await cps()
  const p2b = cp?.find((p) => p.i === 2)
  const movedPx = p2 && p2b ? Math.hypot(p2b.x - p2.x, p2b.y - p2.y) : 0
  check('dragging a point moves it (not the map)', movedPx > 40, `moved ${Math.round(movedPx)}px`)
  check('dragging keeps the point count', (await points()) === 4, 'got ' + (await points()))

  // 5. shift-click ON the routed line of segment 0 to straighten it
  const seg0 = await onSegment(0)
  check('segment 0 geometry is queryable', !!seg0, seg0 ? `${seg0.n} coords` : 'none')
  if (seg0) await click(seg0.x, seg0.y, { modifiers: 8 })
  await settle()
  const freehandShown = /\d+ freehand/.test((await text()) ?? '')
  check('shift-clicking a segment marks it freehand', freehandShown,
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
