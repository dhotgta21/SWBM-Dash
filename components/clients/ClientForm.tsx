'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AddressAutocomplete, type AddressValue } from '@/components/clients/AddressAutocomplete'
import { createClientRecord, updateClientRecord, ClientFormData } from '@/lib/actions/clients'

interface ClientFormProps {
  initialData?: Partial<ClientFormData> & { id?: string }
  /**
   * Whether the current user may set the credit fields (payment terms +
   * credit limit). Follows the clients_manage_account money permission —
   * when false the inputs are disabled and the server applies defaults.
   */
  canManageCredit?: boolean
}

export function ClientForm({ initialData, canManageCredit = true }: ClientFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<ClientFormData>({
    first_name: initialData?.first_name ?? '',
    last_name: initialData?.last_name ?? '',
    email: initialData?.email ?? '',
    phone: initialData?.phone ?? '',
    company_name: initialData?.company_name ?? '',
    account_number: initialData?.account_number ?? '',
    address_line_1: initialData?.address_line_1 ?? '',
    address_line_2: initialData?.address_line_2 ?? '',
    town: initialData?.town ?? '',
    county: initialData?.county ?? '',
    postcode: initialData?.postcode ?? '',
    notes: initialData?.notes ?? '',
    payment_terms_days: initialData?.payment_terms_days ?? '30',
    credit_limit: initialData?.credit_limit ?? '',
  })

  function handleChange(field: keyof ClientFormData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  function handleAddressChange(next: AddressValue) {
    setFormData((prev) => ({
      ...prev,
      address_line_1: next.line1,
      address_line_2: next.line2,
      town: next.town,
      county: next.county,
      postcode: next.postcode,
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      setError('First and last name are required')
      setLoading(false)
      return
    }
    // At least one contact channel is required (email OR phone) — mirrors
    // the server-side validation in lib/actions/clients.ts.
    if (!formData.phone?.trim() && !formData.email?.trim()) {
      setError('An email address or phone number is required')
      setLoading(false)
      return
    }
    if (canManageCredit) {
      const termsRaw = formData.payment_terms_days?.trim() ?? ''
      const terms = Number(termsRaw)
      if (!termsRaw) {
        setError('Payment terms (days) are required')
        setLoading(false)
        return
      }
      if (!Number.isInteger(terms) || terms < 0 || terms > 3650) {
        setError('Payment terms must be a whole number of days (0–3650)')
        setLoading(false)
        return
      }
      const limitRaw = formData.credit_limit?.trim() ?? ''
      const limit = Number(limitRaw)
      if (!limitRaw) {
        setError('Credit limit is required')
        setLoading(false)
        return
      }
      if (!Number.isFinite(limit) || limit < 0) {
        setError('Credit limit must be a number (0 or more)')
        setLoading(false)
        return
      }
    }

    const result = initialData?.id
      ? await updateClientRecord(initialData.id, formData)
      : await createClientRecord(formData)

    setLoading(false)

    if (result.error) {
      setError(result.error)
      return
    }

    router.push('/clients')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="first_name">First Name *</Label>
          <Input
            id="first_name"
            value={formData.first_name}
            onChange={(e) => handleChange('first_name', e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last_name">Last Name *</Label>
          <Input
            id="last_name"
            value={formData.last_name}
            onChange={(e) => handleChange('last_name', e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            value={formData.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="company_name">Company Name</Label>
          <Input
            id="company_name"
            value={formData.company_name}
            onChange={(e) => handleChange('company_name', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="account_number">Account Number</Label>
          <Input
            id="account_number"
            value={formData.account_number}
            onChange={(e) => handleChange('account_number', e.target.value)}
            placeholder="Auto-generated if left blank"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="payment_terms_days">Payment terms (days) *</Label>
          <Input
            id="payment_terms_days"
            type="number"
            min={0}
            max={3650}
            step={1}
            value={formData.payment_terms_days}
            onChange={(e) => handleChange('payment_terms_days', e.target.value)}
            disabled={!canManageCredit}
            required={canManageCredit}
          />
          <p className="text-xs text-muted-foreground">
            Invoices fall due this many days after the issue date.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="credit_limit">Credit limit (£) *</Label>
          <Input
            id="credit_limit"
            type="number"
            min={0}
            step="0.01"
            value={formData.credit_limit}
            onChange={(e) => handleChange('credit_limit', e.target.value)}
            disabled={!canManageCredit}
            required={canManageCredit}
          />
          <p className="text-xs text-muted-foreground">
            {canManageCredit
              ? 'The account is flagged “Over limit” when the outstanding balance passes this.'
              : 'Only users with the account-management permission can change credit terms.'}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Address</Label>
        <AddressAutocomplete
          idPrefix="client"
          value={{
            line1: formData.address_line_1 || '',
            line2: formData.address_line_2 || '',
            town: formData.town || '',
            county: formData.county || '',
            postcode: formData.postcode || '',
          }}
          onChange={handleAddressChange}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          rows={3}
          className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          value={formData.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : initialData?.id ? 'Update Client' : 'Create Client'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/clients')}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
