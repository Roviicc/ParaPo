// What every suite runs on: the dev server's address, the PASS/FAIL/SKIP
// lines and the tally at the end, the https route through Node for a
// sandbox, the bare style that stands in for the basemap, the wait for a
// map source's first features, and the reload the dev server may be holding
// for the next page that connects.
//
// BASE and harness: every suite but pwa-test, which starts its own server and
// keeps its own count. nodeFetch: gate, visitor, phone, hotspot,
// regression-gestures, snap and studio-phone. bareStyle: where, scale,
// studio-scale and save. waitForSource: visitor, phone, hotspot,
// regression-gestures, extend, group and studio-phone. takeHeldReload: phone.

/** The dev server's address: PARAPO_BASE, or http://localhost:5173. */
export const BASE = (process.env.PARAPO_BASE ?? 'http://localhost:5173').replace(/\/$/, '')

/**
 * A suite's count. `check` prints PASS or FAIL and its detail, `skip` prints
 * SKIP for a check today's data cannot support, and `tally` prints how many
 * passed and failed, then ends the run, non-zero on any failure. With
 * `bracketed`, a detail is printed in [brackets], as regression-gestures and
 * snap-test print theirs.
 */
export const harness = ({ bracketed = false } = {}) => {
  const results = []
  const check = (name, ok, detail = '') => {
    results.push(ok)
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? (bracketed ? '  [' + detail + ']' : '  ' + detail) : ''}`)
  }
  const skip = (name, reason) =>
    console.log(bracketed ? `SKIP  ${name}${reason ? '  [' + reason + ']' : ''}` : `SKIP  ${name}  ${reason}`)
  /** The last line, after a blank one unless `blankLine` is false (extend-test and group-test print none). */
  const tally = ({ blankLine = true } = {}) => {
    const failed = results.filter((r) => !r).length
    console.log(`${blankLine ? '\n' : ''}${results.length - failed} passed, ${failed} failed`)
    process.exit(failed ? 1 : 0)
  }
  return { check, skip, tally }
}

// PARAPO_NODE_FETCH=1: serve every https request through Node fetch. Needed only
// where the browser cannot reach the internet but Node can (sandboxed CI).
// `seen`, when given, is handed each request first: hotspot-test and
// regression-gestures count the router's requests with it.
export const nodeFetch = async (p, seen) => {
  if (!process.env.PARAPO_NODE_FETCH) return
  await p.route(/^https:\/\//, async (route) => {
    const req = route.request()
    seen?.(req)
    try {
      const h = { ...req.headers() }
      delete h['accept-encoding']
      const r = await fetch(req.url(), { method: req.method(), headers: h, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer() })
      const body = Buffer.from(await r.arrayBuffer())
      const hh = {}
      r.headers.forEach((v, k) => {
        if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) hh[k] = v
      })
      await route.fulfill({ status: r.status, headers: hh, body })
    } catch {
      await route.abort()
    }
  })
}

/**
 * No basemap tiles: the style is a bare one, a grey background and nothing
 * else, and anything else asked of the tile server is a 404, so a suite runs
 * the same on a laptop, in a sandbox and on a GitHub runner. save-test's grey
 * is a shade darker.
 */
export const bareStyle = (page, grey = '#eeeeee') =>
  page.route(/tiles\.openfreemap\.org/, (route) =>
    /\/styles\//.test(route.request().url())
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': grey } }] }),
        })
      : route.fulfill({ status: 404, body: '' }),
  )

// The features of one of our GeoJSON sources once the page has some, asked
// every 100 ms from here for up to `ms`; [] when none came in time. Not
// `page.waitForFunction` with an async function: under Playwright's default
// polling that resolves after the function's first call whatever it returned,
// so a slow database (GitHub's runners are far from it) let the checks start
// on an empty map. Seen on the first CI run, 2026-09-25. It reads the page's
// window.__src, which each suite's init script defines.
export const waitForSource = async (page, id, ms = 20000) => {
  const until = Date.now() + ms
  for (;;) {
    const fs = await page.evaluate(async (id) => (await window.__src(id))?.features ?? [], id)
    if (fs.length > 0 || Date.now() > until) return fs
    await page.waitForTimeout(100)
  }
}

/**
 * The dev server's HMR socket, as `clientCode` — what `${base}/@vite/client`
 * serves — connects to it: `base`'s host and port, its token if the client
 * carries one. Null for anything that is not Vite's client (a preview build
 * answers that path with the app's page).
 */
export const hmrSocketUrl = (base, clientCode) => {
  if (typeof clientCode !== 'string' || !/new WebSocket\([^)]*"vite-hmr"/.test(clientCode)) return null
  const url = new URL('/', base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  // server.hmr.port, when a config gives the socket a port of its own.
  const port = /const hmrPort = (\d+)/.exec(clientCode)?.[1]
  if (port) url.port = port
  const token = /const wsToken = "([^"]*)"/.exec(clientCode)?.[1]
  if (token) url.searchParams.set('token', token)
  return url.href
}

/**
 * Takes what the dev server holds for the next page to connect, before a
 * suite's own page connects (the owner's answer to question W of the
 * cheap-phone report, 2026-10-06). Vite 8 keeps a full reload, or an error,
 * sent while no page is connected, and hands it to the next page whose
 * client connects, which then loads a second time at once. Tailwind's plugin
 * sends one for every change to a file it reads for class names that is not
 * code: README.md, tests/e2e/README.md, PLAN.md, package.json. So an edit
 * between two runs loaded the next run's first page twice, though that page
 * was served after the edit and had it already, and phone-test's step 20
 * check counted two requests for the map file in two loads (in two full runs
 * of 2026-10-05, each started soon after an edit to tests/e2e/README.md). A
 * reload sent once a page is connected still reaches that page.
 *
 * Resolves to { socket: false } when `base` has no dev server's socket, and
 * otherwise to { socket: true, held }, `held` the message taken, or null.
 */
export const takeHeldReload = async (base = BASE, ms = 3000) => {
  const code = await fetch(`${base}/@vite/client`)
    .then((r) => (r.ok ? r.text() : null))
    .catch(() => null)
  const socket = hmrSocketUrl(base, code)
  if (!socket) return { socket: false }
  return new Promise((resolve) => {
    let ws
    let connected = false
    let held = null
    let timer
    let ended = false
    const end = () => {
      if (ended) return
      ended = true
      clearTimeout(timer)
      resolve(connected ? { socket: true, held } : { socket: false })
    }
    // Closed before it resolves: the server counts a socket still closing as
    // a page connected, and sends it what it would otherwise hold.
    const done = () => {
      clearTimeout(timer)
      if (!ws || ws.readyState === WebSocket.CLOSED) return end()
      ws.onclose = end
      timer = setTimeout(end, 1000)
      try {
        ws.close()
      } catch {
        end()
      }
    }
    timer = setTimeout(done, ms)
    try {
      ws = new WebSocket(socket, 'vite-hmr')
    } catch {
      return end()
    }
    ws.onerror = done
    ws.onmessage = (e) => {
      let m = null
      try {
        m = JSON.parse(String(e.data))
      } catch {}
      if (m?.type === 'connected') {
        connected = true
        // What it holds goes out right behind 'connected', on the same socket.
        clearTimeout(timer)
        timer = setTimeout(done, 250)
      } else if (connected && (m?.type === 'full-reload' || m?.type === 'error')) {
        held = m
        done()
      }
    }
  })
}
