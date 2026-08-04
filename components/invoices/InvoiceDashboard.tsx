import { InvoicesTable } from '@/components/dashboard/InvoicesTable'
import { KpiCards } from '@/components/dashboard/KpiCards'
import { StatusBreakdown } from '@/components/dashboard/StatusBreakdown'
import { CollectionTimeChart } from '@/components/dashboard/CollectionTimeChart'
import type {
  DueInvoice,
  StatusBreakdownItem,
  PaymentDuration,
  InvoiceKpiMetrics,
} from '@/lib/dashboard-types'

interface InvoiceDashboardProps {
  /** Outstanding invoices to render in the "Invoices to collect"
   *  table. */
  invoices: DueInvoice[]
  /** Invoice status breakdown for the pie chart. */
  statusBreakdown: StatusBreakdownItem[]
  /** Historical payment durations for the collection-time line chart. */
  paymentDurations: PaymentDuration[]
  /** As-of date label for the collection-time chart. */
  asOfDate?: string
  /** Top-line KPI strip (Total Sales, Collected, Outstanding, Overdue,
   *  Collection Rate). Null when the operator cannot see invoice money. */
  kpiMetrics: InvoiceKpiMetrics | null
}

/**
 * Inner content of the Invoices → Due Dashboard tab.
 *
 * Layout mirrors the operator's request: analytics KPI bar at the top,
 * then the invoice-status + collection-time summary row, then the
 * "Invoices to collect" table as the actionable queue below.
 */
export function InvoiceDashboard({
  invoices,
  statusBreakdown,
  paymentDurations,
  asOfDate,
  kpiMetrics,
}: InvoiceDashboardProps) {
  return (
    <div className="space-y-5">
      {kpiMetrics && (
        <KpiCards
          totalSales={kpiMetrics.totalSales}
          totalCollected={kpiMetrics.totalCollected}
          totalOutstanding={kpiMetrics.totalOutstanding}
          totalOverdue={kpiMetrics.totalOverdue}
          collectionRate={kpiMetrics.collectionRate}
          invoiceCount={kpiMetrics.invoiceCount}
          salesTrend={kpiMetrics.salesTrend}
          collectedTrend={kpiMetrics.collectedTrend}
          collectionRateTrend={kpiMetrics.collectionRateTrend}
          outstandingTrend={kpiMetrics.outstandingTrend}
          overdueTrend={kpiMetrics.overdueTrend}
          salesSeries={kpiMetrics.salesSeries}
          collectedSeries={kpiMetrics.collectedSeries}
        />
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <StatusBreakdown data={statusBreakdown} />
        </div>
        <CollectionTimeChart
          data={paymentDurations}
          asOfDate={asOfDate}
        />
      </div>

      <InvoicesTable invoices={invoices} />
    </div>
  )
}
