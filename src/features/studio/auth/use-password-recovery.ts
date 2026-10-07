import { useCallback, useEffect, useState } from 'react';

import { getSupabase } from '../data/supabase';

interface RecoveryUrl {
  recovering: boolean;
  error: string | null;
}

/**
 * Tracks arrival from a password-reset link.
 *
 *  - `recovering`: the link was valid and a new password should be collected
 *    (the caller should wait for the session before showing the form).
 *  - `error`: the link was rejected — expired, already used — said in our own
 *    words, picked by Supabase's `error_code`. Never the URL's
 *    `error_description`: anyone can write that into a link to /studio/, so
 *    showing it would let a stranger put their words on the editor's door.
 *    `recovering` is false in that case so the app behaves as plainly signed
 *    out.
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
  const [state, setState] = useState<RecoveryUrl>(() => readRecoveryUrl());

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setState({ recovering: true, error: null });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const done = useCallback(() => {
    setState({ recovering: false, error: null });
    // Drop the token fragment / code so a refresh does not re-open the form.
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  return { ...state, done };
}

function readRecoveryUrl(): RecoveryUrl {
  if (typeof window === 'undefined') return { recovering: false, error: null };
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const params = hash.get('type') || hash.get('error') ? hash : query;

  if (params.get('type') !== 'recovery' && !params.get('error')) {
    return { recovering: false, error: null };
  }
  if (params.get('error')) {
    return { recovering: false, error: linkError(params.get('error_code')) };
  }
  return { recovering: true, error: null };
}

function linkError(code: string | null): string {
  return code === 'otp_expired'
    ? 'the link has expired or was already used. Ask for a new one.'
    : 'the link could not be used. Ask for a new one.';
}
