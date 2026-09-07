import { useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Magic-link sign-in. Appears only when a signed-out user reaches for the one
 * button; there is no persistent auth chrome.
 */
export function SignIn({ onDismiss }: { onDismiss: () => void }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setState('sending')
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })

    if (error) {
      setError(error.message)
      setState('idle')
    } else {
      setState('sent')
    }
  }

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/30 p-6">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        {state === 'sent' ? (
          <>
            <h2 className="text-base font-medium text-neutral-900">Check your email</h2>
            <p className="mt-2 text-sm text-neutral-600">
              A sign-in link is on its way to {email}. Open it on this device.
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
          <form onSubmit={send}>
            <h2 className="text-base font-medium text-neutral-900">Sign in to draw</h2>
            <p className="mt-2 text-sm text-neutral-600">
              Routes are public to read. Only you can edit them.
            </p>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-4 w-full rounded-lg border border-neutral-300 px-3 py-2.5
                         text-sm outline-none focus:border-neutral-900"
            />
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
                disabled={state === 'sending'}
                className="flex-1 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium
                           text-white disabled:opacity-50"
              >
                {state === 'sending' ? 'Sending…' : 'Send link'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
