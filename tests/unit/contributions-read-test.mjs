// The studio's Contributors map, apart from the browser: an upload's trail
// decoded as the phone packed it (src/features/contribute/api/pack-recording.ts),
// and the map drawing exactly the uploads the list holds.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/contributions-read-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { packRecording } from '../../src/features/contribute/api/pack-recording.ts';
import { decodeTrail } from '../../src/features/studio/data/contributions-read.ts';
import { uploadsData } from '../../src/features/studio/contributors/contribution-layers.ts';

import { T0, rideFixes, rideRecording } from './fixtures/contribution-ride.mjs';

test('the studio decodes the trail the phone packed, point for point', () => {
  const fixes = rideFixes(1300);
  const { payload } = packRecording(rideRecording('x', fixes), fixes, 1, T0);
  const trail = decodeTrail([...payload.batches].reverse());
  assert.equal(trail.length, payload.point_count);
  assert.deepEqual(trail[0], { time: T0, at: [121.05, 14.7] });
  for (let i = 1; i < trail.length; i += 1) assert.ok(trail[i].time > trail[i - 1].time);
  const last = trail.at(-1);
  const fix = fixes.filter((f) => f.time === last.time)[0];
  assert.ok(Math.abs(last.at[1] - fix.at[1]) < 1e-6, 'the last point is where the phone was');
});

const upload = (id, over = {}) => ({
  id,
  phoneCode: 'abcdef',
  contributorName: null,
  startedAt: T0,
  endedAt: T0 + 60_000,
  receivedAt: T0 + 90_000,
  vehicle: null,
  startName: '',
  endName: '',
  description: '',
  distanceM: 0,
  movingSeconds: 0,
  standingSeconds: 0,
  lostSeconds: 0,
  pointCount: 0,
  line: null,
  box: null,
  hiddenAt: null,
  hiddenNote: '',
  ...over,
});

test('the map holds one feature per upload that has a place: its line, or a dot at its box', () => {
  const data = uploadsData([
    upload('a', {
      line: [
        [121, 14.6],
        [121.01, 14.61],
      ],
      box: [121, 14.6, 121.01, 14.61],
    }),
    upload('b', { box: [121, 14.6, 121.02, 14.62] }),
    upload('c'),
  ]);
  assert.deepEqual(
    data.features.map((f) => [f.properties.id, f.geometry.type]),
    [
      ['a', 'LineString'],
      ['b', 'Point'],
    ],
  );
  const [lng, lat] = data.features[1].geometry.coordinates;
  assert.ok(Math.abs(lng - 121.01) < 1e-9 && Math.abs(lat - 14.61) < 1e-9, 'the box centre');
});
