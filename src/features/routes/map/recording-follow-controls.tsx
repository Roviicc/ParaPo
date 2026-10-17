import type { MapLibreMap } from 'maplibre-gl';
import { createPortal } from 'react-dom';

import { IconButton } from '@/design-system/primitives/icon-button';

import { CORNER_MARGIN, useTopRightControl } from './basemap-control';
import type { FollowMode } from './use-recording-follow';

interface RecordingFollowControlsProps {
  map: MapLibreMap;
  mode: FollowMode;
  /** False once the contributor has moved the map by hand. */
  isFollowing: boolean;
  onModeToggle: () => void;
  onRecentre: () => void;
}

/**
 * Under the map-style button, top right: course-up or north-up, and while the
 * camera is let go, a button that brings it back to the contributor.
 */
export function RecordingFollowControls({
  map,
  mode,
  isFollowing,
  onModeToggle,
  onRecentre,
}: RecordingFollowControlsProps) {
  const corner = useTopRightControl(map, CORNER_MARGIN['icon-button']);
  const isCourseUp = mode === 'course-up';
  return createPortal(
    <div className="flex flex-col items-end gap-2">
      <IconButton
        size="small"
        tooltip="left"
        label={isCourseUp ? 'Keep north at the top' : 'Turn the map with your direction'}
        icon={isCourseUp ? <CourseUpIcon /> : <NorthUpIcon />}
        onClick={onModeToggle}
      />
      {!isFollowing && (
        <IconButton
          size="small"
          tooltip="left"
          label="Follow me again"
          icon={<RecentreIcon />}
          onClick={onRecentre}
        />
      )}
    </div>,
    corner,
  );
}

/** An arrow pointing up the screen: the map turns so the way you go is up. */
function CourseUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 3.5 18.5 20 12 16.6 5.5 20 12 3.5Z" />
    </svg>
  );
}

/** North's arrow over an N: the map keeps north at the top. */
function NorthUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="m12 3 3.4 6H8.6L12 3Z" />
      <path
        d="M8.5 20v-7.5l7 7.5v-7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A target: bring the camera back to where you are. */
function RecentreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path
        d="M12 3v3M12 18v3M3 12h3M18 12h3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
