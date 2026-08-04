'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  createCampaign,
  updateCampaign,
  type CampaignFormData,
  type CampaignWithProducts,
  type CampaignProductRow,
} from '@/lib/actions/campaigns'
import { getCampaignStatus, formatSaleDate } from '@/lib/products/sale'
import { CampaignStatusBadge } from './CampaignStatusBadge'
import { Search, X, Plus, Loader2 } from 'lucide-react'

const CAMPAIGN_LABEL_PRESETS = [
  'Winter Sale',
  'Summer Sale',
  'Clearance',
  'Black Friday',
  'New Customer',
] as const

type ScheduleMode = 'days' | 'weeks' | 'months' | 'custom'

const SCHEDULE_UNITS: Record<Exclude<ScheduleMode, 'custom'>, { singular: string; plural: string }> = {
  days: { singular: 'day', plural: 'days' },
  weeks: { singular: 'week', plural: 'weeks' },
  months: { singular: 'month', plural: 'months' },
}

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
  onChange: (startsAt: string | null, endsAt: string | null) => void
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
  onChange(starts.toISOString(), ends.toISOString())
}

function FieldRow({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr] sm:items-start', className)}>
      <Label htmlFor={htmlFor} className="pt-2 text-sm font-medium text-foreground">
        {label}
      </Label>
      <div>{children}</div>
    </div>
  )
}

function ScheduleSection({
  startsAt,
  endsAt,
  onChange,
}: {
  startsAt: string | null
  endsAt: string | null
  onChange: (startsAt: string | null, endsAt: string | null) => void
}) {
  const [mode, setMode] = useState<ScheduleMode>('days')
  const [duration, setDuration] = useState<number>(7)

  useEffect(() => {
    const start = startsAt ? new Date(startsAt) : null
    const end = endsAt ? new Date(endsAt) : null
    if (!start || !end) return
    const ms = end.getTime() - start.getTime()
    if (ms <= 0) return
    if (mode === 'days') {
      setDuration(Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24))))
    } else if (mode === 'weeks') {
      setDuration(Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24 * 7))))
    } else {
      setDuration(Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24 * 30))))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  function applyDuration() {
    if (mode === 'custom') return
    applyDurationSchedule(mode, duration, onChange)
  }

  const unit = mode === 'custom' ? null : SCHEDULE_UNITS[mode]
  const unitLabel = mode === 'custom' ? null : (duration === 1 ? unit?.singular : unit?.plural) ?? ''

  return (
    <div className="space-y-3">
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
            className={cn(
              'inline-flex items-center rounded px-2.5 py-1 font-medium transition-colors',
              mode === opt.value
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            aria-pressed={mode === opt.value}
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
            onClick={applyDuration}
            className="h-8 px-2.5 text-xs"
            title={`Set start = now, end = ${duration} ${unitLabel} later`}
          >
            Apply
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="starts_at" className="mb-1 block text-xs font-medium text-muted-foreground">
            Starts
          </label>
          <Input
            id="starts_at"
            type="datetime-local"
            value={toDateTimeLocal(startsAt)}
            onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null, endsAt)}
          />
        </div>
        <div>
          <label htmlFor="ends_at" className="mb-1 block text-xs font-medium text-muted-foreground">
            Ends
          </label>
          <Input
            id="ends_at"
            type="datetime-local"
            value={toDateTimeLocal(endsAt)}
            onChange={(e) => onChange(startsAt, e.target.value ? new Date(e.target.value).toISOString() : null)}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Leave <strong>Starts</strong> blank to begin immediately, or leave{' '}
        <strong>Ends</strong> blank for an open-ended clearance (no countdown).
      </p>
    </div>
  )
}

interface ProductSearchResult {
  id: string
  code: string
  name: string
  category: string | null
  default_price: number
}

function ProductSelector({
  selected,
  onChange,
}: {
  selected: CampaignProductRow[]
  onChange: (products: CampaignProductRow[]) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const selectedIds = useMemo(() => new Set(selected.map((p) => p.id)), [selected])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }

    let cancelled = false
    async function search() {
      setLoading(true)
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`)
        if (!cancelled) {
          const json = await res.json()
          setResults((json.products ?? []).filter((p: ProductSearchResult) => !selectedIds.has(p.id)))
        }
      } catch (err) {
        console.error('Product search failed:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    const timeout = setTimeout(search, 200)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [query, selectedIds])

  function addProduct(product: ProductSearchResult) {
    onChange([...selected, product])
    setQuery('')
    setResults([])
  }

  function removeProduct(id: string) {
    onChange(selected.filter((p) => p.id !== id))
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products by name or code..."
          className="pl-9"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {results.length > 0 && (
        <div className="rounded-lg border border-border bg-white shadow-sm max-h-60 overflow-auto">
          {results.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => addProduct(product)}
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-secondary/50 border-b border-border last:border-0"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{product.name}</p>
                <p className="text-xs text-muted-foreground">
                  {product.code} · {product.category || 'No category'}
                </p>
              </div>
              <Plus className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {selected.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {selected.length} product{selected.length === 1 ? '' : 's'} in this campaign
          </p>
          <div className="flex flex-wrap gap-2">
            {selected.map((product) => (
              <Badge
                key={product.id}
                variant="default"
                className="inline-flex items-center gap-1 px-2 py-1"
              >
                <span className="truncate max-w-[200px]">{product.name}</span>
                <button
                  type="button"
                  onClick={() => removeProduct(product.id)}
                  className="ml-1 rounded-full hover:bg-muted p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No products added yet. Search above to add products.</p>
      )}
    </div>
  )
}

interface CampaignFormProps {
  initialCampaign?: CampaignWithProducts
}

export function CampaignForm({ initialCampaign }: CampaignFormProps) {
  const router = useRouter()
  const isEditing = !!initialCampaign

  const [name, setName] = useState(initialCampaign?.name ?? '')
  const [discountPercent, setDiscountPercent] = useState<string>(
    initialCampaign ? String(initialCampaign.discount_percent) : '10'
  )
  const [startsAt, setStartsAt] = useState<string | null>(initialCampaign?.starts_at ?? null)
  const [endsAt, setEndsAt] = useState<string | null>(initialCampaign?.ends_at ?? null)
  const [label, setLabel] = useState(initialCampaign?.label ?? '')
  const [products, setProducts] = useState<CampaignProductRow[]>(initialCampaign?.products ?? [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const status = useMemo(() => {
    const fields = {
      discountPercent: Number(discountPercent) || 0,
      startsAt,
      endsAt,
      isPaused: initialCampaign?.is_paused ?? false,
    }
    return getCampaignStatus(fields)
  }, [discountPercent, startsAt, endsAt, initialCampaign?.is_paused])

  const isRunning = status === 'live'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const payload: CampaignFormData = {
      name,
      discount_percent: Number(discountPercent),
      starts_at: startsAt,
      ends_at: endsAt,
      label: label || null,
      product_ids: products.map((p) => p.id),
    }

    const result = isEditing
      ? await updateCampaign(initialCampaign.id, payload)
      : await createCampaign(payload)

    setLoading(false)

    if (result.error) {
      setError(result.error)
      return
    }

    router.push('/admin/products?view=campaigns&tab=campaigns')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {isRunning && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 text-sm text-emerald-800">
          <strong>Campaign is live.</strong> This campaign is currently running and its discount is
          applied to all products in the group. You can still edit the campaign, but pausing or
          ending it will unlock individual product seasonal sales.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Campaign details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <FieldRow label="Name" htmlFor="name">
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Summer Sale 2026"
              maxLength={120}
              required
            />
          </FieldRow>

          <FieldRow label="Discount" htmlFor="discount_percent">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="flex">
                <Input
                  id="discount_percent"
                  type="number"
                  min={1}
                  max={100}
                  step={0.01}
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  placeholder="10"
                  className="h-9 w-24 rounded-r-none tabular-nums"
                  required
                />
                <span className="inline-flex h-9 items-center rounded-r-md border border-l-0 border-border bg-white px-2.5 text-sm text-muted-foreground">
                  % off
                </span>
              </div>
              <p className="text-xs text-muted-foreground sm:pt-2">
                Applied at display time; product prices are not changed.
              </p>
            </div>
          </FieldRow>

          <FieldRow label="Schedule" htmlFor="starts_at">
            <ScheduleSection startsAt={startsAt} endsAt={endsAt} onChange={setStartsAtAndEndsAt} />
          </FieldRow>

          <FieldRow label="Campaign label" htmlFor="label">
            <div className="space-y-2">
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Winter Sale, Clearance, Black Friday"
                maxLength={60}
              />
              <div className="flex flex-wrap gap-1.5">
                {CAMPAIGN_LABEL_PRESETS.map((preset) => (
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
          </FieldRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductSelector selected={products} onChange={setProducts} />
        </CardContent>
      </Card>

      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardContent className="p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            Schedule summary
          </p>
          <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Starts</p>
              <p className="text-sm font-semibold text-foreground">
                {startsAt ? formatSaleDate(startsAt) : 'Immediately'}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Ends</p>
              <p className="text-sm font-semibold text-foreground">
                {endsAt ? formatSaleDate(endsAt) : 'Open-ended'}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Status</p>
              <CampaignStatusBadge status={status} />
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Products</p>
              <p className="text-sm font-semibold text-foreground">
                {products.length} product{products.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => router.push('/admin/products?view=campaigns&tab=campaigns')} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving…
            </>
          ) : (
            <>{isEditing ? 'Update campaign' : 'Create campaign'}</>
          )}
        </Button>
      </div>
    </form>
  )

  function setStartsAtAndEndsAt(starts: string | null, ends: string | null) {
    setStartsAt(starts)
    setEndsAt(ends)
  }
}
