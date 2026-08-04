'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  updateIndividualDiscount,
  type IndividualDiscountProduct,
  type IndividualDiscountInput,
} from '@/lib/actions/individual-discounts'

type ScheduleMode = 'days' | 'weeks' | 'months' | 'custom'

const SCHEDULE_UNITS: Record<Exclude<ScheduleMode, 'custom'>, { singular: string; plural: string }> = {
  days: { singular: 'day', plural: 'days' },
  weeks: { singular: 'week', plural: 'weeks' },
  months: { singular: 'month', plural: 'months' },
}

const LABEL_PRESETS = ['Winter Sale', 'Summer Sale', 'Clearance', 'Black Friday', 'New Customer']

function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function applyDurationSchedule(
  mode: Exclude<ScheduleMode, 'custom'>,
  duration: number,
  setStartsAt: (value: string) => void,
  setEndsAt: (value: string) => void
) {
  const starts = new Date()
  const ends = new Date(starts)
  if (mode === 'days') {
    ends.setDate(starts.getDate() + duration)
  } else if (mode === 'weeks') {
    ends.setDate(starts.getDate() + duration * 7)
  } else {
    ends.setMonth(starts.getMonth() + duration)
  }
  ends.setHours(23, 59, 0, 0)
  setStartsAt(starts.toISOString())
  setEndsAt(ends.toISOString())
}

interface IndividualDiscountFormDialogProps {
  product: IndividualDiscountProduct | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function IndividualDiscountFormDialog({
  product,
  open,
  onOpenChange,
  onSuccess,
}: IndividualDiscountFormDialogProps) {
  const [inputMode, setInputMode] = useState<'price' | 'percent'>('price')
  const [salePrice, setSalePrice] = useState<number | null>(null)
  const [startsAt, setStartsAt] = useState<string | null>(null)
  const [endsAt, setEndsAt] = useState<string | null>(null)
  const [label, setLabel] = useState<string | null>(null)
  const [mode, setMode] = useState<ScheduleMode>('days')
  const [duration, setDuration] = useState<number>(7)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!product) return
    setSalePrice(product.sale_price)
    setStartsAt(product.sale_starts_at)
    setEndsAt(product.sale_ends_at)
    setLabel(product.sale_label)
    setError(null)
  }, [product])

  const defaultPrice = product?.default_price ?? 0
  const discountPct = useMemo(() => {
    if (salePrice == null || defaultPrice <= 0 || salePrice >= defaultPrice) return 0
    return Math.round(((defaultPrice - salePrice) / defaultPrice) * 100)
  }, [salePrice, defaultPrice])

  const exactPct = useMemo(() => {
    if (salePrice == null || defaultPrice <= 0 || salePrice >= defaultPrice) return 0
    return ((defaultPrice - salePrice) / defaultPrice) * 100
  }, [salePrice, defaultPrice])

  function priceFromPercent(pct: number): number | null {
    if (defaultPrice <= 0) return null
    return Math.round(defaultPrice * (1 - pct / 100) * 100) / 100
  }

  function handleApplyDuration() {
    if (mode === 'custom') return
    applyDurationSchedule(mode, duration, setStartsAt, setEndsAt)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!product || salePrice == null) return

    setLoading(true)
    setError(null)

    const input: IndividualDiscountInput = {
      sale_price: salePrice,
      sale_starts_at: startsAt,
      sale_ends_at: endsAt,
      sale_label: label,
    }

    const result = await updateIndividualDiscount(product.id, input)
    setLoading(false)

    if (result.error) {
      setError(result.error)
      return
    }

    onSuccess()
  }

  const unit = mode === 'custom' ? null : SCHEDULE_UNITS[mode]
  const unitLabel = mode === 'custom' ? null : (duration === 1 ? unit?.singular : unit?.plural) ?? ''
  const saleTooHigh = salePrice != null && defaultPrice > 0 && salePrice >= defaultPrice

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{product?.sale_price != null ? 'Edit discount' : 'Add discount'}</DialogTitle>
          <DialogDescription>
            {product?.name ?? 'Product'} — trade price £{defaultPrice.toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Discount input</Label>
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-md border border-border bg-white p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setInputMode('price')}
                  className={`inline-flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors ${
                    inputMode === 'price'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  £ Price
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('percent')}
                  className={`inline-flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors ${
                    inputMode === 'percent'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  % Off
                </button>
              </div>

              {inputMode === 'price' ? (
                <div className="flex">
                  <span className="inline-flex h-9 items-center rounded-l-md border border-r-0 border-border bg-muted/40 px-2.5 text-sm text-muted-foreground">
                    £
                  </span>
                  <Input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={salePrice ?? ''}
                    onChange={(e) =>
                      setSalePrice(e.target.value === '' ? null : parseFloat(e.target.value))
                    }
                    placeholder="0.00"
                    className="h-9 w-32 rounded-l-none tabular-nums"
                  />
                </div>
              ) : (
                <div className="flex">
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    step={1}
                    value={salePrice != null && defaultPrice > 0 ? Math.round(exactPct) : ''}
                    onChange={(e) => {
                      const raw = e.target.value
                      if (raw === '') {
                        setSalePrice(null)
                        return
                      }
                      const pct = Math.max(0, Math.min(99, parseFloat(raw)))
                      if (Number.isNaN(pct)) return
                      setSalePrice(priceFromPercent(pct))
                    }}
                    placeholder="0"
                    className="h-9 w-24 rounded-r-none tabular-nums"
                  />
                  <span className="inline-flex h-9 items-center rounded-r-md border border-l-0 border-border bg-muted/40 px-2.5 text-sm text-muted-foreground">
                    % off
                  </span>
                </div>
              )}
            </div>

            {salePrice != null && defaultPrice > 0 && !saleTooHigh && (
              <p className="text-xs text-emerald-700">
                −{discountPct}% off · saving £{(defaultPrice - salePrice).toFixed(2)}
              </p>
            )}
            {saleTooHigh && (
              <p className="text-xs text-destructive">
                Sale price must be lower than the trade price (£{defaultPrice.toFixed(2)}).
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Schedule</Label>
            <div className="inline-flex rounded-md border border-border bg-white p-0.5 text-xs">
              {(
                [
                  { value: 'days', label: 'Days' },
                  { value: 'weeks', label: 'Weeks' },
                  { value: 'months', label: 'Months' },
                  { value: 'custom', label: 'Custom date' },
                ] as { value: ScheduleMode; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={`inline-flex items-center rounded px-2.5 py-1 font-medium transition-colors ${
                    mode === opt.value
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {mode !== 'custom' && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-white p-2">
                <span className="text-xs font-medium text-muted-foreground">Run for</span>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  step={1}
                  value={duration}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    setDuration(Number.isNaN(v) || v < 1 ? 1 : v)
                  }}
                  className="h-8 w-16 rounded-md border-border px-2 py-1 text-sm tabular-nums"
                />
                <span className="text-xs text-muted-foreground">{unitLabel}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={handleApplyDuration}
                  className="h-8 px-2.5 text-xs"
                >
                  Apply
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="sale_starts_at" className="text-xs text-muted-foreground">
                  Starts
                </Label>
                <Input
                  id="sale_starts_at"
                  type="datetime-local"
                  value={toDateTimeLocal(startsAt)}
                  onChange={(e) =>
                    setStartsAt(e.target.value ? new Date(e.target.value).toISOString() : null)
                  }
                />
              </div>
              <div>
                <Label htmlFor="sale_ends_at" className="text-xs text-muted-foreground">
                  Ends
                </Label>
                <Input
                  id="sale_ends_at"
                  type="datetime-local"
                  value={toDateTimeLocal(endsAt)}
                  onChange={(e) =>
                    setEndsAt(e.target.value ? new Date(e.target.value).toISOString() : null)
                  }
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave <strong>Starts</strong> blank to begin immediately, or leave{' '}
              <strong>Ends</strong> blank for an open-ended clearance.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sale_label">Label</Label>
            <Input
              id="sale_label"
              value={label ?? ''}
              onChange={(e) => setLabel(e.target.value || null)}
              placeholder="e.g. Winter Sale, Clearance"
              maxLength={60}
            />
            <div className="flex flex-wrap gap-1.5">
              {LABEL_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setLabel(preset)}
                  className="rounded-full border border-border bg-white px-2.5 py-0.5 text-[11px] font-medium text-foreground hover:border-primary/40"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || salePrice == null || saleTooHigh}>
              {loading ? 'Saving...' : 'Save discount'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
