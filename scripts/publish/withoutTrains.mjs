import { isRail } from '../../src/shared/model/routes.ts'

/**
 * The map with its train lines left out: every train direction, every
 * station (a stop with a `line`) and every link to either. The public map's
 * file stays on its old shape (MAP_FILE_SCHEMA 2) until the train release
 * bumps it, and an app installed on that shape knows no stations: it would
 * draw a jeep stopping at one, and a train at every jeep hintuan under its
 * track. The owner's pick of 2026-10-03, after the nightly publish from the
 * old script put the trains out half-made: hide them until they ship whole.
 *
 * `ids` are what was left out, so the shrink guard can hold the last file to
 * the same map.
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
