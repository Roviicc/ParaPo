import type { MapLibreMap } from 'maplibre-gl';
import { useEffect } from 'react';

import { addRecordingTrail, setRecordingTrail, type RecordingTrail } from './recording-trail';

/**
 * A contributor's recording drawn on `map` as it is made: blue for papunta and
 * orange for pabalik, a dot at each switch, and the contributor's own dot.
 */
export function useRecordingTrail(map: MapLibreMap | null, trail: RecordingTrail): void {
  useEffect(() => {
    if (map) addRecordingTrail(map);
  }, [map]);

  useEffect(() => {
    if (map) setRecordingTrail(map, trail);
  }, [map, trail]);
}
