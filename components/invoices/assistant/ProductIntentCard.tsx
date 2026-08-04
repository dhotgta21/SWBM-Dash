'use client'

import { Check, Pencil, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  type ParsedIntent,
  type IntentConfidence,
} from '@/lib/voice/product-intent'

interface ProductIntentCardProps {
  /** Original utterance (for display). */
  utterance: string
  /** The slots we extracted; null when we couldn't parse anything useful. */
  intent: ParsedIntent
  /** Loading state for the Confirm action. */
  busy?: boolean
  onConfirm: () => void
  onEdit: () => void
  onCancel: () => void
}

export function ProductIntentCard({
  utterance,
  intent,
  busy = false,
  onConfirm,
  onEdit,
  onCancel,
}: ProductIntentCardProps) {
  return (
    <div
      role="region"
      aria-label="Captured product line"
      className={cn(
        'rounded-xl border bg-card shadow-sm transition-all',
        intent.confidence === 'low'
          ? 'border-warning/60 bg-warning/5'
          : 'border-primary/40 bg-primary/5'
      )}
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                intent.confidence === 'high' &&
                  'bg-success/15 text-success ring-1 ring-success/30',
                intent.confidence === 'medium' &&
                  'bg-info/15 text-info ring-1 ring-info/30',
                intent.confidence === 'low' &&
                  'bg-warning/15 text-warning ring-1 ring-warning/30'
              )}
              aria-label={`Confidence ${intent.confidence}`}
            >
              {intent.confidence}
            </span>
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Captured from voice
            </p>
          </div>
          <p className="text-sm font-semibold leading-tight text-foreground">
            {summarise(intent)}
          </p>
          <p
            className="text-xs text-muted-foreground italic line-clamp-2"
            title={utterance}
          >
            “{utterance}”
          </p>
          {intent.missing.length > 0 && (
            <p className="text-xs text-warning">
              Still need: {humaniseMissing(intent.missing).join(', ')}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border/60 bg-background/40 px-3 py-2">
        <Button
          type="button"
          size="sm"
          onClick={onConfirm}
          disabled={busy || intent.missing.length > 0}
          className="gap-1.5"
          aria-label="Confirm and add line"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Confirm
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onEdit}
          disabled={busy}
          className="gap-1.5"
          aria-label="Edit details before adding"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
          disabled={busy}
          className="gap-1.5 text-muted-foreground"
          aria-label="Cancel captured line"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
      </div>
    </div>
  )
}

function summarise(intent: ParsedIntent): string {
  const parts: string[] = []
  if (intent.quantity) {
    parts.push(`${formatQty(intent.quantity.value)} ${intent.quantity.unit || ''}`.trim())
  }
  if (intent.price) {
    parts.push(`at £${intent.price.value.toFixed(2)}`)
  }
  if (intent.product) {
    parts.push(`— ${intent.product.name}`)
  }
  return parts.join(' ') || 'No details captured'
}

function formatQty(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return value.toString()
}

function humaniseMissing(missing: ParsedIntent['missing']): string[] {
  return missing.map((m) => {
    if (m === 'quantity') return 'how many'
    if (m === 'price') return 'price'
    return 'which product'
  })
}

/** Re-export IntentConfidence so consumers don't reach into lib/voice for it. */
export type { IntentConfidence }
