import * as z from 'zod/mini';

import type { GapReason, Mode } from '@/features/routes/model/ride-recording';

/**
 * The saved format's version: bump it when the file or the stored rows change shape. 2 replaced
 * the Papunta and Pabalik switches with Lakad and Sakay; a recording kept as 1 reads as all Sakay.
 */
export const RECORDING_VERSION = 2;

/**
 * What the contributor says they rode; optional, so a recording may have none. Only ever added
 * to: a recording kept with any of these still reads. The save form offers RIDE_CHOICES
 * (ride-choices.ts), which leaves Tricycle out: it is under Others now, and stays here so a
 * recording kept with it still reads and uploads as a tricycle.
 */
export const RIDE_KINDS = [
  'Jeep',
  'E-Jeep',
  'UV Express',
  'Bus',
  'Train',
  'Ferry',
  'Tricycle',
  'Other',
] as const;
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

const MODES = ['walk', 'ride'] as const satisfies readonly Mode[];

/** The start, or a tap on the mode button: when it was, and the mode the recording was on from then. */
export const modeSchema = z.object({
  time: z.number(),
  to: z.enum(MODES),
});

export type ModeRow = z.infer<typeof modeSchema>;

/** A tap on the mark button: when it was. Where it was is worked out from the fixes. */
export const markSchema = z.object({ time: z.number() });

export type MarkRow = z.infer<typeof markSchema>;

/**
 * What became of a saved recording's upload, as this phone last knew it. Absent
 * until the first upload goes through. `by` is the phone's identity at the time:
 * a removal is only possible from that identity. `removed` keeps the phone's
 * copy and stops it being sent again unless the contributor asks.
 */
export const uploadMarkSchema = z.union([
  z.object({ state: z.literal('uploaded'), at: z.number(), by: z.string() }),
  z.object({
    state: z.literal('removed'),
    at: z.number(),
    /** Set when an editor deleted it in the studio, not the contributor here. */
    byEditor: z.optional(z.boolean()),
  }),
]);
export type UploadMark = z.infer<typeof uploadMarkSchema>;

/** What every version of a stored recording holds. */
const recordingShape = {
  id: z.string(),
  /** Recording until Stop, stopped until Save (or Cancel), then saved. */
  status: z.enum(['recording', 'stopped', 'saved']),
  startedAt: z.number(),
  stoppedAt: z.nullable(z.number()),
  savedAt: z.nullable(z.number()),
  /** The gaps the page saw happen: hidden, paused, and resumed after a reload. The silent ones come from the fixes. */
  gaps: z.array(gapSchema),
  /** Each tap on the mark button, in order; absent on a recording made before marks. */
  marks: z.optional(z.array(markSchema)),
  /** Fixes the phone reported but could not write to IndexedDB; absent when none failed. */
  failedFixWrites: z.optional(z.number()),
  startPointName: z.string(),
  endPointName: z.string(),
  description: z.string(),
  rideKind: z.nullable(z.enum(RIDE_KINDS)),
  /** What the ride cost, in pesos, as the contributor typed it; absent when they said nothing. */
  farePhp: z.optional(z.number()),
  /** The consent text's version agreed to when it began; absent on one made before consent version 2. */
  consentVersion: z.optional(z.number()),
  upload: z.optional(uploadMarkSchema),
};

/** A recording as IndexedDB keeps it, apart from its fixes. */
export const recordingSchema = z.object({
  ...recordingShape,
  version: z.literal(RECORDING_VERSION),
  /**
   * The mode it started on, then each tap on the mode button, in order. Empty on a recording made
   * before modes, which is all ride.
   */
  modes: z.array(modeSchema),
});
export type Recording = z.infer<typeof recordingSchema>;

/**
 * A recording as version 1 kept it, read as all ride. Its Papunta and Pabalik switches and its
 * auto-stop flag are not listed, so they are dropped: both ways were ridden.
 */
const recordingV1Schema = z.pipe(
  z.object({ ...recordingShape, version: z.literal(1) }),
  z.transform((old): Recording => ({ ...old, version: RECORDING_VERSION, modes: [] })),
);

/** A stored recording of any version, read as the current one. */
export const storedRecordingSchema = z.union([recordingSchema, recordingV1Schema]);

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

/** A kept picture of a recording's whole trail, for History's card: a data URL of an image. */
export const thumbnailRowSchema = z.object({
  recordingId: z.string(),
  dataUrl: z.string().check(z.startsWith('data:image/')),
});
