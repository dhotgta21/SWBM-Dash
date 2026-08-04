'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateInvoiceStatus } from '@/lib/actions/invoices'
import { getSelectableStatuses } from '@/lib/invoice-status'
import { PAYMENT_STATUS_STYLES } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

interface InvoiceStatusDropdownProps {
  id: string
  type: 'invoice' | 'quotation'
  status: string
}

export function InvoiceStatusDropdown({ id, type, status }: InvoiceStatusDropdownProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const current = status.toLowerCase()
  const options = getSelectableStatuses(type, current)

  async function handleChange(value: string) {
    if (value === current) return
    setError(null)
    startTransition(async () => {
      const result = await updateInvoiceStatus(id, value)
      if (result.error) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="relative">
      <div className="relative inline-flex items-center">
        <select
          value={current}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isPending}
          className={cn(
            'appearance-none rounded-full px-3 py-1 pr-7 text-xs font-medium capitalize border-0 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-70 cursor-pointer',
            PAYMENT_STATUS_STYLES[current as keyof typeof PAYMENT_STATUS_STYLES] ||
              'bg-gray-100 text-gray-800'
          )}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {isPending ? (
          <Loader2 className="absolute right-2 w-3 h-3 animate-spin text-current opacity-70" />
        ) : (
          <svg
            className="absolute right-2 w-3 h-3 text-current opacity-70 pointer-events-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
