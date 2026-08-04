'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  createClientDeliveryAddress,
  updateClientDeliveryAddress,
  deleteClientDeliveryAddress,
} from './actions'
import { MapPin, Plus, Pencil, Trash2, Star, Check, X } from 'lucide-react'

interface DeliveryAddress {
  id: string
  label: string
  is_default: boolean
  address_line_1: string
  address_line_2: string | null
  town: string
  county: string | null
  postcode: string
  contact_name: string | null
  contact_phone: string | null
  delivery_notes: string | null
}

interface ClientDeliveryAddressesProps {
  addresses: DeliveryAddress[]
}

interface AddressFormValues {
  label: string
  is_default: boolean
  address_line_1: string
  address_line_2: string
  town: string
  county: string
  postcode: string
  contact_name: string
  contact_phone: string
  delivery_notes: string
}

const emptyAddress: AddressFormValues = {
  label: '',
  is_default: false,
  address_line_1: '',
  address_line_2: '',
  town: '',
  county: '',
  postcode: '',
  contact_name: '',
  contact_phone: '',
  delivery_notes: '',
}

function formatAddress(address: DeliveryAddress) {
  const parts = [
    address.address_line_1,
    address.address_line_2,
    address.town,
    address.county,
    address.postcode,
  ].filter(Boolean)
  return parts.join(', ')
}

export function ClientDeliveryAddresses({ addresses }: ClientDeliveryAddressesProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AddressFormValues>(emptyAddress)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startAdd() {
    setEditingId(null)
    setForm(emptyAddress)
    setIsEditing(true)
    setError(null)
  }

  function startEdit(address: DeliveryAddress) {
    setEditingId(address.id)
    setForm({
      label: address.label,
      is_default: address.is_default,
      address_line_1: address.address_line_1,
      address_line_2: address.address_line_2 ?? '',
      town: address.town,
      county: address.county ?? '',
      postcode: address.postcode,
      contact_name: address.contact_name ?? '',
      contact_phone: address.contact_phone ?? '',
      delivery_notes: address.delivery_notes ?? '',
    })
    setIsEditing(true)
    setError(null)
  }

  function cancelEdit() {
    setIsEditing(false)
    setEditingId(null)
    setForm(emptyAddress)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const input = {
      label: form.label,
      addressLine1: form.address_line_1,
      addressLine2: form.address_line_2,
      town: form.town,
      county: form.county,
      postcode: form.postcode,
      contactName: form.contact_name,
      contactPhone: form.contact_phone,
      deliveryNotes: form.delivery_notes,
      isDefault: form.is_default,
    }

    const result = editingId
      ? await updateClientDeliveryAddress(editingId, input)
      : await createClientDeliveryAddress(input)

    setPending(false)

    if (result?.error) {
      setError(result.error)
    } else {
      setIsEditing(false)
      setEditingId(null)
      setForm(emptyAddress)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this address?')) return
    const result = await deleteClientDeliveryAddress(id)
    if (result?.error) {
      setError(result.error)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Delivery addresses</CardTitle>
          <CardDescription>Save job sites, yards or offices for faster checkout.</CardDescription>
        </div>
        {!isEditing && (
          <Button onClick={startAdd} size="sm" variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Add address
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {isEditing ? (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="label">Address label</Label>
                <Input
                  id="label"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="e.g. Site A, Head office"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="address_line_1">Address line 1</Label>
                <Input
                  id="address_line_1"
                  value={form.address_line_1}
                  onChange={(e) => setForm({ ...form, address_line_1: e.target.value })}
                  placeholder="Street address"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="address_line_2">Address line 2 (optional)</Label>
                <Input
                  id="address_line_2"
                  value={form.address_line_2}
                  onChange={(e) => setForm({ ...form, address_line_2: e.target.value })}
                  placeholder="Unit, building, etc."
                />
              </div>
              <div>
                <Label htmlFor="town">Town / city</Label>
                <Input
                  id="town"
                  value={form.town}
                  onChange={(e) => setForm({ ...form, town: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="county">County (optional)</Label>
                <Input
                  id="county"
                  value={form.county}
                  onChange={(e) => setForm({ ...form, county: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="postcode">Postcode</Label>
                <Input
                  id="postcode"
                  value={form.postcode}
                  onChange={(e) => setForm({ ...form, postcode: e.target.value })}
                  placeholder="e.g. SL1 1AA"
                  required
                  className="uppercase"
                />
              </div>
              <div>
                <Label htmlFor="contact_name">Contact name (optional)</Label>
                <Input
                  id="contact_name"
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="contact_phone">Contact phone (optional)</Label>
                <Input
                  id="contact_phone"
                  value={form.contact_phone}
                  onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="delivery_notes">Delivery notes (optional)</Label>
                <Input
                  id="delivery_notes"
                  value={form.delivery_notes}
                  onChange={(e) => setForm({ ...form, delivery_notes: e.target.value })}
                  placeholder="e.g. Use side gate"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="is_default"
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
              />
              <Label htmlFor="is_default" className="text-sm font-normal">
                Make this my default delivery address
              </Label>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                <Check className="mr-2 h-4 w-4" />
                {pending ? 'Saving…' : editingId ? 'Update address' : 'Save address'}
              </Button>
            </div>
          </form>
        ) : (
          <>
            {addresses.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <MapPin className="mx-auto h-10 w-10 text-muted-foreground/60" />
                <p className="mt-3">No saved delivery addresses yet.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {addresses.map((address) => (
                  <li
                    key={address.id}
                    className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground">{address.label}</p>
                        {address.is_default && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            <Star className="h-3 w-3 fill-primary" />
                            Default
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{formatAddress(address)}</p>
                      {(address.contact_name || address.contact_phone) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {address.contact_name}
                          {address.contact_name && address.contact_phone && ' · '}
                          {address.contact_phone}
                        </p>
                      )}
                      {address.delivery_notes && (
                        <p className="mt-1 text-xs italic text-muted-foreground">
                          Note: {address.delivery_notes}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(address)}
                        className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Edit address"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(address.id)}
                        className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Delete address"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
