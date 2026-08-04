// components/quote-requests/dashboard/QuoteRequestDashboard.tsx
// Composition for the Quote & order requests overview. Server component —
// receives pre-computed metrics and lays out the client chart/KPI widgets in
// the same rhythm as the Invoices Due Dashboard (KPI strip, then a
// 2-col + 1-col chart row).

import { QuoteKpiCards } from './QuoteKpiCards'
import { QuoteRequestsOverTime } from './QuoteRequestsOverTime'
import { QuoteStatusBreakdown } from './QuoteStatusBreakdown'
import type { QuoteRequestDashboardMetrics } from '@/lib/quote-request-dashboard'

export function QuoteRequestDashboard({ metrics }: { metrics: QuoteRequestDashboardMetrics }) {
  return (
    <div className="space-y-5">
      <QuoteKpiCards metrics={metrics.kpis} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <QuoteRequestsOverTime data={metrics.dailySeries} asOfDate={metrics.asOfDate} />
        </div>
        <QuoteStatusBreakdown data={metrics.statusBreakdown} />
      </div>
    </div>
  )
}
