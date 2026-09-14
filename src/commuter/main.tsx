import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../shared/index.css'
import CommuterApp from './CommuterApp.tsx'
import { setSupabase, supabaseConfig } from '../shared/supabase'

// Visitors never sign in, so this client is a plain reader: it keeps no
// session in localStorage, runs no refresh timer, and never reads a token out
// of the address bar.
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
