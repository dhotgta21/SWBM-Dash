// app/(portal)/portal/quotes/new/page.tsx
// Authenticated client quote request form.

import { createClient } from '@/lib/supabase/server'
import { EyebrowChip } from '@/components/ui/PageHeader'
import { ClientQuoteForm } from './ClientQuoteForm'

export const metadata = {
  title: 'New Quote',
}

export default async function NewClientQuotePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let deliveryAddresses: Array<{
    id: string
    label: string
    is_default: boolean
    address_line_1: string
    address_line_2: string | null
    town: string
    county: string | null
    postcode: string
    contact_name: string | null
    contact_phone: string | null
    delivery_notes: string | null
  }> = []

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('client_id')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.client_id) {
      const { data: addressData } = await supabase
        .from('client_delivery_addresses')
        .select(
          'id, label, is_default, address_line_1, address_line_2, town, county, postcode, contact_name, contact_phone, delivery_notes'
        )
        .eq('client_id', profile.client_id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })
      deliveryAddresses = addressData ?? []
    }
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-border/70 pb-6">
        <EyebrowChip label="Tools / Quotes" tone="info" />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.7rem]">
          Request a quote
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Tell us what materials you need and we will come back to you with trade pricing and
          availability.
        </p>
      </header>

      <ClientQuoteForm deliveryAddresses={deliveryAddresses} />
    </div>
  )
}
