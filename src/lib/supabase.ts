import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. ' +
      'Copy .env.local.example to .env.local and fill it in.',
  )
}

/**
 * The publishable key is public by design — it ships in this bundle. RLS is
 * what protects the data: public read, writes only for the owning user.
 */
export const supabase = createClient(url, key)
