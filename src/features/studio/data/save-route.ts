import type { HotspotRow } from '@/features/routes/model/hotspots';
import { nameDirections, type DirectionRow } from '@/features/routes/model/routes';

import { syncHintuanLinks } from './hotspots-write';
import { saveVariant, type SaveInput } from './routes-write';

/**
 * A direction saved, then every hintuan's route list brought up to date
 * against its line: a hintuan's list is a fact about geometry, so a changed
 * line re-checks itself against all of them (terminal links are the owner's
 * and are left alone). Two steps, not one transaction (PLAN.md's known risk
 * #3): `onWritten` hears of the row the moment it is in, so a retry after a
 * failed link sync updates that row instead of inserting the route again
 * (review finding 13). Split from SavePanel.tsx, 2026-09-29.
 */
export async function saveRouteAndLinks(
  input: SaveInput,
  hotspots: HotspotRow[],
  onWritten: (written: { routeId: string; variantId: string }) => void,
): Promise<DirectionRow> {
  const saved = await saveVariant(input);
  onWritten({ routeId: saved.route_id, variantId: saved.id });
  const named = nameDirections([saved], hotspots)[0];
  try {
    await syncHintuanLinks(named);
  } catch (err) {
    throw new Error(
      `The line is saved, but its hintuan links are not: ${err instanceof Error ? err.message : String(err)}. ` +
        'Press Save again to retry.',
    );
  }
  return named;
}
