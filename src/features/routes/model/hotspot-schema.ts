import * as z from 'zod/mini';

import { pointSchema, polygonSchema } from './geojson-schema';

/**
 * A hotspot's rows as they enter the app: from the published index (the
 * reader parses with these) and from the studio's live reads. The database's
 * names (`stop_id`, `created_at`) stay here, at the boundary, until the pass
 * that camelCases them (ticket 07's part 3). The types the app uses derive
 * from these schemas; hotspots.ts re-exports them beside the functions.
 */

/** Mirrors the `stop_kind` enum in supabase/migrations/0004_stop_hotspot.sql. */
export const hotspotKindSchema = z.enum(['terminal', 'hintuan']);
export type HotspotKind = z.infer<typeof hotspotKindSchema>;

/** A hotspot as the public map shows it. `area` is null only for legacy point-only hotspots (none exist). */
export const hotspotSchema = z.object({
  id: z.string(),
  /** The ground name: what is written on the ground, "SM Fairview Terminal B". */
  name: z.string(),
  /**
   * The hotspot name: what people say, "SM Fairview". Optional; `hotspotLabel`
   * falls back to the ground name. The route name reads this (R1), and
   * boxes that share it are one hotspot to a commuter, whatever is written on
   * each — a terminal and two hintuans under one hotspot name. 0007; the
   * owner's two words for the two names, 2026-09-26.
   */
  informal: z.nullable(z.string()),
  /** Other ways people say the same place, for a search or a suggestion list. */
  aliases: z.array(z.string()),
  kind: hotspotKindSchema,
  point: pointSchema,
  area: z.nullable(polygonSchema),
  note: z.nullable(z.string()),
  created_at: z.string(),
  /**
   * The line this hintuan is a station of: a train's, 'LRT-1' (0011), or the
   * ferry's, 'PRFS' (0012); null for every other hintuan and every terminal.
   * Only that line stops here, and no jeep does (servedBy). Absent from files
   * published before.
   */
  line: z.optional(z.nullable(z.string())),
});
export type Hotspot = z.infer<typeof hotspotSchema>;

/** One row of route_stop: this direction passes through (or stages at) this hotspot. */
export const hotspotLinkSchema = z.object({
  route_variant_id: z.string(),
  stop_id: z.string(),
  stop_sequence: z.number(),
});
export type HotspotLink = z.infer<typeof hotspotLinkSchema>;
