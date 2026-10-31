import type { MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { MapView } from '@/features/routes/map/map-view';
import { useRecordingTrail } from '@/features/routes/map/use-recording-trail';

import { usePublishedRoutes } from './use-published-routes';
import type { RecordingTrack } from './use-recording-track';
import { retryingImport } from '../common/retrying-import';

// Fetched when a recording's form opens, not with the page.
const loadCapture = retryingImport(() => import('./capture-trail-picture'));

/** What the page draws on the map besides the trail: the shell's locator, which this feature may not import. */
export type ContributeLocatorSlot = (
  map: MapLibreMap,
  isMapLoaded: boolean,
  isRecording: boolean,
  mark: ReactNode,
) => ReactNode;

interface ContributeMapProps {
  track: RecordingTrack;
  /** Whether a recording is on the screen. */
  isRecording: boolean;
  locator?: ContributeLocatorSlot;
  /** The mark button, for the locator's column: null when nothing is recording. */
  mark: ReactNode;
  /** False while a screen shows its own ⓘ for the credits: MapLibre's corner ⓘ steps aside. */
  areCreditsShown: boolean;
  /** The recording whose whole trail to take a picture of, for History's card; null for none. */
  pictureFor: string | null;
  /** The picture taken, a data URL; not called when none could be (no trail, or no tiles). */
  onPicture: (recordingId: string, picture: string) => void;
}

/**
 * The map under every screen: the public map's own view, with the published
 * routes faint on it, the recording's trail over them and the shell's locator
 * (the dot, and the button with the map-style picker) on top.
 */
export function ContributeMap({
  track,
  isRecording,
  locator,
  mark,
  areCreditsShown,
  pictureFor,
  onPicture,
}: ContributeMapProps) {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  usePublishedRoutes(map, isMapLoaded);
  useRecordingTrail(map, track.trail);

  // Once each time a recording's form opens, the trail whole on the map under it: the form covers
  // the map, so framing the trail for the picture moves nothing the rider sees. The ref keeps a
  // second picture from being taken. The form closing (Keep recording, Stop without saving) aborts
  // a capture still under way; one cut short otherwise is tried again.
  const pictureTakenFor = useRef<string | null>(null);
  const { trail } = track;
  useEffect(() => {
    if (pictureFor === null) pictureTakenFor.current = null;
    if (!map || !isMapLoaded || pictureFor === null || pictureTakenFor.current === pictureFor) {
      return;
    }
    pictureTakenFor.current = pictureFor;
    const controller = new AbortController();
    let isDone = false;
    loadCapture()
      .then(({ captureTrailPicture }) => captureTrailPicture(map, trail, controller.signal))
      .then((picture) => {
        isDone = true;
        if (picture && !controller.signal.aborted) onPicture(pictureFor, picture);
      })
      .catch((error: unknown) => {
        isDone = true;
        console.warn("The trail's picture could not be taken; History draws the trail.", error);
      });
    return () => {
      controller.abort();
      if (!isDone) pictureTakenFor.current = null;
    };
  }, [map, isMapLoaded, pictureFor, trail, onPicture]);

  return (
    <>
      <MapView
        onReady={setMap}
        onLoadedChange={setIsMapLoaded}
        zoomButtons={false}
        hasMapStyleButton={false}
        creditsAtBottom
        areCreditsShown={areCreditsShown}
      />
      {map && locator?.(map, isMapLoaded, isRecording, mark)}
    </>
  );
}
