import { useState } from 'react'
import { supabase, supabaseConfigError } from '../lib/supabase'

/**
 * Shown after the user lands from a password-reset link, once supabase-js has
 * turned that link into a session. Sets the new password on that session.
 */
export function ResetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }

    if (!supabase) {
      setError(supabaseConfigError)
      return
    }

    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    onDone()
  }

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/30 p-6">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <form onSubmit={submit}>
          <h2 className="text-base font-medium text-neutral-900">Choose a new password</h2>
          <p className="mt-2 text-sm text-neutral-600">
            You are signed in from your reset link. Set a password to finish.
          </p>

          <input
            type="password"
            required
            autoFocus
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            className="mt-4 w-full rounded-lg border border-neutral-300 px-3 py-2.5
                       text-sm outline-none focus:border-neutral-900"
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2.5
                       text-sm outline-none focus:border-neutral-900"
          />
          <p className="mt-2 text-xs text-neutral-500">At least 6 characters.</p>

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onDone}
              title="Stay signed in with your old password"
              className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-600
                         ring-1 ring-neutral-300"
            >
              Skip for now
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium
                         text-white disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
