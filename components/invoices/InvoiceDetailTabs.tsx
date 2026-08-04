// components/invoices/InvoiceDetailTabs.tsx
//
// Client-side tab shell for the invoice detail page. Renders Overview,
// Payments, Loads & delivery, and an Edit tab only when the page supplies one.
// Keeping the tabs as a thin client wrapper means the inner card JSX can stay
// server-rendered and only the tab-switching logic crosses the boundary.
//
// The active tab can be pre-selected via the `defaultTab` prop so the server
// page can honour a ?tab=edit deep-link. If a tab is hidden, a deep-link to it
// gracefully falls back to Overview.

'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReactNode } from 'react'

interface InvoiceDetailTabsProps {
  overview: ReactNode
  payments: ReactNode | null
  loads: ReactNode | null
  edit: ReactNode | null
  defaultTab?: 'overview' | 'payments' | 'loads' | 'edit'
  /**
   * Quotations don't have a Payments tab (no money collected, no
   * PaymentRecorder, no PaymentHistory). Paid / partial invoices don't have
   * an Edit tab because the document is locked once payment is recorded.
   * The page decides these and passes `null` to hide the tab entirely.
   */
}

export function InvoiceDetailTabs({ overview, payments, loads, edit, defaultTab = 'overview' }: InvoiceDetailTabsProps) {
  const activeTab =
    (defaultTab === 'payments' && payments === null) ||
    (defaultTab === 'loads' && loads === null) ||
    (defaultTab === 'edit' && edit === null)
      ? 'overview'
      : defaultTab
  return (
    <Tabs defaultValue={activeTab} className="w-full">
      <TabsList className="w-full">
        <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
        {payments !== null && <TabsTrigger value="payments" className="flex-1">Payments</TabsTrigger>}
        {loads !== null && <TabsTrigger value="loads" className="flex-1">Loads</TabsTrigger>}
        {edit !== null && <TabsTrigger value="edit" className="flex-1">Edit</TabsTrigger>}
      </TabsList>
      <TabsContent value="overview" className="space-y-6">
        {overview}
      </TabsContent>
      {payments !== null && (
        <TabsContent value="payments" className="space-y-6">
          {payments}
        </TabsContent>
      )}
      {loads !== null && (
        <TabsContent value="loads" className="space-y-6">
          {loads}
        </TabsContent>
      )}
      {edit !== null && (
        <TabsContent value="edit" className="space-y-6">
          {edit}
        </TabsContent>
      )}
    </Tabs>
  )
}
