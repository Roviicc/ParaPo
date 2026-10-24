import { messageOf } from './account-message';
import { ProfileScreen } from './profile-screen';
import { useAccountQuery } from '../api/use-account-query';
import { useProfileQuery } from '../api/use-profile-query';
import { useSignOutMutation } from '../api/use-sign-out-mutation';
import { useUpdateProfileMutation } from '../api/use-update-profile-mutation';

interface ProfileViewProps {
  onBack: () => void;
}

/** Profile with its data: the stored name and number, saving them, and signing out. */
export function ProfileView({ onBack }: ProfileViewProps) {
  const account = useAccountQuery();
  const profile = useProfileQuery();
  const update = useUpdateProfileMutation();
  const signOut = useSignOutMutation();

  return (
    <ProfileScreen
      email={account.data?.email ?? ''}
      profile={profile.data ?? null}
      loadError={profile.isError ? messageOf(profile.error) : null}
      isSaving={update.isPending}
      error={messageOf(update.error ?? signOut.error)}
      isSigningOut={signOut.isPending}
      onRetry={() => void profile.refetch()}
      onSave={(fields) => update.mutate(fields)}
      onSignOut={() => signOut.mutate()}
      onBack={onBack}
    />
  );
}
