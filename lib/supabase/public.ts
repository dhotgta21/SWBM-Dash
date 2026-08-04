import { createClient } from '@supabase/supabase-js'

/**
 * Anonymous/public Supabase client for server-side reads that should work
 * without a user session. Uses the public anon key, so it is safe to use
 * from public pages and server actions — it cannot bypass RLS; it relies
 * on RLS policies that grant access to anon users.
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Missing Supabase public credentials. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in the environment.'
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
