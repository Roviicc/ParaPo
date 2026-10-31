// The Save Recording form's rules: the fare as typed (fare-text.ts), what "What did you ride?"
// offers (ride-choices.ts), and how a kept recording carries both to the upload (pack-recording.ts).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/save-form-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FARE_ERROR, fareFromText } from '../../src/features/contribute/screens/fare-text.ts';
import { RIDE_CHOICES, RIDE_LABEL } from '../../src/features/contribute/screens/ride-choices.ts';
import { VEHICLE_OF } from '../../src/features/contribute/api/pack-recording.ts';
import {
  RIDE_KINDS,
  storedRecordingSchema,
} from '../../src/features/contribute/storage/recording-schema.ts';

test('an empty fare is no fare, not an error', () => {
  assert.deepEqual(fareFromText(''), {});
  assert.deepEqual(fareFromText('   '), {});
});

test('a fare from ₱0 to ₱2,000 with up to two decimals is read in pesos', () => {
  for (const [text, farePhp] of [
    ['0', 0],
    ['13', 13],
    ['13.5', 13.5],
    ['13.50', 13.5],
    ['.5', 0.5],
    [' 45 ', 45],
    ['2000.00', 2000],
  ]) {
    assert.deepEqual(fareFromText(text), { farePhp }, text);
  }
});

test('a decimal comma is read as a decimal point, as a comma-decimal phone gives it', () => {
  for (const [text, farePhp] of [
    ['13,50', 13.5],
    ['13,5', 13.5],
    ['1,3', 1.3],
    [',5', 0.5],
    ['0,75', 0.75],
  ]) {
    assert.deepEqual(fareFromText(text), { farePhp }, text);
  }
});

test('a comma before three digits is a thousands comma', () => {
  for (const [text, farePhp] of [
    ['1,350', 1350],
    ['1,350.50', 1350.5],
    ['2,000', 2000],
  ]) {
    assert.deepEqual(fareFromText(text), { farePhp }, text);
  }
});

test('a comma that cannot be read without a guess is the error, never a fare', () => {
  for (const text of [
    '1,3,5',
    '13,5000',
    '1,000,50',
    '13,',
    ',',
    '1,35,0',
    '13,50.5',
    '12,345,6',
  ]) {
    assert.deepEqual(fareFromText(text), { error: FARE_ERROR }, text);
  }
  // Over the most, read either way.
  assert.deepEqual(fareFromText('2,500'), { error: FARE_ERROR });
});

test('anything else is the one error, and never a fare', () => {
  for (const text of ['2000.01', '2001', '-1', '13.555', 'abc', '1e3', '12..5', '₱13', '.']) {
    assert.deepEqual(fareFromText(text), { error: FARE_ERROR }, text);
  }
});

test('the sheet offers seven rides, Others last, and no Tricycle', () => {
  assert.deepEqual(
    [...RIDE_CHOICES].map((kind) => RIDE_LABEL[kind]),
    ['Jeep', 'E-Jeep', 'UV Express', 'Bus', 'Train', 'Ferry', 'Others'],
  );
  assert.ok(!RIDE_CHOICES.includes('Tricycle'));
  for (const kind of RIDE_CHOICES) assert.ok(RIDE_KINDS.includes(kind), kind);
});

test('Others uploads as other; a Tricycle kept from before still reads and uploads as tricycle', () => {
  assert.equal(VEHICLE_OF.Other, 'other');
  assert.ok(RIDE_KINDS.includes('Tricycle'));
  assert.equal(VEHICLE_OF.Tricycle, 'tricycle');
  const kept = {
    id: 'r1',
    status: 'saved',
    startedAt: 1,
    stoppedAt: 2,
    savedAt: 3,
    gaps: [],
    startPointName: '',
    endPointName: '',
    description: '',
    rideKind: 'Tricycle',
    version: 2,
    modes: [],
  };
  assert.equal(storedRecordingSchema.safeParse(kept).success, true);
  const withFare = storedRecordingSchema.safeParse({ ...kept, farePhp: 13.5 });
  assert.equal(withFare.success && withFare.data.farePhp, 13.5);
});
