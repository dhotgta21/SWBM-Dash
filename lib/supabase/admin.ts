import { createClient } from '@supabase/supabase-js'

function resolveSupabaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || null
}

/**
 * Service-role / secret key. Prefer the classic service_role JWT, then the
 * newer sb_secret_ key, then any project-linked alias Vercel may inject.
 */
function resolveServiceRoleKey(): string | null {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    null
  )
}

export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient must only be used on the server')
  }

  const url = resolveSupabaseUrl()
  const key = resolveServiceRoleKey()

  if (!url || !key) {
    throw new Error(
      'Missing Supabase admin credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).'
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/** URL host only, for error messages (no secrets). */
export function getSupabaseProjectHost(): string {
  try {
    const url = resolveSupabaseUrl()
    return url ? new URL(url).host : '(not set)'
  } catch {
    return '(invalid URL)'
  }
}
