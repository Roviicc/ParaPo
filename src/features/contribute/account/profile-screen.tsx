import { Button } from '@/design-system/primitives/button';
import { IconButton } from '@/design-system/primitives/icon-button';
import { ChevronLeftIcon } from '@/shared/ui/route-icons';

import type { ProfileFields } from './account-fields';
import { ProfileForm } from './profile-form';
import { useFocusHeading } from '../use-focus-heading';

interface ProfileScreenProps {
  email: string;
  /** The stored name and number, or null until they have loaded. */
  profile: ProfileFields | null;
  /** One line when the profile could not be loaded. */
  loadError: string | null;
  isSaving: boolean;
  /** One line about the last save or sign-out, or null. */
  error: string | null;
  isSigningOut: boolean;
  onRetry: () => void;
  onSave: (fields: ProfileFields) => void;
  onSignOut: () => void;
  onBack: () => void;
}

/**
 * The account on a screen of its own: name and number to change, the email as it is, and Sign
 * out. The layout says what each is, so nothing carries a caption.
 */
export function ProfileScreen({
  email,
  profile,
  loadError,
  isSaving,
  error,
  isSigningOut,
  onRetry,
  onSave,
  onSignOut,
  onBack,
}: ProfileScreenProps) {
  const headingRef = useFocusHeading();

  return (
    <section
      aria-labelledby="profile-heading"
      className="absolute inset-0 z-20 flex flex-col bg-surface-secondary font-sn-pro text-content-primary"
    >
      <header className="flex items-center gap-3 pt-[max(1rem,env(safe-area-inset-top))] pr-4 pb-3 pl-[max(1rem,env(safe-area-inset-left))]">
        <IconButton
          tooltip="top"
          size="large"
          label="Back"
          icon={<ChevronLeftIcon />}
          onClick={onBack}
        />
        <h1
          id="profile-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl/8 font-extrabold focus:outline-none"
        >
          Profile
        </h1>
      </header>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="text-base/6 break-words">{email}</p>
        {!profile && !loadError && (
          <p role="status" className="text-base/6 text-content-quaternary">
            Loading…
          </p>
        )}
        {loadError && (
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="text-base/6 text-content-quaternary">
              {loadError}
            </p>
            <Button variant="secondary" size="small" label="Try again" onClick={onRetry} />
          </div>
        )}
        {profile && (
          <ProfileForm
            // A saved profile arrives as new values: the form starts again from them.
            key={`${profile.name}|${profile.phone}`}
            profile={profile}
            isBusy={isSaving}
            error={error}
            onSubmit={onSave}
          />
        )}
        {!profile && error && (
          <p role="alert" className="text-sm/5">
            {error}
          </p>
        )}
        <div>
          <Button
            variant="secondary"
            label={isSigningOut ? 'Signing out…' : 'Sign out'}
            disabled={isSigningOut}
            onClick={onSignOut}
          />
        </div>
      </div>
    </section>
  );
}
