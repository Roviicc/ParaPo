import { ACCOUNT_MESSAGES, AccountError } from '../api/account-problem';

/** The one line to show for a failed request; one the page does not know is ParaPo not accepting it. */
export function messageOf(error: Error | null): string | null {
  if (!error) return null;
  if (error instanceof AccountError) return ACCOUNT_MESSAGES[error.problem];
  console.error('An account request failed.', error);
  return ACCOUNT_MESSAGES['not-accepting'];
}
