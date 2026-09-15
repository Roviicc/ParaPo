import { haversine, type LngLat, type Segment, type StreetRun } from '../shared/geo'

/**
 * FOSSGIS public OSRM. No API key, and it sends
 * `Access-Control-Allow-Origin: *`, so the browser calls it directly.
 *
 * It is a shared demo server with no SLA. That is acceptable for one person
 * drawing a handful of routes; if ParaPo ever takes real traffic the upgrade
 * is OpenRouteService with a key (host `api.heigit.org`) or self-hosted OSRM.
 * Both return the same thing, so only this file changes.
 */
const OSRM = 'https://router.project-osrm.org/route/v1/driving'

/**
 * How far a control point may be from a road and still snap to it, in metres.
 * Without a limit the router silently takes the nearest road however far away
 * it is: a click in the La Mesa watershed snapped to Quirino Highway 1.2 km
 * off and looked like success. With the limit the router refuses, and a
 * refused gap is drawn dashed, where it can be seen and fixed.
 */
export const SNAP_RADIUS_M = 25

/**
 * The public router allows about one request a second. Requests are spaced
 * this far apart across the page, so a quick run of clicks queues instead of
 * being refused — and a refusal draws a good stretch as a dashed straight line.
 */
const REQUEST_GAP_MS = 1000

/** A request with no answer by then is given up on, and its gap drawn straight. */
const TIMEOUT_MS = 10_000

/** Streets followed for less than this are left out of the street list. */
const MIN_STREET_M = 25

/** Two router vertices this close are the same place: one OSM node, reached twice. */
const SAME_M = 0.5

/** A turn sharper than this, from the edge a segment arrives on to the edge the next leaves on, is turning back. */
const UTURN_DEG = 150

/**
 * A turn back shorter than this is a click that snapped a metre or two past a
 * junction: nothing to see under the ring, and nothing a drag could fix.
 */
const MIN_UTURN_M = 5

/** How far off the longer edge the shorter one may be and still count as running back along it. */
const ALONG_M = 2

/**
 * Where a road cannot turn back — a one-way street, one carriageway of a
 * divided road — the router drives on and comes round, through a U-turn slot
 * or round the block. A segment that has gone at least LOOP_MIN_M and is back
 * within LOOP_NEAR_M of its point has done that: the way back runs beside the
 * way out, and at editing zoom the two read as one line.
 */
const LOOP_MIN_M = 100
const LOOP_NEAR_M = 30

/** A straight line: correct topology, wrong geometry, always editable. */
export function straightSegment(from: LngLat, to: LngLat): Segment {
  return { snap: 'freehand', coordinates: [from, to] }
}

/** The router answered, and said no. `coordinate` is the point it could not place, when it says. */
class RouterRefusal extends Error {
  code: string
  coordinate: number | null
  constructor(code: string, message: string) {
    super(`${code}: ${message}`)
    this.code = code
    const m = /coordinate (\d+)/.exec(message)
    this.coordinate = m ? Number(m[1]) : null
  }
}

const isAbort = (err: unknown) => err instanceof Error && err.name === 'AbortError'
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let nextSlot = 0

/** Wait for this request's turn: one request every REQUEST_GAP_MS, page-wide. Throws if given up on meanwhile. */
async function takeTurn(signal?: AbortSignal) {
  signal?.throwIfAborted()
  const now = Date.now()
  const at = Math.max(now, nextSlot)
  nextSlot = at + REQUEST_GAP_MS
  if (at > now) await sleep(at - now)
  // Given up on while it waited (its stand-in was replaced): the slot passes unused.
  signal?.throwIfAborted()
}

async function fetchRoute(url: string, signal?: AbortSignal): Promise<Response> {
  const attempt = async () => {
    await takeTurn(signal)
    // The timeout starts once it is this request's turn, not while it queues.
    const timeout = AbortSignal.timeout(TIMEOUT_MS)
    return fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
  }
  const res = await attempt()
  // Over the limit anyway (another tab, another tool): one more try, a turn later.
  return res.status === 429 ? attempt() : res
}

type OsrmStep = { name: string; distance: number; geometry: { coordinates: LngLat[] } }
type OsrmLeg = { steps: OsrmStep[] }

/**
 * One request through every point; one Segment per gap. Throws RouterRefusal
 * when the router says no, and whatever fetch throws when it cannot be reached,
 * times out or is aborted.
 *
 * - `radiuses`: each point must be within SNAP_RADIUS_M of a road.
 * - `continue_straight=false`: the route may turn back at a middle point. That
 *   can be a click a little past a corner, or a jeepney that really turns
 *   there; only the owner knows which, so it is kept as the router drew it
 *   and shown (findUTurns), never changed (owner's decision, 2026-09-15).
 * - `steps`: geometry and street names per gap, so `overview` is off.
 */
async function route(points: LngLat[], signal?: AbortSignal): Promise<Segment[]> {
  const url =
    `${OSRM}/${points.map(([lng, lat]) => `${lng},${lat}`).join(';')}` +
    `?overview=false&geometries=geojson&steps=true&continue_straight=false` +
    `&radiuses=${points.map(() => SNAP_RADIUS_M).join(';')}`

  const res = await fetchRoute(url, signal)
  // A refusal arrives as JSON on a 400, so read the body before the status.
  const data = await res.json().catch(() => null)
  if (data?.code && data.code !== 'Ok') throw new RouterRefusal(data.code, data.message ?? '')
  if (!res.ok || !data?.routes?.length) throw new Error(`OSRM ${res.status}`)

  const legs = data.routes[0].legs as OsrmLeg[]
  if (legs.length !== points.length - 1) throw new Error('OSRM returned the wrong number of legs')

  return legs.map((leg) => {
    // Each step starts where the one before ended; keep that point once.
    const coordinates: LngLat[] = []
    for (const step of leg.steps) {
      for (const c of step.geometry.coordinates) {
        const last = coordinates[coordinates.length - 1]
        if (!last || last[0] !== c[0] || last[1] !== c[1]) coordinates.push(c)
      }
    }
    if (coordinates.length < 2) throw new RouterRefusal('Degenerate', 'a gap with no length')
    return { snap: 'snapped' as const, coordinates, streets: streetRuns(leg.steps) }
  })
}

/** The roads a leg follows as runs of one name, in order. Unnamed ways stay in, so the lengths add up. */
function streetRuns(steps: OsrmStep[]): StreetRun[] {
  const runs: StreetRun[] = []
  for (const { name, distance } of steps) {
    if (distance <= 0) continue
    const last = runs[runs.length - 1]
    if (last?.name === name) last.metres += distance
    else runs.push({ name, metres: distance })
  }
  return runs
}

/**
 * Road-following geometry through consecutive control points: one Segment per
 * gap, each with the streets it follows.
 *
 * Never fails for routing reasons. When the router refuses a point, only the
 * gaps touching that point are drawn straight ('freehand'); the rest are
 * routed on their own. A visibly wrong segment you can fix beats a silently
 * missing one, and jeepneys do take paths a car router refuses. When the
 * router cannot be reached or does not answer in time, every gap is straight.
 * Only an abort throws: nobody is waiting for the answer any more.
 */
export async function snapSegments(points: LngLat[], signal?: AbortSignal): Promise<Segment[]> {
  const straight = (i: number) => straightSegment(points[i], points[i + 1])
  try {
    return await route(points, signal)
  } catch (err) {
    if (isAbort(err)) throw err
    if (!(err instanceof RouterRefusal) || points.length === 2) {
      return points.slice(1).map((_, i) => straight(i))
    }

    const out: Segment[] = []
    for (let i = 0; i < points.length - 1; i++) {
      if (i === err.coordinate || i + 1 === err.coordinate) {
        out.push(straight(i))
        continue
      }
      try {
        out.push(...(await route([points[i], points[i + 1]], signal)))
      } catch (e) {
        if (isAbort(e)) throw e
        out.push(straight(i))
      }
    }
    return out
  }
}

/** Compass bearing from a to b, in degrees clockwise from north. */
function bearing([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLng = rad(lng2 - lng1)
  const y = Math.sin(dLng) * Math.cos(rad(lat2))
  const x =
    Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/** Metres from p to the edge a–b, on a flat local projection: exact enough at street scale. */
function distanceToEdge(p: LngLat, a: LngLat, b: LngLat): number {
  const kx = 111_320 * Math.cos((a[1] * Math.PI) / 180)
  const ky = 110_574
  const px = (p[0] - a[0]) * kx
  const py = (p[1] - a[1]) * ky
  const bx = (b[0] - a[0]) * kx
  const by = (b[1] - a[1]) * ky
  const len2 = bx * bx + by * by
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2))
  return Math.hypot(px - t * bx, py - t * by)
}

/**
 * A segment's coordinates with repeats removed (a vertex within SAME_M of the
 * one before), or [] when they are not a list of points. Segments saved by
 * older code can hold repeats, and a stored row can be malformed.
 */
function distinct(coords: unknown): LngLat[] {
  if (!Array.isArray(coords)) return []
  const out: LngLat[] = []
  for (const c of coords) {
    if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return []
    const point: LngLat = [c[0], c[1]]
    if (out.length === 0 || haversine(out[out.length - 1], point) > SAME_M) out.push(point)
  }
  return out
}

/** A control point where the route turns back on itself. */
export type UTurn = {
  /** Which control point. */
  point: number
  /** The stretch that doubles back, so it can be drawn over the line. */
  stub: LngLat[]
  /** That stretch's length, in metres. */
  metres: number
}

type Turn = Omit<UTurn, 'point'>

/** The next segment runs back over the road nodes the previous one came in on. */
function retrace(p: LngLat[], n: LngLat[]): Turn | null {
  if (haversine(p[p.length - 1], n[0]) > SAME_M) return null
  let i = p.length - 1
  let j = 0
  let metres = 0
  while (i > 0 && j < n.length - 1 && haversine(p[i - 1], n[j + 1]) <= SAME_M) {
    metres += haversine(p[i - 1], p[i])
    i--
    j++
  }
  return metres >= MIN_UTURN_M ? { stub: p.slice(i), metres } : null
}

/**
 * With no node between: the edge in and the edge out point opposite ways, and
 * the shorter lies along the longer. A sharp turn onto another road points
 * nearly opposite too, but does not run back along this one.
 */
function oppositeEdges(p: LngLat[], n: LngLat[]): Turn | null {
  const a = p[p.length - 2]
  const join = p[p.length - 1]
  const b = n[1]
  const inM = haversine(a, join)
  const outM = haversine(n[0], b)
  const d = Math.abs(bearing(a, join) - bearing(n[0], b)) % 360
  if ((d > 180 ? 360 - d : d) < UTURN_DEG) return null
  const shorterIn = inM <= outM
  const off = shorterIn ? distanceToEdge(a, n[0], b) : distanceToEdge(b, a, join)
  const metres = Math.min(inM, outM)
  if (off > ALONG_M || metres < MIN_UTURN_M) return null
  return { stub: shorterIn ? [a, join] : [b, n[0]], metres }
}

/** Where the road cannot turn back, the router comes round: either segment is back beside the point. */
function loopBack(p: LngLat[], n: LngLat[]): Turn | null {
  const join = p[p.length - 1]
  let walked = 0
  for (let j = 1; j < n.length; j++) {
    walked += haversine(n[j - 1], n[j])
    if (walked >= LOOP_MIN_M && haversine(n[j], join) <= LOOP_NEAR_M) return { stub: n.slice(0, j + 1), metres: walked }
  }
  walked = 0
  for (let i = p.length - 2; i >= 0; i--) {
    walked += haversine(p[i], p[i + 1])
    if (walked >= LOOP_MIN_M && haversine(p[i], join) <= LOOP_NEAR_M) return { stub: p.slice(i), metres: walked }
  }
  return null
}

/**
 * Every control point where the route turns back on itself: the next segment
 * runs back over the road the previous one arrived on (shared nodes, or with
 * no node between, opposite edges), or — where the road cannot turn back — the
 * route goes on and comes round to beside the point.
 *
 * Nothing is changed. A doubled-back stretch overlaps itself or runs beside
 * itself, so on the map it cannot be seen; reporting it is what makes it
 * visible. `ignore` skips segments that are not road geometry yet (stand-ins).
 */
export function findUTurns(segments: Segment[], ignore: (s: Segment) => boolean = () => false): UTurn[] {
  const found: UTurn[] = []
  for (let k = 0; k + 1 < segments.length; k++) {
    const a = segments[k]
    const b = segments[k + 1]
    if (a?.snap !== 'snapped' || b?.snap !== 'snapped' || ignore(a) || ignore(b)) continue
    const p = distinct(a.coordinates)
    const n = distinct(b.coordinates)
    if (p.length < 2 || n.length < 2) continue
    const turn = retrace(p, n) ?? oppositeEdges(p, n) ?? loopBack(p, n)
    if (turn) found.push({ point: k + 1, ...turn })
  }
  return found
}

/**
 * The streets a whole route follows, for the save panel: named runs of at
 * least MIN_STREET_M, in order, with a street that runs across a join named
 * once. `missing` counts routed segments with no streets recorded (saved
 * before they were, until routed again); `straight` counts freehand segments,
 * which follow no street. Runs that are not `{ name, metres }` are skipped.
 */
export function routeStreets(segments: Segment[]): { names: string[]; missing: number; straight: number } {
  const runs: StreetRun[] = []
  let missing = 0
  let straight = 0
  for (const s of segments) {
    if (!s) continue
    if (s.snap !== 'snapped') {
      straight++
      continue
    }
    if (!Array.isArray(s.streets)) {
      missing++
      continue
    }
    for (const r of s.streets as unknown[]) {
      if (!r || typeof r !== 'object') continue
      const { name, metres } = r as Partial<StreetRun>
      if (typeof name !== 'string' || typeof metres !== 'number' || !Number.isFinite(metres)) continue
      const last = runs[runs.length - 1]
      if (last && last.name === name) last.metres += metres
      else runs.push({ name, metres })
    }
  }
  const names: string[] = []
  for (const r of runs) {
    if (r.name && r.metres >= MIN_STREET_M && names[names.length - 1] !== r.name) names.push(r.name)
  }
  return { names, missing, straight }
}
