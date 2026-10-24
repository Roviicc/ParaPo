// The consent gate (src/features/contribute/consent-version.ts): only consent to the current
// text lets a recording be sent, and an agreement to the first text no longer counts.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/consent-version-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONSENT_VERSION,
  agreedVersionOf,
  isCurrentConsent,
  isEarlierRecording,
  shouldAskAboutEarlier,
} from '../../src/features/contribute/consent-version.ts';

test('the current text is version 3', () => {
  assert.equal(CONSENT_VERSION, 3);
});

test('nothing stored is no consent', () => {
  assert.equal(agreedVersionOf(null), null);
  assert.equal(isCurrentConsent(agreedVersionOf(null)), false);
});

test("the first text's 'yes' reads as version 1, which is not consent to the current text", () => {
  assert.equal(agreedVersionOf('yes'), 1);
  assert.equal(isCurrentConsent(agreedVersionOf('yes')), false);
});

test('the current version stored by the page is consent', () => {
  assert.equal(agreedVersionOf(String(CONSENT_VERSION)), CONSENT_VERSION);
  assert.equal(isCurrentConsent(agreedVersionOf(String(CONSENT_VERSION))), true);
});

test('a later text than this page knows is not consent to this one', () => {
  assert.equal(isCurrentConsent(agreedVersionOf('4')), false);
});

test('anything else stored is no consent', () => {
  for (const stored of ['', 'no', '0', '-2', '2.5', '02', ' 2', 'true']) {
    assert.equal(agreedVersionOf(stored), null, JSON.stringify(stored));
  }
});

test('an agreement to the second text is not consent to the current one', () => {
  assert.equal(isCurrentConsent(agreedVersionOf('2')), false);
});

test('a recording is earlier unless it was made under the second text or later', () => {
  assert.equal(isEarlierRecording(undefined), true);
  assert.equal(isEarlierRecording(1), true);
  assert.equal(isEarlierRecording(2), false);
  assert.equal(isEarlierRecording(CONSENT_VERSION), false);
});

test('the earlier-recordings question shows only with consent, no answer yet and something unsent', () => {
  const base = { hasConsent: true, hasAnswered: false, unsentEarlierCount: 2 };
  assert.equal(shouldAskAboutEarlier(base), true);
  assert.equal(shouldAskAboutEarlier({ ...base, hasConsent: false }), false);
  assert.equal(shouldAskAboutEarlier({ ...base, hasAnswered: true }), false);
  assert.equal(shouldAskAboutEarlier({ ...base, unsentEarlierCount: 0 }), false);
});
