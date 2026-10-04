import { useEffect, useRef, useState } from 'react'
import { BasemapControl } from './BasemapControl'
import { DEFAULT_BASEMAP, initialStyle, readBasemap, type Basemap } from './basemap'
import { diagnose, type Diagnosis } from './diagnose'
import {
  AttributionControl,
  MapLibreMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

/**
 * MapLibre 6 spawns its tile-parsing worker from a sibling file whose URL it
 * computes at runtime, so no bundler can see it: the production build shipped
 * no worker, the URL 404'd silently, tiles never parsed and the map never
 * fired 'load'. `?worker&url` makes Vite bundle the worker (and the shared
 * chunk it imports) and hand back its real URL, in dev and in production.
 */
setWorkerUrl(maplibreWorkerUrl)

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

/** How long to wait before assuming the style is never arriving. */
const LOAD_TIMEOUT_MS = 12_000

type Props = {
  /** Fires once the style is loaded, so callers may add sources immediately. */
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

export function MapView({ onReady, zoomButtons = true, maxBounds, foldCredits = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  // A blank map with no explanation is the worst possible failure mode, so
  // surface whatever went wrong rather than rendering nothing.
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
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
    let timer = 0

    const startId = window.setTimeout(async () => {
      // A URL for the plain designs; for "Gray, detailed" the style is fetched
      // and extended first, since `Map` has no transform hook of its own.
      const style = await initialStyle(basemap)
      if (cancelled || !containerRef.current) return

      try {
        map = new MapLibreMap({
          container: containerRef.current,
          style,
          center: CENTER,
          zoom: ZOOM,
          maxBounds,
          attributionControl: false,
        })
      } catch (err) {
        setError(
          `MapLibre could not start: ${err instanceof Error ? err.message : String(err)}.`,
        )
        void diagnose(basemap.url).then(setDiag)
        return
      }

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
        // a build that carries the map out.
        if (import.meta.env.DEV || import.meta.env.VITE_EXPOSE_MAP === '1') (window as unknown as { __map?: MapLibreMap }).__map = map!
        setReady(map)
        onReadyRef.current?.(map!)
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

      timer = window.setTimeout(() => {
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
      }, LOAD_TIMEOUT_MS)
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(startId)
      window.clearTimeout(timer)
      setReady(null)
      map?.remove()
    }
    // `basemap` and `zoomButtons` are read once at mount and never change afterwards.
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

      {!loaded && !error && (
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
