'use client'

import { useFormStatus } from 'react-dom'
import { signOut } from '@/lib/actions/auth'
import { LogOut, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

function SubmitButton({ collapsed }: { collapsed?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      title={collapsed ? 'Sign out' : undefined}
      className={cn(
        'flex items-center rounded-lg font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-60',
        collapsed ? 'justify-center w-full px-3 py-3' : 'w-full gap-3 px-3 py-2.5 text-sm'
      )}
    >
      {pending ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
      {!collapsed && (pending ? 'Signing out...' : 'Sign out')}
    </button>
  )
}

export function SignOutButton({ className, collapsed }: { className?: string; collapsed?: boolean }) {
  return (
    <form action={signOut} className={className}>
      <SubmitButton collapsed={collapsed} />
    </form>
  )
}
