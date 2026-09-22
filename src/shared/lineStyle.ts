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

/** The style expression: `extra` pixels wider than the line, at every zoom. */
export function roadWidth(extra: number) {
  return ['interpolate', ['exponential', BASE], ['zoom'], Z0, W0 + extra, Z1, W1 + extra] as never
}

/** The same curve as a number, the way MapLibre evaluates an exponential interpolation. */
export function roadWidthAt(zoom: number, extra: number): number {
  const z = Math.min(Z1, Math.max(Z0, zoom))
  const t = (BASE ** (z - Z0) - 1) / (BASE ** (Z1 - Z0) - 1)
  return W0 + extra + t * (W1 - W0)
}

/** How much wider than the rest the lit direction is drawn: 9 px to the line's 6 at zoom 18, the owner's numbers. */
export const LIT_EXTRA = 3
/** The casing shows one pixel either side of whatever it wraps. */
export const CASING_EXTRA = 2
