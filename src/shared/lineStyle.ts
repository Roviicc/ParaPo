/**
 * How the route line is drawn: its colours and how wide it is at every zoom.
 *
 * The colours are the owner's, sent 2026-09-23 as hex: the line's blue, and
 * the orange of the stretch where a direction passes a hintuan.
 */
export const LINE_BLUE = '#406AF5'
export const PASS_ORANGE = '#FF9831'

/**
 * How wide the route line is, at every zoom.
 *
 * The line fills the road, the owner's ask of 2026-09-23: its width follows
 * the basemap's own curve for a major road (2 px at zoom 10, 20 px at zoom
 * 20, growing by 1.3 a zoom), at half of it — the owner's "6 px again",
 * judged at zoom 18 where the road is 12 px, after 10/10, 8/10, 6/10 and a
 * day at 5 px — so road shows either side at every zoom. `extra` pads it: the casing shows
 * 1 px either side, the lit direction sits 1 px proud, and the hit area
 * reaches well beyond.
 *
 * Two forms of the one curve: the style expression the layers take, and the
 * number the arrows need for a given zoom, so a chevron stays inside the
 * line it rides.
 */
const ROAD_SHARE = 0.5
const BASE = 1.3
const [Z0, W0, Z1, W1] = [10, 2 * ROAD_SHARE, 20, 20 * ROAD_SHARE]

/** A width along the zoom: [zoom, px] stops, exponential between them and flat outside. */
type Stops = [number, number][]

/** The stops as the style expression the layers take. */
function curve(stops: Stops) {
  return ['interpolate', ['exponential', BASE], ['zoom'], ...stops.flat()] as never
}

/** The stops as a number at `zoom`, the way MapLibre evaluates an exponential interpolation. */
function curveAt(stops: Stops, zoom: number): number {
  if (zoom <= stops[0][0]) return stops[0][1]
  for (let i = 1; i < stops.length; i++) {
    const [[za, wa], [zb, wb]] = [stops[i - 1], stops[i]]
    if (zoom <= zb) return wa + ((BASE ** (zoom - za) - 1) / (BASE ** (zb - za) - 1)) * (wb - wa)
  }
  return stops[stops.length - 1][1]
}

const road = (extra: number): Stops => [
  [Z0, W0 + extra],
  [Z1, W1 + extra],
]

/** The style expression: `extra` pixels wider than the line, at every zoom. */
export function roadWidth(extra: number) {
  return curve(road(extra))
}

/** The same curve as a number. */
export function roadWidthAt(zoom: number, extra: number): number {
  return curveAt(road(extra), zoom)
}

/** How much wider than the rest the lit direction is drawn: 9 px to the line's 6 at zoom 18, the owner's numbers. */
export const LIT_EXTRA = 3

/**
 * Zoomed out, the lit direction is drawn 12/10 as wide: the owner's ask of
 * 2026-09-25, looking at zoom 16, where it read thin under its orange
 * stretches. Full at 16 and below, gone by 18, where the 9 px was judged;
 * between, it eases, so the line never thins as the map zooms in.
 */
const LIT_BOOST = 1.2
const [BOOST_FULL_TO, BOOST_GONE_AT] = [16, 18]

/** The lit line's stops, `extra` pixels wider: a casing keeps its pixel a side, boost or not. */
function lit(extra: number): Stops {
  const at = (z: number, k: number): [number, number] => [z, roadWidthAt(z, LIT_EXTRA) * k + extra]
  return [at(Z0, LIT_BOOST), at(BOOST_FULL_TO, LIT_BOOST), at(BOOST_GONE_AT, 1), at(Z1, 1)]
}

/** The lit direction's width, `extra` pixels wider, as the layers take it: the line, its casing, its orange. */
export function litWidth(extra = 0) {
  return curve(lit(extra))
}

/** The same as a number: what the chevrons are cut to. */
export function litWidthAt(zoom: number, extra = 0): number {
  return curveAt(lit(extra), zoom)
}

/**
 * The circle at each end of a lit direction, as a radius inside its 2 px
 * ring: half the lit line and two pixels more, so the line reads as ending
 * in it at every zoom. Plain for now; the owner decides its look.
 */
export function endRadius() {
  return curve(lit(0).map(([z, w]) => [z, w / 2 + 2]))
}
/** The casing shows one pixel either side of whatever it wraps. */
export const CASING_EXTRA = 2
