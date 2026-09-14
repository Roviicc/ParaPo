import { useState } from 'react'
import { getSupabase, supabaseConfigError } from '../shared/supabase'

type Mode = 'signin' | 'forgot'

type Props = {
  /** Heading while signing in. */
  title?: string
  /** A message to open with, such as why a reset link was refused. */
  notice?: string | null
  /**
   * Closes the panel. Without it the panel is the studio's front door: there
   * is nothing behind it to go back to, so Cancel becomes a link to the public
   * map.
   */
  onDismiss?: () => void
}

/**
 * Email + password sign-in: the studio's front door, and the dialog that opens
 * at Done in a test session.
 *
 * There is no sign-up. Only accounts on the editor list may write (migration
 * 0005), and sign-ups are off in the Supabase dashboard.
 *
 * "Forgot password?" is the one path that must send mail: the reset link is
 * how ownership of the account is proved. It leads to /studio/, the only page
 * that can finish it; landing there is handled by usePasswordRecovery and
 * ResetPassword, not here.
 */
export function SignIn({ title = 'Sign in to save', notice = null, onDismiss }: Props) {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(notice)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const supabase = getSupabase()
    if (!supabase) {
      setError(supabaseConfigError)
      setBusy(false)
      return
    }

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(
          error.message === 'Invalid login credentials'
            ? 'That email and password do not match an account.'
            : error.message,
        )
        setBusy(false)
      }
      // On success the auth listener in useSession replaces this panel.
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Only the studio has the form that sets the new password.
      redirectTo: `${window.location.origin}/studio/`,
    })
    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    setSent(true)
    setBusy(false)
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setPassword('')
  }

  // After "Check your email": a dialog closes; the front door goes back to sign-in.
  function afterSent() {
    if (onDismiss) {
      onDismiss()
      return
    }
    setSent(false)
    switchMode('signin')
  }

  const heading = mode === 'signin' ? title : 'Reset your password'

  const submitLabel = busy
    ? mode === 'signin'
      ? 'Signing in…'
      : 'Sending…'
    : mode === 'signin'
      ? 'Sign in'
      : 'Send reset link'

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/30 p-6">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        {sent ? (
          <>
            <h2 className="text-base font-medium text-neutral-900">Check your email</h2>
            <p className="mt-2 text-sm text-neutral-600">
              {`If an account exists for ${email}, a reset link is on its way. Open it on this device to choose a new password.`}
            </p>
            <button
              type="button"
              onClick={afterSent}
              className="mt-5 w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white"
            >
              Done
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <h2 className="text-base font-medium text-neutral-900">{heading}</h2>
            <p className="mt-2 text-sm text-neutral-600">
              {mode === 'forgot'
                ? 'Enter your email and we will send you a link to choose a new password.'
                : 'Anyone can see the routes. Only you can save or change them. Your drawing is kept on this device while you sign in.'}
            </p>

            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-4 w-full rounded-lg border border-neutral-300 px-3 py-2.5
                         text-sm outline-none focus:border-neutral-900"
            />

            {mode === 'signin' && (
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2.5
                           text-sm outline-none focus:border-neutral-900"
              />
            )}

            {mode === 'signin' && (
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

            <div className="mt-4 flex gap-2">
              {onDismiss ? (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-600
                             ring-1 ring-neutral-300"
                >
                  Cancel
                </button>
              ) : (
                <a
                  href="/"
                  className="flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-medium
                             text-neutral-600 ring-1 ring-neutral-300"
                >
                  Public map
                </a>
              )}
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium
                           text-white disabled:opacity-50"
              >
                {submitLabel}
              </button>
            </div>

            {mode === 'forgot' && (
              <p className="mt-4 text-center text-sm text-neutral-600">
                Remembered it?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="font-medium text-neutral-900 underline underline-offset-2"
                >
                  Sign in
                </button>
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
