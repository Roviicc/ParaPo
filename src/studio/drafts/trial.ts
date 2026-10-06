import type { HintuanDraftsFile } from './drafts'
import file from './hintuanDrafts.trial.json'

/**
 * The drafts the studio offers: Caloocan's, made 2026-10-06 by
 * scripts/drafts/hintuan-drafts.mjs. Apart from drafts.ts so the unit checks
 * read the plain parts without a JSON import. Through `unknown`, as
 * TypeScript reads a JSON [lng, lat] as number[]; the file's shape is held by
 * tests/unit/hintuan-drafts-test.mjs instead.
 */
export const DRAFTS = file as unknown as HintuanDraftsFile
