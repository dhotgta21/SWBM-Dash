'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isValidHex } from '@/lib/appearance-shared'

interface ColorPickerFieldProps {
  id: string
  name: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function ColorPickerField({
  id,
  name,
  label,
  value,
  onChange,
  disabled = false,
}: ColorPickerFieldProps) {
  const isValid = isValidHex(value)

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        <input
          id={`${id}-picker`}
          type="color"
          value={isValid ? value : '#000000'}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 shrink-0 rounded border border-border bg-transparent p-0.5 cursor-pointer disabled:opacity-50"
          aria-label={`${label} colour picker`}
        />
        <Input
          id={id}
          name={name}
          type="text"
          value={value}
          disabled={disabled}
          placeholder="#b91c1c"
          maxLength={7}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          className={!isValid && value ? 'border-destructive' : ''}
        />
      </div>
      {!isValid && value && (
        <p className="text-xs text-destructive">Use a 3 or 6 digit hex code, e.g. #b91c1c.</p>
      )}
    </div>
  )
}
