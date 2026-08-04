import { redirect } from 'next/navigation'
import { ClientForm } from '@/components/clients/ClientForm'
import { getOperatorContext } from '@/lib/auth/context'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'
import { canSeeClientMoney } from '@/lib/auth/permissions'

export const metadata = {
  title: 'New Client',
}

export default async function NewClientPage() {
  const ctx = await getOperatorContext()
  if (!ctx) redirect(ADMIN_LOGIN_PATH)
  if (!ctx.isAdmin && !ctx.permissions.clients_add) {
    redirect('/clients')
  }

  // Same gate as the client detail page: credit fields follow the
  // account-management permission (and require seeing client money).
  const canManageCredit =
    ctx.isAdmin || (ctx.permissions.clients_manage_account && canSeeClientMoney(ctx.permissions))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Add Client</h1>
        <p className="text-sm text-muted-foreground">Create a new customer record</p>
      </div>
      <ClientForm canManageCredit={canManageCredit} />
    </div>
  )
}
