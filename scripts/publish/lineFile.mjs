// A direction's line file as the publish writes it (publish-map.mjs), on its
// own so a unit check can hold the very text (tests/unit/pass-stretches-test.mjs)
// without running the publish, which reads the live tables.
//
// Since 2026-10-05 (the cheap-phone plan, step 13) the file carries the
// direction's orange stretches beside its line, worked out by the app's own
// rule (src/features/routes/geo/line-pass.ts), with their key: the hintuans they were
// worked out against. The app takes them only when the index it has gives
// the same key, and works them out itself otherwise. An app from before
// ignores both fields, which is not a new shape (src/features/published-map/map-file.ts has
// the rules). The file's shape is the app's own schema
// (src/features/published-map/schemas/line-file-schema.ts, since 2026-10-07):
// each file is read back with it before it is written.
import {
  LINE_FILE_SCHEMA,
  lineFileSchema,
} from '../../src/features/published-map/schemas/line-file-schema.ts';
import { linePass } from '../../src/features/routes/geo/line-pass.ts';

/** Shape 2's, which shapes 3 and 4 kept: every index reads the same files. */
export { LINE_FILE_SCHEMA };

/**
 * The text of `v`'s line file: its id, its line as published, and its
 * stretches past `boxes` — passBoxes of the index the app reads (shape 4's,
 * every line in), so the key is the one the app works out. No date in it: a
 * file changes only when its line does, or a hintuan near it (its stretches
 * and their key). Key order is the file's contract; keep it fixed.
 */
export function lineFileText(v, boxes) {
  const { pass, passKey } = linePass(v, boxes);
  const file = { schema: LINE_FILE_SCHEMA, id: v.id, shape: v.shape, pass, passKey };
  const read = lineFileSchema.safeParse(file);
  if (!read.success) {
    throw new Error(`${v.id}: not a line file the app reads: ${read.error.issues[0]?.message}`);
  }
  return JSON.stringify(file) + '\n';
}
