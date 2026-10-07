import {
  FERRY_LINES,
  FERRY_MODES,
  LINE_MODES,
  LINES,
} from '../../src/features/routes/model/routes.ts';

/** Shape 3's leave-out: the ferry (0012), which an app reading shape 3 would take for a jeep. */
export const FERRY = { modes: FERRY_MODES, lines: FERRY_LINES };
/** Shapes 1 and 2's: every line, the trains (0011) and the ferry. */
export const EVERY_LINE = { modes: LINE_MODES, lines: LINES };

/**
 * The map with some lines left out: every direction of their modes, every
 * station of theirs (a stop whose `line` is one of them) and every link to
 * either — for the shapes an app installed before them reads
 * (src/features/published-map/map-file.ts). Such an app does not know their mode is a
 * line's: it would draw a jeep stopping at one of their stations, and their
 * route at every jeep hintuan along its track or river. Shape 4 has them
 * all; shape 3 every line but the ferry; shapes 1 and 2 none. The owner's
 * pick of 2026-10-03, after the nightly publish from the old script put the
 * trains out half-made.
 *
 * `ids` are what was left out.
 */
export function withoutLines({ variants, stops, links }, { modes, lines }) {
  const variantIds = new Set(
    variants.filter((v) => modes.includes(v.route?.mode)).map((v) => v.id),
  );
  const stopIds = new Set(stops.filter((s) => s.line && lines.includes(s.line)).map((s) => s.id));
  return {
    variants: variants.filter((v) => !variantIds.has(v.id)),
    stops: stops.filter((s) => !stopIds.has(s.id)),
    links: links.filter((l) => !variantIds.has(l.route_variant_id) && !stopIds.has(l.stop_id)),
    ids: { variants: variantIds, stops: stopIds },
  };
}
