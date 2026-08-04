import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getOperatorContext } from '@/lib/auth/context'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'
import { canSeeDashboard } from '@/lib/auth/roles'
import { getDashboardMetrics } from '@/lib/dashboard'
import {
  normalizeDashboardRange,
  DASHBOARD_RANGES,
  type DashboardRange,
} from '@/lib/dashboard-config'
import { SalesChart } from '@/components/dashboard/SalesChart'
import { DashboardRangeControl } from '@/components/dashboard/DashboardRangeControl'
import { TodaySnapshot } from '@/components/dashboard/TodaySnapshot'
import { MoneyCollectionHero } from '@/components/dashboard/MoneyCollectionHero'
import { DeliveryAlertsBanner } from '@/components/dashboard/DeliveryAlertsBanner'
import { ShortShipReviewBanner } from '@/components/dashboard/ShortShipReviewBanner'
import { getOpenDeliveryAlerts } from '@/lib/actions/delivery-alerts'
import { getOpenShortShipReviews } from '@/lib/actions/picker'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EyebrowChip, PageHeader } from '@/components/ui/PageHeader'
import { formatDate } from '@/lib/utils'
import { loadMoneyCollectionSnapshot } from '@/lib/money-collection'
import { Plus, UserPlus } from 'lucide-react'

export const metadata = {
  title: 'Analytics',
}

interface DashboardPageProps {
  searchParams: Promise<{ range?: string }>
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  // Revenue dashboard is admin-only by default. Staff who need it
  // can be granted access from Settings → Staff Permissions.
  const ctx = await getOperatorContext()
  if (!ctx) redirect(ADMIN_LOGIN_PATH)
  if (!canSeeDashboard(ctx.role, ctx.permissions)) {
    redirect('/invoices?view=due')
  }

  const sp = await searchParams
  const range = normalizeDashboardRange(sp.range)

  let metrics
  let loadError = false

  try {
    metrics = await getDashboardMetrics(range)
  } catch (error) {
    console.error('Dashboard error:', error)
    loadError = true
  }

  if (loadError || !metrics) {
    // getDashboardMetrics also throws when the operator can't see money
    // figures — show a permission hint instead of the generic error.
    const canSeeMoney = ctx.isAdmin || ctx.permissions.invoices_see_money
    return (
      <div className="space-y-6">
        <DashboardHeader range={range} asOfDate={null} canCreate={ctx.isAdmin} />
        <Alert variant="destructive">
          <AlertDescription>
            {canSeeMoney
              ? 'Unable to load dashboard data. Please try again later.'
              : "You don't have permission to view money figures. Ask an administrator."}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Supporting panels load in parallel AFTER the metrics resolve, so a
  // metrics failure short-circuits before these queries run.
  const [moneyCollection, { alerts: deliveryAlerts }, { reviews: shortShipReviews }] =
    await Promise.all([
      loadMoneyCollectionSnapshot(),
      getOpenDeliveryAlerts(),
      getOpenShortShipReviews(),
    ])

  return (
    <div className="space-y-6">
      <DashboardHeader range={range} asOfDate={metrics.asOfDate} canCreate={ctx.isAdmin} />

      <DeliveryAlertsBanner alerts={deliveryAlerts ?? []} />
      <ShortShipReviewBanner reviews={shortShipReviews ?? []} />

      {/* Money collection — primary hero. Surfaces the headline
          numbers (outstanding, overdue, due-today, due-this-week,
          DSO, collection rate) above everything else so the
          operator knows the cash position at a glance. */}
      <MoneyCollectionHero
        totals={moneyCollection.totals}
        dso={moneyCollection.dso}
        collectionRate={metrics.collectionRate}
        collectedThisPeriod={metrics.totalCollected}
        invoicedThisPeriod={metrics.totalSales}
      />

      {/* Today's snapshot — day-level companion to the hero
          above. Surfaces "collected today" plus today's due / overdue
          / due-this-week totals in a compact grid so the operator
          doesn't have to drill into the invoices list to see where
          today stands. */}
      <TodaySnapshot
        collectedToday={metrics.collectedToday}
        dueTodayTotal={metrics.dueTodayTotal}
        dueTodayCount={metrics.dueTodayInvoicesCount}
        overdueTotal={metrics.overdueTotal}
        overdueCount={metrics.overdueInvoicesCount}
        dueThisWeekTotal={metrics.dueThisWeekTotal}
        averageDaysOverdue={metrics.averageDaysOverdue}
        asOfDate={metrics.asOfDate}
        currency={metrics.currency}
      />

      {/* Primary chart — invoiced vs collected over the active range.
          Sole time-series chart on the page; deeper drill-down lives
          on the dedicated invoices / sales pages. */}
      <SalesChart data={metrics.salesSeries} range={range} />
    </div>
  )
}

function DashboardHeader({
  range,
  asOfDate,
  canCreate,
}: {
  range: DashboardRange
  asOfDate: string | null
  canCreate: boolean
}) {
  const rangeLabel = DASHBOARD_RANGES[range].label
  return (
    <PageHeader
      eyebrow={
        <>
          <EyebrowChip label="Money in" tone="primary" />
          <span className="hidden text-muted-foreground/60 sm:inline">/</span>
          <span className="hidden sm:inline">Overview</span>
        </>
      }
      title="Analytics"
      description={
        <>
          Sales &amp; collections overview for the last {rangeLabel}
          {asOfDate ? ` · as of ${formatDate(asOfDate)}` : ''}.
        </>
      }
      actions={
        <>
          <DashboardRangeControl current={range} />
          {canCreate ? (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href="/clients/new">
                  <UserPlus className="h-4 w-4" />
                  Add client
                </Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/invoices/new">
                  <Plus className="h-4 w-4" />
                  New invoice
                </Link>
              </Button>
            </>
          ) : null}
        </>
      }
    />
  )
}