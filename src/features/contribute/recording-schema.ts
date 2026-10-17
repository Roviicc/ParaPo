import * as z from 'zod/mini';

import type { GapReason } from '@/features/routes/model/ride-recording';

/** The saved format's version: bump it when the file or the stored rows change shape. */
export const RECORDING_VERSION = 1;

/** What the contributor says they rode; optional, so a recording may have none. */
export const RIDE_KINDS = ['Jeep', 'Bus', 'Train', 'Ferry', 'Tricycle', 'Other'] as const;
export type RideKind = (typeof RIDE_KINDS)[number];

const GAP_REASONS = [
  'hidden',
  'silent',
  'resumed',
  'paused',
] as const satisfies readonly GapReason[];

export const gapSchema = z.object({
  from: z.number(),
  to: z.number(),
  reasons: z.array(z.enum(GAP_REASONS)),
});

/** A recording as IndexedDB keeps it, apart from its fixes. */
export const recordingSchema = z.object({
  version: z.literal(RECORDING_VERSION),
  id: z.string(),
  /** Recording until Stop, stopped until Save (or Cancel), then saved. */
  status: z.enum(['recording', 'stopped', 'saved']),
  startedAt: z.number(),
  stoppedAt: z.nullable(z.number()),
  savedAt: z.nullable(z.number()),
  /** The gaps the page saw happen: hidden, paused, and resumed after a reload. The silent ones come from the fixes. */
  gaps: z.array(gapSchema),
  /** Fixes the phone reported but could not write to IndexedDB; absent when none failed. */
  failedFixWrites: z.optional(z.number()),
  startPointName: z.string(),
  endPointName: z.string(),
  description: z.string(),
  rideKind: z.nullable(z.enum(RIDE_KINDS)),
});
export type Recording = z.infer<typeof recordingSchema>;

/** One fix as IndexedDB keeps it: a record per fix, keyed by the recording and the fix's place in it. */
export const fixRowSchema = z.object({
  recordingId: z.string(),
  seq: z.number(),
  time: z.number(),
  lng: z.number(),
  lat: z.number(),
  accuracyM: z.number(),
});
export type FixRow = z.infer<typeof fixRowSchema>;
