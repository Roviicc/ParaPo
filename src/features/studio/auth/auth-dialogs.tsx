import { ChangePassword } from './change-password';
import { ResetPassword } from './reset-password';
import { SignIn } from './sign-in';

/**
 * The account's dialogs over the workshop: sign-in, from the pill's Sign in
 * or asked for at Done when signed out; setting a new password, back from a
 * reset link; changing it, from the pill. Each shows on its own flag; the workshop keeps them apart
 * (a password change waits while a reset is up). Split from StudioApp.tsx,
 * 2026-09-29.
 */
export function AuthDialogs({
  signingIn,
  onSignInDismiss,
  resetting,
  onResetDone,
  changingPasswordFor,
  onPasswordDone,
}: {
  signingIn: boolean;
  onSignInDismiss: () => void;
  resetting: boolean;
  onResetDone: () => void;
  /** The signed-in email while its password is being changed; null otherwise. */
  changingPasswordFor: string | null;
  onPasswordDone: () => void;
}) {
  return (
    <>
      {signingIn && <SignIn onDismiss={onSignInDismiss} />}

      {resetting && <ResetPassword onDone={onResetDone} />}

      {changingPasswordFor && (
        <ChangePassword email={changingPasswordFor} onDone={onPasswordDone} />
      )}
    </>
  );
}
