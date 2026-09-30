// What every suite runs on: the dev server's address, the PASS/FAIL/SKIP
// lines and the tally at the end, the https route through Node for a
// sandbox, the bare style that stands in for the basemap, and the wait for a
// map source's first features.
//
// BASE and harness: every suite but pwa-test, which starts its own server and
// keeps its own count. nodeFetch: gate, visitor, phone, hotspot,
// regression-gestures and snap. bareStyle: where, scale, studio-scale and
// save. waitForSource: visitor, phone, hotspot, regression-gestures, extend
// and group.

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
