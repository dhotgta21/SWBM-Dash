'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { BarChart3, User, Wallet } from 'lucide-react'

interface ClientDetailTabsProps {
  /** Number of invoices to render in the "Account" tab badge. */
  invoiceCount: number
  /** Panel for the "Client Details" tab — Summary metrics + Edit form + Portal invite + Actions. */
  details: React.ReactNode
  /** Panel for the "Client Dashboard" tab — client analytics and KPIs. */
  dashboard: React.ReactNode
  /** Panel for the "Account" tab — wallet balance, deposits, invoice payments, ledger. */
  account: React.ReactNode
}

/**
 * Three-tab strip on the client detail page:
 *   - "Client Details"   → Summary, edit form, portal invite, actions.
 *   - "Client Dashboard" → Client-level analytics and charts.
 *   - "Account"          → Wallet balance, deposits, paying invoices, ledger.
 *
 * Uncontrolled (no URL sync) because tab choice here is ephemeral UI state,
 * not a shareable view. Switching tabs preserves form state — Radix keeps
 * inactive `TabsContent` mounted and just toggles `data-state`, so the
 * user doesn't lose unsaved edits when glancing at another tab.
 */
export function ClientDetailTabs({ invoiceCount, details, dashboard, account }: ClientDetailTabsProps) {
  return (
    <Tabs defaultValue="details">
      <TabsList className="h-auto p-1 rounded-lg border border-border bg-card overflow-x-auto max-w-full w-full sm:w-auto">
        <TabsTrigger
          value="details"
          className={cn(
            'inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
            'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground',
            'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-secondary'
          )}
        >
          <User className="w-4 h-4" />
          Client Details
        </TabsTrigger>
        <TabsTrigger
          value="dashboard"
          className={cn(
            'inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
            'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground',
            'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-secondary'
          )}
        >
          <BarChart3 className="w-4 h-4" />
          Client Dashboard
        </TabsTrigger>
        {account && (
          <TabsTrigger
            value="account"
            className={cn(
              'group inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
              'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground',
              'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-secondary'
            )}
          >
            <Wallet className="w-4 h-4" />
            Account
            {invoiceCount > 0 && (
              <span
                className={cn(
                  'inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-[10px] font-semibold',
                  'bg-background/60 text-muted-foreground',
                  'group-data-[state=active]:bg-primary-foreground group-data-[state=active]:text-primary'
                )}
              >
                {invoiceCount}
              </span>
            )}
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="details" className="mt-4 space-y-6 focus-visible:outline-none">
        {details}
      </TabsContent>
      <TabsContent value="dashboard" className="mt-4 space-y-6 focus-visible:outline-none">
        {dashboard}
      </TabsContent>
      {account && (
        <TabsContent value="account" className="mt-4 space-y-6 focus-visible:outline-none">
          {account}
        </TabsContent>
      )}
    </Tabs>
  )
}
