import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'
import App from './App.tsx'
import { setSupabase, supabaseConfig } from './lib/supabase'

// The entry point decides how this page talks to Supabase; everything else
// reads the client it sets here. Default auth settings: the editor keeps a
// session and finishes password-reset links.
if (supabaseConfig) setSupabase(createClient(supabaseConfig.url, supabaseConfig.key))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
