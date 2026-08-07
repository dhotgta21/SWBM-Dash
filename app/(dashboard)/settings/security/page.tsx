import Link from 'next/link'
import { SettingsCategoryShell } from '@/components/settings/SettingsCategoryShell'
import { resolveSettingsAccess } from '@/lib/auth/settings-access'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ShieldCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Security settings',
}

/**
 * Sensitive actions (record payment, delete invoice, client account money moves)
 * re-verify with the operator's login password. Separate action passwords were
 * removed; login password is managed under Account settings.
 */
export default async function SecuritySettingsPage() {
  await resolveSettingsAccess()

  return (
    <SettingsCategoryShell
      title="Security"
      description="Protected actions use your login password (the same one you use to sign in)."
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Login password re-auth
          </CardTitle>
          <CardDescription>
            Recording payments, deleting invoices (and other protected deletes), and client
            account money moves ask only for your login password. There are no separate
            payment, deletion, or client-account passwords to manage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            To change or reset the password you use to sign in, open Account settings.
          </p>
          <Button asChild variant="outline">
            <Link href="/settings/account">Go to Account settings</Link>
          </Button>
        </CardContent>
      </Card>
    </SettingsCategoryShell>
  )
}
