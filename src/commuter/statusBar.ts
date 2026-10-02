import { useEffect } from 'react'
import type { MapLibreMap } from 'maplibre-gl'

/**
 * The phone's status bar in the map's own colour (the owner's ask,
 * 2026-10-02: "make the map visible behind the status bar"). Android lets a
 * web page colour that bar but never draw behind it, so it takes the
 * basemap's background — Gray, Colour or Dark, whichever is up — and reads
 * as part of the map. On an iPhone opened from the Home Screen the page
 * runs behind it instead (index.html, black-translucent). The manifest keeps
 * the brand maroon for the installed app's splash.
 */
export function useStatusBarColour(map: MapLibreMap | null): void {
  useEffect(() => {
    if (!map) return
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) return
    const brand = meta.content
    const paint = () => {
      const bg = map.getStyle()?.layers?.find((l) => l.type === 'background')
      const colour = bg && map.getPaintProperty(bg.id, 'background-color')
      if (typeof colour === 'string') meta.content = colour
    }
    paint()
    map.on('styledata', paint)
    return () => {
      map.off('styledata', paint)
      meta.content = brand
    }
  }, [map])
}
