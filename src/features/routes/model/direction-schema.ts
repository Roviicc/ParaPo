import * as z from 'zod/mini';

import { lineStringSchema } from './geojson-schema';

/**
 * A direction's rows as they enter the app: from the published index (the
 * reader parses with these, its overview standing in for the line) and from
 * the studio's live reads. The database's names (`route_id`, `head_stop_id`)
 * stay here, at the boundary, until the pass that camelCases them (ticket
 * 07's part 3). The types the app uses derive from these schemas; routes.ts
 * re-exports them beside the functions.
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
 * The parent route as the public map shows it. `name` is not a column: it is
 * generated from the two end hotspots by whoever reads the rows — the studio
 * after loading (live.ts), the publish script before writing the file.
 */
export const routeSummarySchema = z.object({
  id: z.string(),
  /**
   * What is painted on the windshield. Optional since 0006: the generated name
   * took over the job of making a route recognisable, which leaves the
   * signboard as the observed fact it really is — filled in when the owner is
   * sure of it, rather than invented at save time.
   */
  signboard: z.nullable(z.string()),
  long_name: z.nullable(z.string()),
  mode: transportModeSchema,
  fare_note: z.nullable(z.string()),
  /** The two ends, as hotspots. The name is generated from them; see routeName. */
  head_stop_id: z.string(),
  tail_stop_id: z.string(),
  /** Set only when another route shares both ends by a different road. */
  via: z.nullable(z.string()),
  name: z.string(),
  /** The train line, 'LRT-1', for a rail route (0011). Absent from files published before it. */
  route_code: z.optional(z.nullable(z.string())),
});
export type RouteSummary = z.infer<typeof routeSummarySchema>;

/**
 * One direction as the public map needs it: its line and what its card shows.
 * No control points or segments — those exist for editing.
 */
export const directionSchema = z.object({
  id: z.string(),
  route_id: z.string(),
  direction_name: z.nullable(z.string()),
  origin_terminal: z.nullable(z.string()),
  destination_terminal: z.nullable(z.string()),
  /**
   * Null until this direction is drawn. Saving one direction creates the other
   * at once as an empty slot, so the card can always be flipped and the studio
   * has a list of what is still undrawn. 0006.
   */
  shape: z.nullable(lineStringSchema),
  /** false = head to tail, true = the way back. Exactly two per route. */
  reversed: z.boolean(),
  confidence: confidenceSchema,
  route: routeSummarySchema,
  /**
   * The ride's length in metres, measured on its full line: the published
   * index carries it, so a trip's Kilometer and fare never read an overview.
   * Absent from the studio's rows and from map.json's, whose lines are whole.
   */
  metres: z.optional(z.nullable(z.number())),
  /**
   * Its signboards as pictures, in order (0010, the owner's ask of
   * 2026-10-01): file names — in the studio's bucket for the editor, beside
   * the map (/data/signboards/) for the public. Absent when it has none.
   */
  signboards: z.optional(z.readonly(z.array(z.string()))),
});
export type Direction = z.infer<typeof directionSchema>;
