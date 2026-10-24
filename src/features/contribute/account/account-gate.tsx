import { useState } from 'react';

import { useSaveProfileMutation } from '../api/use-save-profile-mutation';
import { useSignInMutation } from '../api/use-sign-in-mutation';
import { useSignUpMutation } from '../api/use-sign-up-mutation';
import { BackToMapButton } from '../back-to-map-button';
import { messageOf } from './account-message';
import { CreateAccountScreen } from './create-account-screen';
import { ProfileStepScreen } from './profile-step-screen';
import { SignInScreen } from './sign-in-screen';
import { useCaptcha } from './use-captcha';

type Mode = 'sign-in' | 'create-account';

interface AccountGateProps {
  /** The phone is signed in to an account whose name and number are not stored yet. */
  needsProfile: boolean;
}

/**
 * What a phone with no account sees: Sign in, with Create account beside it, and the way back to
 * the map. An account whose name and number did not save sees only those two fields.
 */
export function AccountGate({ needsProfile }: AccountGateProps) {
  const [mode, setMode] = useState<Mode>('sign-in');
  const captcha = useCaptcha();
  const signIn = useSignInMutation();
  const signUp = useSignUpMutation();
  const saveProfile = useSaveProfileMutation();

  const switchTo = (next: Mode) => {
    signIn.reset();
    signUp.reset();
    setMode(next);
  };

  if (needsProfile) {
    return (
      <>
        <BackToMapButton />
        <ProfileStepScreen
          isBusy={saveProfile.isPending}
          error={messageOf(saveProfile.error ?? signUp.error)}
          onSubmit={(fields) => saveProfile.mutate(fields)}
        />
      </>
    );
  }

  return (
    <>
      <BackToMapButton />
      {mode === 'sign-in' && (
        <SignInScreen
          isBusy={signIn.isPending}
          error={messageOf(signIn.error)}
          captcha={captcha}
          onSubmit={(fields) => signIn.mutate({ ...fields, captchaToken: captcha.takeToken() })}
          onCreateAccount={() => switchTo('create-account')}
        />
      )}
      {mode === 'create-account' && (
        <CreateAccountScreen
          isBusy={signUp.isPending}
          error={messageOf(signUp.error)}
          captcha={captcha}
          onSubmit={(fields) => signUp.mutate({ ...fields, captchaToken: captcha.takeToken() })}
          onSignIn={() => switchTo('sign-in')}
        />
      )}
    </>
  );
}
