import { keepLinePass } from '@/features/routes/geo/line-pass';
import type { LineStringGeoJSON } from '@/features/routes/model/geojson-schema';

import { LINES_URL } from '../map-file';
import { lineFileSchema } from '../schemas/line-file-schema';

const lines = new Map<string, Promise<LineStringGeoJSON | null>>();

/**
 * A direction's full line, read once a page and shared. Null for a
 * direction with no line; a failure is not kept, so the next light tries
 * again — until then the map keeps the overview, which is the same road.
 *
 * The orange stretches the file brings with the line, since the cheap-phone
 * plan's step 13 (2026-10-05), are kept under the line itself (line-pass.ts),
 * and painted only if they were worked out against the index's own hintuans;
 * a file without them is read as before.
 */
export function fetchLine(id: string): Promise<LineStringGeoJSON | null> {
  let line = lines.get(id);
  if (!line) {
    line = fetch(`${LINES_URL}${encodeURIComponent(id)}.json`, { cache: 'no-cache' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${LINES_URL}${id}.json: HTTP ${res.status}`);
        const parsed = lineFileSchema.safeParse(await res.json());
        if (!parsed.success || parsed.data.id !== id) {
          throw new Error(`${LINES_URL}${id}.json is not that direction's line`);
        }
        const file = parsed.data;
        if (!file.shape) return null;
        keepLinePass(file.shape, file);
        return file.shape;
      })
      .catch((e: unknown) => {
        lines.delete(id);
        throw e;
      });
    lines.set(id, line);
  }
  return line;
}
