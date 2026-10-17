import type { MapLibreMap } from 'maplibre-gl';
import { useState } from 'react';

import { MapView } from '@/features/routes/map/map-view';
import { RecordingFollowControls } from '@/features/routes/map/recording-follow-controls';
import type { FollowMode } from '@/features/routes/map/use-recording-follow';
import { useRecordingFollow } from '@/features/routes/map/use-recording-follow';
import { useRecordingTrail } from '@/features/routes/map/use-recording-trail';

import type { Follow } from './use-follow';
import type { RecordingTrack } from './use-recording-track';

interface ContributeMapProps {
  track: RecordingTrack;
  follow: Follow;
  /** Whether a recording is on the screen, which is when the follow controls show. */
  hasRecording: boolean;
}

const NEXT_MODE = { 'course-up': 'north-up', 'north-up': 'course-up' } satisfies Record<
  FollowMode,
  FollowMode
>;

/**
 * The map under every screen: the public map's own view and map-style button,
 * with the recording's trail drawn on it and the camera following the recording.
 */
export function ContributeMap({ track, follow, hasRecording }: ContributeMapProps) {
  const [map, setMap] = useState<MapLibreMap | null>(null);

  useRecordingTrail(map, track.trail);
  useRecordingFollow(map, {
    here: track.trail.here,
    bearing: track.bearing,
    mode: follow.mode,
    isFollowing: follow.isFollowing,
    onLetGo: follow.letGo,
  });

  return (
    <>
      <MapView
        onReady={setMap}
        zoomButtons={false}
        foldCredits
        buttonStyle="icon-button"
        creditsAtBottom
      />
      {map && hasRecording && (
        <RecordingFollowControls
          map={map}
          mode={follow.mode}
          isFollowing={follow.isFollowing}
          onModeToggle={() => follow.setMode(NEXT_MODE[follow.mode])}
          onRecentre={follow.recentre}
        />
      )}
    </>
  );
}
