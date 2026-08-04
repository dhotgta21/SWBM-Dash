import { redirect, notFound } from 'next/navigation'
import { PageHeader, EyebrowChip } from '@/components/ui/PageHeader'
import { CampaignForm } from '@/components/campaigns/CampaignForm'
import { getCampaignById } from '@/lib/actions/campaigns'
import { getOperatorContext } from '@/lib/auth/context'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'

export const metadata = {
  title: 'Edit Campaign',
}

interface EditCampaignPageProps {
  params: Promise<{ id: string }>
}

export default async function EditCampaignPage({ params }: EditCampaignPageProps) {
  const ctx = await getOperatorContext()
  if (!ctx) redirect(ADMIN_LOGIN_PATH)

  const canEdit = ctx.isAdmin || ctx.permissions.products_edit
  if (!canEdit) redirect('/admin/products?view=campaigns')

  const { id } = await params
  const { campaign, error } = await getCampaignById(id)

  if (error || !campaign) {
    notFound()
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        eyebrow={<EyebrowChip label="Promotions" tone="warning" />}
        title="Edit campaign"
        description="Update the discount, schedule, or product selection for this campaign."
      />
      <CampaignForm initialCampaign={campaign} />
    </div>
  )
}
