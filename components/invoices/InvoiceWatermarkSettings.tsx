'use client'

/**
 * Status-stamp settings for the invoice actions card.
 *
 * Two-level control:
 *   1. Master switch (`status_stamps_enabled`) — turns the whole feature
 *      on/off. When off, no stamp ever renders regardless of any other
 *      setting.
 *   2. Auto / Manual mode:
 *        - **Auto**  (default) — system auto-detects which stamp to show
 *          based on status + 30-day cool-down for OVERDUE. The 3
 *          per-stamp toggles are NOT shown in the UI because the system
 *          already manages them. The "Detection mode" section just shows
 *          the description.
 *        - **Manual** — the operator picks ONE stamp to print via a single
 *          dropdown (replacing the 3 switches, which were three steps too
 *          many). Picking an option sets the corresponding per-stamp
 *          boolean to TRUE and the others to FALSE.
 *
 * The 30-day OVERDUE cool-down only applies in auto mode. In manual mode
 * the operator's selection wins regardless of the cool-down.
 */

import { useEffect, useState, useTransition } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, type SelectOption } from '@/components/ui/select'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toggleInvoiceWatermarks, type InvoiceWatermarkToggles } from '@/lib/actions/invoices'

export interface InvoiceWatermarkSettingsProps {
  invoiceId: string
  status: string
  showPaidWatermark: boolean | null | undefined
  showPartiallyPaidWatermark: boolean | null | undefined
  showOverdueWatermark: boolean | null | undefined
  statusStampsEnabled: boolean | null | undefined
  statusStampsMode: 'auto' | 'manual' | null | undefined
  /** Operator permissions — `invoices_edit` (or admin) gates the toggles. */
  canManage: boolean
}



/** Stamp identifiers used by the manual-mode dropdown + render logic. */
type StampKey = 'paid' | 'partial' | 'overdue' | null

const STAMP_OPTIONS: SelectOption[] = [
  { value: '', label: 'No stamp (off)' },
  { value: 'paid', label: 'PAID — green rubber stamp' },
  { value: 'partial', label: 'PARTIALLY PAID — orange rubber stamp' },
  { value: 'overdue', label: 'OVERDUE — red rubber stamp' },
]

/** Derive the dropdown's selected value from the 3 booleans + mode. */
function pickStampFromToggles(
  mode: 'auto' | 'manual',
  paid: boolean,
  partial: boolean,
  overdue: boolean
): string {
  if (mode === 'auto') return ''
  if (paid) return 'paid'
  if (partial) return 'partial'
  if (overdue) return 'overdue'
  return ''
}

export function InvoiceWatermarkSettings({
  invoiceId,
  status,
  showPaidWatermark,
  showPartiallyPaidWatermark,
  showOverdueWatermark,
  statusStampsEnabled,
  statusStampsMode,
  canManage,
}: InvoiceWatermarkSettingsProps) {
  // Master switch defaults to ON, mode defaults to 'auto'. The three
  // per-stamp toggles default to TRUE in auto mode and FALSE in manual
  // mode (the operator has to pick which one to enable).
  const [masterOn, setMasterOn] = useState(statusStampsEnabled !== false)
  const [mode, setMode] = useState<'auto' | 'manual'>(
    statusStampsMode === 'manual' ? 'manual' : 'auto'
  )
  const [paidOn, setPaidOn] = useState(showPaidWatermark !== false)
  const [partialOn, setPartialOn] = useState(showPartiallyPaidWatermark !== false)
  const [overdueOn, setOverdueOn] = useState(showOverdueWatermark !== false)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)

  // Keep local state in sync if the server-side value changes.
  useEffect(() => setMasterOn(statusStampsEnabled !== false), [statusStampsEnabled])
  useEffect(
    () => setMode(statusStampsMode === 'manual' ? 'manual' : 'auto'),
    [statusStampsMode]
  )
  useEffect(() => setPaidOn(showPaidWatermark !== false), [showPaidWatermark])
  useEffect(() => setPartialOn(showPartiallyPaidWatermark !== false), [showPartiallyPaidWatermark])
  useEffect(() => setOverdueOn(showOverdueWatermark !== false), [showOverdueWatermark])

  // Generic server write: takes a partial InvoiceWatermarkToggles
  // object, sends it, and rolls back the local state if the server
  // rejects. Server returns the full updated row, so we sync the local
  // copy from the response to stay consistent.
  function persist(
    patch: InvoiceWatermarkToggles,
    onError: () => void,
    successText: string
  ) {
    if (!canManage) return
    setFeedback(null)
    startTransition(async () => {
      const result = await toggleInvoiceWatermarks(invoiceId, patch)
      if (result.error) {
        onError()
        setFeedback({ kind: 'error', text: result.error })
        return
      }
      const row = result.invoice as Record<string, unknown> | null
      if (row) {
        if (typeof row.status_stamps_enabled === 'boolean') setMasterOn(row.status_stamps_enabled)
        if (row.status_stamps_mode === 'auto' || row.status_stamps_mode === 'manual') {
          setMode(row.status_stamps_mode)
        }
        if (typeof row.show_paid_watermark === 'boolean') setPaidOn(row.show_paid_watermark)
        if (typeof row.show_partially_paid_watermark === 'boolean') {
          setPartialOn(row.show_partially_paid_watermark)
        }
        if (typeof row.show_overdue_watermark === 'boolean') setOverdueOn(row.show_overdue_watermark)
      }
      setFeedback({ kind: 'info', text: successText })
    })
  }

  function flipMaster(next: boolean) {
    const previous = masterOn
    setMasterOn(next)
    persist({ status_stamps_enabled: next }, () => setMasterOn(previous), `Status stamps are now ${next ? 'ON' : 'OFF'}.`)
  }

  function flipMode(next: 'auto' | 'manual') {
    const previous = mode
    setMode(next)
    persist({ status_stamps_mode: next }, () => setMode(previous), `Mode is now ${next === 'auto' ? 'Auto' : 'Manual'}.`)
  }

  // Manual-mode dropdown handler. The user picks ONE stamp; the server
  // sets the corresponding boolean to true and the other two to false
  // (so the render logic only ever shows the chosen stamp, if its
  // status matches).
  function pickStamp(key: StampKey) {
    const previous = { paidOn, partialOn, overdueOn }
    const nextPaid = key === 'paid'
    const nextPartial = key === 'partial'
    const nextOverdue = key === 'overdue'
    setPaidOn(nextPaid)
    setPartialOn(nextPartial)
    setOverdueOn(nextOverdue)
    persist(
      {
        show_paid_watermark: nextPaid,
        show_partially_paid_watermark: nextPartial,
        show_overdue_watermark: nextOverdue,
      },
      () => {
        setPaidOn(previous.paidOn)
        setPartialOn(previous.partialOn)
        setOverdueOn(previous.overdueOn)
      },
      key
        ? `${key.toUpperCase()} stamp selected. Will print when the status matches.`
        : 'No stamp selected.'
    )
  }

  const selectedStamp = pickStampFromToggles(mode, paidOn, partialOn, overdueOn)

  return (
    <div className="space-y-4">
      {/* Master switch */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Status stamps</p>
          <p className="text-xs text-muted-foreground">
            Master switch for the PAID / PARTIALLY PAID / OVERDUE rubber stamps.
            Turn this off to suppress every status stamp on this invoice.
          </p>
        </div>
        <Switch
          id="status-stamps-enabled"
          checked={masterOn}
          disabled={!canManage || isPending}
          onCheckedChange={flipMaster}
        />
      </div>

      {/* Auto / Manual mode selector — only meaningful when the master is ON */}
      <div className={cn('space-y-2', !masterOn && 'opacity-50 pointer-events-none')}>
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Detection mode</p>
          <p className="text-xs text-muted-foreground">
            <strong>Auto</strong> shows the PAID + PARTIALLY PAID stamps by default and turns the
            OVERDUE stamp on 30 days after the due date while the invoice is still unpaid.
            <strong> Manual</strong> requires you to pick one stamp to print from a dropdown.
          </p>
        </div>
        <div
          className="inline-flex h-9 w-full rounded-lg bg-muted p-1 text-muted-foreground"
          role="radiogroup"
          aria-label="Status stamp detection mode"
        >
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'auto'}
            disabled={!canManage || isPending || !masterOn}
            onClick={() => flipMode('auto')}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:pointer-events-none disabled:opacity-50',
              mode === 'auto'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Auto
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'manual'}
            disabled={!canManage || isPending || !masterOn}
            onClick={() => flipMode('manual')}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:pointer-events-none disabled:opacity-50',
              mode === 'manual'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Manual
          </button>
        </div>
      </div>

      {/* ── Per-stamp controls. The shape depends on the mode: ─────────
           - Auto:  no per-stamp controls here. The system auto-manages all
                   three based on status + 30-day cool-down. The
                   description below tells the operator what's happening.
           - Manual: a single dropdown replaces the three switches. Pick
                   one stamp (or "No stamp" to clear); the server sets
                   only the chosen boolean to true. */}
      {mode === 'manual' ? (
        <div className={cn('space-y-2', !masterOn && 'opacity-50 pointer-events-none')}>
          <div className="space-y-0.5">
            <Label htmlFor="manual-stamp-select" className="text-sm font-medium">
              Stamp to print
            </Label>
            <p className="text-xs text-muted-foreground">
              Choose which stamp should print on this invoice. Only one stamp at a time —
              pick "No stamp" to suppress.
            </p>
          </div>
          <Select
            id="manual-stamp-select"
            value={selectedStamp}
            disabled={!canManage || isPending || !masterOn}
            onChange={(value) => pickStamp((value as StampKey) || null)}
            options={STAMP_OPTIONS}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-3">
          <p className="text-xs text-muted-foreground">
            Auto mode is managing the three stamp toggles for you. PAID + PARTIALLY
            PAID default ON; OVERDUE auto-activates 30 days past the due date while
            the invoice is still unpaid. Switch to <strong>Manual</strong> if you
            want to choose a single stamp to print from a dropdown.
          </p>
        </div>
      )}

      {feedback ? (
        <Alert variant={feedback.kind === 'error' ? 'destructive' : 'default'}>
          {feedback.kind === 'info' ? (
            <Check className="h-4 w-4" />
          ) : (
            <X className="h-4 w-4" />
          )}
          <AlertDescription>{feedback.text}</AlertDescription>
        </Alert>
      ) : null}

      {!canManage ? (
        <p className="text-xs text-muted-foreground">
          You don&apos;t have permission to change stamp settings.
        </p>
      ) : null}
    </div>
  )
}