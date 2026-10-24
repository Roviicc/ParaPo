import { useState } from 'react';

import { readAccountAnswer, writeAccountAnswer } from './account-storage';
import { CONSENT_VERSION, agreedVersionOf, isCurrentConsent } from './consent-version';

const CONSENT_KEY = 'parapo.contribute.consent';

function storedAgreedVersion(accountId: string | null): number | null {
  try {
    return agreedVersionOf(readAccountAnswer(CONSENT_KEY, accountId));
  } catch {
    // Storage blocked (a private window): the contributor is asked again next visit.
    return null;
  }
}

export interface Consent {
  /** Whether the signed-in account has agreed to the current text; an older text's agreement does not count. */
  hasConsent: boolean;
  giveConsent: () => void;
}

/** Whether this account has agreed to what the page does, and a way to say it has. */
export function useConsent(accountId: string | null): Consent {
  // Kept in memory too, for when storage is blocked.
  const [given, setGiven] = useState<{ accountId: string | null } | null>(null);
  const agreedVersion =
    given && given.accountId === accountId ? CONSENT_VERSION : storedAgreedVersion(accountId);

  const giveConsent = () => {
    try {
      writeAccountAnswer(CONSENT_KEY, accountId, String(CONSENT_VERSION));
    } catch (error) {
      console.warn('The page could not remember the consent.', error);
    }
    setGiven({ accountId });
  };

  return { hasConsent: isCurrentConsent(agreedVersion), giveConsent };
}
