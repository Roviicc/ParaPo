// The publish's guard on signboards (publish-map.mjs), on its own so a unit
// check can hold it (tests/unit/board-guard-test.mjs). Since 2026-10-03,
// review finding 8: the bucket answering 400 or 404 for every board — what
// a bucket made private looks like — read as every board gone, and the
// publish deleted them all from the map with one plain line of log.
//
// It counts only boards a direction still names that the bucket says are
// gone. A board the owner took off in the studio is unlisted first
// (signboards.ts), so it is not named and never counts: removing boards on
// purpose publishes as before, however many.

/**
 * Why these boards must not be published, or null when they may.
 * `named`: how many boards the directions name; `gone`: how many of those
 * the bucket answered as missing; `published`: how many of the gone ones
 * the map holds now, and would lose; `maxShrink`: the share the map's own
 * rule lets a collection lose.
 */
export function boardsRefusal({ named, gone, published, maxShrink }) {
  // One board gone is a file deleted by hand: a warning, and the map goes on.
  if (gone < 2 || published === 0) return null
  if (gone === named) {
    return (
      `signboards: every one of the ${named} named is gone from the bucket. Is the bucket still public? ` +
      'Not publishing. If the removal is deliberate, run with --force.'
    )
  }
  if (gone > named * maxShrink) {
    return (
      `signboards: ${gone} of the ${named} named are gone from the bucket, more than ${maxShrink * 100}%. ` +
      'Not publishing. If the removal is deliberate, run with --force.'
    )
  }
  return null
}
