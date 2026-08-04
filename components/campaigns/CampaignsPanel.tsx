// components/campaigns/CampaignsPanel.tsx
// Server component that fetches campaigns + individual-discount data and
// renders the Campaigns UI (Product discounts / Campaign groups tabs).
//
// Used in two places:
//   1. /admin/products?view=campaigns (the new tab on the Products page)
//   2. /admin/campaigns (legacy URL, kept as a redirect for back-compat)
//
// Why a server component: the underlying data fetches are RSC-safe, the
// lists are static markup, and the only client bits are the inner
// CampaignsViewTabs (already a client component). Keeping the panel on
// the server avoids an unnecessary client bundle + double fetch.

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { CampaignsList } from './CampaignsList'
import { CampaignsViewTabs } from './CampaignsViewTabs'
import { IndividualDiscountsList } from './IndividualDiscountsList'
import { listCampaigns } from '@/lib/actions/campaigns'
import { listIndividualDiscountProducts } from '@/lib/actions/individual-discounts'

interface CampaignsPanelProps {
  /** `?view=` value the inner tabs should treat as "active". */
  activeView: 'individual' | 'campaigns'
  /** `?filter=` passed through to the IndividualDiscountsList. */
  activeFilter?: string
  /** Operator permissions — drives the "Add Campaign" button + row actions. */
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
}

export async function CampaignsPanel({
  activeView,
  activeFilter,
  canAdd,
  canEdit,
  canDelete,
}: CampaignsPanelProps) {
  const [{ campaigns, error: campaignsError }, { products: individualProducts, error: individualError }] =
    await Promise.all([
      listCampaigns(),
      listIndividualDiscountProducts(
        activeFilter as Parameters<typeof listIndividualDiscountProducts>[0]
      ),
    ])

  const individualCount = individualProducts.length
  const campaignCount = campaigns.length

  return (
    <div className="space-y-6">
      <CampaignsViewTabs
        individualCount={individualCount}
        campaignCount={campaignCount}
      />

      {activeView === 'individual' && individualError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {individualError}
        </div>
      )}

      {activeView === 'campaigns' && campaignsError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {campaignsError}
        </div>
      )}

      {activeView === 'individual' && (
        <Card>
          <CardContent className="p-0">
            <IndividualDiscountsList
              products={individualProducts}
              canEdit={canEdit}
              activeFilter={
                (activeFilter as Parameters<typeof listIndividualDiscountProducts>[0]) ?? 'all'
              }
            />
          </CardContent>
        </Card>
      )}

      {activeView === 'campaigns' && (
        <>
          {campaigns.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Total</p>
                <p className="text-2xl font-semibold text-foreground">{campaigns.length}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Live now</p>
                <p className="text-2xl font-semibold text-emerald-700">
                  {campaigns.filter((c) => c.status === 'live').length}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Scheduled</p>
                <p className="text-2xl font-semibold text-blue-700">
                  {campaigns.filter((c) => c.status === 'scheduled').length}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Products on campaign</p>
                <p className="text-2xl font-semibold text-foreground">
                  {campaigns.reduce((sum, c) => sum + (c.product_count ?? 0), 0)}
                </p>
              </div>
            </div>
          )}

          {campaigns.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <CampaignsList campaigns={campaigns} canEdit={canEdit} canDelete={canDelete} />
              </CardContent>
            </Card>
          ) : (
            <div className="text-center py-12 text-muted-foreground rounded-lg border border-dashed border-border bg-card">
              <p className="text-sm font-medium text-foreground">No campaigns yet.</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                Campaigns let you apply a scheduled discount to a whole group of products at once.
              </p>
              {canAdd && (
                <Button asChild className="mt-4">
                  <Link href="/admin/campaigns/new">
                    <Plus className="w-4 h-4 mr-2" />
                    Create your first campaign
                  </Link>
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}