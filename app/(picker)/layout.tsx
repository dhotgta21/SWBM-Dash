// app/(picker)/layout.tsx
// Minimal mobile-first shell for warehouse pickers. No sidebar, no dashboard
// navigation, no access to prices or settings. Pickers are redirected here
// after sign-in and are blocked from all other operator surfaces.

import { redirect } from 'next/navigation'
import { ReactNode } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'
import { signOut } from '@/lib/actions/auth'
import { BottomTabBar } from '@/components/mobile-shell/BottomTabBar'

export const dynamic = 'force-dynamic'

export default async function PickerLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user

  if (!user) {
    redirect(ADMIN_LOGIN_PATH)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || profile.is_active === false) {
    redirect(`${ADMIN_LOGIN_PATH}?error=inactive`)
  }

  if (profile.role === 'driver') {
    redirect('/driver')
  }

  if (profile.role === 'client') {
    redirect('/portal')
  }

  if (profile.role !== 'picker') {
    redirect('/invoices?view=due')
  }

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      {/* App bar */}
      <header className="shrink-0 sticky top-0 z-30 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/picker" className="font-semibold text-foreground truncate">
            {profile.full_name || profile.email}
          </Link>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="icon" className="shrink-0">
              <LogOut className="h-5 w-5" />
              <span className="sr-only">Sign out</span>
            </Button>
          </form>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">{children}</main>

      {/* Bottom tab bar */}
      <BottomTabBar
        tabs={[
          { href: '/picker', label: 'Queue', icon: 'clipboard-list' },
          { href: '/picker/loads', label: 'Loads', icon: 'package' },
        ]}
      />
    </div>
  )
}
