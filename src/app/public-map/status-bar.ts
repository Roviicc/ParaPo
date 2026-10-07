import { useEffect } from 'react';
import type { MapLibreMap } from 'maplibre-gl';
import { firstLayerOfType } from '@/features/routes/map/layers';

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
    if (!map) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    const brand = meta.content;
    const background = backgroundColour(map, (colour) => {
      meta.content = colour;
    });
    background.paint();
    map.on('style.load', background.find);
    map.on('styledata', background.paint);
    return () => {
      map.off('style.load', background.find);
      map.off('styledata', background.paint);
      meta.content = brand;
    };
  }, [map]);
}

/**
 * The basemap's background colour, handed to `set` on every 'styledata'
 * (a style changed: a basemap switch, and every paint change a tap makes).
 * The background layer is looked for once per style, at 'style.load', and
 * each 'styledata' reads only its colour. It used to copy the whole style
 * (getStyle) to look for it every time: 0.5-4.5 ms at 4x CPU a load, and
 * 0.4-4.3 ms a tap that opens a trip, which paints the lit line in the
 * trip's colour (the cheap-phone plan, step 5, 2026-10-04).
 * A style MapLibre builds afresh says 'styledata' before 'style.load', and
 * getPaintProperty throws on a layer that is gone, so the id is checked
 * first, one lookup, and looked for again when it names no background.
 */
export function backgroundColour(
  map: Pick<MapLibreMap, 'getLayersOrder' | 'getLayer' | 'getPaintProperty'>,
  set: (colour: string) => void,
) {
  let id: string | undefined;
  const find = () => {
    id = firstLayerOfType(map, 'background');
  };
  const paint = () => {
    if (id === undefined || map.getLayer(id)?.type !== 'background') find();
    const colour = id && map.getPaintProperty(id, 'background-color');
    if (typeof colour === 'string') set(colour);
  };
  return { find, paint };
}
