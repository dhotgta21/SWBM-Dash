import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOperatorContext } from '@/lib/auth/context'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'
import { canSeeClientMoney } from '@/lib/auth/permissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { EyebrowChip, PageHeader } from '@/components/ui/PageHeader'
import { formatCurrency, cn } from '@/lib/utils'
import { getCreditStatus } from '@/lib/client-credit'
import { buildClientSearchFilter, sanitizeLikeTerm } from '@/lib/search'
import {
  Search,
  Plus,
  Phone,
  Mail,
  MapPin,
  FileText,
  AlertTriangle,
  Zap,
  ArrowRight,
  UserPlus,
} from 'lucide-react'
import {
  temporaryClientMissingFields,
  formatRelativeFromNow,
  type MissingFieldChip,
} from '@/lib/temporary'
import { ClientsViewTabs, type ClientView } from '@/components/clients/ClientsViewTabs'
import { ClientDashboard } from '@/components/clients/ClientDashboard'

export const metadata = {
  title: 'Clients',
}

interface ClientsPageProps {
  searchParams: Promise<{ q?: string; view?: string; page?: string }>
}

interface ClientInvoiceRow {
  status: string
  type: string
  deleted_at: string | null
  total: number
  balance_due: number
  amount_paid: number
}

interface ClientRow {
  id: string
  first_name: string
  last_name: string
  company_name: string | null
  account_number: string | null
  phone: string | null
  email: string | null
  address_line_1: string | null
  postcode: string | null
  ai_created: boolean
  reviewed: boolean
  account_balance: number | null
  credit_limit: number | null
  invoices: ClientInvoiceRow[] | null
}

interface TempClientRow {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  company_name: string | null
  account_number: string | null
  address_line_1: string | null
  postcode: string | null
  created_at: string
  created_by: string | null
}

/**
 * Resolve which tab the URL is asking for. Falls back to 'dashboard' (the
 * new aggregate view) unless the URL explicitly says otherwise. When the
 * database has zero permanent accounts but some temporary ones, the temp
 * tab is auto-picked so the operator lands on the queue they actually
 * need to act on instead of staring at an empty dashboard.
 */
function resolveView(
  rawView: string | undefined,
  permanentCount: number,
  tempCount: number
): ClientView {
  if (rawView === 'dashboard') return 'dashboard'
  if (rawView === 'temporary') return 'temporary'
  if (rawView === 'accounts') return 'accounts'
  // No explicit view: prefer the dashboard unless the accounts list is
  // empty AND temps exist, in which case we drop the user straight into
  // the "things to do" queue.
  if (permanentCount === 0 && tempCount > 0) return 'temporary'
  return 'dashboard'
}

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  // Permission-aware gate: respect the admin's "see_clients" toggle
  // in Settings. Bouncing early with a redirect keeps the URL honest
  // if a staff bookmark lands on the page directly.
  const ctx = await getOperatorContext()
  if (!ctx) redirect(ADMIN_LOGIN_PATH)
  if (!ctx.permissions.see_clients) redirect('/invoices?view=due')

  const supabase = await createClient()
  const { q = '', view: rawView, page: pageParam } = await searchParams
  const query = q

  // Per-client money totals are hidden when the operator lacks
  // clients_see_money — invoice numbers stay visible because staff
  // need them to find a specific document.
  const showMoney = canSeeClientMoney(ctx.permissions)
  const canAddClient = ctx.isAdmin || ctx.permissions.clients_add

  // ---------- Header counts first (cheap head-only queries) ----------
  // The active view is resolved before any heavy data is fetched so each
  // tab only pays for the data it actually renders. Previously every render
  // fetched ALL clients with ALL their invoices plus the full temp list,
  // regardless of the active tab.
  const [
    { count: permanentCountRaw },
    { count: tempCountRaw },
    { count: aiReviewCountRaw },
  ] = await Promise.all([
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('is_temporary', false)
      .is('deleted_at', null),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('is_temporary', true)
      .is('deleted_at', null),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('is_temporary', false)
      .eq('ai_created', true)
      .eq('reviewed', false)
      .is('deleted_at', null),
  ])

  const permanentCount = permanentCountRaw ?? 0
  const tempCount = tempCountRaw ?? 0
  const aiClientsNeedingReviewCount = aiReviewCountRaw ?? 0
  const activeView = resolveView(rawView, permanentCount, tempCount)

  const sanitizedQuery = query.trim() ? sanitizeLikeTerm(query) : ''

  // ---------- Account clients (permanent) — paginated, accounts tab only ----------
  const ACCOUNTS_PAGE_SIZE = 60
  const accountsPage = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  let clients: ClientRow[] | null = null
  let accountsTotal = 0

  if (activeView === 'accounts') {
    let dbQuery = supabase
      .from('clients')
      // Permanent-only in the main list. Temporary clients live in their own
      // tab so the two "trade account vs walk-in" lists stay visually
      // separate (Selco / BNQ / Home Depot style). Embedded invoices come
      // along for the page's clients only (was: the whole book).
      .select('*, invoices(total, amount_paid, balance_due, status, type, deleted_at)', {
        count: 'exact',
      })
      .eq('is_temporary', false)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      // Unique tiebreaker so offset pagination can't skip/double rows.
      .order('id', { ascending: true })
      .range((accountsPage - 1) * ACCOUNTS_PAGE_SIZE, accountsPage * ACCOUNTS_PAGE_SIZE - 1)

    if (sanitizedQuery) {
      dbQuery = dbQuery.or(buildClientSearchFilter(sanitizedQuery))
    }

    const { data, count, error: clientsError } = await dbQuery
    if (clientsError) {
      console.error('Clients page load error:', clientsError)
      return (
        <div className="space-y-6">
          <Alert variant="destructive">
            <AlertDescription>Unable to load clients. Please try again later.</AlertDescription>
          </Alert>
        </div>
      )
    }
    clients = (data ?? []) as unknown as ClientRow[]
    accountsTotal = count ?? 0
  }

  // ---------- Temporary clients (walk-ins) — temporary tab only ----------
  let tempClients: TempClientRow[] = []

  if (activeView === 'temporary') {
    let tempQuery = supabase
      .from('clients')
      .select(
        'id, first_name, last_name, email, phone, company_name, account_number, address_line_1, postcode, created_at, created_by'
      )
      .eq('is_temporary', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (sanitizedQuery) {
      tempQuery = tempQuery.or(buildClientSearchFilter(sanitizedQuery))
    }

    const { data: tempClientsData, error: tempClientsError } = await tempQuery
    if (tempClientsError) {
      console.error('Clients page load error:', tempClientsError)
      return (
        <div className="space-y-6">
          <Alert variant="destructive">
            <AlertDescription>Unable to load clients. Please try again later.</AlertDescription>
          </Alert>
        </div>
      )
    }
    tempClients = (tempClientsData ?? []) as TempClientRow[]
  }

  const accountsTotalPages = Math.max(1, Math.ceil(accountsTotal / ACCOUNTS_PAGE_SIZE))

  // Out-of-range page (stale link, deleted clients): bounce to the last
  // valid page instead of showing a misleading empty state with no way back.
  if (activeView === 'accounts' && accountsTotal > 0 && accountsPage > accountsTotalPages) {
    redirect(
      `/clients?view=accounts&page=${accountsTotalPages}${query ? `&q=${encodeURIComponent(query)}` : ''}`
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<EyebrowChip label="Customers" tone="primary" />}
        title="Clients"
        description={(() => {
          if (permanentCount === 0 && tempCount === 0) {
            return 'No clients yet — add your first to get started.'
          }
          if (permanentCount === 0) {
            return `${tempCount} walk-in client${tempCount === 1 ? '' : 's'} pending completion.`
          }
          return `${permanentCount} client${permanentCount === 1 ? '' : 's'} on file${tempCount > 0 ? ` · ${tempCount} temporary pending` : ''}.`
        })()}
        actions={
          canAddClient ? (
            <Link href="/clients/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Client
              </Button>
            </Link>
          ) : null
        }
      />

      <ClientsViewTabs
        accountsCount={permanentCount}
        temporaryCount={tempCount}
        defaultView={activeView}
        resolvedView={activeView}
      />

      {activeView === 'dashboard' ? (
        <ClientDashboard />
      ) : activeView === 'accounts' ? (
        <div className="space-y-6">
          {aiClientsNeedingReviewCount > 0 ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {aiClientsNeedingReviewCount} client
                {aiClientsNeedingReviewCount === 1 ? '' : 's'} created by the AI assistant need
                {aiClientsNeedingReviewCount === 1 ? 's' : ''} review. Please confirm their details.
              </AlertDescription>
            </Alert>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Search account clients</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="flex flex-wrap gap-2">
                <input type="hidden" name="view" value={activeView} />
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    name="q"
                    defaultValue={query}
                    placeholder="Search by name, company, account number, phone or email..."
                    className="pl-9"
                  />
                </div>
                <Button type="submit">Search</Button>
              </form>
            </CardContent>
          </Card>

          {clients && clients.length > 0 ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {clients.map((client) => {
                const invoices = (client.invoices || []) as {
                  status: string
                  type: string
                  deleted_at: string | null
                  total: number
                  balance_due: number
                }[]
                const realInvoices = invoices.filter(
                  (i) =>
                    i.type === 'invoice' &&
                    i.status !== 'cancelled' &&
                    i.status !== 'draft' &&
                    !i.deleted_at
                )
                const totalInvoiced = realInvoices.reduce((sum, i) => sum + (i.total || 0), 0)
                const totalBalance = realInvoices.reduce((sum, i) => sum + (i.balance_due || 0), 0)
                const invoiceCount = realInvoices.length
                // Unified account view: one pot — wallet minus unpaid invoices.
                const credit = getCreditStatus(client.account_balance || 0, totalBalance, client.credit_limit)

                return (
                  <Link key={client.id} href={`/clients/${client.id}`}>
                    <Card className="group relative h-full overflow-hidden hover:shadow-md hover:border-primary/40 transition-all cursor-pointer">
                      <div
                        aria-hidden
                        className={cn(
                          'pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-50 blur-2xl',
                          totalBalance > 0 ? 'bg-destructive/10' : 'bg-success/10'
                        )}
                      />
                      <CardContent className="relative p-5 space-y-3">
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground truncate">
                              {client.first_name} {client.last_name}
                            </h3>
                            {client.company_name ? (
                              <p className="text-sm text-muted-foreground truncate">{client.company_name}</p>
                            ) : (
                              <p className="text-sm text-muted-foreground italic">No company</p>
                            )}
                            {client.account_number && (
                              <p className="text-xs text-muted-foreground">Account {client.account_number}</p>
                            )}
                            {client.ai_created && !client.reviewed && (
                              <Badge variant="destructive" className="mt-2 gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                AI created — review needed
                              </Badge>
                            )}
                            {showMoney && credit.overLimit && (
                              <Badge variant="destructive" className="mt-2 gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Over limit by {formatCurrency(credit.overBy)}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1 text-xs text-muted-foreground">
                          {client.phone && (
                            <div className="flex items-center gap-2 truncate">
                              <Phone className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{client.phone}</span>
                            </div>
                          )}
                          {client.email && (
                            <div className="flex items-center gap-2 truncate">
                              <Mail className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{client.email}</span>
                            </div>
                          )}
                          {(client.address_line_1 || client.postcode) && (
                            <div className="flex items-center gap-2 truncate">
                              <MapPin className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">
                                {[client.address_line_1, client.postcode].filter(Boolean).join(', ')}
                              </span>
                            </div>
                          )}
                        </div>

                        {showMoney ? (
                          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border">
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Total Sales
                              </p>
                              <p className="mt-0.5 text-sm font-semibold text-foreground">
                                {formatCurrency(totalInvoiced)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Outstanding
                              </p>
                              <p
                                className={cn(
                                  'mt-0.5 text-sm font-semibold',
                                  totalBalance > 0 ? 'text-destructive' : 'text-foreground'
                                )}
                              >
                                {formatCurrency(totalBalance)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Account
                              </p>
                              <p
                                className={cn(
                                  'mt-0.5 text-sm font-semibold',
                                  credit.net < 0
                                    ? 'text-destructive'
                                    : credit.net > 0
                                      ? 'text-success'
                                      : 'text-foreground'
                                )}
                                title={`${formatCurrency(client.account_balance || 0)} in account · ${formatCurrency(totalBalance)} owed`}
                              >
                                {formatCurrency(credit.net)}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="pt-3 border-t border-border">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              Invoices on file
                            </p>
                            <p className="mt-0.5 text-sm font-semibold text-foreground">
                              {invoiceCount} {invoiceCount === 1 ? 'document' : 'documents'}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>

            {accountsTotalPages > 1 ? (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Page {accountsPage} of {accountsTotalPages} · {accountsTotal} client
                  {accountsTotal === 1 ? '' : 's'}
                </span>
                <div className="flex gap-2">
                  {accountsPage > 1 ? (
                    <Link
                      href={`/clients?view=accounts&page=${accountsPage - 1}${query ? `&q=${encodeURIComponent(query)}` : ''}`}
                    >
                      <Button variant="outline" size="sm">
                        Previous
                      </Button>
                    </Link>
                  ) : null}
                  {accountsPage < accountsTotalPages ? (
                    <Link
                      href={`/clients?view=accounts&page=${accountsPage + 1}${query ? `&q=${encodeURIComponent(query)}` : ''}`}
                    >
                      <Button variant="outline" size="sm">
                        Next
                      </Button>
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              {query
                ? 'No matching account clients.'
                : 'No account clients yet — add one above or capture a walk-in from any invoice or quote.'}
            </div>
          )}
        </div>
      ) : (
        // -------- Temporary tab --------
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Search temporary clients</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="flex flex-wrap gap-2">
                <input type="hidden" name="view" value={activeView} />
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    name="q"
                    defaultValue={query}
                    placeholder="Search by name, company, account number, phone or email..."
                    className="pl-9"
                  />
                </div>
                <Button type="submit">Search</Button>
              </form>
            </CardContent>
          </Card>

          {tempClients.length > 0 ? (
            <Card className="border-amber-200 bg-amber-50/60">
              <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-700" />
                  <CardTitle className="text-amber-900">
                    Walk-in clients needing completion ({tempClients.length})
                  </CardTitle>
                </div>
                <p className="text-xs text-amber-900/80">
                  Quick-add records from invoices/quotes. Click any row to fill in contact details — save promotes it to a full account automatically.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {tempClients.map((c) => {
                  const chips = temporaryClientMissingFields(c)
                  return (
                    <Link
                      key={c.id}
                      href={`/clients/${c.id}`}
                      className="block rounded-lg border border-amber-200 bg-white p-3 hover:border-amber-400 hover:shadow-sm transition-colors"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <UserPlus className="h-4 w-4 text-amber-700 shrink-0" />
                            <span className="font-semibold text-foreground truncate">
                              {c.first_name} {c.last_name}
                            </span>
                            <Badge
                              variant="outline"
                              className="border-amber-300 text-amber-900 bg-amber-50 text-[10px] uppercase tracking-wide"
                            >
                              Temporary
                            </Badge>
                            {c.account_number && (
                              <span className="text-xs text-muted-foreground">
                                Account {c.account_number}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {c.phone ? (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {c.phone}
                              </span>
                            ) : null}
                            <span>Added {formatRelativeFromNow(c.created_at)}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mr-1">
                              Missing:
                            </span>
                            {chips.length > 0 ? (
                              chips.map((chip: MissingFieldChip) => (
                                <Badge
                                  key={chip.key}
                                  variant={chip.blocksPromotion ? 'destructive' : 'outline'}
                                  className="text-[10px] font-medium"
                                >
                                  {chip.label}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-success">Ready to promote — just needs a save.</span>
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
                })}
              </CardContent>
            </Card>
          ) : (
            <div className="text-center py-12 text-muted-foreground rounded-lg border border-dashed border-amber-200 bg-amber-50/40">
              <Zap className="mx-auto h-8 w-8 text-amber-500/70" />
              <p className="mt-3 text-sm font-medium text-foreground">No temporary clients pending.</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                {query
                  ? 'No matches in the walk-in queue.'
                  : 'Walk-in clients captured from invoices or quotes will appear here until they are promoted to a full account.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}