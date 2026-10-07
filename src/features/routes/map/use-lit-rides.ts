import type { MapLibreMap } from 'maplibre-gl';
import { useMemo } from 'react';

import type { LngLat } from '@/shared/utils/geo';

import { useDirectionArrows, type Ride } from './direction-arrows';
import { useBabaanSides } from '../geo/babaan-sides';
import { usePassStretches } from '../geo/pass-stretches';
import type { Hotspot } from '../model/hotspots';
import { travelLine } from '../model/ride';
import { directionEndHotspots, directionEnds, type Direction } from '../model/routes';

/**
 * What a lit route wears on the map, in both apps: its orange stretches
 * where it passes a hintuan, its chevrons and end circles, and the chosen
 * direction's side of each hintuan it cuts across. Returns the rides, for
 * the names over their ends (EndTitles). Split from CommuterApp and
 * StudioApp, which each had it word for word (2026-10-01).
 */
export function useLitRides(
  map: MapLibreMap | null,
  saved: {
    directions: readonly Direction[];
    /** The directions whose full line has been read. */
    fullIds: ReadonlySet<string>;
    lit: readonly string[];
    litDirections: readonly Direction[];
    selected: Direction | null;
  },
  hotspots: readonly Hotspot[],
  /** The direction being redrawn in the studio: no stretches over the draft. */
  hiddenDirectionId: string | null = null,
  /** A hintuan picked on the trip (useRideTo's `ridden`): that ride's chevrons stop there. */
  ridden: { directionId: string; line: LngLat[] } | null = null,
): Ride[] {
  // Where a lit direction passes a hintuan, the line turns orange for that
  // stretch: worked out on the full lines read — a lit direction's is asked
  // for as it lights, and its orange comes with it — rather than on every
  // overview at load. Offline, a line never read has none.
  const withLines = useMemo(
    () => saved.directions.filter((v) => saved.fullIds.has(v.id)),
    [saved.directions, saved.fullIds],
  );
  usePassStretches(map, withLines, hotspots, saved.lit, hiddenDirectionId);

  // Which way the jeep goes, on what is lit only — the chosen direction, the
  // Selected card's directions, or else a list's or a hotspot card's: chevrons
  // flowing inside each line from where the ride starts, and each end a
  // circle with its place's name and, where the route says, its hotspot.
  const rides = useMemo(
    () =>
      saved.litDirections.map((v) => ({
        id: v.id,
        line: travelLine(v, hotspots),
        ...(ridden?.directionId === v.id ? { flow: ridden.line } : {}),
        ...directionEnds(v),
        ...directionEndHotspots(v),
      })),
    [saved.litDirections, hotspots, ridden],
  );
  useDirectionArrows(map, rides);
  // The chosen direction's side of each hintuan it cuts across: its right.
  useBabaanSides(map, saved.selected, hotspots);
  return rides;
}
