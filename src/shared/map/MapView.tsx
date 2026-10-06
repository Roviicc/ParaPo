import { useEffect, useRef, useState } from 'react'
import { BasemapControl } from './BasemapControl'
import { DEFAULT_BASEMAP, initialStyle, readBasemap, type Basemap } from './basemap'
import { diagnose, type Diagnosis } from './diagnose'
import { OPENING_WAIT_MS, ROUTES_FRAMING, loadClock, loadingLifts, openedOn, within, type Bounds } from './framing'
import { routesDrawn } from './savedRoutesLayers'
import { noteTile } from './tilesAsked'
import {
  AttributionControl,
  MapLibreMap,
  NavigationControl,
  ScaleControl,
  prewarm,
  setWorkerUrl,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

/**
 * MapLibre 6 spawns its tile-parsing worker from a sibling file whose URL it
 * computes at runtime, so no bundler can see it: the production build shipped
 * no worker, the URL 404'd silently, tiles never parsed and the map never
 * fired 'load'. `?worker&url` makes Vite bundle the worker (and the shared
 * chunk it imports) and hand back its real URL. It still does in dev. In a
 * build, vite.config.ts's maplibreWorkerWithThePage answers this import with
 * a worker built with the page, which imports the page's own copy of
 * MapLibre's shared code rather than carrying one (the cheap-phone plan,
 * step 14, 2026-10-05).
 */
setWorkerUrl(maplibreWorkerUrl)

/**
 * The worker is started as this module is read, not when the map is made
 * (the cheap-phone plan, step 6, 2026-10-04). It parses every tile, so the
 * map's 'load' waits for its script: 133 kB on the wire when this was
 * written. Since step 14 (2026-10-05) a build's worker is 6 kB on the wire,
 * and the two chunks it imports, MapLibre's shared code and Vite's preload
 * helper, are the page's own, which the browser already holds: no request
 * for them reaches the server, but the worker still has to run them. Made by
 * the map, it was asked for only after React's first render and commit, the
 * effect, its timer and the style's lookup (a fetch of its own for "Gray,
 * detailed"). prewarm() starts the same one worker (up to three on Safari:
 * MapLibre's WorkerPool) from the address set just above, which it reads as
 * it starts, so it must come after setWorkerUrl; the map takes it when it is
 * made. It lives as long as the page, as it always did once a map had been
 * made: MapLibre's global dispatcher holds it. On the studio's sign-in, and
 * on an auth result passed on from / (commuter/main.tsx), it starts for
 * nothing.
 */
prewarm()

/**
 * OpenFreeMap: OSM-derived vector tiles, no API key, no usage limits. Exported
 * for the offline cache warm-up (commuter/pwa.ts).
 *
 * Positron, not Liberty: a desaturated basemap, so the route lines and hotspot
 * polygons we paint on top carry all the colour on the screen. It serves the
 * same `/planet` tiles, sprite and fonts as Liberty from half the layers, so
 * the switch costs no cached tile and draws a little cheaper. A viewer can
 * pick another design from the control at the top right (shared/basemap.ts);
 * this is the one the map starts with when nothing has been chosen.
 */
export const STYLE_URL = DEFAULT_BASEMAP.url

/**
 * Passed as the event data of a camera move the app makes on the visitor's
 * behalf — to a hintuan picked, an end tapped, a trip's whole route as it
 * opens — so whatever is steering the camera can tell it from a gesture and
 * from its own moves. "Where am I" lets go on it: it once undid those moves with the next
 * fix (the review's 3c).
 */
export const APP_MOVE = { appMove: true } as const

/**
 * The OpenFreeMap styles ship no `attribution` on their sources, so MapLibre's
 * default control would render empty. The tiles are OSM-derived, so we
 * declare it ourselves.
 */
const ATTRIBUTION = [
  // Our own data, under the ODbL: the credit every copy has to keep.
  '<a href="https://github.com/Roviicc/ParaPo#data-and-licence" target="_blank" rel="noreferrer">Route data © ParaPo contributors, ODbL</a>',
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a> contributors',
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>',
  '<a href="http://project-osrm.org/" target="_blank" rel="noreferrer">OSRM</a>',
].join(' · ')

/**
 * A coarse pointer means a finger: pinch already zooms, so the zoom buttons
 * are dead weight sitting on top of the map. And the bottom sheet a phone gets
 * would cover a bottom-right attribution, which the OpenStreetMap licence
 * requires to stay visible -- so on touch the attribution moves to the top.
 */
export const coarse =
  typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches

/** Metro Manila. */
const CENTER: [number, number] = [121.0244, 14.5995]
const ZOOM = 11

/**
 * How long to wait before assuming the style is never arriving: from the
 * map's making, and on the public map from its style's coming too, for its
 * tiles and our routes (framing.ts, loadClock; review of the owner's Q1,
 * 2026-10-05).
 */
const LOAD_TIMEOUT_MS = 12_000

type Props = {
  /**
   * Fires once the map can take sources and layers: at its 'load', or with
   * `openOn` as soon as its style is in.
   */
  onReady?: (map: MapLibreMap) => void
  /**
   * MapLibre's +, − and compass, top right, for a mouse (never a finger:
   * `coarse`). The studio keeps them; the public map has none since the
   * owner's "annoying for users" of 2026-09-29 — the wheel, a double click
   * and the keys zoom it. Read once, as the map is made.
   */
  zoomButtons?: boolean
  /**
   * How far the map may be panned, [[west, south], [east, north]]. The public
   * map is held to Greater Manila (METRO_MANILA) so a stray pan never fetches
   * tiles of the world; the studio is not, for a route that runs out of it.
   * Read once, as the map is made.
   */
  maxBounds?: [[number, number], [number, number]]
  /**
   * The credits start folded to their ⓘ. MapLibre opens them until the first
   * drag, and on a phone the studio's open credits covered its account pill
   * and the top of the map; ⓘ still opens them, as the licence asks. Read
   * once, as the map is made.
   */
  foldCredits?: boolean
  /**
   * The public map's (the owner's Q1, 2026-10-04): the routes' framing to
   * open on, from the map file in by then, the copy kept from an earlier
   * visit, or the file on its way (mapFile.ts, openingVariants), null for
   * none. It is asked for as the map is about to be made, waited for a
   * second at most (OPENING_WAIT_MS), and the map is made framed on it — as
   * the routes' own fit (useSavedRoutes) left it, padding 100, zoom 13 at
   * most — so its first tiles are those of the view it keeps, not of a fixed
   * centre at zoom 11 a fit then threw away. And `onReady` fires as soon as
   * the style is in, so the routes are drawn while the basemap's tiles
   * still come, and "Loading map…" goes with the first frame that draws
   * them, or at the map's 'load' if that comes first (loadingLifts, the
   * owner's answer to question A of the cheap-phone report, 2026-10-06).
   * Without it (the studio), the map opens at the centre, `onReady` waits
   * for 'load', and so does "Loading map…", as always. Read once, as the
   * map is made.
   */
  openOn?: () => Promise<Bounds | null>
}

/**
 * Metro Manila with its jeepney hinterland — Bulacan's south, Rizal's
 * slopes, Cavite and Laguna's north — and room to spare: 0.9° by 0.95°, so
 * the opening view at zoom 11 fits inside it on a screen 2,000 px wide.
 */
export const METRO_MANILA: [[number, number], [number, number]] = [
  [120.6, 14.1],
  [121.5, 15.05],
]

export function MapView({ onReady, zoomButtons = true, maxBounds, foldCredits = false, openOn }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  // A blank map with no explanation is the worst possible failure mode, so
  // surface whatever went wrong rather than rendering nothing.
  const [error, setError] = useState<string | null>(null)
  // The map's 'load', which "Loading map…" waited for until 2026-10-06: the
  // 12 s clock below reads it, through its setter.
  const [, setLoaded] = useState(false)
  // "Loading map…" gone (loadingLifts): at 'load', or on the public map at
  // its first frame with the routes drawn if that comes first.
  const [lifted, setLifted] = useState(false)
  const [diag, setDiag] = useState<Diagnosis | null>(null)
  const [trace, setTrace] = useState<string[]>([])
  const [dom, setDom] = useState<string | null>(null)
  const eventsRef = useRef<string[]>([])
  // The design chosen on this device, read once; the map is built with it so
  // a remembered choice never flashes gray first.
  const [basemap] = useState<Basemap>(readBasemap)
  const [ready, setReady] = useState<MapLibreMap | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // React StrictMode mounts, unmounts and remounts effects in development.
    // Constructing a MapLibre map and immediately calling remove() on it tears
    // down workers the next instance depends on, and the second map then never
    // fires 'load' — a white page with no error at all.
    //
    // Deferring construction by a tick means StrictMode's throwaway cleanup
    // cancels before any map exists, so only the surviving mount builds one.
    let cancelled = false
    let map: MapLibreMap | null = null
    let stopClock = () => {}
    let stopLift = () => {}

    const startId = window.setTimeout(async () => {
      // A URL for the plain designs; for "Gray, detailed" the style is fetched
      // and extended first, since `Map` has no transform hook of its own.
      // Beside it, the public map's framing (`openOn`): none if it fails or
      // has not come within OPENING_WAIT_MS.
      const [style, framing] = await Promise.all([
        initialStyle(basemap),
        openOn ? within(openOn(), OPENING_WAIT_MS, null) : null,
      ])
      if (cancelled || !containerRef.current) return

      try {
        map = new MapLibreMap({
          container: containerRef.current,
          style,
          center: CENTER,
          zoom: ZOOM,
          maxBounds,
          attributionControl: false,
          // No check of the whole style against the spec before it is used:
          // 82-91 ms of main thread at 4x CPU on every load, before the first
          // tile is asked for (profiled 2026-10-04, the cheap-phone plan,
          // step 1). The basemaps are OpenFreeMap's own and ours is built in
          // code, so it found nothing. A basemap switch skips it too: setStyle
          // takes this as its default (MapLibre 6.7, map.ts). A style that
          // fails still says so, by 'error' or the 12 s timeout below, each
          // with `diagnose`.
          validateStyle: false,
          // Framed on the routes from its making, the public map's (the
          // owner's Q1, 2026-10-04): MapLibre fits these bounds as the map is
          // made, with no animation, on the same size and limits a fit made
          // later would meet, so the camera is the one the routes' own fit
          // put it at after 'load' (useSavedRoutes; visitor-test and
          // phone-test hold it to cameraForBounds of the map file's routes).
          ...(framing ? { bounds: framing, fitBoundsOptions: ROUTES_FRAMING } : {}),
          // The public map notes the tiles it asks for, changing none, so the
          // service worker can keep a first visit's (tilesAsked.ts). The
          // studio has no worker and notes nothing.
          ...(openOn ? { transformRequest: noteTile } : {}),
        })
      } catch (err) {
        setError(
          `MapLibre could not start: ${err instanceof Error ? err.message : String(err)}.`,
        )
        void diagnose(basemap.url).then(setDiag)
        return
      }

      // The map from its making, for the builds that hand it out (see 'load'
      // below): the cheap-phone timer stamps its 'load' and its first frame
      // with the routes drawn from here, before any of its events can fire
      // (the cheap-phone plan, Step 0, 2026-10-04). So do the suites, for
      // the camera it was made at and the first lines it draws, before its
      // 'load' on the public map (the owner's Q1, 2026-10-04).
      if (import.meta.env.DEV || import.meta.env.VITE_EXPOSE_MAP === '1') (window as unknown as { __mapEarly?: MapLibreMap }).__mapEarly = map

      // The public map (the owner's Q1, 2026-10-04): what it opened framed
      // on, and the visitor's gestures from now on, for the routes' own fit
      // to leave a map they have moved alone (framing.ts). And the map is
      // handed over as soon as its style is in, for the routes to go on it
      // then, not after every basemap tile in view has come and been read
      // ('load'): the first 'style.load' only, the one of this style, never
      // a basemap switch's. Registered here, before anything can load.
      if (openOn) {
        openedOn(map, framing)
        const made = map
        made.once('style.load', () => onReadyRef.current?.(made))
      }

      // "Loading map…" goes at the map's 'load'; on the public map at the
      // first frame that draws its routes, if that comes first (the owner's
      // answer to question A of the cheap-phone report, 2026-10-06): since
      // Q1 they are drawn seconds before 'load', which waits for every
      // basemap tile in view too. Only the text: the design button, the
      // clock and the failure banner still go by 'load' (below).
      stopLift = loadingLifts(map, openOn ? routesDrawn : null, () => setLifted(true))

      // Record how far MapLibre gets, so a silent failure at least says
      // which stage it died in.
      const t0 = performance.now()
      const LIFECYCLE = [
        'styledataloading', 'styledata', 'sourcedataloading', 'sourcedata',
        'dataloading', 'data', 'render', 'idle', 'load', 'error',
        'webglcontextlost',
      ] as const
      for (const evt of LIFECYCLE) {
        map.on(evt, () => {
          const stamp = `${evt}@${Math.round(performance.now() - t0)}ms`
          if (!eventsRef.current.some((e) => e.startsWith(evt + '@'))) {
            eventsRef.current.push(stamp)
          }
        })
      }

      if (zoomButtons && !coarse) map.addControl(new NavigationControl(), 'top-right')
      map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
      map.addControl(
        new AttributionControl({ compact: true, customAttribution: ATTRIBUTION }),
        coarse ? 'top-right' : 'bottom-right',
      )
      // What MapLibre itself does to them on the first drag.
      if (foldCredits) map.getContainer().querySelector('.maplibregl-compact')?.classList.remove('maplibregl-compact-show')

      let isLoaded = false
      map.on('load', () => {
        isLoaded = true
        setLoaded(true)
        setError(null)
        // Dev builds expose the map so the headless suites (tests/e2e/) can read real
        // screen positions from the drawn geometry instead of guessing. So does
        // the production build scripts/research/phone-speed.mjs makes for itself
        // with VITE_EXPOSE_MAP=1, to time a cheap phone on the code visitors get
        // (2026-10-04); `npm run build` never sets it, and check-build.mjs fails
        // a build that carries the map out. With it, the GL programs compiled
        // so far by MapLibre's own key: painter.cache is MapLibre's inside, so
        // it is read here and nowhere else, for the timer and the suites to
        // see what a tap compiles (the cheap-phone plan, Step 0, 2026-10-04).
        if (import.meta.env.DEV || import.meta.env.VITE_EXPOSE_MAP === '1') {
          const shown = map!
          const w = window as unknown as { __map?: MapLibreMap; __programs?: () => string[] }
          w.__map = shown
          w.__programs = () => Object.keys((shown as unknown as { painter: { cache: object } }).painter.cache)
        }
        setReady(map)
        // The public map's was handed over at its style's load (above).
        if (!openOn) onReadyRef.current?.(map!)
      })

      map.on('error', (e) => {
        const message = e.error?.message ?? 'unknown map error'
        // Once the map is up, an error is a tile, glyph or sprite that did not
        // arrive — offline, a place never viewed before. The map is drawn and
        // working; that is not "failed to load", so only the console hears it.
        if (isLoaded) {
          console.warn('[map]', message)
          return
        }
        console.error('[map]', message, e)
        setError(message)
        void diagnose(basemap.url).then(setDiag)
      })

      // From the map's making; on the public map (`openOn`) again from its
      // style's load, when its routes go on, if it has not run by then.
      stopClock = loadClock(map, !!openOn, LOAD_TIMEOUT_MS, () => {
        setLoaded((isLoaded) => {
          if (!isLoaded) {
            setError(`The map did not finish loading within ${LOAD_TIMEOUT_MS / 1000}s.`)
            void diagnose(basemap.url).then(setDiag)
            setTrace([...eventsRef.current])
            const el = containerRef.current
            const canvas = el?.querySelector('canvas')
            setDom(
              el
                ? `container ${el.clientWidth}×${el.clientHeight}px, ` +
                  (canvas
                    ? `canvas ${canvas.width}×${canvas.height} (css ${canvas.clientWidth}×${canvas.clientHeight})`
                    : 'NO canvas element')
                : 'container missing',
            )
          }
          return isLoaded
        })
      })
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(startId)
      stopClock()
      stopLift()
      setReady(null)
      map?.remove()
    }
    // `basemap`, `zoomButtons` and `openOn` are read once at mount and never change afterwards.
  }, [])

  return (
    <>
      {/*
        MapLibre adds `maplibregl-map` to its container, and its stylesheet
        sets `position: relative` on that class. Tailwind v4 emits utilities
        inside a cascade layer, and unlayered CSS beats layered CSS regardless
        of import order -- so `absolute inset-0` on the container itself
        silently lost: the div became a relative block with height 0, and the
        300px default canvas was clipped by MapLibre's own `overflow: hidden`.
        A white page, no errors, `load` firing normally.

        So: size the WRAPPER, and hand MapLibre a plain child to restyle.
      */}
      <div className="absolute inset-0 bg-surface-secondary">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {ready && !error && (
        <BasemapControl
          map={ready}
          initial={basemap}
          under={coarse ? 'attribution' : zoomButtons ? 'zoom' : 'nothing'}
        />
      )}

      {!lifted && !error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p className="text-sm text-neutral-500">Loading map…</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-x-0 top-0 z-30 m-4 rounded-lg bg-red-50 p-4
                        text-sm text-red-900 shadow ring-1 ring-red-200">
          <p className="font-medium">The map failed to load.</p>
          <p className="mt-1 break-words">{error}</p>
          {diag && (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-red-800">
              <dt className="font-medium">WebGL</dt>
              <dd>{diag.webgl}</dd>
              <dt className="font-medium">Renderer</dt>
              <dd className="break-words">{diag.renderer ?? "(hidden)"}</dd>
              <dt className="font-medium">Style fetch</dt>
              <dd className="break-words">{diag.styleFetch}</dd>
              <dt className="font-medium">DOM</dt>
              <dd className="break-words">{dom ?? '—'}</dd>
              <dt className="font-medium">Events</dt>
              <dd className="break-words">{trace.length ? trace.join(' → ') : '(none fired)'}</dd>
            </dl>
          )}
          <p className="mt-2 text-red-700">
            Tile source: <code className="break-all">{basemap.url}</code>
          </p>
        </div>
      )}
    </>
  )
}
