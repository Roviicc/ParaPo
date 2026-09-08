// Real-clock headless screenshot of a URL via Chrome DevTools Protocol.
//
//   node scripts/realshot.mjs <url> <out.png> [waitMs=25000]
//
// Why this exists: `chrome --headless --screenshot` runs on a virtual clock
// that outruns real tile fetches, so a MapLibre page always looks blank or
// timed out there. This launches Chrome with a clean profile (no extensions),
// waits real wall-clock time, then screenshots and reports what the page
// itself sees (canvas size, error box, controls). It found the zero-height
// container bug and the missing production worker on 2026-09-07.
// Requires Node 22+ (global fetch/WebSocket) and Chrome at the path below.

import { spawn } from 'node:child_process'
import { writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const [url, out, waitMsArg] = process.argv.slice(2)
const waitMs = Number(waitMsArg ?? 25000)
const port = 9333
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = join(process.env.TEMP, 'parapo-realshot-profile')
try { rmSync(profile, { recursive: true, force: true }) } catch {}

const chrome = spawn(chromePath, [
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + profile, '--window-size=1280,800', '--hide-scrollbars',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--remote-debugging-port=' + port, '--remote-allow-origins=*', url,
], { stdio: 'ignore', windowsHide: true })
chrome.on('error', (e) => { console.log('[realshot] spawn error:', e.message); process.exit(1) })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log('[realshot]', ...a)
const NL = String.fromCharCode(10)

try {
  let targets = null
  for (let i = 0; i < 60 && !targets; i++) {
    try { targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json() } catch { await sleep(250) }
  }
  if (!targets) throw new Error('DevTools endpoint never came up')
  const page = targets.find((t) => t.type === 'page' && t.url.startsWith(url.replace(/[/]$/, ''))) ?? targets.find((t) => t.type === 'page')
  if (!page) throw new Error('no page target: ' + JSON.stringify(targets.map((t) => [t.type, t.url])))
  log('page target:', page.url)

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')) })
  let id = 0; const pending = new Map()
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })

  await send('Page.enable'); await send('Runtime.enable')
  log('waiting ' + waitMs + 'ms of real time for tiles')
  await sleep(waitMs)

  const expr = [
    '(async () => {',
    '  const c = document.querySelector("canvas");',
    '  const txt = document.body.innerText;',
    '  const after = txt.split("Events")[1] || "-";',
    '  return JSON.stringify({',
    '    canvas: c ? c.width + "x" + c.height : "MISSING",',
    '    errorBox: txt.indexOf("failed to load") !== -1,',
    '    eventsLine: after.split(String.fromCharCode(10))[0].trim(),',
    '    supabaseBanner: txt.indexOf("not configured") !== -1,',
    '    newRoute: txt.indexOf("New Route") !== -1,',
    '    mlControls: document.querySelectorAll(".maplibregl-ctrl").length,',
    '    view: await (async () => { const m = window.__map; if (!m) return "no __map (prod build?)"; const b = m.getBounds();',
    '      const s = m.getSource("saved-routes"); const d = s ? await s.getData() : null; const cs = d ? d.features.flatMap(f => f.geometry.coordinates) : [];',
    '      const inside = cs.filter(([x, y]) => b.contains([x, y])).length; const c = m.getCenter();',
    '      return c.lng.toFixed(4) + "," + c.lat.toFixed(4) + " z" + m.getZoom().toFixed(2) + " " + inside + "/" + cs.length + " route coords in view"; })(),',
    '  });',
    '})()',
  ].join(NL)
  const probe = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: expr })
  log('probe:', probe.result?.result?.value ?? JSON.stringify(probe).slice(0, 300))

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const data = shot.result?.data
  if (!data) throw new Error('no screenshot: ' + JSON.stringify(shot).slice(0, 300))
  const buf = Buffer.from(data, 'base64')
  writeFileSync(out, buf)
  log('saved', out, buf.length, 'bytes')
  ws.close()
} catch (e) {
  log('FAILED:', e.message)
  process.exitCode = 1
} finally {
  try { spawn('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }) } catch {}
}
