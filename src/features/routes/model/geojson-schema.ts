import * as z from 'zod/mini';

/**
 * The GeoJSON the rows carry: a point for a hotspot, a polygon for its box, a
 * line string for a direction's line. Each schema validates what enters the
 * app (the published index and its line files, the studio's rows) and is the
 * one definition of the type (ticket 08 of the restructure follow-ups,
 * 2026-10-07). A coordinate is [lng, lat], as shared/utils/geo's LngLat.
 *
 * zod/mini, the tree-shakeable API, throughout the schemas: the classic one
 * weighed 24 kB gzipped on the public page (check-build.mjs's zod ceiling),
 * and these schemas need nothing it adds. Its functions wrap where the
 * classic API chains: z.nullable(x) for x.nullable(), z.pipe(x, z.transform(f))
 * for x.transform(f).
 */
export const lngLatSchema = z.tuple([z.number(), z.number()]);

export const lineStringSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(lngLatSchema),
});
export type LineStringGeoJSON = z.infer<typeof lineStringSchema>;

export const pointSchema = z.object({
  type: z.literal('Point'),
  coordinates: lngLatSchema,
});
export type PointGeoJSON = z.infer<typeof pointSchema>;

export const polygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(lngLatSchema)),
});
export type PolygonGeoJSON = z.infer<typeof polygonSchema>;
