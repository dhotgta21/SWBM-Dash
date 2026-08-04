import { redirect } from 'next/navigation'
import { PageHeader, EyebrowChip } from '@/components/ui/PageHeader'
import { CampaignForm } from '@/components/campaigns/CampaignForm'
import { getOperatorContext } from '@/lib/auth/context'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'

export const metadata = {
  title: 'New Campaign',
}

export default async function NewCampaignPage() {
  const ctx = await getOperatorContext()
  if (!ctx) redirect(ADMIN_LOGIN_PATH)

  const canAdd = ctx.isAdmin || ctx.permissions.products_add
  if (!canAdd) redirect('/admin/products?view=campaigns')

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        eyebrow={<EyebrowChip label="Promotions" tone="warning" />}
        title="New campaign"
        description="Create a folder of products and set a percentage discount with a schedule."
      />
      <CampaignForm />
    </div>
  )
}
