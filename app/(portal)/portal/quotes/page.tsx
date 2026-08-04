// app/(portal)/portal/quotes/page.tsx
// List of authenticated quote requests created by the client.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { EyebrowChip } from '@/components/ui/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FileText, Plus, ArrowRight, Clock, CheckCircle2, XCircle, HelpCircle } from 'lucide-react'

export const metadata = {
  title: 'My Quotes',
}

const STATUS_STYLES: Record<string, { tone: string; icon: typeof HelpCircle; label: string }> = {
  pending: { tone: 'text-warning bg-warning/10', icon: Clock, label: 'Pending' },
  quoted: { tone: 'text-primary bg-primary/10', icon: FileText, label: 'Quoted' },
  ordered: { tone: 'text-success bg-success/10', icon: CheckCircle2, label: 'Ordered' },
  rejected: { tone: 'text-muted-foreground bg-muted', icon: XCircle, label: 'Rejected' },
  cancelled: { tone: 'text-muted-foreground bg-muted', icon: XCircle, label: 'Cancelled' },
}

interface ClientQuote {
  id: string
  reference_number: string
  status: string
  items: Array<{ product_name: string; quantity: number }>
  delivery_address: {
    label?: string
    address_line_1?: string
    address_line_2?: string | null
    town?: string
    county?: string | null
    postcode?: string
  } | null
  notes: string | null
  created_at: string
}

function formatDeliveryAddress(address: ClientQuote['delivery_address']): string | null {
  if (!address) return null
  const parts = [
    address.address_line_1,
    address.address_line_2,
    address.town,
    address.county,
    address.postcode,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

export default async function PortalQuotesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id')
    .eq('id', user.id)
    .maybeSingle()

  const clientId = profile?.client_id
  if (!clientId) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Your portal account is not linked to a customer record yet. Please contact us to finish
          setting up your account.
        </AlertDescription>
      </Alert>
    )
  }

  const { data: quotes, error } = await supabase
    .from('client_quotes')
    .select('id, reference_number, status, items, delivery_address, notes, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Could not load your quotes. Please try again later.</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 border-b border-border/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <EyebrowChip label="Tools" tone="info" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.7rem]">
            My quotes
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Quote requests you have submitted and their current status.
          </p>
        </div>
        <Link
          href="/portal/quotes/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" />
          New quote
        </Link>
      </header>

      {(quotes?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <p className="mt-3 text-sm text-muted-foreground">
              No quotes yet. Create a new quote request and we will get back to you with trade
              pricing.
            </p>
            <div className="mt-5">
              <Link href="/portal/quotes/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create a quote
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {quotes?.map((quote) => {
            const style = STATUS_STYLES[quote.status] ?? STATUS_STYLES.pending
            const Icon = style.icon
            return (
              <Card key={quote.id}>
                <CardContent className="p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-foreground">{quote.reference_number}</h2>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style.tone}`}
                        >
                          <Icon className="h-3 w-3" />
                          {style.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Submitted {new Date(quote.created_at).toLocaleDateString('en-GB')}
                      </p>
                      <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                        {(quote.items as ClientQuote['items']).slice(0, 3).map((item, idx) => (
                          <li key={idx}>
                            {item.product_name} × {item.quantity}
                          </li>
                        ))}
                        {(quote.items as ClientQuote['items']).length > 3 && (
                          <li>
                            +{(quote.items as ClientQuote['items']).length - 3} more items
                          </li>
                        )}
                      </ul>
                      {formatDeliveryAddress(quote.delivery_address as ClientQuote['delivery_address']) && (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Deliver to: {formatDeliveryAddress(quote.delivery_address as ClientQuote['delivery_address'])}
                        </p>
                      )}
                      {quote.notes && (
                        <p className="mt-2 text-sm text-muted-foreground">{quote.notes}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div className="flex justify-start">
        <Link
          href="/portal/tools"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
        >
          Back to tools
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
