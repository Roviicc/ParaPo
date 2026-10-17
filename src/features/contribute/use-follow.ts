import { useCallback, useState } from 'react';

import type { FollowMode } from '@/features/routes/map/use-recording-follow';

export interface Follow {
  mode: FollowMode;
  /** False once the contributor has moved the map by hand, until they recentre. */
  isFollowing: boolean;
  setMode: (mode: FollowMode) => void;
  /** The contributor moved the map by hand. */
  letGo: () => void;
  /** Back to following the ride. */
  recentre: () => void;
}

/** How the camera follows the ride: turning with it or north-up, and whether a hand has let it go. */
export function useFollow(): Follow {
  const [mode, setMode] = useState<FollowMode>('course-up');
  const [isFollowing, setIsFollowing] = useState(true);
  const letGo = useCallback(() => setIsFollowing(false), []);
  const recentre = useCallback(() => setIsFollowing(true), []);
  return { mode, isFollowing, setMode, letGo, recentre };
}
