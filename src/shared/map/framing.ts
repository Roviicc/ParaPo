import { variantLine, type VariantSummary } from '../model/routes'

/** [[west, south], [east, north]]. */
export type Bounds = [[number, number], [number, number]]

/**
 * How the map frames the routes as it opens: every route in, 100 px clear
 * of the edges, no closer than zoom 13 (useSavedRoutes' fit, since the map
 * first opened on the routes rather than on a fixed centre).
 */
export const ROUTES_FRAMING = { padding: 100, maxZoom: 13 } as const

/**
 * The box round every point of `variants`' lines, as the opening's framing
 * reads them (variantLine: the overviews the map draws first); null with
 * fewer than two points.
 */
export function routesBounds(variants: readonly VariantSummary[]): Bounds | null {
  const coords = variants.flatMap(variantLine)
  if (coords.length < 2) return null
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of coords) {
    if (x < w) w = x
    if (x > e) e = x
    if (y < s) s = y
    if (y > n) n = y
  }
  return [[w, s], [e, n]]
}

/** Whether two boxes are the same box, corner for corner. */
export const sameBounds = (a: Bounds | null, b: Bounds | null): boolean =>
  !!a && !!b && a[0][0] === b[0][0] && a[0][1] === b[0][1] && a[1][0] === b[1][0] && a[1][1] === b[1][1]

/**
 * How long MapView waits for the framing to open on before it makes the map
 * without one (2026-10-04). The framing is in at once when the map file
 * is; otherwise it is a read of the copy kept from an earlier visit, tens
 * of milliseconds, or with none kept the file on its way: a round trip on
 * a second visit, which asks it again (a 304). Past this, the map is made as
 * it always was, at the centre, and the routes are framed as they come: a
 * file held up, a store that never answers. The map's own 12 s timer says
 * what fails after.
 */
export const OPENING_WAIT_MS = 1000

/** What `p` brings, or `none` if it fails or has not come within `ms`. */
export function within<T>(p: Promise<T>, ms: number, none: T): Promise<T> {
  return new Promise((done) => {
    const timer = setTimeout(() => done(none), ms)
    p.then(
      (value) => {
        clearTimeout(timer)
        done(value)
      },
      () => {
        clearTimeout(timer)
        done(none)
      },
    )
  })
}

/**
 * A visitor's gestures: MapLibre's, each carrying the input that made it
 * (originalEvent); the app's own moves carry none (APP_MOVE, or no event
 * data at all). A drag, a zoom, a turn or a tilt, and two that none of
 * those four carry (review of the owner's Q1, 2026-10-05; MapLibre 6.7):
 * - 'movestart', for an arrow key's pan: the keys ease the map with its
 *   zoom, bearing and pitch kept (handler/keyboard.ts), so the one event
 *   that carries the key is 'movestart'. Any 'movestart' with an input is
 *   a visitor's (MapLibre's handlers, the keys, its controls' buttons); a
 *   resize carries none, nor do the app's moves.
 * - 'boxzoomstart', for a shift-drag's box: MapLibre zooms to it with no
 *   input (box_zoom.ts, fitScreenCoordinates), so it is noted as the box
 *   is drawn, and no fit moves the map under it.
 */
const GESTURES = ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart', 'movestart', 'boxzoomstart'] as const

type Listener = (e: { originalEvent?: unknown }) => void
type Watched = { on(type: string, listener: Listener): unknown; off(type: string, listener: Listener): unknown }

/** What a map made with MapView's `openOn` opened framed on, and whether the visitor has moved it since. */
type Opening = { on: Bounds | null; moved: boolean }
const openings = new WeakMap<object, Opening>()

/**
 * The public map's opening (the owner's Q1, 2026-10-04): MapView makes the
 * map framed on the routes, `on` (null when it had none to frame on, and
 * opened as it always did), and calls this as soon as the map is made. From
 * then on the visitor's first drag, zoom, turn or tilt, pan by the arrow
 * keys or box drawn to zoom to (GESTURES) is noted, so the routes' framing
 * never takes the map back from under a finger, a key or a mouse
 * (framesRoutes). The studio's map is never recorded here.
 */
export function openedOn(map: Watched, on: Bounds | null): void {
  const opening: Opening = { on, moved: false }
  openings.set(map, opening)
  const gesture: Listener = (e) => {
    if (!e.originalEvent) return
    opening.moved = true
    for (const type of GESTURES) map.off(type, gesture)
  }
  for (const type of GESTURES) map.on(type, gesture)
}

/**
 * Whether useSavedRoutes frames the routes on `map` now, their lines in at
 * last (`bounds`, routesBounds). The studio's map, as always. The public
 * map's (openedOn) opened framed already, so only if what came frames
 * otherwise — the copy kept from an earlier visit (mapFile.ts,
 * openingVariants) differing from the one the network brought, or none to
 * open on — and never once the visitor has moved it: the camera ends where
 * the framing of what came puts it, or where the visitor took it.
 */
export function framesRoutes(map: object, bounds: Bounds): boolean {
  const opening = openings.get(map)
  if (!opening) return true
  return !opening.moved && !sameBounds(opening.on, bounds)
}
