import { useEffect, useRef, useState } from 'react'
import { diagnose, type Diagnosis } from '../lib/diagnose'
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

/** OpenFreeMap: OSM-derived vector tiles, no API key, no usage limits. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

/**
 * The Liberty style ships no `attribution` on its sources, so MapLibre's
 * default control would render empty. The tiles are OSM-derived, so we
 * declare it ourselves.
 */
const ATTRIBUTION = [
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a> contributors',
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>',
  '<a href="http://project-osrm.org/" target="_blank" rel="noreferrer">OSRM</a>',
].join(' · ')

/** Metro Manila. */
const CENTER: [number, number] = [121.0244, 14.5995]
const ZOOM = 11

/** How long to wait before assuming the style is never arriving. */
const LOAD_TIMEOUT_MS = 12_000

/** Fires once the style is loaded, so callers may add sources immediately. */
export function MapView({ onReady }: { onReady?: (map: MapLibreMap) => void }) {
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

    const startId = window.setTimeout(() => {
      if (cancelled || !containerRef.current) return

      try {
        map = new MapLibreMap({
          container: containerRef.current,
          style: STYLE_URL,
          center: CENTER,
          zoom: ZOOM,
          attributionControl: false,
        })
      } catch (err) {
        setError(
          `MapLibre could not start: ${err instanceof Error ? err.message : String(err)}.`,
        )
        void diagnose(STYLE_URL).then(setDiag)
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

      map.addControl(new NavigationControl(), 'top-right')
      map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
      map.addControl(
        new AttributionControl({ compact: true, customAttribution: ATTRIBUTION }),
        'bottom-right',
      )

      map.on('load', () => {
        setLoaded(true)
        setError(null)
        // Dev builds expose the map so scripts/uitest.mjs can read real
        // screen positions from the drawn geometry instead of guessing.
        if (import.meta.env.DEV) (window as unknown as { __map?: MapLibreMap }).__map = map!
        onReadyRef.current?.(map!)
      })

      map.on('error', (e) => {
        const message = e.error?.message ?? 'unknown map error'
        console.error('[map]', message, e)
        setError(message)
        void diagnose(STYLE_URL).then(setDiag)
      })

      timer = window.setTimeout(() => {
        setLoaded((isLoaded) => {
          if (!isLoaded) {
            setError(`The map did not finish loading within ${LOAD_TIMEOUT_MS / 1000}s.`)
            void diagnose(STYLE_URL).then(setDiag)
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
      map?.remove()
    }
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
      <div className="absolute inset-0 bg-neutral-100">
        <div ref={containerRef} className="h-full w-full" />
      </div>

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
            Tile source: <code className="break-all">{STYLE_URL}</code>
          </p>
        </div>
      )}
    </>
  )
}
