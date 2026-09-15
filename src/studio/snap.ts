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

/** Wait for this request's turn: one request every REQUEST_GAP_MS, page-wide. */
async function takeTurn() {
  const now = Date.now()
  const at = Math.max(now, nextSlot)
  nextSlot = at + REQUEST_GAP_MS
  if (at > now) await sleep(at - now)
}

async function fetchRoute(url: string, signal?: AbortSignal): Promise<Response> {
  const attempt = async () => {
    await takeTurn()
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
 * when the router says no, and whatever fetch throws when it cannot be reached
 * or times out.
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
 * Only an abort throws.
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

/** A control point where the route turns back on itself. */
export type UTurn = {
  /** Which control point. */
  point: number
  /** The doubled-back stretch, ending where it turns, so it can be drawn over the line. */
  stub: LngLat[]
  /** That stretch's length one way, in metres. */
  metres: number
}

/**
 * Every control point where the next segment sets off back along the road
 * the previous one arrived on. Found two ways: the two segments pass the same
 * road nodes in opposite order, or, with no node between, the edge one
 * arrives on and the edge the next leaves on point opposite ways.
 *
 * Nothing is changed. The doubled-back stretch overlaps itself, so on the map
 * it cannot be seen; reporting it is what makes it visible.
 * `ignore` skips segments that are not road geometry yet (stand-ins).
 */
export function findUTurns(segments: Segment[], ignore: (s: Segment) => boolean = () => false): UTurn[] {
  const found: UTurn[] = []
  for (let k = 0; k + 1 < segments.length; k++) {
    const a = segments[k]
    const b = segments[k + 1]
    if (a?.snap !== 'snapped' || b?.snap !== 'snapped' || ignore(a) || ignore(b)) continue
    const p = a.coordinates
    const n = b.coordinates
    if (p.length < 2 || n.length < 2) continue

    // Walk back along one and forward along the other while they share nodes.
    let i = p.length - 1
    let j = 0
    let metres = 0
    if (haversine(p[i], n[j]) <= SAME_M) {
      while (i > 0 && j < n.length - 1 && haversine(p[i - 1], n[j + 1]) <= SAME_M) {
        metres += haversine(p[i - 1], p[i])
        i--
        j++
      }
    }
    if (metres > 0) {
      found.push({ point: k + 1, stub: p.slice(i), metres })
      continue
    }

    // No shared node: compare the edge in with the edge out.
    const end = p.length - 1
    const inEdge = haversine(p[end - 1], p[end])
    const outEdge = haversine(n[0], n[1])
    if (inEdge === 0 || outEdge === 0) continue
    const d = Math.abs(bearing(p[end - 1], p[end]) - bearing(n[0], n[1])) % 360
    if ((d > 180 ? 360 - d : d) < UTURN_DEG) continue
    // The shorter edge lies along the longer one: that is the doubled-back part.
    const stub = inEdge <= outEdge ? [p[end - 1], p[end]] : [n[1], n[0]]
    found.push({ point: k + 1, stub, metres: Math.min(inEdge, outEdge) })
  }
  return found
}

/**
 * The streets a whole route follows, for the save panel: named runs of at
 * least MIN_STREET_M, in order, with a street that runs across a join named
 * once. `missing` counts routed segments with no streets recorded (saved
 * before they were, until routed again); `straight` counts freehand segments,
 * which follow no street.
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
    for (const r of s.streets) {
      const last = runs[runs.length - 1]
      if (last && last.name === r.name) last.metres += r.metres
      else runs.push({ ...r })
    }
  }
  const names: string[] = []
  for (const r of runs) {
    if (r.name && r.metres >= MIN_STREET_M && names[names.length - 1] !== r.name) names.push(r.name)
  }
  return { names, missing, straight }
}
