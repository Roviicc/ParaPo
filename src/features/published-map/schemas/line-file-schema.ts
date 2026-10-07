import * as z from 'zod/mini';

import { lineStringSchema } from '@/features/routes/model/geojson-schema';

/**
 * A direction's line file, `/data/lines/<id>.json`: its full line, and since
 * the cheap-phone plan's step 13 (2026-10-05) its orange stretches with the
 * key they were worked out against (line-pass.ts reads those as it will).
 * Shape 2's; shapes 3 and 4 of the index kept it, so every index reads the
 * same files. The publish writes with it (scripts/publish/lineFile.mjs), the
 * reader parses with it.
 */
export const LINE_FILE_SCHEMA = 2;

export const lineFileSchema = z.looseObject({
  schema: z.optional(z.number()),
  id: z.string(),
  /** A shape that is not a line string reads as no line: the map keeps the overview. */
  shape: z.catch(z.nullable(lineStringSchema), null),
  pass: z.optional(z.unknown()),
  passKey: z.optional(z.unknown()),
});
export type LineFile = z.infer<typeof lineFileSchema>;
