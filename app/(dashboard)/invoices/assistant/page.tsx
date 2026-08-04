import { redirect } from 'next/navigation'
import { InvoiceAssistant } from '@/components/invoices/assistant/InvoiceAssistant'
import { getOperatorContext } from '@/lib/auth/context'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'

export const metadata = {
  title: 'AI Invoice Assistant',
}

export default async function InvoiceAssistantPage() {
  const ctx = await getOperatorContext()
  if (!ctx) redirect(ADMIN_LOGIN_PATH)
  if (!ctx.isAdmin && !ctx.permissions.invoices_add) {
    redirect('/invoices?view=due')
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-6rem)]">
      <InvoiceAssistant canSendEmail={ctx.isAdmin || ctx.permissions.invoices_send_email} />
    </div>
  )
}
