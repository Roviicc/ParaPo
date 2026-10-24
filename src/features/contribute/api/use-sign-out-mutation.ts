import { useMutation, useQueryClient } from '@tanstack/react-query';

import { signOut } from './account';
import { accountKeys } from './account-keys';
import { useSessionWriter } from './use-session-writer';

/** Signs this phone out; nothing of the account's profile or uploads stays to show the next one. */
export function useSignOutMutation() {
  const write = useSessionWriter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: accountKeys.profile() });
      queryClient.removeQueries({ queryKey: accountKeys.uploads() });
      write(null);
    },
    networkMode: 'always',
  });
}
