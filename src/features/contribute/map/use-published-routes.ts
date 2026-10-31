import type { MapLibreMap } from 'maplibre-gl';
import { useEffect } from 'react';

import { retryingImport } from '../common/retrying-import';

// Not on the page's opening path: fetched once the map has drawn its first view.
const loadPublishedRoutes = retryingImport(() => import('./published-routes'));

/**
 * The published routes on the contributor's map, faint, once the map has loaded and settled.
 * A recording never waits for them: if they cannot be read, the map shows none and says nothing.
 */
export function usePublishedRoutes(map: MapLibreMap | null, isMapLoaded: boolean): void {
  useEffect(() => {
    if (!map || !isMapLoaded) return;
    let isCancelled = false;
    let remove: (() => void) | null = null;

    const draw = () => {
      loadPublishedRoutes()
        .then(({ drawPublishedRoutes }) => (isCancelled ? null : drawPublishedRoutes(map)))
        .then((undraw) => {
          if (!undraw) return;
          if (isCancelled) undraw();
          else remove = undraw;
        })
        .catch((error: unknown) => {
          console.warn('The published routes could not be shown on the map.', error);
        });
    };
    // After the first view is drawn, so the opening frames are the map's alone.
    map.once('idle', draw);

    return () => {
      isCancelled = true;
      map.off('idle', draw);
      remove?.();
    };
  }, [map, isMapLoaded]);
}
