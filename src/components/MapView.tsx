import { useEffect, useRef } from 'react'
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

/** Fires once the style is loaded, so callers may add sources immediately. */
export function MapView({ onReady }: { onReady?: (map: MapLibreMap) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useEffect(() => {
    if (!containerRef.current) return

    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL,
      center: CENTER,
      zoom: ZOOM,
      attributionControl: false,
    })

    map.addControl(new NavigationControl(), 'top-right')
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
    map.addControl(
      new AttributionControl({ compact: true, customAttribution: ATTRIBUTION }),
      'bottom-right',
    )

    map.on('load', () => onReadyRef.current?.(map))

    return () => {
      map.remove()
    }
  }, [])

  return <div ref={containerRef} className="absolute inset-0" />
}
