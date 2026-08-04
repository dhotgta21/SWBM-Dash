'use client'

import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface FontUploadFieldProps {
  id: string
  name: string
  label: string
  description?: string
  currentUrl?: string | null
  currentFamily?: string | null
  disabled?: boolean
  onChange?: (file: File | null) => void
}

export function FontUploadField({
  id,
  name,
  label,
  description,
  currentUrl,
  currentFamily,
  disabled = false,
  onChange,
}: FontUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)

  const displayName = selectedName || currentFamily || 'Default font'
  const hasCustomFont = Boolean(currentUrl)

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        <Input
          ref={inputRef}
          id={id}
          name={name}
          type="file"
          accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
          disabled={disabled}
          className="flex-1"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null
            setSelectedName(file ? file.name : null)
            onChange?.(file)
          }}
        />
        {hasCustomFont && !disabled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedName(null)
              if (inputRef.current) {
                inputRef.current.value = ''
              }
              onChange?.(null)
            }}
          >
            Clear
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {description || 'Upload TTF, OTF, WOFF, or WOFF2. Max 5 MB.'}
      </p>
      <p className="text-xs font-medium text-foreground">
        Current: {displayName}
        {selectedName && <span className="text-muted-foreground ml-1">(will be uploaded on save)</span>}
      </p>
    </div>
  )
}
