import { useState } from 'react'
import { supabase, supabaseConfigError } from '../lib/supabase'

type Mode = 'signin' | 'signup' | 'forgot'

/**
 * Email + password sign-in. Appears only when a signed-out user reaches for the
 * one button; there is no persistent auth chrome.
 *
 * Sign-up only shows the "confirm your email" step when the Supabase project
 * has email confirmation switched on. With it off, sign-up signs the user
 * straight in and no mail is ever sent.
 *
 * "Forgot password?" is the one path that must send mail: the reset link is
 * how ownership of the account is proved. Landing back from that link is
 * handled by usePasswordRecovery + ResetPassword, not here.
 */
export function SignIn({ onDismiss }: { onDismiss: () => void }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<'confirm' | 'reset' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

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
      // On success the auth listener in useSession closes this panel.
      return
    }

    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })
      if (error) {
        setError(error.message)
        setBusy(false)
        return
      }
      setSent('reset')
      setBusy(false)
      return
    }

    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }

    // With email confirmation on, Supabase hides "already registered" behind a
    // decoy success: a user object with no identities and no session.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setMode('signin')
      setPassword('')
      setError('An account with this email already exists. Sign in instead.')
      setBusy(false)
      return
    }

    // No session back means the project requires email confirmation.
    if (!data.session) {
      setSent('confirm')
      setBusy(false)
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setPassword('')
  }

  const heading =
    mode === 'signin' ? 'Sign in to save' : mode === 'signup' ? 'Create an account' : 'Reset your password'

  const submitLabel = busy
    ? mode === 'signin'
      ? 'Signing in…'
      : mode === 'signup'
        ? 'Creating…'
        : 'Sending…'
    : mode === 'signin'
      ? 'Sign in'
      : mode === 'signup'
        ? 'Create account'
        : 'Send reset link'

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/30 p-6">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        {sent ? (
          <>
            <h2 className="text-base font-medium text-neutral-900">
              {sent === 'confirm' ? 'Confirm your email' : 'Check your email'}
            </h2>
            <p className="mt-2 text-sm text-neutral-600">
              {sent === 'confirm'
                ? `We sent a confirmation link to ${email}. Open it, then sign in with your password.`
                : `If an account exists for ${email}, a reset link is on its way. Open it on this device to choose a new password.`}
            </p>
            <button
              type="button"
              onClick={onDismiss}
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

            {mode !== 'forgot' && (
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2.5
                           text-sm outline-none focus:border-neutral-900"
              />
            )}

            {mode === 'signup' && (
              <p className="mt-2 text-xs text-neutral-500">At least 6 characters.</p>
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
              <button
                type="button"
                onClick={onDismiss}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-600
                           ring-1 ring-neutral-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium
                           text-white disabled:opacity-50"
              >
                {submitLabel}
              </button>
            </div>

            <p className="mt-4 text-center text-sm text-neutral-600">
              {mode === 'signin' ? (
                <>
                  No account?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className="font-medium text-neutral-900 underline underline-offset-2"
                  >
                    Create one
                  </button>
                </>
              ) : (
                <>
                  {mode === 'signup' ? 'Already have one?' : 'Remembered it?'}{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="font-medium text-neutral-900 underline underline-offset-2"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
