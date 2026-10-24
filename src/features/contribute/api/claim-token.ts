import * as z from 'zod/mini';

/** Its own key, apart from the session's: signing in replaces the session, never this. */
export const CLAIM_TOKEN_KEY = 'parapo.contributor-claim';

const pendingClaimSchema = z.object({
  token: z.uuid(),
  /**
   * The account the claim is for: it is finished only while that account is signed in, so one
   * person's uploads never land on another's account. Null until the sign-in has answered.
   */
  accountId: z.nullable(z.string()),
  /** Whether `finish_claim` was sent with it at least once, so a lost answer may have succeeded. */
  wasTried: z.boolean(),
});

/** The token of an earlier identity's claim that is not finished yet. */
export type PendingClaim = z.infer<typeof pendingClaimSchema>;

/** The unfinished claim this phone kept, or null; unreadable storage is no claim. */
export function readPendingClaim(): PendingClaim | null {
  try {
    const raw = localStorage.getItem(CLAIM_TOKEN_KEY);
    if (raw === null) return null;
    const parsed = pendingClaimSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    console.warn('The phone kept a claim it cannot read; dropping it.');
    localStorage.removeItem(CLAIM_TOKEN_KEY);
  } catch (error) {
    console.warn('The phone could not read its pending claim.', error);
  }
  return null;
}

/** Keeps the claim until it is finished; storage that refuses means no retry after a failure. */
export function keepPendingClaim(claim: PendingClaim): void {
  try {
    localStorage.setItem(CLAIM_TOKEN_KEY, JSON.stringify(claim));
  } catch (error) {
    console.warn('The phone could not keep its pending claim.', error);
  }
}

export function dropPendingClaim(): void {
  try {
    localStorage.removeItem(CLAIM_TOKEN_KEY);
  } catch (error) {
    console.warn('The phone could not drop its finished claim.', error);
  }
}
