import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { withQueryRetry } from '@/lib/supabase/with-query-retry'
import { InvoiceForm } from '@/components/invoices/InvoiceForm'
import { getOperatorContext } from '@/lib/auth/context'
import { mapChannel } from '@/lib/company'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'

export const metadata = {
  title: 'New Invoice',
}

export default async function NewInvoicePage() {
  // Page-level gate: the admin may have revoked invoices_add for this
  // staff user. Redirect before we load anything else — and before we
  // render the form (which would expose every product + client to a
  // user who isn't allowed to issue documents).
  const ctx = await getOperatorContext()
  if (!ctx) redirect(ADMIN_LOGIN_PATH)
  if (!ctx.isAdmin && !ctx.permissions.invoices_add) {
    redirect('/invoices?view=due')
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(ADMIN_LOGIN_PATH)
  }

  // The form no longer surfaces Order / Account / Operator as inputs — all
  // three are auto-populated server-side. We just need the active user's
  // profile values to render an accurate PDF preview before the row is
  // committed to the DB.
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  const operatorName = profile?.full_name || 'Unknown Operator'

  const [{ data: company }, { data: bankDetails }, { data: phones }, { data: emails }] = await Promise.all([
    withQueryRetry('company_settings (new invoice)', () =>
      supabase.from('company_settings').select('*').maybeSingle()
    ),
    withQueryRetry('company_bank_details (new invoice)', () =>
      supabase.from('company_bank_details').select('*').maybeSingle()
    ),
    supabase.from('company_phones').select('*').eq('settings_id', 1).order('sort_order', { ascending: true }),
    supabase.from('company_emails').select('*').eq('settings_id', 1).order('sort_order', { ascending: true }),
  ])

  const companyWithChannels = company
    ? {
        ...company,
        phones: phones?.map(mapChannel) ?? [],
        emails: emails?.map(mapChannel) ?? [],
      }
    : {
        phones: phones?.map(mapChannel) ?? [],
        emails: emails?.map(mapChannel) ?? [],
      }

  // Brand logo is a static asset in /public — Logo.webp.
  const logoSrc = '/Logo.webp'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Create Document</h1>
        <p className="text-sm text-muted-foreground">Create a new invoice or quotation</p>
      </div>
      <InvoiceForm
        operatorName={operatorName}
        company={companyWithChannels}
        bankDetails={bankDetails}
        logoSrc={logoSrc}
        canSendEmail={ctx.isAdmin || ctx.permissions.invoices_send_email}
        defaultVatRate={
          company && 'default_vat_rate' in company && company.default_vat_rate != null
            ? Number(company.default_vat_rate)
            : 20
        }
      />
    </div>
  )
}
