import { useMutation, useQueryClient } from '@tanstack/react-query';

import { saveProfile } from './account';
import { accountKeys } from './account-keys';

/** Stores a new name and number through set_profile, then shows them as the profile. */
export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveProfile,
    onSuccess: (_account, fields) => queryClient.setQueryData(accountKeys.profile(), fields),
    networkMode: 'always',
  });
}
