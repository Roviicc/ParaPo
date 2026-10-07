import * as z from 'zod/mini';

import { pointSchema, polygonSchema } from './geojson-schema';

/**
 * A hotspot's rows as they enter the app: from the published index (the
 * reader parses with these) and from the studio's live reads. The file and
 * the database say `stop_id` and `created_at`; the app says hotspotId and
 * createdAt (CONTEXT.md; ticket 07 of the restructure follow-ups,
 * 2026-10-07). The raw schemas describe what comes in, the `to…` functions
 * translate, and the schemas the app parses with are the two piped. The
 * types the app uses derive from them; hotspots.ts re-exports them beside
 * the functions.
 */

/** Mirrors the `stop_kind` enum in supabase/migrations/0004_stop_hotspot.sql. */
export const hotspotKindSchema = z.enum(['terminal', 'hintuan']);
export type HotspotKind = z.infer<typeof hotspotKindSchema>;

/** A hotspot as the index carries it (and the `stop` table, less its owner). */
export const rawHotspotSchema = z.object({
  id: z.string(),
  name: z.string(),
  informal: z.nullable(z.string()),
  aliases: z.array(z.string()),
  kind: hotspotKindSchema,
  point: pointSchema,
  area: z.nullable(polygonSchema),
  note: z.nullable(z.string()),
  created_at: z.string(),
  line: z.optional(z.nullable(z.string())),
});
export type RawHotspot = z.infer<typeof rawHotspotSchema>;

/** The app's hotspot from a row: the same facts, the glossary's names. */
export const toHotspot = (raw: RawHotspot) => ({
  id: raw.id,
  /** The ground name: what is written on the ground, "SM Fairview Terminal B". */
  name: raw.name,
  /**
   * The hotspot name: what people say, "SM Fairview". Optional; `hotspotLabel`
   * falls back to the ground name. The route name reads this (R1), and
   * boxes that share it are one hotspot to a commuter, whatever is written on
   * each — a terminal and two hintuans under one hotspot name. 0007; the
   * owner's two words for the two names, 2026-09-26.
   */
  informal: raw.informal,
  /** Other ways people say the same place, for a search or a suggestion list. */
  aliases: raw.aliases,
  kind: raw.kind,
  point: raw.point,
  /** Null only for legacy point-only hotspots (none exist). */
  area: raw.area,
  note: raw.note,
  createdAt: raw.created_at,
  /**
   * The line this hintuan is a station of: a train's, 'LRT-1' (0011), or the
   * ferry's, 'PRFS' (0012); null for every other hintuan and every terminal.
   * Only that line stops here, and no jeep does (servedBy). Absent from files
   * published before.
   */
  ...(raw.line === undefined ? {} : { line: raw.line }),
});

/** A hotspot as the public map shows it. */
export const hotspotSchema = z.pipe(rawHotspotSchema, z.transform(toHotspot));
export type Hotspot = ReturnType<typeof toHotspot>;

/** The `stop` row with what the editor needs: who owns it. */
export const rawHotspotRowSchema = z.extend(rawHotspotSchema, { owner_id: z.string() });
export type RawHotspotRow = z.infer<typeof rawHotspotRowSchema>;
export const toHotspotRow = (raw: RawHotspotRow) => ({ ...toHotspot(raw), ownerId: raw.owner_id });
export const hotspotRowSchema = z.pipe(rawHotspotRowSchema, z.transform(toHotspotRow));
export type HotspotRow = ReturnType<typeof toHotspotRow>;

/** One row of route_stop as the file and the table carry it. */
export const rawHotspotLinkSchema = z.object({
  route_variant_id: z.string(),
  stop_id: z.string(),
  stop_sequence: z.number(),
});
export type RawHotspotLink = z.infer<typeof rawHotspotLinkSchema>;

/** A link: this direction passes through (or stages at) this hotspot, `sequence` where along its line. */
export const toHotspotLink = (raw: RawHotspotLink) => ({
  directionId: raw.route_variant_id,
  hotspotId: raw.stop_id,
  sequence: raw.stop_sequence,
});
export const hotspotLinkSchema = z.pipe(rawHotspotLinkSchema, z.transform(toHotspotLink));
export type HotspotLink = ReturnType<typeof toHotspotLink>;

/** A link as the route_stop table takes it: the way back, for the studio's writes. */
export const toLinkRow = (link: HotspotLink): RawHotspotLink => ({
  route_variant_id: link.directionId,
  stop_id: link.hotspotId,
  stop_sequence: link.sequence,
});
