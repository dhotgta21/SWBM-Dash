// lib/supabase/product-reader.ts
// Server-side Supabase client for reading the product catalogue.
//
// Prefer the service-role key so product lists work even when anon RLS is
// misconfigured (common on partial demo schemas). The service role is only
// used on the server and callers must still select public-safe columns and
// filter is_active / non-temporary rows in application code.
//
// Falls back to the anon key when SUPABASE_SERVICE_ROLE_KEY is not set.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPublicClient } from '@/lib/supabase/public'

export type ProductReaderMode = 'service_role' | 'anon'

export interface ProductReader {
  client: SupabaseClient
  mode: ProductReaderMode
}

/**
 * Best available server client for product catalogue reads.
 * Prefer service role (bypasses RLS) so empty-product bugs from broken
 * anon policies do not blank the shop.
 */
export function createProductReader(): ProductReader {
  try {
    return { client: createAdminClient(), mode: 'service_role' }
  } catch (adminErr) {
    console.warn(
      '[product-reader] service role unavailable; using anon key (RLS must allow SELECT):',
      adminErr instanceof Error ? adminErr.message : adminErr
    )
    return { client: createPublicClient(), mode: 'anon' }
  }
}
