import * as z from 'zod/mini';

/** The consent text's version, sent with every upload; bump it when the consent panel's words change. */
export const CONSENT_VERSION = 3;

/** The oldest consent text whose recordings still go without a question: 2 only differs by who is named. */
export const EARLIEST_SENT_VERSION = 2;

/** The first consent text stored a plain 'yes'; every later one stores its version number. */
const FIRST_VERSION_MARK = 'yes';

const storedConsentSchema = z.union([
  z.literal(FIRST_VERSION_MARK),
  z.string().check(z.regex(/^[1-9]\d*$/)),
]);

/** The version of the consent text a stored value says was agreed to, or null when there is none. */
export function agreedVersionOf(stored: string | null): number | null {
  const parsed = storedConsentSchema.safeParse(stored);
  if (!parsed.success) return null;
  return parsed.data === FIRST_VERSION_MARK ? 1 : Number(parsed.data);
}

/** Whether the agreed version is the current text: an older one no longer counts as consent. */
export function isCurrentConsent(agreedVersion: number | null): boolean {
  return agreedVersion === CONSENT_VERSION;
}

/** Whether a recording was made under a text too old to send unasked; one with no stamp was. */
export function isEarlierRecording(consentVersion: number | undefined): boolean {
  return consentVersion === undefined || consentVersion < EARLIEST_SENT_VERSION;
}

/** Whether the earlier-recordings question shows: consent is given, it was not answered, and some are unsent. */
export function shouldAskAboutEarlier(state: {
  hasConsent: boolean;
  hasAnswered: boolean;
  unsentEarlierCount: number;
}): boolean {
  return state.hasConsent && !state.hasAnswered && state.unsentEarlierCount > 0;
}
