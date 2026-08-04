import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { withQueryRetry } from '@/lib/supabase/with-query-retry'
import { getOperatorContext } from '@/lib/auth/context'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'
import { canSeeClientMoney, canSeeInvoiceMoney } from '@/lib/auth/permissions'
import { mapChannel } from '@/lib/company'
import { InvoiceForm } from '@/components/invoices/InvoiceForm'
import { PaymentRecorder } from '@/components/invoices/PaymentRecorder'
import { PaymentHistory } from '@/components/invoices/PaymentHistory'
import { InvoicePdfActions } from '@/components/invoices/InvoicePdf'
import { ConvertQuoteButton } from '@/components/invoices/ConvertQuoteButton'
import { DeleteInvoiceButton } from '@/components/invoices/DeleteInvoiceButton'
import { InvoiceShareSettings } from '@/components/invoices/InvoiceShareSettings'
import { InvoiceWatermarkSettings } from '@/components/invoices/InvoiceWatermarkSettings'
import { InvoiceDetailTabs } from '@/components/invoices/InvoiceDetailTabs'
import { InvoiceLoadsPanel } from '@/components/invoices/InvoiceLoadsPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  formatCurrency,
  formatDate,
  getInvoiceDisplayStatus,
  PAYMENT_STATUS_STYLES,
  getDeliveryStatus,
  DELIVERY_STATUS_STYLES,
  DELIVERY_STATUS_LABELS,
  cn,
} from '@/lib/utils'
import { getCreditStatus } from '@/lib/client-credit'
import { getInvoiceLoads, getInvoiceStockReviews } from '@/lib/actions/picker'
import { InvoiceShortShipReview } from '@/components/invoices/InvoiceShortShipReview'
import { isHardLocked } from '@/lib/invoice-status'
import { baseUrlFromRequest } from '@/lib/share/invoice-url'
import { ArrowLeft, FileText, AlertTriangle } from 'lucide-react'

export const metadata = {
  title: 'Invoice Details',
}

interface InvoiceDetailPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

function clientName(client: { company_name?: string | null; first_name?: string | null; last_name?: string | null } | null | undefined) {
  return (
    client?.company_name ||
    `${client?.first_name || ''} ${client?.last_name || ''}`.trim() ||
    'Unknown'
  )
}

interface InvoiceItemRow {
  id: string
  quantity: number
  product_name: string
  product_code: string | null
  price: number
  line_total: number
}

function DesktopLineItemsTable({ rows, showMoney }: { rows: InvoiceItemRow[]; showMoney: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Qty</TableHead>
          <TableHead>Product</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((item) => (
          <TableRow key={item.id}>
            <TableCell>{item.quantity}</TableCell>
            <TableCell>
              {item.product_name}
              {item.product_code && <span className="text-xs text-muted-foreground ml-2">{item.product_code}</span>}
            </TableCell>
            <TableCell className="text-right">{showMoney ? formatCurrency(item.price) : '—'}</TableCell>
            <TableCell className="text-right">{showMoney ? formatCurrency(item.line_total) : '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function MobileLineItemCard({ item, showMoney }: { item: InvoiceItemRow; showMoney: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground truncate">{item.product_name}</p>
        {item.product_code && <p className="text-xs text-muted-foreground truncate">{item.product_code}</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          {item.quantity} × {showMoney ? formatCurrency(item.price) : '—'}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-semibold text-foreground">{showMoney ? formatCurrency(item.line_total) : '—'}</p>
      </div>
    </div>
  )
}

export default async function InvoiceDetailPage({ params, searchParams }: InvoiceDetailPageProps) {
  const { id } = await params
  const { tab } = await searchParams
  const defaultTab: 'overview' | 'payments' | 'loads' | 'edit' =
    tab === 'edit' || tab === 'payments' || tab === 'loads' || tab === 'overview' ? tab : 'overview'

  const h = await headers()
  const host = h.get('host') || 'localhost'
  const headersObj = new Headers()
  h.forEach((value, key) => headersObj.set(key, value))
  const baseUrl = baseUrlFromRequest(new Request(`http://${host}`, { headers: headersObj }))

  const ctx = await getOperatorContext()
  if (!ctx) redirect(ADMIN_LOGIN_PATH)
  if (!ctx.permissions.see_invoices) redirect(ADMIN_LOGIN_PATH)

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect(ADMIN_LOGIN_PATH)
  }

  let invoice
  let company
  let bankDetails
  let loads: Awaited<ReturnType<typeof getInvoiceLoads>>['loads'] = []
  let shortShipReviews: Awaited<ReturnType<typeof getInvoiceStockReviews>>['reviews'] = []
  const logoSrc: string | null = '/Logo.webp'
  let loadError = false

  try {
    const invoiceResult = await supabase
      .from('invoices')
      .select('*, clients(*), invoice_items(*), payments(*)')
      .eq('id', id)
      .is('deleted_at', null)
      .order('sort_order', { referencedTable: 'invoice_items', ascending: true })
      .single()

    if (invoiceResult.error) throw invoiceResult.error
    invoice = invoiceResult.data

    // Load company settings + bank + contact channels the same way as the
    // create page. Without phones/emails mapped through mapChannel the
    // invoice PDF/preview cannot show the address block contacts or
    // channel-filtered numbers from Company Settings.
    const [companyResult, bankResult, phonesResult, emailsResult] = await Promise.all([
      withQueryRetry('company_settings (invoice detail)', () =>
        supabase.from('company_settings').select('*').maybeSingle()
      ),
      withQueryRetry('company_bank_details (invoice detail)', () =>
        supabase.from('company_bank_details').select('*').maybeSingle()
      ),
      supabase
        .from('company_phones')
        .select('*')
        .eq('settings_id', 1)
        .order('sort_order', { ascending: true }),
      supabase
        .from('company_emails')
        .select('*')
        .eq('settings_id', 1)
        .order('sort_order', { ascending: true }),
    ])

    if (phonesResult.error) {
      console.error('Failed to load company_phones for invoice:', phonesResult.error)
    }
    if (emailsResult.error) {
      console.error('Failed to load company_emails for invoice:', emailsResult.error)
    }

    const phones = phonesResult.data?.map((row) => mapChannel(row as Record<string, unknown>)) ?? []
    const emails = emailsResult.data?.map((row) => mapChannel(row as Record<string, unknown>)) ?? []
    company = companyResult.data
      ? { ...companyResult.data, phones, emails }
      : { phones, emails }
    bankDetails = bankResult.data ?? {}

    const loadsResult = await getInvoiceLoads(id)
    if (loadsResult.error) {
      // A loads failure should not prevent the rest of the invoice from
      // rendering; fall back to an empty loads list.
      console.error('Failed to load delivery history:', loadsResult.error)
    } else {
      loads = loadsResult.loads ?? []
    }

    const reviewsResult = await getInvoiceStockReviews(id)
    if (reviewsResult.error) {
      console.error('Failed to load short-ship reviews:', reviewsResult.error)
    } else {
      shortShipReviews = reviewsResult.reviews ?? []
    }
  } catch (error) {
    const errorDetails = {
      message: error instanceof Error ? error.message : undefined,
      code: error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : undefined,
      details: error && typeof error === 'object' && 'details' in error ? (error as { details?: unknown }).details : undefined,
      hint: error && typeof error === 'object' && 'hint' in error ? (error as { hint?: unknown }).hint : undefined,
      raw: error,
    }
    console.error('Failed to load invoice:', errorDetails)
    loadError = true
  }

  // Brand logo is a static asset in /public — Logo.webp.

  if (loadError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/invoices">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
        </div>
        <Alert variant="destructive">
          <AlertDescription>
            Unable to load this document. The invoice may have been removed, or there may be a
            temporary connection problem. Check the browser console for details and try again.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!invoice) {
    notFound()
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .maybeSingle()

  const operatorName = profile?.full_name || 'Unknown Operator'
  const displayOperatorName =
    invoice.operator_name && invoice.operator_name !== 'Unknown Operator'
      ? invoice.operator_name
      : operatorName

  // InvoiceForm's `isAdmin` flag only matters for converted quotes now;
  // 'sent' is treated as a tag and no longer soft-locks the document.
  // That's intentionally admin-only and not in the perms matrix — staff
  // never get to edit converted quotes regardless of what the admin toggles.
  // Hard-locked invoices (paid / partial) are never editable, so the edit
  // tab is hidden entirely for them.
  const isAdmin = ctx.isAdmin
  // Per-capability flags drive the UI hide/show below. Each is
  // enforced server-side as well — the UI gate is just polish so
  // staff don't see buttons that would immediately 403.
  const canEditDoc = isAdmin || ctx.permissions.invoices_edit
  const editAllowed = canEditDoc && !isHardLocked(invoice.status)
  const canDeleteDoc = isAdmin || ctx.permissions.invoices_delete
  const canChangeStatus = isAdmin || ctx.permissions.invoices_change_status
  const canSendEmail = isAdmin || ctx.permissions.invoices_send_email
  const canRecordPayment = isAdmin || ctx.permissions.invoices_record_payment
  const canManageSharing = isAdmin || ctx.permissions.invoices_manage_sharing
  const canConvertQuote = isAdmin || ctx.permissions.invoices_convert_quote
  const showMoney = canSeeInvoiceMoney(ctx.permissions)
  // "Pay from client account" requires the wallet permission + the right to see
  // client money; the confirmation dialog exposes the balance.
  const canPayFromAccount =
    isAdmin || (ctx.permissions.clients_manage_account && canSeeClientMoney(ctx.permissions))

  const invoiceClient = Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients
  const clientAccountBalance = invoiceClient?.account_balance || 0
  const clientDisplayName = clientName(invoiceClient)

  const paymentStatus = getInvoiceDisplayStatus(invoice.status, invoice.amount_paid, invoice.total, invoice.due_date)
  const deliveryStatus = getDeliveryStatus(invoice.status, invoice.picking_status)
  const isQuote = invoice.type === 'quotation'
  const canMarkDelivered = isAdmin || ctx.permissions.invoices_change_status

  // Account-level credit check: flag the whole client ACCOUNT (not this
  // invoice) when their net position (wallet − unpaid invoices) drops below
  // the overdraft limit.
  let clientCredit = { net: 0, overLimit: false, overBy: 0 }
  if (showMoney && !isQuote && invoiceClient?.credit_limit != null) {
    const { data: clientOpenInvoices } = await supabase
      .from('invoices')
      .select('balance_due')
      .eq('client_id', invoice.client_id)
      .eq('type', 'invoice')
      .is('deleted_at', null)
      .neq('status', 'draft')
      .neq('status', 'cancelled')
    const outstanding = (clientOpenInvoices ?? []).reduce((sum, i) => sum + (i.balance_due || 0), 0)
    clientCredit = getCreditStatus(clientAccountBalance, outstanding, invoiceClient.credit_limit)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/invoices">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" />
              {invoice.document_number}
            </h1>
            <p className="text-sm text-muted-foreground capitalize">{invoice.type}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex px-3 py-1 rounded-full text-sm font-medium capitalize',
              PAYMENT_STATUS_STYLES[paymentStatus as keyof typeof PAYMENT_STATUS_STYLES]
            )}
          >
            {paymentStatus}
          </span>
          {!isQuote && (
            <span
              className={cn(
                'inline-flex px-3 py-1 rounded-full text-sm font-medium',
                DELIVERY_STATUS_STYLES[deliveryStatus]
              )}
              title="Delivery status"
            >
              {DELIVERY_STATUS_LABELS[deliveryStatus]}
            </span>
          )}
        </div>
      </div>

      {clientCredit.overLimit && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{clientDisplayName}</strong> is{' '}
            <strong>{formatCurrency(clientCredit.overBy)} past their overdraft limit</strong>.
            Collect the outstanding balance before extending more credit.
          </AlertDescription>
        </Alert>
      )}

      {!isQuote && shortShipReviews && shortShipReviews.length > 0 && (
        <InvoiceShortShipReview
          invoiceId={invoice.id}
          reviews={shortShipReviews}
          canResolve={canEditDoc || canChangeStatus}
        />
      )}

<div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {/* Tabs separate the read-only summary (Overview), money
              activity (Payments — hidden for quotations), and the
              mutation surface (Edit). The right sidebar stays as the
              always-visible operational panel (share + actions). */}
          <InvoiceDetailTabs
            defaultTab={isQuote && defaultTab === 'payments' ? 'overview' : defaultTab}
            payments={isQuote ? null : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Payment Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-medium text-foreground">{showMoney ? formatCurrency(invoice.total) : '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Paid</span>
                      <span className="font-medium text-success">{showMoney ? formatCurrency(invoice.amount_paid) : '—'}</span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-2">
                      <span className="text-muted-foreground">Balance</span>
                      <span className={cn('font-bold', invoice.balance_due > 0 ? 'text-destructive' : 'text-success')}>
                        {showMoney ? formatCurrency(invoice.balance_due) : '—'}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {canRecordPayment && showMoney && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Record Payment</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <PaymentRecorder
                        invoiceId={invoice.id}
                        documentNumber={invoice.document_number}
                        balanceDue={invoice.balance_due}
                        clientId={invoice.client_id}
                        clientName={clientDisplayName}
                        accountBalance={clientAccountBalance}
                        canPayFromAccount={canPayFromAccount}
                      />
                    </CardContent>
                  </Card>
                )}

                {showMoney && invoice.payments && invoice.payments.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Payment History</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <PaymentHistory
                        payments={invoice.payments}
                        invoiceId={invoice.id}
                        canDelete={ctx.isAdmin || ctx.permissions.invoices_delete_payment}
                      />
                    </CardContent>
                  </Card>
                )}
              </>
            )}
            overview={
              /* Invoice Overview — read-only snapshot of the document.
                 Combines what used to be the "Document Details" and
                 "Line Items" cards into one cohesive section so the
                 user sees the full picture of the invoice in a single
                 glance. */
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle>Invoice Overview</CardTitle>
                      <CardDescription>
                        Read-only summary of {invoice.document_number}
                      </CardDescription>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Read-only
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Parties & Dates — who, when, and reference numbers. */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      Parties &amp; Dates
                    </h4>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-sm text-muted-foreground">Client</p>
                        {(() => {
                          const client = Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients
                          return <p className="font-medium text-foreground">{clientName(client)}</p>
                        })()}
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Issue Date</p>
                        <p className="font-medium text-foreground">{formatDate(invoice.issue_date)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{isQuote ? 'Expiry Date' : 'Due Date'}</p>
                        <p className="font-medium text-foreground">{formatDate(invoice.due_date || invoice.expiry_date)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Operator</p>
                        <p className="font-medium text-foreground">{displayOperatorName}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Order Number</p>
                        <p className="font-medium text-foreground">{invoice.order_number || '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Account Number</p>
                        <p className="font-medium text-foreground">{invoice.account_number || '-'}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-sm text-muted-foreground">Fulfilment</p>
                        {invoice.delivery_method === 'collection' ? (
                          <p className="font-medium text-foreground">
                            Collection — pick up from{' '}
                            {[
                              company?.company_name || 'Head Office',
                              company?.address_line_1,
                              company?.address_line_2,
                              company?.town,
                              company?.county,
                              company?.postcode,
                            ]
                              .filter(Boolean)
                              .join(', ')}
                          </p>
                        ) : (
                          <p className="font-medium text-foreground">
                            {[
                              invoice.delivery_address_line_1,
                              invoice.delivery_address_line_2,
                              invoice.delivery_town,
                              invoice.delivery_county,
                              invoice.delivery_postcode,
                            ]
                              .filter(Boolean)
                              .join(', ') || 'Delivery address not set'}
                          </p>
                        )}
                      </div>
                    </div>
                    {invoice.notes && (
                      <div className="mt-4 pt-4 border-t border-border">
                        <p className="text-sm text-muted-foreground">Notes</p>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{invoice.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Subtle divider between the two halves of the overview. */}
                  <div className="border-t border-border" />

                  {/* Line Items — the products on this invoice with totals. */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      Line Items
                    </h4>
                    <ResponsiveTable
                      rows={(invoice.invoice_items as InvoiceItemRow[] | undefined) ?? []}
                      keyField="id"
                      renderDesktop={(rows) => <DesktopLineItemsTable rows={rows} showMoney={showMoney} />}
                      renderMobile={(item) => <MobileLineItemCard item={item} showMoney={showMoney} />}
                    />
                    <div className="mt-4 space-y-2 max-w-full sm:max-w-xs ml-auto">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-medium text-foreground">{showMoney ? formatCurrency(invoice.subtotal) : '—'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">VAT</span>
                        <span className="font-medium text-foreground">{showMoney ? formatCurrency(invoice.vat_total) : '—'}</span>
                      </div>
                      <div className="flex justify-between text-lg font-bold border-t border-border pt-2 text-foreground">
                        <span>Total</span>
                        <span>{showMoney ? formatCurrency(invoice.total) : '—'}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            }
            loads={isQuote ? null : (
              <InvoiceLoadsPanel
                invoiceId={invoice.id}
                pickingStatus={invoice.picking_status}
                loads={loads || []}
                canMarkDelivered={canMarkDelivered}
                canManageLoads={
                  canEditDoc &&
                  ['sent', 'partial'].includes(invoice.status) &&
                  invoice.picking_status !== 'delivered'
                }
                canAssignDriver={
                  (canEditDoc || canChangeStatus) &&
                  ['sent', 'partial'].includes(invoice.status) &&
                  invoice.picking_status !== 'delivered'
                }
              />
            )}
            edit={
              editAllowed
                ? /* Edit Document — its own dedicated tab. The mutation
                     surface is intentionally separated from the read-only
                     Overview so users can't accidentally edit something
                     they're just trying to read. */
                  <Card>
                    <CardHeader>
                      <CardTitle>Edit Document</CardTitle>
                      <CardDescription>
                        Make changes to this {invoice.type}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <InvoiceForm
                        initialData={invoice}
                        operatorName={operatorName}
                        company={company}
                        bankDetails={bankDetails}
                        logoSrc={logoSrc}
                        isAdmin={isAdmin}
                        canSendEmail={canSendEmail}
                        canChangeStatus={canChangeStatus}
                        defaultVatRate={
                          company &&
                          typeof company === 'object' &&
                          'default_vat_rate' in company &&
                          company.default_vat_rate != null
                            ? Number(company.default_vat_rate)
                            : 20
                        }
                      />
                    </CardContent>
                  </Card>
                : null
            }
          />
        </div>

        {/* Right sidebar — always-visible operational panel.
            Sharing + actions stay one click away no matter which tab
            is active. Money stuff moved into the Payments tab. */}
        <div className="space-y-6">
          <InvoiceShareSettings
            invoiceId={invoice.id}
            shareToken={invoice.share_token}
            shareKey={invoice.public_share_key}
            publicShareEnabled={invoice.public_share_enabled}
            deliveryNoteShareEnabled={invoice.delivery_note_share_enabled}
            shareTokenExpiresAt={invoice.share_token_expires_at}
            shareTokenCreatedAt={invoice.share_token_created_at}
            publicShareRequiresPassword={invoice.public_share_requires_password}
            deliveryNoteShareRequiresPassword={invoice.delivery_note_share_requires_password}
            canManage={canManageSharing}
            baseUrl={baseUrl}
          />

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InvoicePdfActions
                invoice={invoice}
                company={company}
                bankDetails={bankDetails}
                logoSrc={logoSrc}
                canSendEmail={canSendEmail}
              />
              {/* Status-stamp toggles (PAID / PARTIALLY PAID / OVERDUE).
                  Lives inside the actions card so it's right below the
                  Download/Preview/Print buttons + the email-needed alert,
                  exactly where the user wanted it. Gated by invoices_edit
                  (or admin) — the toggle UI hides controls when the
                  operator lacks the permission. */}
              {!isQuote && (
                <div className="pt-3 border-t border-border">
                  <InvoiceWatermarkSettings
                    invoiceId={invoice.id}
                    status={invoice.status}
                    showPaidWatermark={invoice.show_paid_watermark}
                    showPartiallyPaidWatermark={invoice.show_partially_paid_watermark}
                    showOverdueWatermark={invoice.show_overdue_watermark}
                    statusStampsEnabled={invoice.status_stamps_enabled}
                    statusStampsMode={
                      invoice.status_stamps_mode === 'manual' ? 'manual' : 'auto'
                    }
                    canManage={canEditDoc || isAdmin}
                  />
                </div>
              )}
              {isQuote && invoice.status !== 'converted' && canConvertQuote && (
                <ConvertQuoteButton quoteId={invoice.id} />
              )}
              {/* Destructive action — visible when the operator has
                  invoices_delete permission (default off for staff).
                  The server action also enforces this as a backstop —
                  we never trust the UI gate alone. */}
              {canDeleteDoc && (
                <div className="pt-2 border-t border-border">
                  <DeleteInvoiceButton
                    invoiceId={invoice.id}
                    documentNumber={invoice.document_number}
                    documentType={invoice.type as 'invoice' | 'quotation'}
                    isAdmin={isAdmin}
                    requiresConfirmation={
                      ['paid', 'partial', 'converted'].includes(invoice.status) ||
                      (invoice.amount_paid ?? 0) > 0
                    }
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
