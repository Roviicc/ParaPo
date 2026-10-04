// The phone-speed measurement's own reckoning (scripts/research/phone-speed.mjs),
// on its own so a unit check can hold it (tests/unit/phone-speed-test.mjs):
// the one slow link the harness models, what a file weighs on it, which
// basemap tile is which zoom, and where on the screen a tap opens a trip.
// Written 2026-10-04 for the cheap-phone plan, step 0.
import { gzipSync } from 'node:zlib'

/**
 * One Slow-4G link, as the harness models it for the files Chrome's own
 * throttling does not reach: the basemap, which the harness hands over
 * itself, and MapLibre's worker, which Chrome fetches before any throttle
 * can be set on it (and refuses one on: "Not supported"). Before step 0
 * these came at disk speed, so a change that fetched less of them could
 * not show.
 *
 * Every file waits `latency` ms for its first byte, then its bytes go down
 * the link at `bytesPerSecond`, one file after another in the order asked
 * for: a file asked for while the link is busy waits its turn.
 * `hold(now, bytes)` says how long, in ms from `now`, the file asked for at
 * `now` takes to arrive whole.
 */
export function slowLink({ latency = 150, bytesPerSecond = 200_000 } = {}) {
  let free = -Infinity
  return {
    hold(now, bytes) {
      const start = Math.max(now + latency, free)
      free = start + (bytes / bytesPerSecond) * 1000
      return free - now
    },
  }
}

/**
 * What `body` weighs on the wire: gzipped, as `vite preview` sends the app
 * and OpenFreeMap's tiles come — or as it is, where gzip gains nothing (a
 * PNG). Cloudflare's brotli is some 15-20% under this, so it errs heavy.
 * The basemap cache keeps bodies as curl unpacked them, and the harness
 * counted those until 2026-10-04: 1,451 KB of a first visit.
 */
export function wireBytes(body) {
  return body.length === 0 ? 0 : Math.min(body.length, gzipSync(body).length)
}

/** The zoom of a basemap tile from its address (…/{z}/{x}/{y}.pbf), or null for the style, its sprite, glyphs and TileJSON. */
export function tileZoom(url) {
  const m = /\/(\d{1,2})\/\d+\/\d+\.(?:pbf|mvt|png|jpg|jpeg|webp)(?:[?#]|$)/.exec(url)
  return m ? Number(m[1]) : null
}

/** The basemap files counted by zoom, `z11: 4`, the rest under `other`. */
export function byZoom(urls) {
  const out = {}
  for (const url of urls) {
    const z = tileZoom(url)
    const key = z === null ? 'other' : `z${z}`
    out[key] = (out[key] ?? 0) + 1
  }
  return out
}

/** The middle value of the numbers among `xs`, the higher of the two middles for an even count; null with none. */
export function median(xs) {
  const s = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : null
}

/** Distance in px from `p` to the segment a–b. */
function toSegment(p, a, b) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Distance in px from `p` to a polyline. */
function toLine(p, pts) {
  if (pts.length === 1) return Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1])
  let d = Infinity
  for (let i = 1; i < pts.length; i++) d = Math.min(d, toSegment(p, pts[i - 1], pts[i]))
  return d
}

/** Distance in px from `p` to a ring's edge, 0 inside it. */
function toRing(p, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = [ring[i], ring[j]]
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside ? 0 : toLine(p, ring)
}

/**
 * Where a tap opens one route's trip and not the list: a vertex of a line,
 * on the screen inside `view` ({left, top, right, bottom}, px), with more
 * than `reach` px between it and every other route's line and every
 * hotspot's box. A tap's box reaches 20√2 px to its corner, and a line is
 * hit up to half its hit width beyond that (tap.ts, savedRoutesLayers.ts);
 * phone-test's openAlone keeps the same room, in metres. A route's own way
 * back may run there: both directions are one route, and the tap opens one
 * of them (routeTaps.ts).
 *
 * `lines`: [{ route, pts }] with `pts` the line's vertices on the screen;
 * `rings`: the hotspots' boxes on the screen. Returns the vertex with the
 * most room, as { at, room, line } (`line` its index), or null.
 */
export function loneSpot({ lines, rings, reach, view }) {
  let best = null
  for (const [i, line] of lines.entries()) {
    for (const p of line.pts) {
      if (p[0] < view.left || p[0] > view.right || p[1] < view.top || p[1] > view.bottom) continue
      let room = Infinity
      for (const other of lines) if (other.route !== line.route && other.pts.length) room = Math.min(room, toLine(p, other.pts))
      for (const ring of rings) if (room > reach && ring.length) room = Math.min(room, toRing(p, ring))
      if (room > reach && (!best || room > best.room)) best = { at: p, room, line: i }
    }
  }
  return best
}
