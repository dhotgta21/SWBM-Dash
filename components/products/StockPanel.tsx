// components/products/StockPanel.tsx
// Server component that owns the Stock section of the Products page.
//
// Combines the previous top-level "Stock" and "Stock audit" tabs into a
// single Stock section with two sub-tabs (Stock take / Stock audit),
// implemented by the inner StockViewTabs (already a client component).
//
// Why a server component: the underlying data fetches are RSC-safe, the
// lists are static markup, and only the inner StockViewTabs + leaf
// panels (StockTakePanel, StockHistoryPanel, StockAuditPanel) need
// to be client components. Keeping the panel on the server avoids an
// unnecessary client bundle + double fetch.
//
// The page passes in `activeTab` (resolved from `?tab=`) so this
// component doesn't need to read searchParams itself.

import { StockAuditPanel } from './StockAuditPanel'
import { StockHistoryPanel } from './StockHistoryPanel'
import { StockTakePanel } from './StockTakePanel'
import { StockViewTabs } from './StockViewTabs'
import { getStockAlerts, getStockTakeLogs, getTrackedProducts } from '@/lib/actions/stock'

interface StockPanelProps {
  /** `?tab=` value the inner tabs should treat as "active". */
  activeTab: 'take' | 'audit'
  /** Operator permissions — drives the editable actions on the take form. */
  canEdit: boolean
}

export async function StockPanel({ activeTab, canEdit }: StockPanelProps) {
  // Always fetch the data needed for the sub-tab counts so the badge
  // numbers on the inner tab strip stay accurate even when the user
  // is sitting on the Audit sub-tab.
  const [
    { products: trackedProducts, error: trackedProductsError },
    { alerts: stockAlerts, error: stockAlertsError },
    { logs: stockLogs, error: stockLogsError },
  ] = await Promise.all([
    getTrackedProducts(),
    getStockAlerts(),
    getStockTakeLogs(),
  ])

  const alertCount = stockAlerts?.length ?? 0
  const historyCount = stockLogs?.length ?? 0

  return (
    <div className="space-y-6">
      <StockViewTabs alertCount={alertCount} historyCount={historyCount} />

      {activeTab === 'take' ? (
        <>
          {trackedProductsError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {trackedProductsError}
            </div>
          ) : null}
          {stockAlertsError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {stockAlertsError}
            </div>
          ) : null}
          {stockAlerts && stockAlerts.length > 0 ? (
            <StockAuditPanel initialAlerts={stockAlerts} canEdit={canEdit} />
          ) : null}
          <StockTakePanel initialProducts={trackedProducts ?? []} canEdit={canEdit} />
        </>
      ) : (
        <>
          {stockLogsError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {stockLogsError}
            </div>
          ) : null}
          <StockHistoryPanel initialLogs={stockLogs ?? []} />
        </>
      )}
    </div>
  )
}
