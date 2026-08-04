// app/(portal)/portal/profile/page.tsx
// Read-only profile view + sign-out affordance. Clients see the
// contact details Star Hawk has on file for them and can sign out
// from here (the same Sign Out also lives in the header dropdown,
// but having it inline keeps the page self-contained — a customer
// who lands here from a "View profile" link shouldn't have to hunt
// for the sign-out button).

import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { EyebrowChip, PageHeader } from '@/components/ui/PageHeader'
import { SignOutButton } from '@/components/layout/SignOutButton'
import { ClientDeliveryAddresses } from './ClientDeliveryAddresses'
import { Mail, Phone, MapPin, Building2, User as UserIcon } from 'lucide-react'

export const metadata = {
  title: 'Your Profile',
}

interface FieldRowProps {
  icon: React.ReactNode
  label: string
  value: string | null
  placeholder?: string
}

function FieldRow({ icon, label, value, placeholder }: FieldRowProps) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-b-0">
      <div className="mt-0.5 shrink-0 text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm text-foreground break-words">
          {value?.trim() || <span className="text-muted-foreground italic">{placeholder ?? 'Not on file'}</span>}
        </p>
      </div>
    </div>
  )
}

export default async function PortalProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, full_name, phone, client_id')
    .eq('id', user.id)
    .maybeSingle()

  // The client record holds address + company info — that's the
  // "details on file" the user mentioned.
  let client: {
    first_name: string | null
    last_name: string | null
    company_name: string | null
    email: string | null
    phone: string | null
    address_line_1: string | null
    address_line_2: string | null
    town: string | null
    county: string | null
    postcode: string | null
  } | null = null
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

  if (profile?.client_id) {
    const { data: clientData } = await supabase
      .from('clients')
      .select('first_name, last_name, company_name, email, phone, address_line_1, address_line_2, town, county, postcode')
      .eq('id', profile.client_id)
      .is('deleted_at', null)
      .maybeSingle()
    client = clientData

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

  const fullName =
    [client?.first_name, client?.last_name].filter(Boolean).join(' ') ||
    profile?.full_name?.trim() ||
    null

  const cityLine = [client?.town, client?.county].filter(Boolean).join(', ')

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        eyebrow={<EyebrowChip label="Account" tone="info" />}
        title="My profile"
        description="The details Star Hawk has on file for you. Need a change? Get in touch with the office."
      />

      {(!client) && (
        <Alert variant="destructive">
          <AlertDescription>
            We couldn&apos;t find your customer record. Please contact Star Hawk to finish setting up your account.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your sign-in details on this portal.</CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-2">
          <FieldRow icon={<UserIcon className="h-4 w-4" />} label="Name" value={fullName} />
          <FieldRow icon={<Mail className="h-4 w-4" />} label="Email" value={profile?.email ?? null} />
          <FieldRow icon={<Phone className="h-4 w-4" />} label="Phone" value={profile?.phone ?? client?.phone ?? null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>On file with Star Hawk</CardTitle>
          <CardDescription>These details appear on your invoices and delivery paperwork.</CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-2">
          <FieldRow icon={<Building2 className="h-4 w-4" />} label="Company" value={client?.company_name ?? null} />
          <FieldRow icon={<MapPin className="h-4 w-4" />} label="Address line 1" value={client?.address_line_1 ?? null} />
          <FieldRow icon={<MapPin className="h-4 w-4" />} label="Address line 2" value={client?.address_line_2 ?? null} />
          <FieldRow icon={<MapPin className="h-4 w-4" />} label="Town / County" value={cityLine || null} />
          <FieldRow icon={<MapPin className="h-4 w-4" />} label="Postcode" value={client?.postcode ?? null} />
        </CardContent>
      </Card>

      <ClientDeliveryAddresses addresses={deliveryAddresses} />

      <Card>
        <CardHeader>
          <CardTitle>Sign out</CardTitle>
          <CardDescription>End your session on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutButton className="inline-flex" />
        </CardContent>
      </Card>
    </div>
  )
}
