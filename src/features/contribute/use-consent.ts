import { useState } from 'react';
import * as z from 'zod/mini';

const CONSENT_KEY = 'parapo.contribute.consent';
const consentSchema = z.literal('yes');

function hasGivenConsent(): boolean {
  try {
    return consentSchema.safeParse(localStorage.getItem(CONSENT_KEY)).success;
  } catch {
    // Storage blocked (a private window): the contributor is asked again next visit.
    return false;
  }
}

interface Consent {
  hasConsent: boolean;
  giveConsent: () => void;
}

/** Whether this phone has already been told what the page does, and a way to say it has. */
export function useConsent(): Consent {
  const [hasConsent, setHasConsent] = useState(hasGivenConsent);

  const giveConsent = () => {
    try {
      localStorage.setItem(CONSENT_KEY, 'yes');
    } catch (error) {
      console.warn('The page could not remember the consent.', error);
    }
    setHasConsent(true);
  };

  return { hasConsent, giveConsent };
}
