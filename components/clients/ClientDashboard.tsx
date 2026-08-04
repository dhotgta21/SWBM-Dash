// components/clients/ClientDashboard.tsx
// Client Dashboard view — the new "Client Dashboard" tab on /clients.
//
// Mirrors the Invoices → Due Dashboard pattern: aggregate-level
// analytics that give the operator a quick read on the customer base
// without having to click into a list.
//
// Layout (top-to-bottom):
//
//   1. KPI strip — counts + outstanding totals (4 cards + an
//      onboarding pulse row when something needs attention).
//   2. Onboarding alerts — destructive alerts for AI-created rows
//      that need review, and an amber card for temporary (walk-in)
//      clients pending completion. Both previews link into the
//      relevant accounts list.
//   3. Top debtors — full width. Re-uses the same widget that
//      lives on the Analytics page so customer-level exposure looks
//      identical across the two surfaces. Hidden when the operator
//      cannot see money.
//   4. Recent clients — list of the most-recently-added permanent
//      accounts so the operator can see who joined recently.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Mail,
  Phone,
  UserPlus,
  Users,
} from 'lucide-react'

import { getOperatorContext } from '@/lib/auth/context'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'
import { canSeeClientMoney } from '@/lib/auth/permissions'
import {
  getClientDashboardMetrics,
  type ClientDashboardAlert,
  type ClientDashboardRecentClient,
} from '@/lib/client-dashboard'
import { loadMoneyCollectionSnapshot } from '@/lib/money-collection'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { TopDebtors } from '@/components/dashboard/TopDebtors'
import { ClientKpiStrip } from './ClientKpiStrip'
import {
  temporaryClientMissingFields,
  formatRelativeFromNow,
  type MissingFieldChip,
} from '@/lib/temporary'
import { cn, formatDate } from '@/lib/utils'

function clientFullName(c: { firstName: string | null; lastName: string | null; companyName: string | null }): string {
  return (
    c.companyName ||
    `${c.firstName || ''} ${c.lastName || ''}`.trim() ||
    'Unknown'
  )
}

export async function ClientDashboard() {
  // Defence-in-depth: the page already redirects without
  // see_clients, but the dashboard is also called from a server
  // context so a missing operator should bail out cleanly rather
  // than render an empty frame.
  const ctx = await getOperatorContext()
  if (!ctx) redirect(ADMIN_LOGIN_PATH)
  if (!ctx.permissions.see_clients) redirect('/invoices?view=due')

  const showMoney = canSeeClientMoney(ctx.permissions)
  // Top debtors needs invoices_see_money (the widget reads £
  // values) — operators with see_clients but not
  // invoices_see_money still get the dashboard shell, just
  // without the customer-exposure widget.
  const showTopDebtors = showMoney

  const [metrics, money] = await Promise.all([
    getClientDashboardMetrics(),
    showTopDebtors
      ? loadMoneyCollectionSnapshot({ topDebtorLimit: 5 })
      : Promise.resolve(null),
  ])

  const { kpis, aiReviewQueue, temporaryQueue, recentClients } = metrics

  const hasOnboardingAlerts = aiReviewQueue.length > 0 || temporaryQueue.length > 0

  return (
    <div className="space-y-6">
      <ClientKpiStrip
        totalClients={kpis.totalClients}
        activeClients={kpis.activeClients}
        withBalance={kpis.withBalance}
        totalOutstanding={kpis.totalOutstanding}
        averageBalance={kpis.averageBalance}
        aiReviewPending={kpis.aiReviewPending}
        temporaryPending={kpis.temporaryPending}
        showMoney={showMoney}
      />

      {hasOnboardingAlerts ? (
        <div className="space-y-3">
          {kpis.aiReviewPending > 0 ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <span className="font-semibold">
                  {kpis.aiReviewPending} AI-created client
                  {kpis.aiReviewPending === 1 ? '' : 's'} need
                  {kpis.aiReviewPending === 1 ? 's' : ''} review.
                </span>{' '}
                Confirm names, contact details and addresses before they are
                used on a customer-facing document.
                {aiReviewQueue.length > 0 ? (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Newest: {clientFullName(aiReviewQueue[0])}
                    {aiReviewQueue[0].createdAt ? (
                      <> · added {formatRelativeFromNow(aiReviewQueue[0].createdAt)}</>
                    ) : null}
                  </span>
                ) : null}
                <span className="mt-2 block">
                  <Button asChild size="sm" variant="outline">
                    <Link href="/clients?view=accounts">
                      Review AI clients
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </span>
              </AlertDescription>
            </Alert>
          ) : null}

          {temporaryQueue.length > 0 ? (
            <Card className="border-amber-200 bg-amber-50/60 p-0 shadow-none">
              <CardHeader className="border-b border-amber-200/70">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base text-amber-900">
                      <UserPlus className="h-4 w-4" />
                      Walk-in clients needing completion
                      <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full bg-amber-600 text-white text-[10px] font-bold">
                        {kpis.temporaryPending > 99 ? '99+' : kpis.temporaryPending}
                      </span>
                    </CardTitle>
                    <CardDescription className="text-amber-900/80">
                      Quick-add records from invoices/quotes. Click a row to fill
                      in contact details — saving promotes the record to a full
                      account automatically.
                    </CardDescription>
                  </div>
                  <Link
                    href="/clients?view=temporary"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900 hover:text-amber-950"
                  >
                    See all
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                {temporaryQueue.map((c) => (
                  <TempAlertRow key={c.id} client={c} />
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {showTopDebtors && money ? (
        <TopDebtors debtors={money.topDebtors} />
      ) : null}

      <RecentClientsCard clients={recentClients} />
    </div>
  )
}

function TempAlertRow({ client }: { client: ClientDashboardAlert }) {
  // The temp-fields helper was written before the camelCase
  // client-dashboard types existed; map back to its snake_case
  // shape so we don't have to touch shared helpers.
  const chips = temporaryClientMissingFields({
    email: client.email,
    phone: client.phone,
    company_name: client.companyName,
    address_line_1: client.addressLine1,
    postcode: client.postcode,
  })
  const name = clientFullName(client)
  return (
    <Link
      href={`/clients/${client.id}`}
      className="block rounded-lg border border-amber-200 bg-white p-3 transition-colors hover:border-amber-400 hover:shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground truncate">{name}</span>
            <span className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
              Temporary
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {client.phone ? (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {client.phone}
              </span>
            ) : null}
            {client.email ? (
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {client.email}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Added {formatRelativeFromNow(client.createdAt)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {chips.length > 0 ? (
              <>
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mr-1">
                  Missing:
                </span>
                {chips.map((chip: MissingFieldChip) => (
                  <span
                    key={chip.key}
                    className={cn(
                      'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                      chip.blocksPromotion
                        ? 'bg-destructive/10 text-destructive'
                        : 'border border-border bg-card text-muted-foreground'
                    )}
                  >
                    {chip.label}
                  </span>
                ))}
              </>
            ) : (
              <span className="text-xs font-medium text-success">
                Ready to promote — just needs a save.
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 self-center text-amber-900 font-medium text-sm">
          Complete &amp; promote
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  )
}

function RecentClientsCard({ clients }: { clients: ClientDashboardRecentClient[] }) {
  return (
    <Card className="border-border/70 bg-card p-0 shadow-none">
      <CardHeader className="border-b border-border/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Recent clients
            </CardTitle>
            <CardDescription>
              Most-recently-added account clients. Open a row to see their
              document history and outstanding balance.
            </CardDescription>
          </div>
          <Link
            href="/clients?view=accounts"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover"
          >
            See all accounts
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {clients.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            No account clients yet — add your first to see them here.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {clients.map((c) => {
              const name = clientFullName(c)
              return (
                <li key={c.id}>
                  <Link
                    href={`/clients/${c.id}`}
                    className="group flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-secondary/40 sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        {c.accountNumber ? (
                          <span>Account {c.accountNumber}</span>
                        ) : null}
                        {c.email ? (
                          <span className="truncate">{c.email}</span>
                        ) : null}
                        <span>Added {formatDate(c.createdAt)}</span>
                      </div>
                    </div>
                    <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:inline" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
