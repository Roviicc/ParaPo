import * as z from 'zod/mini';

import { directionSchema } from '@/features/routes/model/direction-schema';
import { lineStringSchema } from '@/features/routes/model/geojson-schema';
import { hotspotLinkSchema, hotspotSchema } from '@/features/routes/model/hotspot-schema';

/**
 * The published index (shape 4, map-file.ts MAP_FILE_SCHEMA) as one
 * contract: the reader parses the file with it, the publish validates what
 * it writes with it, and the data check reads with it (ticket 08 of the
 * restructure follow-ups, 2026-10-07). The file says `variants`, `stops`
 * and `overview`, the database's words; the app says directions, hotspots
 * and a direction's `shape` (CONTEXT.md), so the schema translates as it
 * parses. Fields the app does not know pass through at the top level and
 * are dropped from a row: adding a field is not a new shape (map-file.ts
 * has the rules).
 */

/** A direction as the index carries it: its overview, the line thinned at 5 m, under its own name. */
const indexDirectionSchema = z.pipe(
  z.extend(z.omit(directionSchema, { shape: true }), {
    overview: z.optional(z.nullable(lineStringSchema)),
  }),
  z.transform(({ overview, ...direction }) => ({ ...direction, shape: overview ?? null })),
);

/** What makes a file a map at all, before its rows are read: the pre-check's shape. */
export const indexOutlineSchema = z.looseObject({
  published_at: z.string(),
  variants: z.array(z.unknown()),
  stops: z.array(z.unknown()),
  links: z.array(z.unknown()),
});

export const indexSchema = z.pipe(
  z.looseObject({
    /** The shape of this file, MAP_FILE_SCHEMA when written. */
    schema: z.optional(z.number()),
    /** When this content was published. The offline notice reads it. */
    published_at: z.string(),
    /** The data's licence, `ODbL-1.0`. Carried in the file so every copy has it. */
    license: z.optional(z.string()),
    /** The credit a reuser has to keep. */
    attribution: z.optional(z.string()),
    variants: z.array(indexDirectionSchema),
    stops: z.array(hotspotSchema),
    links: z.array(hotspotLinkSchema),
  }),
  z.transform(({ variants, stops, ...rest }) => ({
    ...rest,
    directions: variants,
    hotspots: stops,
  })),
);

/** The index as the app holds it: each direction with its overview as `shape` until the full line is read. */
export type Index = z.infer<typeof indexSchema>;
