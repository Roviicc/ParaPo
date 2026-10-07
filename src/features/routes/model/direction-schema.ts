import * as z from 'zod/mini';

import { lineStringSchema } from './geojson-schema';

/**
 * A direction's rows as they enter the app: from the published index (the
 * reader parses with these, its overview standing in for the line) and from
 * the studio's live reads. The file and the database say `route_id`,
 * `direction_name` and `head_stop_id`; the app says routeId, name and
 * headHotspotId (CONTEXT.md; ticket 07 of the restructure follow-ups,
 * 2026-10-07). The raw schemas describe what comes in, the `to…` functions
 * translate, and the schemas the app parses with are the two piped. The
 * types the app uses derive from them; routes.ts re-exports them beside the
 * functions.
 */

/** Mirrors the `transport_mode` enum in supabase/migrations/0001_init.sql. */
export const transportModeSchema = z.enum([
  'jeepney',
  'e_jeepney',
  'uv_express',
  'bus',
  'p2p',
  'tricycle',
  'lrt',
  'mrt',
  'ferry',
]);
export type TransportMode = z.infer<typeof transportModeSchema>;

export const confidenceSchema = z.enum(['drawn', 'verified']);
export type Confidence = z.infer<typeof confidenceSchema>;

/**
 * The parent route as the index carries it. `name` is not a column: it is
 * generated from the two end hotspots by whoever reads the rows — the studio
 * after loading (live.ts), the publish script before writing the file.
 */
export const rawRouteSummarySchema = z.object({
  id: z.string(),
  signboard: z.nullable(z.string()),
  long_name: z.nullable(z.string()),
  mode: transportModeSchema,
  fare_note: z.nullable(z.string()),
  head_stop_id: z.string(),
  tail_stop_id: z.string(),
  via: z.nullable(z.string()),
  name: z.string(),
  route_code: z.optional(z.nullable(z.string())),
});
export type RawRouteSummary = z.infer<typeof rawRouteSummarySchema>;

export const toRouteSummary = (raw: RawRouteSummary) => ({
  id: raw.id,
  /**
   * What is painted on the windshield. Optional since 0006: the generated name
   * took over the job of making a route recognisable, which leaves the
   * signboard as the observed fact it really is — filled in when the owner is
   * sure of it, rather than invented at save time.
   */
  signboard: raw.signboard,
  longName: raw.long_name,
  mode: raw.mode,
  fareNote: raw.fare_note,
  /** The two ends, as hotspots. The name is generated from them; see routeName. */
  headHotspotId: raw.head_stop_id,
  tailHotspotId: raw.tail_stop_id,
  /** Set only when another route shares both ends by a different road. */
  via: raw.via,
  name: raw.name,
  /** The train line, 'LRT-1', for a rail route (0011). Absent from files published before it. */
  ...(raw.route_code === undefined ? {} : { routeCode: raw.route_code }),
});
export type RouteSummary = ReturnType<typeof toRouteSummary>;

/**
 * The `route` table's row, every column: what the editor reads (route:route(*)).
 * A nullable column may also be absent: a stand-in for the database (the
 * suites') or a select that names fewer columns reads the same as null.
 */
const absentOrNull = (schema: z.ZodMiniString) => z.optional(z.nullable(schema));
export const rawRouteRowSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  signboard: absentOrNull(z.string()),
  route_code: absentOrNull(z.string()),
  short_name: absentOrNull(z.string()),
  long_name: absentOrNull(z.string()),
  mode: transportModeSchema,
  fare_note: absentOrNull(z.string()),
  fare_as_of: absentOrNull(z.string()),
  head_stop_id: z.string(),
  tail_stop_id: z.string(),
  via: absentOrNull(z.string()),
});
export type RawRouteRow = z.infer<typeof rawRouteRowSchema>;

export const toRouteRow = (raw: RawRouteRow) => ({
  id: raw.id,
  ownerId: raw.owner_id,
  signboard: raw.signboard ?? null,
  routeCode: raw.route_code ?? null,
  shortName: raw.short_name ?? null,
  longName: raw.long_name ?? null,
  mode: raw.mode,
  fareNote: raw.fare_note ?? null,
  fareAsOf: raw.fare_as_of ?? null,
  headHotspotId: raw.head_stop_id,
  tailHotspotId: raw.tail_stop_id,
  via: raw.via ?? null,
});
export type RouteRow = ReturnType<typeof toRouteRow>;

/** One direction as the index carries it, less its overview-for-shape (index-schema.ts does that). */
export const rawDirectionSchema = z.object({
  id: z.string(),
  route_id: z.string(),
  direction_name: z.nullable(z.string()),
  origin_terminal: z.nullable(z.string()),
  destination_terminal: z.nullable(z.string()),
  shape: z.nullable(lineStringSchema),
  reversed: z.boolean(),
  confidence: confidenceSchema,
  route: rawRouteSummarySchema,
  metres: z.optional(z.nullable(z.number())),
  signboards: z.optional(z.readonly(z.array(z.string()))),
});
export type RawDirection = z.infer<typeof rawDirectionSchema>;

/**
 * One direction as the public map needs it: its line and what its card shows.
 * No control points or segments — those exist for editing.
 */
export const toDirection = (raw: RawDirection) => ({
  id: raw.id,
  routeId: raw.route_id,
  /** `SM Fairview → Tala`, generated (directionName); null on a file from before names were generated. */
  name: raw.direction_name,
  originTerminal: raw.origin_terminal,
  destinationTerminal: raw.destination_terminal,
  /**
   * Null until this direction is drawn. Saving one direction creates the other
   * at once as an empty slot, so the card can always be flipped and the studio
   * has a list of what is still undrawn. 0006.
   */
  shape: raw.shape,
  /** false = head to tail, true = the way back. Exactly two per route. */
  reversed: raw.reversed,
  confidence: raw.confidence,
  route: toRouteSummary(raw.route),
  /**
   * The ride's length in metres, measured on its full line: the published
   * index carries it, so a trip's Kilometer and fare never read an overview.
   * Absent from the studio's rows and from map.json's, whose lines are whole.
   */
  ...(raw.metres === undefined ? {} : { metres: raw.metres }),
  /**
   * Its signboards as pictures, in order (0010, the owner's ask of
   * 2026-10-01): file names — in the studio's bucket for the editor, beside
   * the map (/data/signboards/) for the public. Absent when it has none.
   */
  ...(raw.signboards === undefined ? {} : { signboards: raw.signboards }),
});
export const directionSchema = z.pipe(rawDirectionSchema, z.transform(toDirection));
export type Direction = ReturnType<typeof toDirection>;

/** What a line borrowed (Extend, 0008): which part of *this* line came from its parent. */
export const borrowPartSchema = z.enum(['start', 'end']);

/**
 * The `route_variant` row as the editor lists it (live.ts DIRECTION_SELECT):
 * every column but the drawing, its parent route whole. `direction_name` is
 * null until nameDirections fills it in.
 */
export const rawDirectionRowSchema = z.object({
  id: z.string(),
  route_id: z.string(),
  owner_id: z.string(),
  direction_name: z.nullable(z.string()),
  origin_terminal: z.nullable(z.string()),
  destination_terminal: z.nullable(z.string()),
  shape: z.nullable(lineStringSchema),
  reversed: z.boolean(),
  confidence: confidenceSchema,
  updated_at: z.string(),
  borrowed_from: z.optional(z.nullable(z.string())),
  borrowed_part: z.optional(z.nullable(borrowPartSchema)),
  borrowed_m: z.optional(z.nullable(z.number())),
  signboards: z.optional(z.nullable(z.array(z.string()))),
  route: rawRouteRowSchema,
});
export type RawDirectionRow = z.infer<typeof rawDirectionRowSchema>;

/** The editor's direction, before nameDirections: its route without a name. */
export const toUnnamedDirectionRow = (raw: RawDirectionRow) => ({
  id: raw.id,
  routeId: raw.route_id,
  ownerId: raw.owner_id,
  name: raw.direction_name,
  originTerminal: raw.origin_terminal,
  destinationTerminal: raw.destination_terminal,
  shape: raw.shape,
  reversed: raw.reversed,
  confidence: raw.confidence,
  updatedAt: raw.updated_at,
  /**
   * Set when this line was started from part of another direction's (Extend,
   * 0008): which one, which part of *this* line it is ('start' or 'end'), and
   * how many metres of it still run on the other's. The borrowed part is a
   * copy; this only remembers where it came from. Optional so fixtures and
   * rows read before 0008 need not carry it.
   */
  ...(raw.borrowed_from === undefined ? {} : { borrowedFrom: raw.borrowed_from }),
  ...(raw.borrowed_part === undefined ? {} : { borrowedPart: raw.borrowed_part }),
  ...(raw.borrowed_m === undefined ? {} : { borrowedMetres: raw.borrowed_m }),
  ...(raw.signboards == null ? {} : { signboards: raw.signboards }),
  route: toRouteRow(raw.route),
});
export const unnamedDirectionRowSchema = z.pipe(
  rawDirectionRowSchema,
  z.transform(toUnnamedDirectionRow),
);
export type UnnamedDirectionRow = ReturnType<typeof toUnnamedDirectionRow>;
