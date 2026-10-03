import { isRail } from '../../src/shared/model/routes.ts'

/**
 * The map with its train lines left out: every train direction, every
 * station (a stop with a `line`) and every link to either — for the shapes
 * an app installed before the train lines reads (`/data/map.json`, shape 1,
 * and `/data/index.json`, shape 2; src/commuter/mapFile.ts). Such an app
 * knows no stations: it would draw a jeep stopping at one, and a train at
 * every jeep hintuan under its track. Shape 3 has them whole. The owner's
 * pick of 2026-10-03, after the nightly publish from the old script put the
 * trains out half-made.
 *
 * `ids` are what was left out.
 */
export function withoutTrains({ variants, stops, links }) {
  const variantIds = new Set(variants.filter((v) => isRail(v.route?.mode)).map((v) => v.id))
  const stopIds = new Set(stops.filter((s) => s.line).map((s) => s.id))
  return {
    variants: variants.filter((v) => !variantIds.has(v.id)),
    stops: stops.filter((s) => !stopIds.has(s.id)),
    links: links.filter((l) => !variantIds.has(l.route_variant_id) && !stopIds.has(l.stop_id)),
    ids: { variants: variantIds, stops: stopIds },
  }
}
