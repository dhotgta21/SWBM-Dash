import { redirect } from 'next/navigation'

// The Campaigns UI used to live at /admin/campaigns as a standalone
// route + sidebar entry. It now lives as the 4th tab on the Products
// page (Catalog | Temporary products | Campaigns) so pricing and
// promotions sit in one place.
//
// This route is kept as a thin redirect for back-compat:
//   - bookmarked / shared links
//   - post-save redirects from /admin/campaigns/new
//   - post-save redirects from /admin/campaigns/[id]/edit
//   - any external integrations pointing at the old URL
//
// The redirect preserves `?tab=` and `?filter=` so the operator lands
// on the right sub-tab inside the campaigns panel.

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; filter?: string }>
}) {
  const sp = await searchParams
  const params = new URLSearchParams()
  params.set('view', 'campaigns')
  if (sp.tab) params.set('tab', sp.tab)
  if (sp.filter) params.set('filter', sp.filter)
  redirect(`/admin/products?${params.toString()}`)
}