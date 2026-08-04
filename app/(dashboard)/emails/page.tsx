// app/(dashboard)/emails/page.tsx
// Quick-access shortcut to the company webmail. Reads webmail_url from
// company_settings and shows a launcher that opens the inbox in a new tab.
// The sidebar "Emails" link opens the inbox directly, so this page is mainly
// a fallback / manual launcher. If the URL isn't configured yet, we surface
// a clear empty state pointing to Settings → Company → Quick links.
//
// We do not use an iframe because providers like Outlook on the web block
// embedding with X-Frame-Options / CSP headers, which would show a blank or
// broken page instead of the inbox.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Mail, Settings as SettingsIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EyebrowChip, PageHeader } from '@/components/ui/PageHeader'
import { createClient } from '@/lib/supabase/server'
import { getOperatorContext } from '@/lib/auth/context'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'
import { WebmailRedirect } from './_components/webmail-redirect'

export const dynamic = 'force-dynamic'

export default async function EmailsPage() {
  // Mirrors the sidebar nav predicate (lib/auth/navigation.ts): visible to
  // admins and to staff with the see_quote_requests permission.
  const ctx = await getOperatorContext()
  if (!ctx) redirect(ADMIN_LOGIN_PATH)
  if (!ctx.isAdmin && !ctx.permissions.see_quote_requests) {
    redirect('/invoices?view=due')
  }

  const supabase = await createClient()
  const { data: company } = await supabase
    .from('company_settings')
    .select('webmail_url, company_name')
    .eq('id', 1)
    .maybeSingle()

  const webmailUrl = (company?.webmail_url ?? '').trim()
  const isAdmin = ctx.isAdmin // staff can view, only admins configure webmail

  if (!webmailUrl) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={<EyebrowChip label="Quick link" tone="info" />}
          title="Emails"
          description="Quick access to your company webmail."
        />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Webmail not configured
            </CardTitle>
            <CardDescription>
              Add the URL of your webmail (Outlook on the web, Gmail, GoDaddy webmail, etc.)
              and the <strong>Emails</strong> sidebar link will take you there automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Open <Link href="/settings/company" className="text-primary hover:underline font-medium">Settings → Company</Link>.</li>
              <li>Scroll to the <strong>Quick links</strong> section.</li>
              <li>Paste the URL of your webmail — must start with <code className="rounded bg-muted px-1 py-0.5 text-xs">https://</code>.</li>
              <li>Save. The sidebar <strong>Emails</strong> link now opens it.</li>
            </ol>
            {isAdmin && (
              <Button asChild>
                <Link href="/settings/company">
                  <SettingsIcon className="mr-2 h-4 w-4" />
                  Configure webmail
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<EyebrowChip label="Quick link" tone="info" />}
        title="Emails"
        description="Quick access to your company webmail."
      />
      <WebmailRedirect webmailUrl={webmailUrl} />
    </div>
  )
}
