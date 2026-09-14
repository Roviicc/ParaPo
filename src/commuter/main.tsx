import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../shared/index.css'
import CommuterApp from './CommuterApp.tsx'
import { setSupabase, supabaseConfig } from '../shared/supabase'

/**
 * Where to send an auth result that arrived here, or null.
 *
 * A password-reset email sent before /studio/ existed still links to /, and
 * Supabase reports a refused link with `error_code` and `error_description`
 * in the address. Only the studio can finish either, so the query and fragment
 * go there untouched. This page never reads the token itself: its client has
 * detectSessionInUrl off.
 *
 * Deliberately narrow. A bare `code=` or `error=` could mean anything — a
 * share link carrying a route code, one day — and the studio's client uses
 * the implicit flow, which never sends `code`.
 */
function studioAddressForAuthResult(): string | null {
  const { pathname, search, hash } = window.location
  // Never forward the studio to itself, should this page ever be served there.
  if (pathname.startsWith('/studio')) return null
  const carriesAuth = (p: URLSearchParams) =>
    p.get('type') === 'recovery' || p.has('error_code') || p.has('error_description')
  const query = new URLSearchParams(search)
  const fragment = new URLSearchParams(hash.replace(/^#/, ''))
  return carriesAuth(query) || carriesAuth(fragment) ? `/studio/${search}${hash}` : null
}

const forwardTo = studioAddressForAuthResult()

if (forwardTo) {
  window.location.replace(forwardTo)
} else {
  // Visitors never sign in, so this client is a plain reader: it keeps no
  // session in localStorage, runs no refresh timer, and never reads a token
  // out of the address bar.
  if (supabaseConfig) {
    setSupabase(
      createClient(supabaseConfig.url, supabaseConfig.key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }),
    )
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <CommuterApp />
    </StrictMode>,
  )
}
