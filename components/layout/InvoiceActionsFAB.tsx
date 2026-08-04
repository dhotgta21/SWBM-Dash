'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import { Plus, Edit, FileSearch, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InvoiceUpdateDialog } from '@/components/invoices/InvoiceUpdateDialog'
import { InvoiceEditSearchDialog } from '@/components/invoices/InvoiceEditSearchDialog'
import { isAdmin as isAdminRole } from '@/lib/auth/roles'
import type { StaffPermissions } from '@/lib/auth/permissions'

interface InvoiceActionsFABProps {
  /**
   * Role + permission matrix for the active user. The FAB only renders
   * the action a user is actually allowed to take — staff with
   * invoices_add off don't see Create, etc. Admins always see all.
   */
  role?: string
  permissions?: StaffPermissions
  isAdmin?: boolean
}

export function InvoiceActionsFAB({ role, permissions, isAdmin }: InvoiceActionsFABProps = {}) {
  const pathname = usePathname()
  const router = useRouter()
  const [updateOpen, setUpdateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  // Single source of truth for whether the action stack is revealed.
  // Desktop flips it via mouseenter/leave on the container; touch devices
  // never fire those, so the trigger's onClick toggle is what they hit;
  // keyboard users get focus-driven open/close. All paths converge here.
  const [menuOpen, setMenuOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  // Resolve "can I show this FAB button?" once. Admins always pass; staff
  // need the matching permission flag. Treat unknown role/permissions as
  // "hide everything" — the FAB isn't safe to surface by default.
  const admin = isAdmin ?? isAdminRole(role)
  const canCreate = admin || permissions?.invoices_add === true
  const canEdit = admin || permissions?.invoices_edit === true
  const canChangeStatus = admin || permissions?.invoices_change_status === true
  const canRecordPayment = admin || permissions?.invoices_record_payment === true
  const canDeletePayment = admin || permissions?.invoices_delete_payment === true
  const canAddProduct = admin || permissions?.products_add === true
  const canAddClient = admin || permissions?.clients_add === true

  const hasAnyAction = canCreate || canEdit || canChangeStatus

  // Close timer shared between pointer-leave (with grace) and explicit dismiss.
  // Using a ref so we can cancel an in-flight close when the user re-enters
  // the container or clicks back — without that, hover-out then quick hover-in
  // would close and reopen jankily.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function cancelScheduledClose() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }
  function openMenu() {
    cancelScheduledClose()
    setMenuOpen(true)
  }
  function closeMenuNow() {
    cancelScheduledClose()
    setMenuOpen(false)
  }
  function scheduleClose(delay = 150) {
    cancelScheduledClose()
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null
      setMenuOpen(false)
    }, delay)
  }

  // On unmount, drop any pending close timer so we don't fire setState on a
  // dead component if the page navigates away while the menu is closing.
  useEffect(() => {
    return () => cancelScheduledClose()
  }, [])

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName.toLowerCase()
      return (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target.isContentEditable
      )
    }

    function handleKeyDown(e: KeyboardEvent) {
      const isMod = e.ctrlKey || e.metaKey
      if (!isMod) return
      if (isTypingTarget(e.target)) return

      const needsShift = e.shiftKey

      // Gate shortcuts by the same perms as the buttons — staff without
      // invoices_add shouldn't be able to use Ctrl+I either.
      if ((e.key === 'i' || e.key === 'I') && canCreate) {
        e.preventDefault()
        router.push('/invoices/new')
        return
      }
      if ((e.key === 'u' || e.key === 'U') && canChangeStatus) {
        e.preventDefault()
        setUpdateOpen(true)
        return
      }
      if ((e.key === 'e' || e.key === 'E') && canEdit) {
        e.preventDefault()
        setEditOpen(true)
        return
      }
      if ((e.key === 'p' || e.key === 'P') && canAddProduct) {
        e.preventDefault()
        router.push('/admin/products/new')
        return
      }
      if ((e.key === 'c' || e.key === 'C') && needsShift && canAddClient) {
        e.preventDefault()
        router.push('/clients/new')
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [router, canCreate, canEdit, canChangeStatus, canAddProduct, canAddClient])

  // Tap-outside / Esc to close. Mostly matters on touch where the user
  // has to tap the trigger to open and needs a clean way to dismiss.
  // Only kicks in when the menu is actually open to avoid burning handlers.
  useEffect(() => {
    if (!menuOpen) return

    function onPointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (containerRef.current?.contains(target)) return
      closeMenuNow()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeMenuNow()
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const INVOICE_DETAIL_RE = /^\/invoices\/[0-9a-f-]{36}$/i
  if (
    pathname === '/invoices/new' ||
    pathname === '/invoices/assistant' ||
    pathname === '/emails' ||
    pathname?.startsWith('/settings') ||
    (pathname && INVOICE_DETAIL_RE.test(pathname))
  ) {
    return null
  }

  // If a staff member can't perform any of the three top-level invoice
  // actions, render the dialogs so they still mount, but skip the floating
  // UI entirely. Hooks above must run unconditionally — see useEffect.
  if (!hasAnyAction) {
    return (
      <>
        <InvoiceUpdateDialog
          open={updateOpen}
          onOpenChange={setUpdateOpen}
          canRecordPayment={canRecordPayment}
          canDeletePayment={canDeletePayment}
        />
        <InvoiceEditSearchDialog open={editOpen} onOpenChange={setEditOpen} />
      </>
    )
  }

  // Shared pill button styles for the four stacked actions. Primary (Create)
  // gets its own variant; the rest stay neutral so the SH-logo trigger
  // doesn't have to fight a wall of red. Tighter padding and a flat icon
  // (no chunky badge wrapper) keep each pill compact.
  const neutralPill = cn(
    'inline-flex items-center gap-2 rounded-full pl-2.5 pr-3.5 py-2 lg:pl-3 lg:pr-4 lg:py-2.5',
    'bg-card text-foreground shadow-md border border-border hover:bg-secondary hover:shadow-lg',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'transition-all active:scale-[0.98]'
  )
  const primaryPill = cn(
    'inline-flex items-center gap-2 rounded-full pl-2.5 pr-3.5 py-2 lg:pl-3 lg:pr-4 lg:py-2.5',
    'bg-primary text-primary-foreground shadow-md hover:bg-primary-hover hover:shadow-lg',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'transition-all active:scale-[0.98]'
  )

  // Action stack driven entirely by `menuOpen` state. Using one source of
  // truth means desktop hover and touch tap can't fight each other — both
  // routes funnel through the same setMenuOpen flip. Hover-launched opens
  // get closed via a 180ms grace timer, so the cursor can travel from the
  // trigger up to a button without the menu collapsing underneath.
  //
  // Critical layout note: the stack is `absolute bottom-full right-0` so
  // its position never contributes to the trigger's bounding box. With
  // flex-col the (invisible) buttons would still steal space above the
  // trigger, expanding the hover zone to the entire green rectangle and
  // letting the menu pop open just by hovering empty whitespace. Absolute
  // positioning keeps the hover zone collapsed-state-equal to the trigger
  // circle; once the menu is open, the stack gets its own mouseenter/leave
  // pair so the cursor can travel from trigger → gap → stack and back
  // without the menu collapsing underneath.
  const stackClass = cn(
    'absolute bottom-full right-0 mb-2.5',
    'flex flex-col items-end gap-2.5',
    'transition-all duration-200 ease-out',
    menuOpen
      ? 'opacity-100 translate-y-0 pointer-events-auto'
      : 'opacity-0 translate-y-3 pointer-events-none'
  )

  return (
    <>
      <div
        ref={containerRef}
        data-state={menuOpen ? 'open' : 'closed'}
        className={cn(
          'fixed bottom-4 right-4 z-30 lg:bottom-6 lg:right-6 mb-safe mr-safe'
        )}
        // Close when keyboard focus leaves the container entirely. We
        // intentionally skip onFocus here — a mousedown→focus→click sequence
        // on the trigger would otherwise open via focus *and* close via the
        // click toggle, landing in the wrong state. Keyboard users open the
        // menu by activating the trigger (Enter/Space) just like a native
        // <button>; once it's open the action pills become focusable.
        onBlur={(e) => {
          if (!containerRef.current?.contains(e.relatedTarget as Node | null)) {
            scheduleClose(120)
          }
        }}
      >
        {/* Stacked action buttons. Inert until revealed — opacity, pointer-events,
            and the `inert` attribute keep screen readers and tab order out of
            the collapsed state. Hover-only handlers live here so the cursor
            can travel into the expanded region without the menu collapsing
            mid-travel — cancelling the close scheduled when leaving the
            trigger. Pointer events are off while collapsed so empty
            whitespace above the trigger never registers as a hover target. */}
        <div
          className={stackClass}
          aria-hidden={!menuOpen}
          inert={!menuOpen}
          onMouseEnter={cancelScheduledClose}
          onMouseLeave={() => scheduleClose(180)}
        >
          {canChangeStatus && (
            <button
              type="button"
              onClick={() => {
                setUpdateOpen(true)
                closeMenuNow()
              }}
              className={neutralPill}
              aria-label="Update invoice status (Ctrl+U)"
              title="Update invoice status (Ctrl+U)"
            >
              <Edit className="h-4 w-4 text-foreground" />
              <span className="text-sm font-semibold whitespace-nowrap">
                Update Invoice
              </span>
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setEditOpen(true)
                closeMenuNow()
              }}
              className={neutralPill}
              aria-label="Edit invoice (Ctrl+E)"
              title="Edit invoice (Ctrl+E)"
            >
              <FileSearch className="h-4 w-4 text-foreground" />
              <span className="text-sm font-semibold whitespace-nowrap">
                Edit Invoice
              </span>
            </button>
          )}

          {canCreate && (
            <>
              <Link
                href="/invoices/assistant"
                onClick={closeMenuNow}
                className={neutralPill}
                aria-label="AI invoice assistant"
                title="AI invoice assistant"
              >
                <Bot className="h-4 w-4 text-foreground" />
                <span className="text-sm font-semibold whitespace-nowrap">
                  AI Assistant
                </span>
              </Link>

              <Link
                href="/invoices/new"
                onClick={closeMenuNow}
                className={primaryPill}
                aria-label="Create invoice (Ctrl+I)"
                title="Create invoice (Ctrl+I)"
              >
                <Plus className="h-4 w-4" />
                <span className="text-sm font-semibold whitespace-nowrap">
                  Create Invoice
                </span>
              </Link>
            </>
          )}
        </div>

        {/* Trigger — the SH brand mark. Carries the visual identity, fits the
            same tidy aesthetic as the sidebar logo. Clicking toggles the
            stack; on hover devices mouseenter/leave do the work via the
            container handlers above so we never have to reconcile CSS hover
            against state. */}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label={menuOpen ? 'Close invoice actions' : 'Open invoice actions'}
          // Hover-to-open lives on the trigger alone, not the surrounding
          // container. Combined with the action stack being `absolute`, this
          // means the hover zone is exactly the trigger circle while the
          // menu is collapsed — no more accidental pop-ups from the empty
          // whitespace above it. Once the menu opens, the stack's own
          // mouseenter/leave pair (with a 180ms grace) keeps it open while
          // the cursor travels up.
          onMouseEnter={openMenu}
          onMouseLeave={() => scheduleClose(180)}
          className={cn(
            'relative inline-flex h-12 w-12 lg:h-14 lg:w-14 items-center justify-center rounded-full overflow-hidden',
            'bg-card ring-1 ring-border shadow-lg shadow-primary/10',
            'transition-all duration-200 ease-out',
            'hover:shadow-xl hover:shadow-primary/20 active:scale-95',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
          )}
        >
          <Image
            src="/logo-square.webp"
            alt="Demo Builder Merchant — invoice actions"
            width={48}
            height={48}
            priority
            className="h-8 w-8 lg:h-10 lg:w-10 object-contain"
          />
        </button>
      </div>

      <InvoiceUpdateDialog
        open={updateOpen}
        onOpenChange={setUpdateOpen}
        canRecordPayment={canRecordPayment}
        canDeletePayment={canDeletePayment}
      />
      <InvoiceEditSearchDialog open={editOpen} onOpenChange={setEditOpen} />
    </>
  )
}
