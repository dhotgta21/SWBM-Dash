// lib/company-vat.ts
// Load the company-wide default VAT percentage used on new invoices/quotes.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeVatRatePercent, VAT_RATE_PERCENTAGE } from '@/lib/vat'

/**
 * Returns the company default VAT rate as a percentage (e.g. 20).
 * Falls back to VAT_RATE_PERCENTAGE when the column/row is missing.
 */
export async function getCompanyDefaultVatRate(): Promise<number> {
  try {
    // Prefer the user-scoped client so RLS applies; fall back to admin for
    // bootstrap / public paths that already run with service role.
    let rate: number | null | undefined
    try {
      const supabase = await createClient()
      const { data } = await supabase
        .from('company_settings')
        .select('default_vat_rate')
        .eq('id', 1)
        .maybeSingle()
      rate = (data as { default_vat_rate?: number | null } | null)?.default_vat_rate
    } catch {
      rate = null
    }

    if (rate == null) {
      const admin = createAdminClient()
      const { data } = await admin
        .from('company_settings')
        .select('default_vat_rate')
        .eq('id', 1)
        .maybeSingle()
      rate = (data as { default_vat_rate?: number | null } | null)?.default_vat_rate
    }

    return normalizeVatRatePercent(rate, VAT_RATE_PERCENTAGE)
  } catch (err) {
    console.error('getCompanyDefaultVatRate failed:', err)
    return VAT_RATE_PERCENTAGE
  }
}
