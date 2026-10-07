import { variantLine, type VariantSummary } from '../model/routes';

/** [[west, south], [east, north]]. */
export type Bounds = [[number, number], [number, number]];

/**
 * How the map frames the routes as it opens: every route in, 100 px clear
 * of the edges, no closer than zoom 13 (useSavedRoutes' fit, since the map
 * first opened on the routes rather than on a fixed centre).
 */
export const ROUTES_FRAMING = { padding: 100, maxZoom: 13 } as const;

/**
 * The box round every point of `variants`' lines, as the opening's framing
 * reads them (variantLine: the overviews the map draws first); null with
 * fewer than two points.
 */
export function routesBounds(variants: readonly VariantSummary[]): Bounds | null {
  const coords = variants.flatMap(variantLine);
  if (coords.length < 2) return null;
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of coords) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [
    [w, s],
    [e, n],
  ];
}

/** Whether two boxes are the same box, corner for corner. */
export const sameBounds = (a: Bounds | null, b: Bounds | null): boolean =>
  !!a &&
  !!b &&
  a[0][0] === b[0][0] &&
  a[0][1] === b[0][1] &&
  a[1][0] === b[1][0] &&
  a[1][1] === b[1][1];

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
export const OPENING_WAIT_MS = 1000;

/** What `p` brings, or `none` if it fails or has not come within `ms`. */
export function within<T>(p: Promise<T>, ms: number, none: T): Promise<T> {
  return new Promise((done) => {
    const timer = setTimeout(() => done(none), ms);
    p.then(
      (value) => {
        clearTimeout(timer);
        done(value);
      },
      () => {
        clearTimeout(timer);
        done(none);
      },
    );
  });
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
const GESTURES = [
  'dragstart',
  'zoomstart',
  'rotatestart',
  'pitchstart',
  'movestart',
  'boxzoomstart',
] as const;

type Listener = (e: { originalEvent?: unknown }) => void;
interface Watched {
  on(type: string, listener: Listener): unknown;
  off(type: string, listener: Listener): unknown;
}

/** What a map made with MapView's `openOn` opened framed on, and whether the visitor has moved it since. */
interface Opening {
  on: Bounds | null;
  moved: boolean;
}
const openings = new WeakMap<object, Opening>();

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
  const opening: Opening = { on, moved: false };
  openings.set(map, opening);
  const gesture: Listener = (e) => {
    if (!e.originalEvent) return;
    opening.moved = true;
    for (const type of GESTURES) map.off(type, gesture);
  };
  for (const type of GESTURES) map.on(type, gesture);
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
  const opening = openings.get(map);
  if (!opening) return true;
  return !opening.moved && !sameBounds(opening.on, bounds);
}

interface Styled {
  once(type: string, listener: () => void): unknown;
}

/**
 * MapView's "did not finish loading" clock (LOAD_TIMEOUT_MS): `timedOut`
 * runs `ms` after the map is made, unless the function returned stops it
 * first. It was made for a style that never comes, and it waits for the
 * map's 'load', which MapLibre fires only once every source on the map is
 * in.
 *
 * The public map's (`fromStyle`, the owner's Q1) starts again as its style
 * comes in, if it has not run by then (review of Q1, 2026-10-05). Since Q1
 * its routes go onto the map at the style's load, so its 'load' waits for
 * them too, and for the view framed on them (zoom 9 on a phone, ~397 kB of
 * basemap) rather than the zoom-11 one it waited for and threw away (~189
 * kB): 1.4 s later in the cheap-phone timer's first visit (8.16 -> 9.52 s),
 * and on a map of thousands of directions later by the time MapLibre's
 * worker takes to cut them. The 12 s could then run out over a map already
 * drawn, its routes on it, with "The map failed to load". Now the style
 * still has 12 s from the map's making, and what comes after it 12 s of its
 * own. A basemap whose tiles never come is said so later than before, by
 * the time its style took. The studio's map (no `fromStyle`; its routes go
 * on at 'load') keeps the one clock from its making.
 */
export function loadClock(
  map: Styled,
  fromStyle: boolean,
  ms: number,
  timedOut: () => void,
): () => void {
  let ran = false;
  const run = () => {
    ran = true;
    timedOut();
  };
  let timer = setTimeout(run, ms);
  if (fromStyle)
    map.once('style.load', () => {
      if (ran) return;
      clearTimeout(timer);
      timer = setTimeout(run, ms);
    });
  return () => clearTimeout(timer);
}

interface Rendered {
  on(type: string, listener: () => void): unknown;
  off(type: string, listener: () => void): unknown;
}

/**
 * When MapView's "Loading map…" goes: `lift` runs once, and the function
 * returned stops it from running at all (the map gone).
 *
 * The studio's map (no `drawn`): at its 'load', as always.
 *
 * The public map's (`drawn`, savedRoutesLayers.ts's routesDrawn; the
 * owner's answer to question A of the cheap-phone report, 2026-10-06): at
 * the first frame it renders with the routes drawn, or at its 'load' if
 * that comes first, never later. Since Q1 its routes go on as its style
 * comes in, well before its 'load', which waits for every basemap tile in
 * view as well: in the cheap-phone timer's first visit the routes were
 * drawn at 5.36 s and 'load' came at 9.83 s, the text over routes a
 * visitor could already tap. A map file that is empty, has failed or is
 * still on its way draws no route, and the text goes at 'load' as before.
 * Only the text: the clock (loadClock), the failure banner (shown for an
 * 'error' before 'load', cleared at it) and the design button still go by
 * 'load' (MapView.tsx). Once gone it never comes back: a style made afresh
 * later (a basemap switch, a lost GL context given back) is not the map's
 * opening. `drawn` is asked inside MapLibre's frame, before it fires
 * 'load' and asks for the next: should it throw, the frame counts as one
 * without the routes, and the text waits for 'load' as before.
 */
export function loadingLifts<M extends Rendered>(
  map: M,
  drawn: ((map: M) => boolean) | null,
  lift: () => void,
): () => void {
  const hotspot = () => {
    map.off('render', look);
    map.off('load', go);
  };
  const go = () => {
    hotspot();
    lift();
  };
  const look = () => {
    let yes = false;
    try {
      yes = !!drawn?.(map);
    } catch {
      // A frame without the routes, then: 'load' still lifts it.
    }
    if (yes) go();
  };
  map.on('load', go);
  if (drawn) map.on('render', look);
  return hotspot;
}
