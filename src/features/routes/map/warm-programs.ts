import type {
  CircleLayerSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
  MapLibreMap,
} from 'maplibre-gl';

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
 * So, once: a twin of each such layer — its paint, unseen — over a speck
 * of its own at the middle of the view (a point, a short line, a small
 * box, each twin over the one its type draws), at the bottom of the stack,
 * drawn once. The end circles need one, and since 2026-10-05 the five
 * layers that draw only what is lit, which are off from the start
 * (layerSwitch.ts): their twins compile the lit line's program, which the
 * orange stretches share since step 2, and the marked boxes'. The basemaps'
 * own fills and lines already compile the programs the chevrons and the
 * babaan sides use. Its source and layers are its own: never `draw-…`,
 * which the studio's editor owns and the public page must not carry
 * (visitor-test), and never a feature in the ends' source, which the
 * suites count (group-test, the `__src` readers).
 *
 * What it costs (review of step 3, 2026-10-05): the twins' frames are new
 * work on every load, first visit or repeat, the studio's too, whether a
 * tap follows or not; only a visit that taps gets it back, as a tap with
 * no compile. In the cheap-phone timer (CPU 4x, SwiftShader; 3 runs
 * against step 5's, medians) the warm-up was one long task of 235-468 ms
 * after the first idle: total blocking time 600 -> 1,130 ms on a first
 * visit, 290 -> 816 on a repeat one and 670 -> 1,271 on a first visit with
 * the service worker, each range clear of the one before, the longest task
 * 277-296 -> 491-550 ms and the page settled 1.7-1.8 s later; against a
 * list tap's 1,453 -> 170 ms and a trip tap's 718 -> 256. On a phone, one
 * first-use program, 5-50 ms, while the visitor looks at the map. Keeping
 * it is the owner's call (asked 2026-10-05); without it (warmSoon's
 * callers, directionArrows.ts and layerSwitch.ts), the first tap compiles
 * the programs again.
 *
 * Each change to the map's style asks for a frame of the whole map, and a
 * warm-up took four: the twins added, then drawn, then taken away at the
 * next 'idle' (two). On the suites' maps of 5,000 directions at 1,280 x
 * 800 on SwiftShader each is 0.9-1.0 s of main thread (scale-test, timed
 * in the page, 2026-10-05). So the twins are taken away with the map's
 * first move after that idle, in the frames the move draws anyway, as the
 * lit layers' switch once waited for a move (50bafce); a map held still
 * keeps them, unseen, and draws them only where their speck is in view.
 */

/** The twins' source; each twin is `warm-programs-<n>`. */
export const WARM_SOURCE = 'warm-programs';
const twinId = (n: number) => `${WARM_SOURCE}-${n}`;
const isTwin = (id: string) => id.startsWith(`${WARM_SOURCE}-`);

/** A layer to compile a program from: the type and paint of the layer it stands in for. */
export type Twin =
  | Pick<CircleLayerSpecification, 'type' | 'paint'>
  | Pick<LineLayerSpecification, 'type' | 'paint'>
  | Pick<FillLayerSpecification, 'type' | 'paint'>;

/** The speck each type of twin draws over: the one geometry it lays out. */
const SPECK = { circle: 'Point', line: 'LineString', fill: 'Polygon' } as const;

/** How far the speck reaches from the middle of the view, in pixels: enough that no tile simplifies it away. */
const SPECK_PX = 16;

type WarmMap = Pick<
  MapLibreMap,
  | 'getSource'
  | 'addSource'
  | 'removeSource'
  | 'getLayer'
  | 'addLayer'
  | 'removeLayer'
  | 'getLayersOrder'
  | 'getCenter'
  | 'getZoom'
  | 'once'
>;

/**
 * A point at the middle of the view, a line across it and a box round it,
 * SPECK_PX each way at the map's zoom (512 px tiles): geojson-vt drops a
 * line or a ring smaller than its tolerance below the source's top zoom, and
 * a twin with nothing laid out draws nothing.
 */
export function specks(map: Pick<MapLibreMap, 'getCenter' | 'getZoom'>) {
  const [x, y] = map.getCenter().toArray();
  const d = (SPECK_PX * 360) / (512 * 2 ** map.getZoom());
  const feature = (geometry: object) => ({ type: 'Feature' as const, properties: {}, geometry });
  return {
    type: 'FeatureCollection' as const,
    features: [
      feature({ type: 'Point', coordinates: [x, y] }),
      feature({
        type: 'LineString',
        coordinates: [
          [x - d, y],
          [x + d, y],
        ],
      }),
      feature({
        type: 'Polygon',
        coordinates: [
          [
            [x - d, y - d],
            [x + d, y - d],
            [x + d, y + d],
            [x - d, y + d],
            [x - d, y - d],
          ],
        ],
      }),
    ],
  };
}

/** The warm-ups on each map so far: the latest takes the twins away. */
const warmUps = new WeakMap<object, number>();

/**
 * Draws `twins`, and takes every twin away with the map's first move after
 * its next 'idle' (see above). A warm-up still on the map is joined: these
 * go on beside its twins, over its specks, and the move after the idle
 * that follows them takes all of them. False for no twins: nothing is
 * added. A basemap switch while the twins are there carries them across
 * like every layer of ours (basemap.ts); they go by their ids all the same.
 */
export function warmPrograms(map: WarmMap, twins: readonly Twin[]): boolean {
  if (twins.length === 0) return false;
  if (!map.getSource(WARM_SOURCE))
    map.addSource(WARM_SOURCE, { type: 'geojson', data: specks(map) });
  // At the bottom, over the basemap's background and under everything
  // else: unseen in any case, each paint showing nothing of a speck.
  const bottom = map.getLayersOrder()[1];
  let n = 0;
  for (const twin of twins) {
    while (map.getLayer(twinId(n))) n++;
    map.addLayer(
      {
        ...twin,
        id: twinId(n),
        source: WARM_SOURCE,
        filter: ['==', ['geometry-type'], SPECK[twin.type]],
      } as never,
      bottom,
    );
  }
  const warmUp = (warmUps.get(map) ?? 0) + 1;
  warmUps.set(map, warmUp);
  map.once('idle', () =>
    map.once('movestart', () => {
      if (warmUps.get(map) !== warmUp) return;
      for (const id of map.getLayersOrder().filter(isTwin)) map.removeLayer(id);
      if (map.getSource(WARM_SOURCE)) map.removeSource(WARM_SOURCE);
    }),
  );
  return true;
}

/** How long a warm-up waits for the browser to have a moment, at most, once the map is idle. */
const IDLE_WAIT_MS = 2000;

type Idle = {
  requestIdleCallback?: (run: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (timer: never) => void;
};

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
  let handle: number | null = null;
  let timer: unknown = null;
  const run = () => {
    handle = null;
    timer = null;
    if (map.style) then();
  };
  const onIdle = () => {
    if (typeof browser.requestIdleCallback === 'function')
      handle = browser.requestIdleCallback(run, { timeout: IDLE_WAIT_MS });
    else timer = browser.setTimeout(run, 0);
  };
  map.once('idle', onIdle);
  return () => {
    map.off('idle', onIdle);
    if (handle !== null) browser.cancelIdleCallback?.(handle);
    if (timer !== null) browser.clearTimeout(timer as never);
  };
}

/** What a hook wants warmed, asked as the warm-up comes: its twins then, or none. */
export type Provider = () => readonly Twin[];

/** Each map's warm-up to come: the providers asked so far, and its cancel. */
const batches = new WeakMap<object, { providers: Set<Provider>; cancel: () => void }>();

/**
 * Asks for `provider`'s twins at the map's next warm-up, after its next
 * 'idle' and the browser's next spare moment (afterIdle). Every hook that
 * asks before that idle comes is in the same warm-up, its twins drawn in
 * the same frames, each of them a frame of the whole map; one that asks
 * later is the next warm-up's. The provider is asked as the warm-up comes,
 * and its twins are warmPrograms'. Returns the cancel: the last provider
 * cancelled cancels the warm-up.
 */
export function warmSoon(
  map: WarmMap & Pick<MapLibreMap, 'off' | 'style'>,
  provider: Provider,
  browser: Idle = globalThis as unknown as Idle,
): () => void {
  let batch = batches.get(map);
  if (!batch) {
    const providers = new Set<Provider>();
    // Closed at the idle, before the browser's moment it waits for.
    const close = () => {
      if (batches.get(map)?.providers === providers) batches.delete(map);
    };
    map.once('idle', close);
    const later = afterIdle(
      map,
      () => {
        const twins = [...providers].flatMap((p) => p());
        if (twins.length > 0) warmPrograms(map, twins);
      },
      browser,
    );
    batch = {
      providers,
      cancel: () => {
        map.off('idle', close);
        close();
        later();
      },
    };
    batches.set(map, batch);
  }
  const { providers, cancel } = batch;
  providers.add(provider);
  return () => {
    if (providers.delete(provider) && providers.size === 0) cancel();
  };
}
