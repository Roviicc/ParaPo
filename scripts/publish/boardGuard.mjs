// The publish's guard on signboards (publish-map.mjs), on its own so a unit
// check can hold it (tests/unit/board-guard-test.mjs). Since 2026-10-03,
// review finding 8: the bucket answering 400 or 404 for every board — what
// a bucket made private looks like — read as every board gone, and the
// publish deleted them all from the map with one plain line of log.

/**
 * Why these boards must not be published, or null when they may.
 * `named`: how many boards the directions name; `gone`: how many of those the
 * bucket answered as missing; `before`: the board files published now;
 * `after`: the files this publish would keep; `maxShrink`: the share of rows
 * a collection may lose, as the map's own rule.
 */
export function boardsRefusal({ named, gone, before, after, maxShrink }) {
  if (gone > 0 && gone === named) {
    return (
      `signboards: every one of the ${named} named is gone from the bucket. Is the bucket still public? ` +
      'Not publishing. If the removal is deliberate, run with --force.'
    )
  }
  if (before > 0 && after < before * (1 - maxShrink)) {
    return (
      `signboards: ${before} → ${after} files, more than ${maxShrink * 100}% fewer than published. ` +
      'Not publishing. If the removal is deliberate, run with --force.'
    )
  }
  return null
}
