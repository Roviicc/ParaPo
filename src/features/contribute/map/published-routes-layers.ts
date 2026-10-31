import { RAIL_AT_REST } from '@/features/routes/map/rail-rest-layers';

/*
 * The faint published routes' source and layer ids (published-routes.ts), apart so what only
 * needs their names (the History picture, capture-trail-picture.ts) does not fetch the reader.
 */

export const PUBLISHED_SRC = 'published-routes';
export const PUBLISHED_CASING = 'published-routes-casing';
export const PUBLISHED_LINE = 'published-routes-line';

/** Each train line's resting layer, under an id of this source's own. */
export const PUBLISHED_RAIL = Object.values(RAIL_AT_REST).map(({ id, colour }) => ({
  id: `published-${id}`,
  railId: id,
  colour,
}));

/** Every layer the routes are drawn with, bottom to top. */
export const PUBLISHED_LAYERS = [
  PUBLISHED_CASING,
  PUBLISHED_LINE,
  ...PUBLISHED_RAIL.map(({ id }) => id),
];
