'use client'

/**
 * Variant editor for the admin product form.
 *
 * Drives the `variant_options` JSONB structure that the public product
 * page renders as a dropdown. The new shape (post 2026-07-18
 * refactor) is deliberately flat and simple:
 *
 *   { options: [{ value, text, measurements?: [{ name, value, unit }] }] }
 *
 * Differences from the legacy shape:
 *   - No per-variant `material` / `image` / `selectors[]` wrapping.
 *     Material is a product-level concern (see Product.materials) and
 *     the product image is shared across all variants, so those fields
 *     were dropped to remove fields the operator didn't actually need.
 *   - No multi-selector (no "Add another selector"). A variant has one
 *     options list — if a product needs multiple dimensions (e.g.
 *     size + finish), they live in the option text.
 *   - Per-option measurements (length, weight, diameter, etc.) with
 *     free-form units, so steel can carry length_m + weight_kg while
 *     timber just carries a bare "10 × 20" label without measurements.
 *
 * The component is fully controlled — it owns no state of its own and
 * just notifies the parent via `onChange`. That keeps the parent
 * form the single source of truth so the auto-save / dirty-flag
 * logic in ProductForm keeps working unchanged.
 */

import { useCallback, useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, Ruler } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { VariantOption, VariantChoice, VariantMeasurement } from '@/lib/public-products'

interface VariantEditorProps {
  /** Current variant list (controlled). */
  value: VariantOption[] | null | undefined
  /** Called whenever the operator adds / removes / edits a variant. */
  onChange: (next: VariantOption[]) => void
}

/**
 * Slugify an option label into the URL-safe value used by the
 * `/products/<code>?size=<slug>` deep link. Mirrors the hand-crafted
 * convention used by migration 158 (and the Parker Steel import):
 *   "UB 127x76x13kg" → "ub-127x76x13"   (kg suffix dropped)
 *   "SHS 100x100x4mm" → "shs-100x100x4" (mm suffix dropped)
 * Strips common unit suffixes (kg, mm, m, cm, in, ft, lb) so the slug
 * stays a clean identifier rather than a redundant unit. Falls back to
 * a random id when the label slugs to an empty string.
 */
function slugifyOption(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\s*(kg|mm|cm|m|inch|in|ft|lb|lbs)\s*$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || `option-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Common measurement presets the operator can pick from the
 * dropdown when adding a per-option measurement row. Steel
 * families (UB / UC / SHS / RHS / PFC) need length + weight;
 * timber needs length + width; sheet goods need thickness. The
 * preset is just a starting name — the operator can still type
 * anything custom (diameter, coverage, etc.).
 */
const MEASUREMENT_PRESETS: { value: string; label: string }[] = [
  { value: '__custom__', label: 'Custom…' },
  { value: 'length', label: 'Length' },
  { value: 'width', label: 'Width' },
  { value: 'height', label: 'Height' },
  { value: 'thickness', label: 'Thickness' },
  { value: 'diameter', label: 'Diameter' },
  { value: 'weight', label: 'Weight' },
  { value: 'coverage', label: 'Coverage' },
]

const UNIT_PRESETS: { value: string; label: string }[] = [
  { value: 'mm', label: 'mm' },
  { value: 'cm', label: 'cm' },
  { value: 'm', label: 'm' },
  { value: 'in', label: 'in' },
  { value: 'ft', label: 'ft' },
  { value: 'kg', label: 'kg' },
  { value: 'lb', label: 'lb' },
  { value: 'm²', label: 'm²' },
  { value: '__custom__', label: 'Custom…' },
]

/**
 * Single measurement row (name + value + unit) inside an option's
 * collapsible measurements editor. Three-up layout on desktop, stacks
 * on mobile. The unit dropdown is a free-form picker — typing into
 * the input switches the value back to the raw string the operator
 * typed so we never lose a unit the schema doesn't know about.
 */
function MeasurementRow({
  measurement,
  onChange,
  onRemove,
}: {
  measurement: VariantMeasurement
  onChange: (next: VariantMeasurement) => void
  onRemove: () => void
}) {
  const [unitMode, setUnitMode] = useState<'preset' | 'custom'>(
    UNIT_PRESETS.some((u) => u.value === measurement.unit) ? 'preset' : 'custom'
  )
  const [nameMode, setNameMode] = useState<'preset' | 'custom'>(
    MEASUREMENT_PRESETS.some((p) => p.value === measurement.name) ? 'preset' : 'custom'
  )

  return (
    <div className="grid items-end gap-2 sm:grid-cols-[1fr_120px_120px_auto]">
      {nameMode === 'preset' ? (
        <Select
          value={MEASUREMENT_PRESETS.some((p) => p.value === measurement.name) ? measurement.name : '__custom__'}
          onChange={(value) => {
            if (value === '__custom__') {
              setNameMode('custom')
              onChange({ ...measurement, name: '' })
            } else {
              onChange({ ...measurement, name: value })
            }
          }}
          options={MEASUREMENT_PRESETS}
        />
      ) : (
        <Input
          value={measurement.name}
          onChange={(e) => onChange({ ...measurement, name: e.target.value })}
          placeholder="e.g. length"
        />
      )}
      <Input
        type="number"
        min={0}
        step="any"
        value={measurement.value ?? ''}
        onChange={(e) => {
          const raw = e.target.value
          const num = raw === '' ? null : parseFloat(raw)
          onChange({
            ...measurement,
            value: num != null && Number.isFinite(num) ? num : null,
          })
        }}
        placeholder="0"
      />
      {unitMode === 'preset' ? (
        <Select
          value={UNIT_PRESETS.some((u) => u.value === measurement.unit) ? measurement.unit : '__custom__'}
          onChange={(value) => {
            if (value === '__custom__') {
              setUnitMode('custom')
              onChange({ ...measurement, unit: '' })
            } else {
              onChange({ ...measurement, unit: value })
            }
          }}
          options={UNIT_PRESETS}
        />
      ) : (
        <Input
          value={measurement.unit}
          onChange={(e) => onChange({ ...measurement, unit: e.target.value })}
          placeholder="e.g. m"
        />
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="h-9 w-9 text-muted-foreground hover:text-destructive"
        aria-label="Remove measurement"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

/**
 * Collapsible measurements panel for a single option. Toggled by a
 * small "Measurements" pill so the option row stays compact when the
 * product doesn't need per-option metadata. Shows the current
 * measurement count and an inline editor when expanded.
 */
function OptionMeasurements({
  option,
  onChange,
}: {
  option: VariantChoice
  onChange: (next: VariantChoice) => void
}) {
  const [open, setOpen] = useState((option.measurements?.length ?? 0) > 0)
  const count = option.measurements?.length ?? 0

  function updateMeasurements(next: VariantMeasurement[]) {
    // Drop the field entirely when there are no rows so the saved
    // JSONB stays compact (no `measurements: []` noise in the column).
    if (next.length === 0) {
      const { measurements: _drop, ...rest } = option
      void _drop
      onChange(rest)
    } else {
      onChange({ ...option, measurements: next })
    }
  }

  function addMeasurement() {
    setOpen(true)
    updateMeasurements([
      ...(option.measurements ?? []),
      { name: 'length', value: null, unit: 'm' },
    ])
  }

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Ruler className="h-3 w-3" />
        Measurements
        {count > 0 && (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
          {(option.measurements ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No measurements yet — add length, weight, diameter or any spec
              that varies by option.
            </p>
          ) : (
            (option.measurements ?? []).map((m, idx) => (
              <MeasurementRow
                key={idx}
                measurement={m}
                onChange={(next) =>
                  updateMeasurements(
                    (option.measurements ?? []).map((existing, i) =>
                      i === idx ? next : existing
                    )
                  )
                }
                onRemove={() =>
                  updateMeasurements(
                    (option.measurements ?? []).filter((_, i) => i !== idx)
                  )
                }
              />
            ))
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addMeasurement}
            className="h-7 px-2 text-xs"
          >
            <Plus className="mr-1 h-3 w-3" />
            Add measurement
          </Button>
        </div>
      )}
    </div>
  )
}

export function VariantEditor({ value, onChange }: VariantEditorProps) {
  const variants = value ?? []

  const update = useCallback(
    (next: VariantOption[]) => {
      onChange(next)
    },
    [onChange]
  )

  function addVariant() {
    update([
      ...variants,
      {
        options: [],
      },
    ])
  }

  function updateVariant(index: number, patch: Partial<VariantOption>) {
    update(variants.map((v, i) => (i === index ? { ...v, ...patch } : v)))
  }

  function removeVariant(index: number) {
    update(variants.filter((_, i) => i !== index))
  }

  function addOption(variantIndex: number) {
    const variant = variants[variantIndex]
    if (!variant) return
    updateVariant(variantIndex, {
      options: [...variant.options, { value: '', text: '' }],
    })
  }

  function updateOption(variantIndex: number, optionIndex: number, next: VariantChoice) {
    const variant = variants[variantIndex]
    if (!variant) return
    const options = variant.options.map((o, i) => (i === optionIndex ? next : o))
    updateVariant(variantIndex, { options })
  }

  function removeOption(variantIndex: number, optionIndex: number) {
    const variant = variants[variantIndex]
    if (!variant) return
    updateVariant(variantIndex, {
      options: variant.options.filter((_, i) => i !== optionIndex),
    })
  }

  if (variants.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No variants yet. Add a variant when this product comes in multiple
          sizes or specs — the public product page will render a dropdown so
          customers can pick one before adding to the quote.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={addVariant}
          className="mt-3"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add variant
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {variants.map((variant, variantIndex) => (
        <div
          key={variantIndex}
          className="rounded-lg border border-border bg-card p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Variant {variants.length > 1 ? variantIndex + 1 : ''}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeVariant(variantIndex)}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Remove variant
            </Button>
          </div>

          {/* Options */}
          <div className="space-y-2">
            {variant.options.map((option, optionIndex) => (
              <div
                key={optionIndex}
                className="rounded-md border border-border/60 bg-background p-3 transition-colors focus-within:border-primary/40"
              >
                <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <Label
                      htmlFor={`option-text-${variantIndex}-${optionIndex}`}
                      className="text-[11px] uppercase tracking-wide text-muted-foreground"
                    >
                      Label
                    </Label>
                    <Input
                      id={`option-text-${variantIndex}-${optionIndex}`}
                      value={option.text}
                      onChange={(e) => {
                        const text = e.target.value
                        // Auto-regenerate the slug when the operator
                        // hasn't touched the value field yet (still
                        // matches the slugified label), so typing
                        // the label is a one-step operation. Once
                        // they edit the slug directly we leave it
                        // alone so we don't clobber custom URLs.
                        const isAutoSlug =
                          !option.value || option.value === slugifyOption(option.text)
                        updateOption(variantIndex, optionIndex, {
                          ...option,
                          text,
                          value: isAutoSlug ? slugifyOption(text) : option.value,
                        })
                      }}
                      placeholder="e.g. UB 127x76x13kg"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor={`option-value-${variantIndex}-${optionIndex}`}
                      className="text-[11px] uppercase tracking-wide text-muted-foreground"
                    >
                      Slug (URL)
                    </Label>
                    <Input
                      id={`option-value-${variantIndex}-${optionIndex}`}
                      value={option.value}
                      onChange={(e) =>
                        updateOption(variantIndex, optionIndex, {
                          ...option,
                          value: e.target.value,
                        })
                      }
                      placeholder="ub-127x76x13"
                      className="font-mono text-xs"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeOption(variantIndex, optionIndex)}
                    className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    aria-label="Remove option"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <OptionMeasurements
                  option={option}
                  onChange={(next) => updateOption(variantIndex, optionIndex, next)}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addOption(variantIndex)}
              className="w-full sm:w-auto"
            >
              <Plus className="mr-2 h-3 w-3" />
              Add option
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={addVariant}>
        <Plus className="mr-2 h-4 w-4" />
        Add another variant
      </Button>
    </div>
  )
}
