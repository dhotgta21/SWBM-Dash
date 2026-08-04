import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getOperatorContext } from '@/lib/auth/context'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'
import { canSeeClientMoney } from '@/lib/auth/permissions'
import { ClientDetailTabs } from '@/components/clients/ClientDetailTabs'
import { ClientForm } from '@/components/clients/ClientForm'
import { ClientPortalInviteCard } from '@/components/clients/ClientPortalInviteCard'
import { DeleteClientButton } from '@/components/clients/DeleteClientButton'
import { MarkReviewedButton } from '@/components/clients/MarkReviewedButton'
import { ClientDashboardView } from '@/components/clients/ClientDashboardView'
import { ClientAccountView } from '@/components/clients/ClientAccountView'
import { getClientAnalytics } from '@/lib/client-analytics'
import { getClientAccountLedger } from '@/lib/actions/client-account'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { formatCurrency, cn } from '@/lib/utils'
import { getCreditStatus } from '@/lib/client-credit'
import { ArrowLeft, AlertTriangle } from 'lucide-react'

export const metadata = {
  title: 'Client Details',
}

type InvoiceRow = import('@/lib/database.types').Database['public']['Tables']['invoices']['Row']
type ClientRow = import('@/lib/database.types').Database['public']['Tables']['clients']['Row']

interface ClientDetailPageProps {
  params: Promise<{ id: string }>
}

function ClientSummaryCard({
  client,
  showMoney,
  outstanding,
}: {
  client: ClientRow
  showMoney: boolean
  outstanding: number
}) {
  // Unified account view: the account is one pot — wallet deposits minus
  // unpaid invoices. Negative = the client is overdrawn on the credit we
  // extended; the credit limit is the overdraft floor.
  const credit = getCreditStatus(client.account_balance || 0, outstanding, client.credit_limit)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
          <div className="sm:pr-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Account number</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{client.account_number || '—'}</p>
          </div>
          <div className="sm:px-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Account balance</p>
            <p
              className={cn(
                'mt-1 text-2xl font-semibold',
                credit.net < 0 ? 'text-destructive' : credit.net > 0 ? 'text-success' : 'text-foreground'
              )}
            >
              {showMoney ? formatCurrency(credit.net) : '—'}
            </p>
            {showMoney && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatCurrency(client.account_balance || 0)} in account · {formatCurrency(outstanding)} owed
              </p>
            )}
          </div>
          <div className="sm:pl-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Credit limit</p>
            <p
              className={cn(
                'mt-1 text-2xl font-semibold',
                credit.overLimit ? 'text-destructive' : 'text-foreground'
              )}
            >
              {showMoney
                ? client.credit_limit != null
                  ? formatCurrency(client.credit_limit)
                  : 'No limit'
                : '—'}
            </p>
            {showMoney && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Overdraft limit · {client.payment_terms_days ?? 30}-day terms
              </p>
            )}
          </div>
        </div>
        {showMoney && credit.overLimit && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This account is <strong>{formatCurrency(credit.overBy)} past its overdraft limit</strong>.
              Collect the outstanding balance before extending more credit.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { id } = await params
  const ctx = await getOperatorContext()
  if (!ctx) redirect(ADMIN_LOGIN_PATH)
  if (!ctx.permissions.see_clients) redirect('/invoices?view=due')

  const supabase = await createClient()

  const showMoney = canSeeClientMoney(ctx.permissions)
  // Managing a client account requires both the account-management permission
  // and the right to see client money — the confirmation dialogs expose amounts.
  const canManageAccount = ctx.isAdmin || (ctx.permissions.clients_manage_account && showMoney)

  let client: ClientRow | undefined
  let allInvoices: InvoiceRow[] = []
  let invitations: {
    id: string
    status: 'pending' | 'accepted' | 'revoked' | 'expired'
    created_at: string
    accepted_at: string | null
    expires_at: string
  }[] = []
  let analytics: Awaited<ReturnType<typeof getClientAnalytics>> | null = null
  let ledger: Awaited<ReturnType<typeof getClientAccountLedger>>['transactions'] = []
  let loadError = false

  try {
    // Prefer soft-delete filter; retry without it when clients.deleted_at is
    // missing on partial demo schemas (same class of bug as product/analytics).
    let clientResult = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single()
    if (
      clientResult.error &&
      (clientResult.error.message ?? '').toLowerCase().includes('deleted_at') &&
      (clientResult.error.message ?? '').toLowerCase().includes('does not exist')
    ) {
      console.warn('Client detail: clients.deleted_at missing; retrying without filter')
      clientResult = await supabase.from('clients').select('*').eq('id', id).single()
    }
    if (clientResult.error) {
      if (clientResult.error.code === 'PGRST116') {
        notFound()
      }
      throw clientResult.error
    }
    client = clientResult.data

    let allResult = await supabase
      .from('invoices')
      .select('*')
      .eq('client_id', id)
      .is('deleted_at', null)
      .order('issue_date', { ascending: false })
    if (
      allResult.error &&
      (allResult.error.message ?? '').toLowerCase().includes('deleted_at') &&
      (allResult.error.message ?? '').toLowerCase().includes('does not exist')
    ) {
      console.warn('Client detail: invoices.deleted_at missing; retrying without filter')
      allResult = await supabase
        .from('invoices')
        .select('*')
        .eq('client_id', id)
        .order('issue_date', { ascending: false })
    }
    if (allResult.error) throw allResult.error
    allInvoices = allResult.data ?? []

    const inviteResult = await supabase
      .from('client_invitations')
      .select('id, status, created_at, accepted_at, expires_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(5)
    invitations = inviteResult.data ?? []

    // Money-sensitive data is only loaded for operators who are allowed to see it.
    // Analytics power the dashboard; the ledger belongs to the account tab.
    if (showMoney) {
      analytics = await getClientAnalytics(id).catch((err) => {
        console.error('Client analytics error:', err)
        return null
      })
    }
    if (showMoney && canManageAccount) {
      const ledgerResult = await getClientAccountLedger(id)
      ledger = ledgerResult.transactions
      if (ledgerResult.error) {
        console.error('Client ledger error:', ledgerResult.error)
      }
    }
  } catch (error) {
    console.error('Client detail error:', error)
    loadError = true
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertDescription>Unable to load client details. Please try again later.</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!client) {
    notFound()
  }

  const invoiceCount = allInvoices?.length ?? 0
  // Outstanding = money still owed on live invoices (sent/partial/overdue).
  // Drafts and cancelled documents are excluded — nothing to collect on them.
  const totalOutstanding = allInvoices
    .filter(
      (inv) =>
        inv.type === 'invoice' &&
        inv.status !== 'draft' &&
        inv.status !== 'cancelled' &&
        (inv.balance_due || 0) > 0
    )
    .reduce((sum, inv) => sum + (inv.balance_due || 0), 0)
  const canDeleteClient = ctx.isAdmin || ctx.permissions.clients_delete
  // Mirrors updateClientRecord / markClientReviewed: edit requires
  // clients_edit AND ownership of the record (admins bypass both).
  const canEditClient = ctx.isAdmin || (ctx.permissions.clients_edit && client.created_by === ctx.userId)

  // Staff without clients_see_money still see document numbers / dates / status,
  // but never the £ values — strip money fields before they reach the browser.
  const recentInvoices = showMoney
    ? allInvoices.slice(0, 5)
    : allInvoices.slice(0, 5).map((inv) => ({ ...inv, total: 0, amount_paid: 0, balance_due: 0 }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/clients">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {client.first_name} {client.last_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {client.company_name || 'No company'}
            {client.account_number && (
              <span className="ml-2 text-xs text-muted-foreground">· Account {client.account_number}</span>
            )}
          </p>
        </div>
      </div>

      {client.is_temporary ? (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
          <AlertDescription>
            This is a <strong>temporary walk-in</strong> record — created quickly from an invoice or quote.
            Fill in <strong>at least one contact channel (email or phone)</strong> and save to promote it to a full client account.
          </AlertDescription>
        </Alert>
      ) : null}

      {client.ai_created && !client.reviewed && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This client was created by the AI invoice assistant. Please review and complete the contact details before treating the record as confirmed.
          </AlertDescription>
        </Alert>
      )}

      <ClientDetailTabs
        invoiceCount={invoiceCount}
        details={
          <>
            <ClientSummaryCard
              client={showMoney ? client : { ...client, account_balance: 0 }}
              showMoney={showMoney}
              outstanding={totalOutstanding}
            />

            {client.email && (
              <ClientPortalInviteCard
                clientId={client.id}
                clientEmail={client.email}
                clientName={`${client.first_name} ${client.last_name}`.trim()}
                invitations={invitations.map((inv) => ({
                  id: inv.id,
                  status: inv.status,
                  created_at: inv.created_at,
                  accepted_at: inv.accepted_at,
                  expires_at: inv.expires_at,
                }))}
                canSendInvite={ctx.isAdmin || ctx.permissions.clients_send_portal_invite}
                canRevokeInvite={ctx.isAdmin || ctx.permissions.clients_revoke_portal_invite}
              />
            )}

            <Card>
              <CardHeader>
                <CardTitle>Edit Client</CardTitle>
              </CardHeader>
              <CardContent>
                {canEditClient ? (
                  <ClientForm
                  initialData={{
                    id: client.id,
                    first_name: client.first_name,
                    last_name: client.last_name,
                    email: client.email ?? undefined,
                    phone: client.phone ?? undefined,
                    company_name: client.company_name ?? undefined,
                    account_number: client.account_number ?? undefined,
                    address_line_1: client.address_line_1 ?? undefined,
                    address_line_2: client.address_line_2 ?? undefined,
                    town: client.town ?? undefined,
                    county: client.county ?? undefined,
                    postcode: client.postcode ?? undefined,
                    notes: client.notes ?? undefined,
                    payment_terms_days: client.payment_terms_days != null ? String(client.payment_terms_days) : undefined,
                    credit_limit: client.credit_limit != null ? String(client.credit_limit) : undefined,
                    ai_created: client.ai_created,
                    reviewed: client.reviewed,
                    is_temporary: client.is_temporary,
                    promoted_at: client.promoted_at,
                  }}
                  canManageCredit={canManageAccount}
                />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    You do not have permission to edit this client. Ask an administrator to make changes.
                  </p>
                )}
              </CardContent>
            </Card>

            {(client.ai_created && !client.reviewed && canEditClient) || canDeleteClient ? (
              <Card>
                <CardHeader>
                  <CardTitle>Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {client.ai_created && !client.reviewed && canEditClient && (
                    <MarkReviewedButton clientId={client.id} />
                  )}
                  {canDeleteClient && (
                    <DeleteClientButton
                      clientId={client.id}
                      clientName={`${client.first_name} ${client.last_name}`.trim()}
                      invoiceCount={invoiceCount}
                    />
                  )}
                </CardContent>
              </Card>
            ) : null}
          </>
        }
        dashboard={
          !showMoney ? (
            <Alert>
              <AlertDescription>
                Money figures are hidden for your role. Ask an administrator for access.
              </AlertDescription>
            </Alert>
          ) : analytics ? (
            <ClientDashboardView
              analytics={analytics}
              recentInvoices={recentInvoices}
              showMoney={showMoney}
              clientName={`${client.first_name} ${client.last_name}`.trim()}
            />
          ) : (
            <Alert variant="destructive">
              <AlertDescription>Unable to load client dashboard. Please try again later.</AlertDescription>
            </Alert>
          )
        }
        account={
          canManageAccount ? (
            <ClientAccountView
              clientId={client.id}
              clientName={`${client.first_name} ${client.last_name}`.trim()}
              accountBalance={showMoney ? client.account_balance || 0 : 0}
              invoices={allInvoices}
              ledger={ledger}
              showMoney={showMoney}
              canManageAccount={canManageAccount}
            />
          ) : undefined
        }
      />
    </div>
  )
}
