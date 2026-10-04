import type { CircleLayerSpecification, MapLibreMap } from 'maplibre-gl'

/**
 * The GL programs a tap would compile, compiled while the map is idle
 * instead (the cheap-phone plan, step 3, 2026-10-04).
 *
 * MapLibre compiles a layer's GL program the first time it draws the layer,
 * and a layer with nothing in view draws nothing. The end circles have
 * nothing until a route is lit, so the first tap that lit one compiled
 * their program, as the card came up: in the harness's baseline every list
 * and trip tap did (5 of 5 runs). A first-use program can hold a cheap
 * phone's main thread for 5-50 ms, and SwiftShader's for a second and more;
 * a program is keyed on which paint properties vary by feature and zoom, so
 * one layer drawn once compiles it for every layer painted alike.
 *
 * So, once: a twin of each such layer — its paint, unseen — over one point
 * at the middle of the view, at the bottom of the stack, drawn once and
 * taken away at the next 'idle'. Only the end circles need one: the
 * basemaps' own fills and lines already compile the programs the chevrons
 * and the babaan sides use, and the lit line's compiles at load (the
 * orange stretches share it since step 2). Its source and layers are its
 * own: never `draw-…`, which the studio's editor owns and the public page
 * must not carry (visitor-test), and never a feature in the ends' source,
 * which the suites count (group-test, the `__src` readers).
 */

/** The twins' source; each twin is `warm-programs-<n>`. */
export const WARM_SOURCE = 'warm-programs'
const twinId = (n: number) => `${WARM_SOURCE}-${n}`

/** A layer to compile a program from: the type and paint of the layer it stands in for. */
export type Twin = Pick<CircleLayerSpecification, 'type' | 'paint'>

type WarmMap = Pick<
  MapLibreMap,
  'getSource' | 'addSource' | 'removeSource' | 'getLayer' | 'addLayer' | 'removeLayer' | 'getLayersOrder' | 'getCenter' | 'once'
>

/**
 * Draws `twins` once and takes them away at the next 'idle'. False when a
 * warm-up is still on the map (its 'idle' to come takes it away): then
 * nothing is added. A basemap switch while the twins are there carries
 * them across like every layer of ours (basemap.ts); they go by their ids
 * all the same.
 */
export function warmPrograms(map: WarmMap, twins: readonly Twin[]): boolean {
  if (map.getSource(WARM_SOURCE)) return false
  map.addSource(WARM_SOURCE, {
    type: 'geojson',
    data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: map.getCenter().toArray() } },
  })
  // At the bottom, over the basemap's background and under everything
  // else: unseen in any case, its colours clear.
  const bottom = map.getLayersOrder()[1]
  twins.forEach((twin, n) => map.addLayer({ ...twin, id: twinId(n), source: WARM_SOURCE }, bottom))
  map.once('idle', () => {
    twins.forEach((_, n) => {
      if (map.getLayer(twinId(n))) map.removeLayer(twinId(n))
    })
    if (map.getSource(WARM_SOURCE)) map.removeSource(WARM_SOURCE)
  })
  return true
}

/** How long a warm-up waits for the browser to have a moment, at most, once the map is idle. */
const IDLE_WAIT_MS = 2000

type Idle = {
  requestIdleCallback?: (run: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
  setTimeout: (run: () => void, ms: number) => unknown
  clearTimeout: (timer: never) => void
}

/**
 * Runs `then` after the map's next 'idle', once the browser has a moment
 * to spare (requestIdleCallback, or a timer where there is none: Safari),
 * so a warm-up never takes the frames that draw the map. Returns the
 * cancel. `then` is not run on a map whose style is gone (a lost GL
 * context, between 'webglcontextlost' and its restoring).
 */
export function afterIdle(
  map: Pick<MapLibreMap, 'once' | 'off' | 'style'>,
  then: () => void,
  browser: Idle = globalThis as unknown as Idle,
): () => void {
  let handle: number | null = null
  let timer: unknown = null
  const run = () => {
    handle = null
    timer = null
    if (map.style) then()
  }
  const onIdle = () => {
    if (typeof browser.requestIdleCallback === 'function') handle = browser.requestIdleCallback(run, { timeout: IDLE_WAIT_MS })
    else timer = browser.setTimeout(run, 0)
  }
  map.once('idle', onIdle)
  return () => {
    map.off('idle', onIdle)
    if (handle !== null) browser.cancelIdleCallback?.(handle)
    if (timer !== null) browser.clearTimeout(timer as never)
  }
}
