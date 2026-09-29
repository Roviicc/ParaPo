import { ChangePassword } from './ChangePassword'
import { ResetPassword } from './ResetPassword'
import { SignIn } from './SignIn'

/**
 * The account's dialogs over the workshop: sign-in, asked for at Done when
 * signed out; setting a new password, back from a reset link; changing it,
 * from the pill. At most one is up at a time, in that order of precedence.
 */
export function AuthDialogs({
  signingIn,
  onSignInDismiss,
  resetting,
  onResetDone,
  changingPasswordFor,
  onPasswordDone,
}: {
  signingIn: boolean
  onSignInDismiss: () => void
  resetting: boolean
  onResetDone: () => void
  /** The signed-in email while its password is being changed; null otherwise. */
  changingPasswordFor: string | null
  onPasswordDone: () => void
}) {
  return (
    <>
      {signingIn && <SignIn onDismiss={onSignInDismiss} />}

      {resetting && <ResetPassword onDone={onResetDone} />}

      {changingPasswordFor && <ChangePassword email={changingPasswordFor} onDone={onPasswordDone} />}
    </>
  )
}
