import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/**
 * Set when the build had no Supabase config. The map still renders and
 * drawing still works; only sign-in and saving are unavailable.
 *
 * Never throw here. An import-time throw takes the whole bundle with it: the
 * minifier removes every module after an unconditional throw, and the result
 * is a white page with no explanation. Production shipped exactly that.
 */
export const supabaseConfigError: string | null =
  url && key
    ? null
    : 'Supabase is not configured — set VITE_SUPABASE_URL and ' +
      'VITE_SUPABASE_PUBLISHABLE_KEY (.env.local for dev, .env.production for builds).'

/**
 * The publishable key is public by design — it ships in this bundle. RLS is
 * what protects the data: public read, writes only for the owning user.
 */
export const supabase: SupabaseClient | null = supabaseConfigError
  ? null
  : createClient(url, key)
