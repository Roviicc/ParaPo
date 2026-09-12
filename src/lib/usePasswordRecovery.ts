import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

type RecoveryUrl = { recovering: boolean; error: string | null }

/**
 * Tracks arrival from a password-reset link.
 *
 *  - `recovering`: the link was valid and a new password should be collected
 *    (the caller should wait for the session before showing the form).
 *  - `error`: the link was rejected — expired, already used — with Supabase's
 *    own description. `recovering` is false in that case so the app behaves as
 *    plainly signed out.
 *
 * Two signals, because either alone can be missed:
 *  - the URL carries `type=recovery` (hash for the implicit flow, query for
 *    PKCE) — checked synchronously on mount, before supabase-js has consumed
 *    and cleared it;
 *  - supabase-js emits PASSWORD_RECOVERY once it has turned that URL into a
 *    session — but if it does so before this effect subscribes, the event is
 *    gone, which is why the URL check comes first.
 */
export function usePasswordRecovery(): RecoveryUrl & { done: () => void } {
  const [state, setState] = useState<RecoveryUrl>(() => readRecoveryUrl())

  useEffect(() => {
    if (!supabase) return
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setState({ recovering: true, error: null })
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const done = useCallback(() => {
    setState({ recovering: false, error: null })
    // Drop the token fragment / code so a refresh does not re-open the form.
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  return { ...state, done }
}

function readRecoveryUrl(): RecoveryUrl {
  if (typeof window === 'undefined') return { recovering: false, error: null }
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const params = hash.get('type') || hash.get('error') ? hash : query

  if (params.get('type') !== 'recovery' && !params.get('error')) {
    return { recovering: false, error: null }
  }
  const error = params.get('error_description') ?? params.get('error')
  if (error) {
    return { recovering: false, error: error.replace(/\+/g, ' ') }
  }
  return { recovering: true, error: null }
}
