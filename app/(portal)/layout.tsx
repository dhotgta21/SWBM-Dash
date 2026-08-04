// app/(portal)/layout.tsx
// Layout for the client-facing portal — fundamentally different from the
// operator dashboard:
//
//   - No sidebar, no nav section, no "Invoices / Dashboard / Clients"
//     rail. The user explicitly asked for a minimal view that just
//     shows their invoices + paid/unpaid breakdown + a profile form.
//   - Single top header with the company wordmark on the left and a
//     profile dropdown on the right. The dropdown is the only place
//     the client can go to view their details or sign out.
//   - Operator accounts are bounced back to /invoices — defence in
//     depth alongside the (dashboard) layout's matching check.
//
// Auth flow:
//   - If unauthenticated → /login
//   - If role !== 'client' → /invoices?view=due (operators don't belong
//     in the portal)
//   - profile.client_id MUST be set (the role/client_id CHECK in the DB
//     enforces this, but we read defensively in case of drift)

import { redirect } from 'next/navigation'
import { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { PortalShell } from '@/components/client-portal/PortalShell'

export const dynamic = 'force-dynamic'

export default async function PortalLayout({ children }: { children: ReactNode }) {
  let user = null
  let profile: {
    id: string
    email: string
    full_name: string | null
    role: string
    client_id: string | null
    is_active: boolean
  } | null = null

  try {
    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    user = userData.user

    if (user) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, client_id, is_active')
        .eq('id', user.id)
        .maybeSingle()
      profile = profileData
    }
  } catch (error) {
    console.error('Portal layout auth check failed:', error)
  }

  // Unauthenticated portal visitors go to the public client login — never
  // the operator login path (which must stay off scanners' radar).
  if (!user) {
    redirect('/login')
  }

  if (!profile || profile.is_active === false) {
    redirect('/login?error=inactive')
  }

  if (profile.role === 'picker') {
    redirect('/picker')
  }

  if (profile.role === 'driver') {
    redirect('/driver')
  }

  if (profile.role !== 'client' || !profile.client_id) {
    redirect('/invoices?view=due')
  }

  // Load the company name for the header wordmark. Falls back to a
  // sensible default so the page still renders if the company row is
  // missing for any reason.
  let companyName = 'Demo Builder Merchant'
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('company_settings')
      .select('company_name')
      .eq('id', 1)
      .maybeSingle()
    if (data?.company_name) companyName = data.company_name
  } catch {
    // Company settings lookup is best-effort.
  }

  return (
    <PortalShell
      companyName={companyName}
      userEmail={profile.email}
      userFullName={profile.full_name}
    >
      {children}
    </PortalShell>
  )
}
