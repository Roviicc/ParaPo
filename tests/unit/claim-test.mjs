// The claim of an anonymous phone's uploads (src/features/contribute/api): how a finish_claim
// answer is sorted into done, drop or retry, and how the phone keeps its token until it is done.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/claim-test.mjs
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { claimFailureOutcome } from '../../src/features/contribute/api/claim-outcome.ts';
import {
  CLAIM_TOKEN_KEY,
  dropPendingClaim,
  keepPendingClaim,
  readPendingClaim,
} from '../../src/features/contribute/api/claim-token.ts';

const TOKEN = '3f2c1d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const ACCOUNT = 'cccccccc-0000-4000-8000-000000000001';
const P0001 = (message) => ({ code: 'P0001', message });

test('a used token the server no longer has, after an earlier try, is the earlier success', () => {
  assert.deepEqual(claimFailureOutcome(P0001('bad_token'), 400, true), { kind: 'done', moved: 0 });
});

test('a token the server never had is dropped: there is nothing to claim', () => {
  assert.deepEqual(claimFailureOutcome(P0001('bad_token'), 400, false), {
    kind: 'drop',
    reason: 'bad-token',
  });
});

test('an expired token is dropped, tried or not', () => {
  for (const wasTried of [true, false]) {
    assert.deepEqual(claimFailureOutcome(P0001('token_expired'), 400, wasTried), {
      kind: 'drop',
      reason: 'token-expired',
    });
  }
});

test('no answer keeps the token for the next start', () => {
  assert.deepEqual(claimFailureOutcome({ message: 'Failed to fetch' }, 0, true), { kind: 'retry' });
});

test('not signed in, not an account and not anonymous keep the token', () => {
  for (const message of ['not_signed_in', 'not_an_account', 'not_anonymous']) {
    assert.deepEqual(claimFailureOutcome({ code: '42501', message }, 403, false), {
      kind: 'retry',
    });
  }
});

test('an error the page does not know keeps the token', () => {
  assert.deepEqual(claimFailureOutcome({ code: '500', message: 'boom' }, 500, false), {
    kind: 'retry',
  });
});

const stored = new Map();
globalThis.localStorage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, String(value)),
  removeItem: (key) => stored.delete(key),
};

beforeEach(() => stored.clear());

test('a kept claim is read back until it is dropped', () => {
  assert.equal(readPendingClaim(), null);
  keepPendingClaim({ token: TOKEN, wasTried: false, accountId: ACCOUNT });
  assert.deepEqual(readPendingClaim(), { token: TOKEN, wasTried: false, accountId: ACCOUNT });
  dropPendingClaim();
  assert.equal(readPendingClaim(), null);
});

test('stored claims that are not a token and a flag are dropped, not trusted', () => {
  for (const raw of [
    'nope',
    '{}',
    JSON.stringify({ token: TOKEN, wasTried: false }),
    JSON.stringify({ token: 'x', wasTried: false, accountId: ACCOUNT }),
    '"' + TOKEN + '"',
  ]) {
    stored.set(CLAIM_TOKEN_KEY, raw);
    assert.equal(readPendingClaim(), null, raw);
  }
  assert.equal(stored.has(CLAIM_TOKEN_KEY), false);
});
