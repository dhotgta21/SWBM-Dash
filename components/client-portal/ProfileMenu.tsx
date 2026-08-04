'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { User, LogOut, Loader2, ChevronDown, Wrench, Package, FileText } from 'lucide-react'
import { signOut } from '@/lib/actions/auth'
import { cn } from '@/lib/utils'

interface ProfileMenuProps {
  userEmail: string
  userFullName: string | null
}

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email.split('@')[0] || '?'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function SignOutMenuItem() {
  // useFormStatus reads the parent <form action={signOut}> pending state,
  // mirroring what the sidebar SignOutButton does so the spinner shows
  // up during the round trip.
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      role="menuitem"
      disabled={pending}
      className="flex w-full items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:bg-secondary disabled:opacity-60 text-left"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4 text-muted-foreground" />}
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  )
}

/**
 * Avatar-button + click-to-open dropdown. Lives in the top-right of
 * the portal header — the only place the client can navigate (apart
 * from clicking the company wordmark to go home).
 *
 * Menu items:
 *   - "My profile"  → /portal/profile
 *   - "Sign out"    → calls the signOut() server action via <form>
 *
 * Closes on:
 *   - Escape
 *   - Click outside
 *   - Click on a menu item
 */
export function ProfileMenu({ userEmail, userFullName }: ProfileMenuProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    function handlePointer(event: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  function close() {
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open profile menu"
        className={cn(
          'flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-10'
        )}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
          {initials(userFullName, userEmail)}
        </span>
        <span className="hidden sm:inline-block max-w-[140px] truncate text-left">
          {userFullName?.trim() || userEmail}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 sm:w-64 max-w-[calc(100vw-2rem)] origin-top-right rounded-lg border border-border bg-popover text-popover-foreground shadow-lg z-50"
        >
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium truncate">
              {userFullName?.trim() || 'Your account'}
            </p>
            <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
          </div>
          <div className="py-1">
            <p className="px-4 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Tools
            </p>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close()
                router.push('/portal/tools')
              }}
              className="flex w-full items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:bg-secondary text-left"
            >
              <Wrench className="h-4 w-4 text-muted-foreground" />
              Tools hub
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close()
                router.push('/portal/inventory')
              }}
              className="flex w-full items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:bg-secondary text-left"
            >
              <Package className="h-4 w-4 text-muted-foreground" />
              Inventory
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close()
                router.push('/portal/quotes')
              }}
              className="flex w-full items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:bg-secondary text-left"
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              Quotes
            </button>
          </div>
          <div className="border-t border-border py-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close()
                router.push('/portal/profile')
              }}
              className="flex w-full items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:bg-secondary text-left"
            >
              <User className="h-4 w-4 text-muted-foreground" />
              My profile
            </button>
          </div>
          <div className="border-t border-border py-1">
            <form action={signOut}>
              <SignOutMenuItem />
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
