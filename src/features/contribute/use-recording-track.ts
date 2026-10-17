import { useMemo, useState } from 'react';

import type { RecordingTrail } from '@/features/routes/map/recording-trail';
import type { Fix } from '@/features/routes/model/ride-recording';

import { courseBearing, trailOf } from './recording-rules';
import type { SwitchRow } from './recording-schema';

export interface RecordingTrack {
  trail: RecordingTrail;
  /** The direction of travel in degrees from north: the last one found, held while standing still. */
  bearing: number | null;
}

const NO_SWITCHES: readonly SwitchRow[] = [];

/** What the map is shown of a recording, from the fixes that count: the trail so far, and which way it is heading. */
export function useRecordingTrack(
  kept: readonly Fix[],
  recorded: readonly SwitchRow[] | undefined,
): RecordingTrack {
  const switches = recorded ?? NO_SWITCHES;
  const trail = useMemo(() => trailOf(kept, switches), [kept, switches]);

  // The rule takes the heading it had and gives it back while the ride stands
  // still, so the heading is state the next fix is measured against.
  const [bearing, setBearing] = useState<number | null>(null);
  const next = kept.length === 0 ? null : courseBearing(kept, bearing);
  if (next !== bearing) setBearing(next);

  return { trail, bearing: next };
}
