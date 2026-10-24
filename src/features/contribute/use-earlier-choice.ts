import { useState } from 'react';
import * as z from 'zod/mini';

import { readAccountAnswer, writeAccountAnswer } from './account-storage';
import { EARLIEST_SENT_VERSION } from './consent-version';

// Keyed by the first text that sends unasked: the answer is about recordings older than it.
const CHOICE_KEY = `parapo.contribute.earlier.${EARLIEST_SENT_VERSION}`;
const choiceSchema = z.enum(['send', 'keep']);

/** What the person said about recordings made before they agreed to the current text. */
export type EarlierChoice = z.infer<typeof choiceSchema>;

function storedChoice(accountId: string | null): EarlierChoice | null {
  try {
    const parsed = choiceSchema.safeParse(readAccountAnswer(CHOICE_KEY, accountId));
    return parsed.success ? parsed.data : null;
  } catch {
    // Storage blocked: the question comes back next visit, and nothing is sent meanwhile.
    return null;
  }
}

interface EarlierChoiceState {
  /** Null until asked; the question is asked once. */
  choice: EarlierChoice | null;
  choose: (choice: EarlierChoice) => void;
}

/** The one-time answer to "send the earlier recordings too?", kept on the phone for each account. */
export function useEarlierChoice(accountId: string | null): EarlierChoiceState {
  // Kept in memory too, for when storage is blocked.
  const [given, setGiven] = useState<{ accountId: string | null; choice: EarlierChoice } | null>(
    null,
  );
  const choice = given && given.accountId === accountId ? given.choice : storedChoice(accountId);

  const choose = (next: EarlierChoice) => {
    try {
      writeAccountAnswer(CHOICE_KEY, accountId, next);
    } catch (error) {
      console.warn('The page could not remember the answer.', error);
    }
    setGiven({ accountId, choice: next });
  };

  return { choice, choose };
}
