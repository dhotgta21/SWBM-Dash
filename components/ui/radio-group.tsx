'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface RadioGroupProps {
  name?: string
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  className?: string
  children: React.ReactNode
}

export function RadioGroup({
  name,
  value,
  defaultValue,
  onValueChange,
  className,
  children,
}: RadioGroupProps) {
  return (
    <div
      role="radiogroup"
      className={cn('flex flex-col gap-2', className)}
    >
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child
        return React.cloneElement(child as React.ReactElement<RadioGroupItemProps>, {
          name,
          groupValue: value,
          defaultGroupValue: defaultValue,
          onValueChange,
        })
      })}
    </div>
  )
}

interface RadioGroupItemProps {
  value: string
  id?: string
  name?: string
  groupValue?: string
  defaultGroupValue?: string
  onValueChange?: (value: string) => void
  children?: React.ReactNode
  className?: string
}

export function RadioGroupItem({
  value,
  id,
  name,
  groupValue,
  defaultGroupValue,
  onValueChange,
  children,
  className,
}: RadioGroupItemProps) {
  const inputId = id || `radio-${value}`
  const isControlled = groupValue !== undefined
  const checked = isControlled ? groupValue === value : undefined

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'inline-flex items-center gap-2 cursor-pointer',
        className
      )}
    >
      <input
        id={inputId}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        defaultChecked={!isControlled ? defaultGroupValue === value : undefined}
        onChange={(e) => onValueChange?.(e.target.value)}
        className="h-4 w-4 accent-primary"
      />
      {children}
    </label>
  )
}
