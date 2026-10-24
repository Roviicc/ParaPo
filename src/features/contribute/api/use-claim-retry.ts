import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { accountKeys } from './account-keys';
import { readPendingClaim } from './claim-token';
import { finishPendingClaim } from './earlier-identity';
import { requireClient } from './require-client';

/**
 * Where the account's list of uploads is refreshed once a claim moved uploads into it.
 * TODO: ticket 03's `accountKeys.uploads()` is under key [..., 'uploads']; this matches it by
 * that name until it is on staging, so no key is invented here.
 */
function invalidateAccountUploads(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: ({ queryKey }) => queryKey[0] === accountKeys.all[0] && queryKey[1] === 'uploads',
  });
}

/**
 * Finishes a claim the sign-in could not, whenever the phone comes back online or to the front,
 * so the token's 10 minutes are not spent waiting for the next start.
 */
export function useClaimRetry(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const retry = () => {
      // Nothing is loaded or asked while there is no claim.
      if (!readPendingClaim()) return;
      requireClient()
        .then(finishPendingClaim)
        .then((moved) => (moved > 0 ? invalidateAccountUploads(queryClient) : undefined))
        .catch((error: unknown) => console.warn('The claim could not be retried.', error));
    };
    const handleVisible = () => {
      if (document.visibilityState === 'visible') retry();
    };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [queryClient]);
}
