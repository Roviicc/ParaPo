/** What a finished or failed `finish_claim` means for the token the phone keeps. */
export type ClaimOutcome =
  /** The uploads moved, or had moved already: nothing is left to do. */
  | { kind: 'done'; moved: number }
  /** There is nothing to claim with this token; it is dropped. */
  | { kind: 'drop'; reason: 'token-expired' | 'bad-token' }
  /** The answer did not come or was not usable; the token stays for the next start. */
  | { kind: 'retry' };

export interface ClaimFailure {
  code?: string;
  message: string;
}

/**
 * Sorts a `finish_claim` error. `wasTried` is whether an earlier attempt already reached the
 * server: the server deletes used tokens after a day, so a repeat that finds none (`bad_token`)
 * is that earlier success, not a refusal. Errors with a 42501 code (`not_signed_in`,
 * `not_an_account`, `not_anonymous`) say the phone is not signed in to an account yet, so the
 * token waits.
 */
export function claimFailureOutcome(
  error: ClaimFailure,
  status: number,
  wasTried: boolean,
): ClaimOutcome {
  if (status === 0 || error.code !== 'P0001') return { kind: 'retry' };
  if (error.message.startsWith('token_expired')) return { kind: 'drop', reason: 'token-expired' };
  if (error.message.startsWith('bad_token')) {
    return wasTried ? { kind: 'done', moved: 0 } : { kind: 'drop', reason: 'bad-token' };
  }
  return { kind: 'retry' };
}
