import {
  directionEndStops,
  directionEnds,
  isDrawn,
  type RouteSummary,
  type VariantSummary,
} from './routes';

/*
 * Choosing among directions: a route's two, those under a tap grouped by
 * where each leaves, the one a tap opens, the other way round, and those
 * sharing an end. Split from routes.ts, 2026-09-29.
 */

/** One route with its directions, for a sheet that lists routes, not directions. */
export interface RouteGroup<V extends VariantSummary> {
  routeId: string;
  route: RouteSummary;
  directions: V[];
}

/** Directions gathered by route, in the order their routes were first met. */
function groupByRoute<V extends VariantSummary>(variants: readonly V[]): RouteGroup<V>[] {
  const groups = new Map<string, RouteGroup<V>>();
  for (const v of variants) {
    const g = groups.get(v.route_id) ?? { routeId: v.route_id, route: v.route, directions: [] };
    g.directions.push(v);
    groups.set(v.route_id, g);
  }
  return [...groups.values()];
}

/** One place in the chooser, and the directions shown leaving it. */
export interface Departures<V extends VariantSummary> {
  from: string;
  directions: { v: V; to: string; drawn: boolean }[];
}

/**
 * The routes under a tap one way round — outbound, or with `back` the way
 * back — gathered by the place each leaves from, in the order met. Tala →
 * SM Fairview and Tala → Novaliches read as Tala, then its two ends; the way
 * back reads SM Fairview, then Tala, and Novaliches, then Tala. The owner's
 * layout of 2026-09-25. A direction still a slot is listed, marked undrawn.
 */
export function departures<V extends VariantSummary>(
  variants: readonly V[],
  back: boolean,
): Departures<V>[] {
  const byPlace = new Map<string, Departures<V>>();
  for (const g of groupByRoute(variants)) {
    const v = g.directions.find((d) => d.reversed === back);
    if (!v) continue;
    const { from, to } = directionEnds(v);
    const key = from.toLowerCase();
    const place = byPlace.get(key) ?? { from, directions: [] };
    place.directions.push({ v, to, drawn: isDrawn(v) });
    byPlace.set(key, place);
  }
  return [...byPlace.values()];
}

/**
 * `departures`, the drawn directions only, and no place left with none: what
 * the owner's route cards list, since he dropped "not mapped yet" from them
 * (2026-09-28) — a row that opens nothing is no row.
 */
export function drawnDepartures<V extends VariantSummary>(
  variants: readonly V[],
  back: boolean,
): Departures<V>[] {
  return departures(variants, back)
    .map((p) => ({ ...p, directions: p.directions.filter((d) => d.drawn) }))
    .filter((p) => p.directions.length > 0);
}

/**
 * The direction a route opens with when it is picked as a whole: the
 * outbound when it has a line, else the return — predictable, and ⇄ is one
 * tap away. Decided with the owner 2026-09-22. Null only for a route with
 * nothing drawn, which no tap can reach.
 */
export function directionToOpen<V extends VariantSummary>(directions: readonly V[]): V | null {
  return (
    directions.find((v) => !v.reversed && isDrawn(v)) ??
    directions.find(isDrawn) ??
    directions[0] ??
    null
  );
}

/**
 * The route's other direction, for the switch on a card: drawn or not, so the
 * card can say "not mapped yet" instead of offering an empty line. Null when
 * the route has only this one.
 */
export function otherDirection<V extends VariantSummary>(all: readonly V[], of: V): V | null {
  return all.find((v) => v.route_id === of.route_id && v.id !== of.id) ?? null;
}

/**
 * Every direction of the routes sharing an end with `of`'s — the same head or
 * the same tail — its own route's included: PLAN.md's fan, an extension being
 * "grouped by the end it shares" (decided 2026-09-21; no screen groups them
 * that way yet but this), Tala – SM Fairview beside Tala – Novaliches. A
 * route that only starts where this one ends is not among them: that is a
 * change of jeep, not another way. An old file's route may carry no ends; it
 * then shares none.
 */
export function sharingAnEnd<V extends VariantSummary>(all: readonly V[], of: V): V[] {
  const { head_stop_id: head, tail_stop_id: tail } = of.route;
  return all.filter(
    (v) =>
      v.route_id === of.route_id ||
      (!!head && v.route.head_stop_id === head) ||
      (!!tail && v.route.tail_stop_id === tail),
  );
}

/**
 * The other routes out of where `of` starts — the owner's "Other routes"
 * under a trip (RouteTripDetail, 3778:3183, 2026-10-01): on Tala →
 * Novaliches, Tala → SM Fairview, and another route making the same trip,
 * if there is one. One direction each, drawn, leaving from the same hotspot
 * as `of` does; its own route's way back is SWITCH, not another route. An
 * old file's route may carry no ends; it then has none.
 */
export function otherRoutesFrom<V extends VariantSummary>(all: readonly V[], of: V): V[] {
  const start = directionEndStops(of).fromStop;
  if (!start) return [];
  return all.filter(
    (v) => v.route_id !== of.route_id && isDrawn(v) && directionEndStops(v).fromStop === start,
  );
}
