import type { MapLibreMap } from 'maplibre-gl';

import type { RecordingTrail } from '@/features/routes/map/recording-trail';

import { PUBLISHED_LAYERS } from './published-routes-layers';
import { TRAIL_PICTURE, trailFit, type PictureBox } from './trail-picture-frame';

/** How long the tiles for the trail's view may take to arrive before the picture is given up. */
const TILES_MS = 8000;
/** WebP where the browser can write it, a JPEG where it cannot: both small at this quality. */
const QUALITY = 0.7;

/** Settles true once the map is idle (everything for the view drawn), false after `ms` or on abort. */
function whenIdle(map: MapLibreMap, ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const settle = (isIdle: boolean) => {
      window.clearTimeout(timer);
      map.off('idle', handleIdle);
      signal.removeEventListener('abort', handleAbort);
      resolve(isIdle);
    };
    const timer = window.setTimeout(() => settle(false), ms);
    function handleIdle() {
      settle(true);
    }
    function handleAbort() {
      settle(false);
    }
    map.once('idle', handleIdle);
    signal.addEventListener('abort', handleAbort);
  });
}

/**
 * The box cut from the map's canvas, in the same frame it is drawn: the canvas keeps no drawing
 * after it is shown (no preserveDrawingBuffer, which would cost the whole session), so it is read
 * inside the render event that drew it.
 */
function cutInNextRender(
  map: MapLibreMap,
  box: PictureBox,
  isStillFramed: () => boolean,
  signal: AbortSignal,
): Promise<string | null> {
  return new Promise((resolve) => {
    map.once('render', () => {
      // The locator may have eased the camera back to the rider meanwhile, or the form closed:
      // no picture of that.
      if (signal.aborted || !isStillFramed()) {
        resolve(null);
        return;
      }
      const source = map.getCanvas();
      const scale = source.width / source.clientWidth;
      const picture = document.createElement('canvas');
      picture.width = TRAIL_PICTURE.width;
      picture.height = TRAIL_PICTURE.height;
      picture
        .getContext('2d')
        ?.drawImage(
          source,
          box.x * scale,
          box.y * scale,
          box.width * scale,
          box.height * scale,
          0,
          0,
          TRAIL_PICTURE.width,
          TRAIL_PICTURE.height,
        );
      const webp = picture.toDataURL('image/webp', QUALITY);
      resolve(webp.startsWith('data:image/webp') ? webp : picture.toDataURL('image/jpeg', QUALITY));
    });
    map.triggerRepaint();
  });
}

/**
 * A picture of the whole trail on the map, as History's card shows it: the camera framed on every
 * run of it, its tiles waited for, the frame cut and the camera put back where the rider had it.
 * Null when there is no trail, the tiles for it could not be had (no signal), or `signal` aborted
 * it (the form closed): the card then draws the trail itself rather than show a blank map. The
 * camera goes back only if nothing moved it since the framing: once the locator or the rider has
 * moved it, where it was before is out of date.
 */
export async function captureTrailPicture(
  map: MapLibreMap,
  trail: RecordingTrail,
  signal: AbortSignal,
): Promise<string | null> {
  const canvas = map.getCanvas();
  const fit = trailFit(trail, canvas.clientWidth, canvas.clientHeight);
  if (!fit || signal.aborted) return null;
  const camera = {
    center: map.getCenter(),
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
  let hasTileFailed = false;
  const handleError = () => {
    hasTileFailed = true;
  };
  map.on('error', handleError);
  // The picture is the rider's own trail on the basemap: the faint published routes, there or
  // not yet by the time the form opens, are left out of every one alike.
  // Hidden as the capture starts, and again before the cut for routes that arrived meanwhile.
  const hiddenRoutes = new Set<string>();
  const hideRoutes = () => {
    for (const id of PUBLISHED_LAYERS) {
      if (!map.getLayer(id) || map.getLayoutProperty(id, 'visibility') === 'none') continue;
      map.setLayoutProperty(id, 'visibility', 'none');
      hiddenRoutes.add(id);
    }
  };
  hideRoutes();
  map.fitBounds(fit.bounds, {
    padding: fit.padding,
    bearing: 0,
    pitch: 0,
    maxZoom: 17,
    animate: false,
  });
  const framed = { center: map.getCenter(), zoom: map.getZoom() };
  const isStillFramed = () =>
    map.getZoom() === framed.zoom && map.getCenter().distanceTo(framed.center) < 1;
  try {
    const isIdle = await whenIdle(map, TILES_MS, signal);
    if (!isIdle || hasTileFailed || !map.areTilesLoaded() || !isStillFramed()) return null;
    hideRoutes();
    return await cutInNextRender(map, fit.box, isStillFramed, signal);
  } finally {
    map.off('error', handleError);
    for (const id of hiddenRoutes) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
    }
    if (isStillFramed()) map.jumpTo(camera);
  }
}
