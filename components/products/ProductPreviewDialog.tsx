'use client'

// components/products/ProductPreviewDialog.tsx
//
// Read-only preview popup opened when a staff member clicks a product row on
// the dashboard `/products` list. Shows every field the catalog carries in a
// scannable, dialog-sized layout — image, status, pricing (with the active sale
// treatment), description, dimensions, coverage, calculator metadata, and the
// seasonal-sale schedule.
//
// The dialog is *display-only*: it never edits state. The action buttons in
// the footer delegate to the existing `ProductActions` island so delete/edit
// flows stay consistent with the rest of the dashboard. We keep that button
// wiring optional via props so the same dialog can be embedded in places that
// don't have edit permission.

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ProductActions } from '@/components/products/ProductActions'
import { cn } from '@/lib/utils'
import { getSaleInfo, describeSaleWindow, formatSaleDate } from '@/lib/products/sale'
import {
  Package,
  Hash,
  Tag,
  Ruler,
  Scaling,
  Calculator,
  ExternalLink,
  Sparkles,
  ImageOff,
} from 'lucide-react'

/**
 * Shape the preview dialog consumes. We intentionally flatten the DB shape so
 * the dialog stays decoupled from the server-side row type — keeps the file
 * portable across the dashboard / portal / any future caller.
 */
export interface ProductPreviewItem {
  id: string
  code: string
  name: string
  description: string
  unit: string
  category: string | null
  default_price: number
  price_from: number | null
  price_includes_vat: boolean
  track_stock: boolean
  stock_quantity: number
  reorder_level: number
  sale_price: number | null
  sale_starts_at: string | null
  sale_ends_at: string | null
  sale_label: string | null
  image_url: string | null
  is_active: boolean
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
  thickness_mm: number | null
  coverage_m2_per_unit: number | null
  coverage_linear_m_per_unit: number | null
  unit_weight_kg: number | null
  pack_size: number | null
  wastage_pct: number | null
  calculator_type: string | null
}

interface ProductPreviewDialogProps {
  product: ProductPreviewItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When true the dialog renders Edit + Delete buttons in the footer. */
  canEdit?: boolean
  canDelete?: boolean
  /** Called after a successful edit/delete from the embedded ProductActions. */
  onChange?: () => void
}

/**
 * Format a measurement that's stored in mm into a human-readable string.
 * Bricks / blocks live in the 60-300 mm range so mm is appropriate, but large
 * sheets look silly without a unit conversion. Keep this local — it's a
 * dialed-in preview-only formatter, not a currency/locale utility.
 */
function formatMm(value: number | null | undefined): string {
  if (value == null) return '—'
  if (value >= 1000) {
    const m = value / 1000
    return `${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(2)} m`
  }
  return `${value} mm`
}

function formatCoverage(value: number | null | undefined, unit: string): string {
  if (value == null || Number.isNaN(value)) return '—'
  const rounded = Number.isInteger(value) ? value.toString() : value.toFixed(2)
  return `${rounded} ${unit}`
}

function formatWeight(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${Number.isInteger(value) ? value.toString() : value.toFixed(2)} kg`
}

function calculatorLabel(value: string | null | undefined): string {
  if (!value) return '—'
  // Mirror the human labels from ProductForm so the dashboard and the form
  // stay consistent without re-defining the option list server-side.
  const map: Record<string, string> = {
    BRICK_WALL: 'Brick & block wall',
    MORTAR_CONCRETE: 'Mortar & concrete mix',
    SHEET_MATERIALS: 'Sheet materials',
    AGGREGATES: 'Aggregates & sub-base',
    SCREED: 'Screed',
    PLASTERING: 'Plastering & board',
    INSULATION: 'Insulation',
    ROOFING: 'Roofing',
    TIMBER: 'Timber & studwork',
    STEEL_LINTEL: 'Steel & lintel selector',
  }
  return map[value] ?? value
}

/**
 * Compact `key: value` row used throughout the preview. Horizontal rule on top
 * of each block keeps the dense dialog scannable.
 */
function DetailRow({
  label,
  value,
  className,
}: {
  label: string
  value: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 py-2 text-sm',
        className
      )}
    >
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  )
}

/**
 * A small sectioned card — header row with an icon, then body content.
 * Renders nothing if the body is empty so we don't dump empty cards into the
 * dialog for products that only have one or two fields populated.
 */
function PreviewSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-muted-foreground">
          {icon}
        </span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </header>
      <div className="px-4 py-2">{children}</div>
    </section>
  )
}

export function ProductPreviewDialog({
  product,
  open,
  onOpenChange,
  canEdit = false,
  canDelete = false,
  onChange,
}: ProductPreviewDialogProps) {
  // Compute sale state every render — cheap, and keeps the popup in sync if
  // the row stays open across a sale-window boundary (e.g. open at 11:59 pm).
  const sale = useMemo(
    () => (product ? getSaleInfo(product) : null),
    [product]
  )

  // Reset body scroll lock if the dialog is dismissed while the user scrolled.
  // The base Dialog renders `null` when `open` is false which React handles,
  // but a stale overflow-y lock survives route changes — flush it defensively.
  useEffect(() => {
    if (!open && typeof document !== 'undefined') {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!product) return null

  const onSale = sale?.active ?? false
  const scheduled = sale?.state === 'scheduled'
  const saleWindow = sale ? describeSaleWindow(sale) : null
  const effectivePrice = sale?.effectivePrice ?? product.default_price
  const hasPrice = product.default_price > 0
  const showSaleSchedule = product.sale_price != null
  const showDimensions =
    product.length_mm != null ||
    product.width_mm != null ||
    product.height_mm != null ||
    product.thickness_mm != null
  const showCoverage =
    product.coverage_m2_per_unit != null ||
    product.coverage_linear_m_per_unit != null ||
    product.unit_weight_kg != null ||
    product.pack_size != null ||
    product.wastage_pct != null
  const showCalculator = !!product.calculator_type

  const productForActions = {
    id: product.id,
    code: product.code,
    name: product.name,
    description: product.description,
    unit: product.unit,
    category: product.category ?? '',
    default_price: product.default_price,
    image_url: product.image_url ?? '',
    is_active: product.is_active,
    price_from: (product as { price_from?: number | null }).price_from ?? null,
    price_includes_vat: (product as { price_includes_vat?: boolean | null }).price_includes_vat ?? false,
    length_mm: product.length_mm,
    width_mm: product.width_mm,
    height_mm: product.height_mm,
    thickness_mm: product.thickness_mm,
    coverage_m2_per_unit: product.coverage_m2_per_unit,
    coverage_linear_m_per_unit: product.coverage_linear_m_per_unit,
    unit_weight_kg: product.unit_weight_kg,
    pack_size: product.pack_size,
    wastage_pct: product.wastage_pct ?? 5,
    calculator_type: product.calculator_type ?? '',
    sale_price: product.sale_price,
    sale_starts_at: product.sale_starts_at,
    sale_ends_at: product.sale_ends_at,
    sale_label: product.sale_label,
    track_stock: (product as { track_stock?: boolean | null }).track_stock ?? false,
    stock_quantity: (product as { stock_quantity?: number | null }).stock_quantity ?? 0,
    reorder_level: (product as { reorder_level?: number | null }).reorder_level ?? 0,
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogClose onClick={() => onOpenChange(false)} />
        <DialogHeader>
          <div className="flex flex-wrap items-start gap-2 pr-8">
            <Package className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <DialogTitle className="flex-1 truncate">
              <span className="break-words">{product.name}</span>
            </DialogTitle>
            {onSale ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-success ring-1 ring-success/20">
                <Sparkles className="h-3 w-3" />
                Sale · {sale?.discountPercent ? `-${sale.discountPercent}%` : 'Live'}
              </span>
            ) : scheduled ? (
              <span className="inline-flex items-center rounded-full bg-info-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-info">
                Upcoming sale
              </span>
            ) : null}
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                product.is_active
                  ? 'bg-success-muted text-success'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {product.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <DialogDescription>
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1 font-mono text-foreground">
                <Hash className="h-3 w-3" />
                {product.code}
              </span>
              <span aria-hidden>·</span>
              <span>
                per <span className="font-medium text-foreground">{product.unit}</span>
              </span>
              {product.category ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    {product.category}
                  </span>
                </>
              ) : null}
              {saleWindow ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-muted-foreground">{saleWindow}</span>
                </>
              ) : null}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
          {/* Image — fixed-aspect box, fallback to a stylised Package icon. */}
          <div className="flex flex-col gap-3">
            <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-border bg-gradient-to-br from-muted to-secondary">
              {product.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground/60">
                  <ImageOff className="h-10 w-10" strokeWidth={1.25} />
                  <span className="text-[11px] uppercase tracking-wider">
                    No image
                  </span>
                </div>
              )}
            </div>

            {/* Price block — fixed visual hierarchy so the eye lands on the
                effective number first, then the strike-through default. */}
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Price
              </p>
              {hasPrice || onSale ? (
                <div className="mt-1">
                  <p
                    className={cn(
                      'text-2xl font-semibold leading-tight',
                      onSale ? 'text-success' : 'text-foreground'
                    )}
                  >
                    £
                    {(onSale ? effectivePrice : product.default_price).toFixed(2)}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      / {product.unit}
                    </span>
                  </p>
                  {onSale ? (
                    <p className="mt-1 text-sm">
                      <span className="font-medium text-foreground">
                        Save £
                        {(product.default_price - effectivePrice).toFixed(2)}
                      </span>
                      <span className="ml-1 text-xs text-muted-foreground line-through">
                        £{product.default_price.toFixed(2)}
                      </span>
                    </p>
                  ) : null}
                  {sale?.label && (onSale || scheduled) ? (
                    <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning ring-1 ring-warning/20">
                      <Tag className="h-3 w-3" />
                      {sale.label}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  Price on application
                </p>
              )}
            </div>

            {product.is_active ? (
              <Link
                href={`/products/${encodeURIComponent(product.code)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View on public catalogue
              </Link>
            ) : null}
          </div>

          {/* Detail column — sectioned cards for scanability. Each card only
              renders when at least one of its rows has data so the dialog
              doesn't show empty shells for sparse products. */}
          <div className="flex flex-col gap-4">
            {product.description ? (
              <PreviewSection
                icon={<Package className="h-3.5 w-3.5" />}
                title="Description"
              >
                <p className="whitespace-pre-line py-2 text-sm leading-relaxed text-foreground">
                  {product.description}
                </p>
              </PreviewSection>
            ) : null}

            {showDimensions || showCoverage ? (
              <PreviewSection
                icon={<Ruler className="h-3.5 w-3.5" />}
                title="Specifications"
              >
                <div className="divide-y divide-border">
                  {showDimensions ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0 py-2 sm:grid-cols-4">
                      <DetailRow label="Length" value={formatMm(product.length_mm)} />
                      <DetailRow label="Width" value={formatMm(product.width_mm)} />
                      <DetailRow label="Height" value={formatMm(product.height_mm)} />
                      <DetailRow
                        label="Thickness"
                        value={formatMm(product.thickness_mm)}
                      />
                    </div>
                  ) : null}
                  {showCoverage ? (
                    <div className="grid grid-cols-1 gap-x-4 gap-y-0 py-2 sm:grid-cols-2">
                      <DetailRow
                        label="Coverage / unit"
                        value={formatCoverage(
                          product.coverage_m2_per_unit,
                          'm²'
                        )}
                      />
                      <DetailRow
                        label="Linear coverage"
                        value={formatCoverage(
                          product.coverage_linear_m_per_unit,
                          'm'
                        )}
                      />
                      <DetailRow
                        label="Unit weight"
                        value={formatWeight(product.unit_weight_kg)}
                      />
                      <DetailRow
                        label="Pack size"
                        value={
                          product.pack_size != null
                            ? `${product.pack_size}`
                            : '—'
                        }
                      />
                      <DetailRow
                        label="Default wastage"
                        value={
                          product.wastage_pct != null
                            ? `${product.wastage_pct}%`
                            : '—'
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </PreviewSection>
            ) : null}

            {showCalculator ? (
              <PreviewSection
                icon={<Scaling className="h-3.5 w-3.5" />}
                title="Quantity calculator"
              >
                <DetailRow
                  label="Calculator"
                  value={
                    <span className="inline-flex items-center gap-1">
                      <Calculator className="h-3.5 w-3.5 text-muted-foreground" />
                      {calculatorLabel(product.calculator_type)}
                    </span>
                  }
                />
              </PreviewSection>
            ) : null}

            {showSaleSchedule ? (
              <PreviewSection
                icon={<Sparkles className="h-3.5 w-3.5" />}
                title="Sale schedule"
              >
                <div className="divide-y divide-border">
                  <DetailRow
                    label="Sale price"
                    value={
                      product.sale_price != null
                        ? `£${product.sale_price.toFixed(2)}`
                        : '—'
                    }
                  />
                  <DetailRow
                    label="Starts"
                    value={formatSaleDate(product.sale_starts_at)}
                  />
                  <DetailRow
                    label="Ends"
                    value={formatSaleDate(product.sale_ends_at)}
                  />
                  {sale?.discountPercent ? (
                    <DetailRow
                      label="Discount"
                      value={`-${sale.discountPercent}%`}
                    />
                  ) : null}
                </div>
              </PreviewSection>
            ) : null}
          </div>
        </div>

        {/* Footer — close + delegated edit/delete. ProductActions returns null
            when the user has neither capability, so the dialog collapses the
            button row to a single "Close" for read-only viewers. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            Preview only — click <span className="font-medium">Edit</span> to modify.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {(canEdit || canDelete) && (
              <div onClick={(e) => e.stopPropagation()}>
                <ProductActions
                  product={productForActions}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  onChange={() => {
                    onChange?.()
                    onOpenChange(false)
                  }}
                />
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
