import { redirect } from 'next/navigation'
import { ReactNode } from 'react'
import { getOperatorContext } from '@/lib/auth/context'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { QuoteNotifications } from '@/components/notifications/QuoteNotifications'
import { DeliveryAlertsNotifications } from '@/components/notifications/DeliveryAlertsNotifications'
import { getOverdueDeliveryCount } from '@/lib/actions/delivery-alerts'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {
  let ctx = null
  try {
    ctx = await getOperatorContext()
  } catch (error) {
    console.error('Dashboard layout auth check failed:', error)
  }

  if (!ctx) {
    redirect(ADMIN_LOGIN_PATH)
  }

  // is_active lives on profiles and isn't in OperatorContext (the
  // permission system doesn't care about it). Re-check it here.
  const supabase = await createClient()
  const { data: activeProfile } = await supabase
    .from('profiles')
    .select('is_active')
    .eq('id', ctx.userId)
    .maybeSingle()
  if (!activeProfile || activeProfile.is_active === false) {
    redirect(`${ADMIN_LOGIN_PATH}?error=inactive`)
  }

  // Client portal users and pickers have their own layouts — keep them
  // out of the operator dashboard. (The reverse — operators hitting
  // /portal or /picker — is also handled by those layouts; defence in depth.)
  if (ctx.role === 'client') {
    redirect('/portal')
  }

  if (ctx.role === 'picker') {
    redirect('/picker')
  }

  if (ctx.role === 'driver') {
    redirect('/driver')
  }

  // Show the first-admin recovery prompt to staff users when the system
  // has no admins yet (e.g. the first user was created as staff before the
  // bootstrap flow existed). Once any admin exists the prompt disappears.
  let showAdminClaimPrompt = false
  if (ctx.role === 'staff') {
    try {
      const { count, error } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'admin')
      if (!error) {
        showAdminClaimPrompt = (count ?? 0) === 0
      }
    } catch (e) {
      console.error('Failed to check admin count:', e)
    }
  }

  // Pending (unprocessed) quote requests count for the sidebar badge.
  // Fetch it for anyone who can see quote requests (admins + permitted staff).
  let pendingQuoteCount: number | undefined
  if (ctx.isAdmin || ctx.permissions.see_quote_requests) {
    try {
      const { count, error } = await supabase
        .from('quote_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
      if (!error) {
        pendingQuoteCount = count ?? 0
      }
    } catch (e) {
      console.error('Failed to check pending quote count:', e)
    }
  }

  // Load company branding for the dashboard navbar.
  let companyName: string | null = null
  let logoUrl: string | null = null
  let logoUpdatedAt: string | null = null
  let webmailUrl: string | null = null
  try {
    const { data: company } = await supabase
      .from('company_settings')
      .select('company_name, logo_url, updated_at, webmail_url')
      .maybeSingle()
    companyName = company?.company_name ?? null
    logoUrl = company?.logo_url ?? null
    logoUpdatedAt = company?.updated_at ?? null
    webmailUrl = (company?.webmail_url ?? '').trim() || null
  } catch (e) {
    console.error('Failed to load company branding:', e)
  }

  // Overdue-delivery alerts (assigned to a driver 24h+ ago, not delivered).
  // The helper self-gates by permission and returns 0 for users who can't
  // see invoices, so the badge simply stays hidden for them.
  const overdueDeliveryCount = await getOverdueDeliveryCount()

  return (
    <DashboardShell
      userEmail={ctx.email}
      userRole={ctx.role}
      permissions={ctx.permissions}
      showAdminClaimPrompt={showAdminClaimPrompt}
      pendingQuoteCount={pendingQuoteCount}
      overdueDeliveryCount={overdueDeliveryCount || undefined}
      companyName={companyName}
      logoUrl={logoUrl}
      logoUpdatedAt={logoUpdatedAt}
      webmailUrl={webmailUrl}
    >
      {children}
      <QuoteNotifications enabled={ctx.isAdmin || ctx.permissions.see_quote_requests} />
      <DeliveryAlertsNotifications
        enabled={ctx.isAdmin || ctx.permissions.see_invoices === true}
      />
    </DashboardShell>
  )
}
