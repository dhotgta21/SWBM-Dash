'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, Save, Loader2, ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  STAFF_DEFAULT_PERMISSIONS,
  type StaffPermissions,
} from '@/lib/auth/permissions'
import { resetStaffPermissions, updateStaffPermissions } from '@/lib/actions/permissions'

export interface StaffMember {
  id: string
  email: string
  full_name: string | null
  /** Resolved permission set — already merged with defaults. NULL
   *  means "use defaults" (which the editor will render as the
   *  default matrix). */
  permissions: StaffPermissions | null
  permissions_updated_at: string | null
}

interface PermissionEditorProps {
  members: StaffMember[]
}

interface FlagDef {
  key: keyof StaffPermissions
  label: string
  hint: string
  /** When set, the switch is locked and the returned hint replaces the normal one. */
  getLocked?: (perms: StaffPermissions) => { locked: boolean; hint?: string }
}

interface SectionDef {
  title: string
  description: string
  flags: FlagDef[]
}

const SECTION_DEFS: SectionDef[] = [
  {
    title: 'Section visibility',
    description: 'Which areas of the dashboard a staff member can see in the sidebar and access directly.',
    flags: [
      { key: 'see_dashboard', label: 'See Analytics', hint: 'Access the Analytics page and its charts.' },
      { key: 'see_clients', label: 'See Clients', hint: 'Access the client directory and detail pages.' },
      { key: 'see_products', label: 'See Products', hint: 'Access the product catalogue.' },
      { key: 'see_invoices', label: 'See Invoices', hint: 'Access invoices and quotations.' },
    ],
  },
  {
    title: 'Clients',
    description: 'What staff can do on the customer directory.',
    flags: [
      { key: 'clients_add', label: 'Add clients', hint: 'Create new client records.' },
      { key: 'clients_edit', label: 'Edit clients', hint: 'Change names, addresses, contact details.' },
      { key: 'clients_delete', label: 'Delete clients', hint: 'Permanently remove a client record.' },
      {
        key: 'clients_see_money',
        label: 'See money per client',
        hint: 'Reveals totals and outstanding balances.',
        getLocked: (perms) =>
          perms.clients_manage_account
            ? { locked: true, hint: 'Required while “Manage client account” is on.' }
            : { locked: false },
      },
      { key: 'clients_send_portal_invite', label: 'Send portal invites', hint: 'Email a client portal invitation.' },
      { key: 'clients_revoke_portal_invite', label: 'Revoke portal invites', hint: 'Cancel a pending portal invitation.' },
      {
        key: 'clients_manage_account',
        label: 'Manage client account',
        hint: 'Deposit credit and pay invoices from the client wallet. Requires “See money per client”, which is enabled automatically.',
      },
    ],
  },
  {
    title: 'Products',
    description: 'What staff can do on the product catalogue.',
    flags: [
      { key: 'products_add', label: 'Add products', hint: 'Create new SKUs / catalogue items.' },
      { key: 'products_edit', label: 'Edit products', hint: 'Change codes, prices, units.' },
      { key: 'products_delete', label: 'Delete products', hint: 'Permanently remove a product.' },
      { key: 'products_see_prices', label: 'See prices', hint: 'Show default_price / unit_price in lists.' },
    ],
  },
  {
    title: 'Invoices',
    description: 'What staff can do on invoices & quotations.',
    flags: [
      { key: 'invoices_add', label: 'Create invoices', hint: 'Start new invoices / quotations.' },
      { key: 'invoices_edit', label: 'Edit invoices', hint: 'Modify existing documents (status permitting).' },
      { key: 'invoices_delete', label: 'Delete invoices', hint: 'Permanently remove a document. Destructive.' },
      {
        key: 'invoices_see_money',
        label: 'See money totals',
        hint: 'Reveal totals on the invoice list / detail.',
        getLocked: (perms) =>
          perms.invoices_record_payment
            ? { locked: true, hint: 'Required while “Record payments” is on.' }
            : { locked: false },
      },
      { key: 'invoices_send_email', label: 'Send emails', hint: 'Email invoice / quote PDFs to clients.' },
      { key: 'invoices_record_payment', label: 'Record payments', hint: 'Log payments against an invoice.' },
      { key: 'invoices_change_status', label: 'Change status', hint: 'Move documents through the workflow.' },
      { key: 'invoices_convert_quote', label: 'Convert quotations', hint: 'Turn an approved quotation into an invoice.' },
      { key: 'invoices_manage_sharing', label: 'Manage public sharing', hint: 'Toggle/regenerate public invoice links.' },
      { key: 'invoices_delete_payment', label: 'Delete payments', hint: 'Remove a recorded payment from an invoice.' },
    ],
  },
  {
    title: 'Quote requests',
    description: 'Processing quote requests submitted from the public site.',
    flags: [
      { key: 'see_quote_requests', label: 'See quote requests', hint: 'View the quote request list and detail pages.' },
      { key: 'quote_requests_review', label: 'Review requests', hint: 'Update status and edit suggested line-item prices.' },
      { key: 'quote_requests_convert', label: 'Convert to invoice', hint: 'Turn a quote request into a real quotation invoice.' },
    ],
  },
  {
    title: 'Settings',
    description: 'Configuration access for company settings.',
    flags: [
      { key: 'settings_edit_company', label: 'Edit company settings', hint: 'Update company profile and bank details.' },
      { key: 'settings_manage_team', label: 'Manage team', hint: 'Change roles and permissions for staff accounts.' },
    ],
  },
]

export function PermissionEditor({ members }: PermissionEditorProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, StaffPermissions>>({})
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const router = useRouter()

  // Resolve the "currently shown" permissions for a member, applying
  // any in-progress edits on top.
  function currentPerms(member: StaffMember): StaffPermissions {
    return edits[member.id] ?? member.permissions ?? STAFF_DEFAULT_PERMISSIONS
  }

  function updateFlag(memberId: string, key: keyof StaffPermissions, value: boolean) {
    setEdits((prev) => {
      const next = {
        ...(prev[memberId] ?? members.find((m) => m.id === memberId)?.permissions ?? STAFF_DEFAULT_PERMISSIONS),
        [key]: value,
      }
      // Managing a client wallet always implies being able to see client money,
      // because the confirmation dialogs expose amounts. Keep the two flags in
      // sync so an admin never accidentally grants a dead toggle.
      if (key === 'clients_manage_account' && value) {
        next.clients_see_money = true
      }
      if (key === 'clients_see_money' && !value) {
        next.clients_manage_account = false
      }
      // Recording invoice money always implies being able to see invoice money,
      // because the payment UI exposes totals and balances. Keep the two flags
      // in sync so an admin never grants a dead or leaking toggle.
      if (key === 'invoices_record_payment' && value) {
        next.invoices_see_money = true
      }
      if (key === 'invoices_see_money' && !value) {
        next.invoices_record_payment = false
      }
      return { ...prev, [memberId]: next }
    })
  }

  function isDirty(member: StaffMember): boolean {
    if (!(member.id in edits)) return false
    const current = edits[member.id]
    const baseline = member.permissions ?? STAFF_DEFAULT_PERMISSIONS
    return (Object.keys(current) as Array<keyof StaffPermissions>).some((k) => current[k] !== baseline[k])
  }

  function save(member: StaffMember) {
    const next = currentPerms(member)
    setBusyId(member.id)
    setFeedback(null)
    startTransition(async () => {
      try {
        const result = await updateStaffPermissions({
          targetUserId: member.id,
          permissions: next,
        })
        setBusyId(null)
        if (result?.error) {
          setFeedback({ kind: 'err', message: result.error })
          return
        }
        setEdits((prev) => {
          const next = { ...prev }
          delete next[member.id]
          return next
        })
        // Refresh server props so the editor reflects the newly persisted
        // permissions without requiring a manual page reload.
        router.refresh()
        setFeedback({ kind: 'ok', message: `Saved permissions for ${member.email}.` })
      } catch (err) {
        setBusyId(null)
        console.error('PermissionEditor save error:', err)
        setFeedback({ kind: 'err', message: 'Something went wrong while saving permissions.' })
      }
    })
  }

  function reset(member: StaffMember) {
    setBusyId(member.id)
    setFeedback(null)
    startTransition(async () => {
      try {
        const result = await resetStaffPermissions(member.id)
        setBusyId(null)
        if (result?.error) {
          setFeedback({ kind: 'err', message: result.error })
          return
        }
        setEdits((prev) => {
          const next = { ...prev }
          delete next[member.id]
          return next
        })
        router.refresh()
        setFeedback({ kind: 'ok', message: `Reset ${member.email} to default permissions.` })
      } catch (err) {
        setBusyId(null)
        console.error('PermissionEditor reset error:', err)
        setFeedback({ kind: 'err', message: 'Something went wrong while resetting permissions.' })
      }
    })
  }

  // Pre-compute a stable list of staff only — admins don't appear in
  // the editor (admins always have full access by definition).
  const staffMembers = useMemo(() => members.filter((m) => m.email), [members])

  if (staffMembers.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground">
        No staff accounts yet. Promote or invite team members to manage their permissions.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <p>
          <strong className="text-foreground">Staff start view-only.</strong> New
          staff can navigate Invoices, Clients and Products but can&apos;t add,
          edit or delete anything until you flip the switches below. Toggle
          exactly what each person needs — the change applies on their next
          page load.
        </p>
      </div>

      {feedback && (
        <div
          className={cn(
            'rounded-lg border p-3 text-sm',
            feedback.kind === 'ok'
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          )}
        >
          {feedback.message}
        </div>
      )}

      <div className="space-y-3">
        {staffMembers.map((member) => {
          const perms = currentPerms(member)
          const isExpanded = expandedId === member.id
          const dirty = isDirty(member)
          const isSaving = busyId === member.id && pending
          const lastChanged = member.permissions_updated_at
            ? new Date(member.permissions_updated_at).toLocaleString()
            : 'defaults'

          return (
            <div
              key={member.id}
              className={cn(
                'rounded-lg border bg-card overflow-hidden',
                dirty ? 'border-primary/50' : 'border-border'
              )}
            >
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : member.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {member.full_name || member.email}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {dirty ? 'Unsaved' : 'Last changed'}
                    </p>
                    <p className="text-xs text-foreground">{dirty ? 'changes pending' : lastChanged}</p>
                  </div>
                  {dirty && (
                    <span className="sm:hidden text-xs font-medium text-primary">Unsaved</span>
                  )}
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide',
                      dirty ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
                    )}
                  >
                    <ShieldCheck className="h-3 w-3" />
                    Staff
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border bg-muted/30 px-4 py-4 space-y-5">
                  {SECTION_DEFS.map((section) => (
                    <div key={section.title}>
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                        <p className="text-xs text-muted-foreground">{section.description}</p>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {section.flags.map((flag) => {
                          const lock = flag.getLocked?.(perms)
                          const locked = lock?.locked ?? false
                          return (
                            <label
                              key={flag.key}
                              className={cn(
                                'flex items-start justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5 transition-colors',
                                locked
                                  ? 'cursor-not-allowed opacity-70'
                                  : 'cursor-pointer hover:border-primary/40'
                              )}
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">{flag.label}</p>
                                <p className="text-xs text-muted-foreground">
                                  {locked && lock?.hint ? lock.hint : flag.hint}
                                </p>
                              </div>
                              <Switch
                                checked={perms[flag.key]}
                                onCheckedChange={(v) => updateFlag(member.id, flag.key, v)}
                                disabled={locked}
                                className="shrink-0 mt-0.5"
                              />
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ))}

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => reset(member)}
                      disabled={isSaving}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset to defaults
                    </Button>
                    <Button
                      type="button"
                      onClick={() => save(member)}
                      disabled={isSaving || !dirty}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Save changes
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
