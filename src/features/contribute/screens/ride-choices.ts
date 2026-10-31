import type { RideKind } from '../storage/recording-schema';

/**
 * What the save form's "What did you ride?" offers, in the sheet's order (Figma 4525:15313). Every
 * one is a RideKind; Tricycle is not offered, as Others covers it (the owner's call).
 */
export const RIDE_CHOICES = [
  'Jeep',
  'E-Jeep',
  'UV Express',
  'Bus',
  'Train',
  'Ferry',
  'Other',
] as const satisfies readonly RideKind[];

export type RideChoice = (typeof RIDE_CHOICES)[number];

/** Each kind as the form writes it: Other reads "Others", as the sheet has it. */
export const RIDE_LABEL = {
  Jeep: 'Jeep',
  'E-Jeep': 'E-Jeep',
  'UV Express': 'UV Express',
  Bus: 'Bus',
  Train: 'Train',
  Ferry: 'Ferry',
  Tricycle: 'Tricycle',
  Other: 'Others',
} as const satisfies Record<RideKind, string>;
