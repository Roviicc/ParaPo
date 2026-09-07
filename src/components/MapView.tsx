import { useEffect, useRef, useState } from 'react'
import {
  AttributionControl,
  MapLibreMap,
  NavigationControl,
  ScaleControl,
} from 'maplibre-gl'

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

  useEffect(() => {
    if (!containerRef.current) return

    let map: MapLibreMap
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
        `MapLibre could not start: ${err instanceof Error ? err.message : String(err)}. ` +
          'This usually means WebGL is unavailable or disabled.',
      )
      return
    }

    map.addControl(new NavigationControl(), 'top-right')
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
    map.addControl(
      new AttributionControl({ compact: true, customAttribution: ATTRIBUTION }),
      'bottom-right',
    )

    map.on('load', () => {
      setLoaded(true)
      onReadyRef.current?.(map)
    })

    map.on('error', (e) => {
      const message = e.error?.message ?? 'unknown map error'
      console.error('[map]', message, e)
      setError(message)
    })

    const timer = window.setTimeout(() => {
      setLoaded((isLoaded) => {
        if (!isLoaded) {
          setError(
            `The map style did not load within ${LOAD_TIMEOUT_MS / 1000}s. ` +
              'Something is blocking the tile requests — an ad blocker or ' +
              'browser shield is the usual cause.',
          )
        }
        return isLoaded
      })
    }, LOAD_TIMEOUT_MS)

    return () => {
      window.clearTimeout(timer)
      map.remove()
    }
  }, [])

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 bg-neutral-100" />

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
          <p className="mt-2 text-red-700">
            Tile source: <code className="break-all">{STYLE_URL}</code>
          </p>
        </div>
      )}
    </>
  )
}
