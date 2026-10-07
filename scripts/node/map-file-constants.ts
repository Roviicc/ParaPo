// The map file's address and the early request's name, read from the text of
// src/features/published-map/map-file.ts rather than imported: Vite bundles
// its config before the `@/` alias exists, and map-file.ts reaches the rest
// of the app through `@/`; check-build.mjs runs on plain Node. One regex for
// both readers (vite.config.ts, scripts/checks/check-build.mjs), so the two
// cannot drift, and so a formatter's semicolon cannot break the build
// (ticket 02 of the restructure follow-ups, 2026-10-07): the line may end at
// the closing quote or at a semicolon after it.
//
//   tests/unit/map-file-constants-test.mjs

/** `export const NAME = '…'` with or without a trailing semicolon; the value. */
function constant(source: string, name: string): string | undefined {
  return new RegExp(`^export const ${name} = '([^']+)';?$`, 'm').exec(source)?.[1];
}

/** MAP_FILE_URL and EARLY_MAP_FILE as map-file.ts declares them, or throws naming what is missing. */
export function mapFileConstants(source: string): { MAP_FILE_URL: string; EARLY_MAP_FILE: string } {
  const MAP_FILE_URL = constant(source, 'MAP_FILE_URL');
  const EARLY_MAP_FILE = constant(source, 'EARLY_MAP_FILE');
  if (!MAP_FILE_URL || !EARLY_MAP_FILE) {
    throw new Error(
      'map-file.ts must export MAP_FILE_URL and EARLY_MAP_FILE as single-quoted string constants',
    );
  }
  return { MAP_FILE_URL, EARLY_MAP_FILE };
}
