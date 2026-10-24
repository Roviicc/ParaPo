import { canUpload } from '../api/contribute-client';
import { useAccountQuery } from '../api/use-account-query';
import { useClaimRetry } from '../api/use-claim-retry';

/**
 * Whether the page may show Ready and the rest. A build with no database has no accounts, so
 * recordings stay on the phone as they always did; otherwise the page waits for an account with
 * its name stored.
 */
export type AccountGateState = 'loading' | 'needs-account' | 'needs-profile' | 'ready';

export function useAccountGate(): AccountGateState {
  const account = useAccountQuery();
  useClaimRetry();
  if (!canUpload()) return 'ready';
  if (account.isPending) return 'loading';
  if (!account.data) return 'needs-account';
  return account.data.hasProfile ? 'ready' : 'needs-profile';
}
