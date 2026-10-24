import type { Contribution, ContributionDetail } from '../data/contributions-read';

const T0 = Date.UTC(2026, 9, 19, 0, 0, 0);

/** Uploads as the Contributors map reads them, for the stories. */
export const STORY_CONTRIBUTIONS: Contribution[] = [
  {
    id: '11111111-0000-4000-8000-000000000001',
    contributorId: 'a697d4aa-0000-4000-8000-000000000001',
    phoneCode: 'a697d4',
    contributorName: 'Maria Santos',
    startedAt: T0,
    endedAt: T0 + 1_800_000,
    receivedAt: T0 + 1_860_000,
    vehicle: 'jeep',
    startName: 'SM Fairview',
    endName: 'Cubao',
    description: 'Morning jeep, full at Commonwealth',
    distanceM: 14_200,
    movingSeconds: 1_500,
    standingSeconds: 240,
    lostSeconds: 60,
    pointCount: 1_780,
    line: [
      [121.06, 14.73],
      [121.07, 14.68],
      [121.05, 14.62],
    ],
    box: [121.05, 14.62, 121.07, 14.73],
    hiddenAt: null,
    hiddenNote: '',
  },
  {
    id: '11111111-0000-4000-8000-000000000002',
    contributorId: 'd542b6aa-0000-4000-8000-000000000002',
    phoneCode: 'd542b6',
    contributorName: null,
    startedAt: T0 - 86_400_000,
    endedAt: T0 - 86_400_000 + 600_000,
    receivedAt: T0 - 86_400_000 + 700_000,
    vehicle: null,
    startName: '',
    endName: '',
    description: '',
    distanceM: 900,
    movingSeconds: 420,
    standingSeconds: 0,
    lostSeconds: 180,
    pointCount: 420,
    line: null,
    box: [121.0, 14.6, 121.01, 14.61],
    hiddenAt: T0 - 3_600_000,
    hiddenNote: 'Walked, not a ride',
  },
];

export const STORY_DETAIL: ContributionDetail = {
  trail: [
    { time: T0, at: [121.06, 14.73] },
    { time: T0 + 1_800_000, at: [121.05, 14.62] },
  ],
  hintos: [{ seq: 0, startedAt: T0 + 600_000, seconds: 240, at: [121.07, 14.68] }],
  marks: [],
};

/** The same ride with two Mark presses, 8:14 and 8:31 in Manila. */
export const STORY_DETAIL_MARKED: ContributionDetail = {
  ...STORY_DETAIL,
  marks: [Date.UTC(2026, 9, 19, 0, 14), Date.UTC(2026, 9, 19, 0, 31)],
};
