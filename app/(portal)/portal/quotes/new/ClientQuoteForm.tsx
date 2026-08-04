'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2, Loader2, ArrowLeft } from 'lucide-react'
import { createClientQuote } from '../actions'

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

interface QuoteItem {
  id: string
  product_name: string
  quantity: string
  notes: string
}

interface ClientQuoteFormProps {
  deliveryAddresses: DeliveryAddress[]
}

type AddressMode = 'saved' | 'new'

export function ClientQuoteForm({ deliveryAddresses }: ClientQuoteFormProps) {
  const router = useRouter()
  const [items, setItems] = useState<QuoteItem[]>([
    { id: crypto.randomUUID(), product_name: '', quantity: '1', notes: '' },
  ])
  const [notes, setNotes] = useState('')
  const [addressMode, setAddressMode] = useState<AddressMode>(
    deliveryAddresses.length > 0 ? 'saved' : 'new'
  )
  const [selectedAddressId, setSelectedAddressId] = useState<string | ''>(
    deliveryAddresses.find((a) => a.is_default)?.id ?? deliveryAddresses[0]?.id ?? ''
  )
  const [newAddress, setNewAddress] = useState({
    label: '',
    address_line_1: '',
    address_line_2: '',
    town: '',
    county: '',
    postcode: '',
  })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedAddress = useMemo(
    () => deliveryAddresses.find((a) => a.id === selectedAddressId),
    [deliveryAddresses, selectedAddressId]
  )

  function addItem() {
    setItems((prev) => [...prev, { id: crypto.randomUUID(), product_name: '', quantity: '1', notes: '' }])
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  function updateItem(id: string, field: keyof QuoteItem, value: string) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)))
  }

  async function handleSubmit(formData: FormData) {
    setPending(true)
    setError(null)

    const payload = items
      .filter((item) => item.product_name.trim() && Number(item.quantity) > 0)
      .map((item) => ({
        product_name: item.product_name.trim(),
        quantity: Number(item.quantity),
        notes: item.notes.trim(),
      }))

    let deliveryAddress: Record<string, string | null> | null = null
    if (addressMode === 'saved' && selectedAddress) {
      deliveryAddress = {
        label: selectedAddress.label,
        address_line_1: selectedAddress.address_line_1,
        address_line_2: selectedAddress.address_line_2,
        town: selectedAddress.town,
        county: selectedAddress.county,
        postcode: selectedAddress.postcode,
        contact_name: selectedAddress.contact_name,
        contact_phone: selectedAddress.contact_phone,
        delivery_notes: selectedAddress.delivery_notes,
      }
    } else if (addressMode === 'new') {
      if (!newAddress.address_line_1.trim() || !newAddress.town.trim() || !newAddress.postcode.trim()) {
        setPending(false)
        setError('Please enter a complete delivery address.')
        return
      }
      deliveryAddress = {
        label: newAddress.label.trim() || 'One-off delivery address',
        address_line_1: newAddress.address_line_1.trim(),
        address_line_2: newAddress.address_line_2.trim() || null,
        town: newAddress.town.trim(),
        county: newAddress.county.trim() || null,
        postcode: newAddress.postcode.trim().toUpperCase(),
        contact_name: null,
        contact_phone: null,
        delivery_notes: null,
      }
    }

    const data = new FormData()
    data.set('items', JSON.stringify(payload))
    data.set('notes', notes)
    data.set('delivery_address', JSON.stringify(deliveryAddress))

    const result = await createClientQuote(data)
    setPending(false)

    if (result?.error) {
      setError(result.error)
    }
    // Success redirects from the server action.
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Deliver to</h2>

        {deliveryAddresses.length > 0 && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAddressMode('saved')}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  addressMode === 'saved'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:bg-muted/50'
                }`}
              >
                Saved address
              </button>
              <button
                type="button"
                onClick={() => setAddressMode('new')}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  addressMode === 'new'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:bg-muted/50'
                }`}
              >
                New address
              </button>
            </div>

            {addressMode === 'saved' && (
              <div>
                <Label htmlFor="saved-address">Select a saved address</Label>
                <select
                  id="saved-address"
                  value={selectedAddressId}
                  onChange={(e) => setSelectedAddressId(e.target.value)}
                  className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {deliveryAddresses.map((address) => (
                    <option key={address.id} value={address.id}>
                      {address.label}
                      {address.is_default ? ' (default)' : ''} — {address.address_line_1},{' '}
                      {address.postcode}
                    </option>
                  ))}
                </select>
                {selectedAddress && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {selectedAddress.address_line_1}
                    {selectedAddress.address_line_2 ? `, ${selectedAddress.address_line_2}` : ''},
                    {selectedAddress.town}, {selectedAddress.county ? `${selectedAddress.county}, ` : ''}
                    {selectedAddress.postcode}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {addressMode === 'new' && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="new-label">Address label (optional)</Label>
              <Input
                id="new-label"
                value={newAddress.label}
                onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })}
                placeholder="e.g. Site office"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="new-line1">Address line 1</Label>
              <Input
                id="new-line1"
                value={newAddress.address_line_1}
                onChange={(e) => setNewAddress({ ...newAddress, address_line_1: e.target.value })}
                placeholder="Street address"
                required={addressMode === 'new'}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="new-line2">Address line 2 (optional)</Label>
              <Input
                id="new-line2"
                value={newAddress.address_line_2}
                onChange={(e) => setNewAddress({ ...newAddress, address_line_2: e.target.value })}
                placeholder="Unit, building, etc."
              />
            </div>
            <div>
              <Label htmlFor="new-town">Town / city</Label>
              <Input
                id="new-town"
                value={newAddress.town}
                onChange={(e) => setNewAddress({ ...newAddress, town: e.target.value })}
                required={addressMode === 'new'}
              />
            </div>
            <div>
              <Label htmlFor="new-county">County (optional)</Label>
              <Input
                id="new-county"
                value={newAddress.county}
                onChange={(e) => setNewAddress({ ...newAddress, county: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="new-postcode">Postcode</Label>
              <Input
                id="new-postcode"
                value={newAddress.postcode}
                onChange={(e) => setNewAddress({ ...newAddress, postcode: e.target.value })}
                placeholder="e.g. SL1 1AA"
                required={addressMode === 'new'}
                className="uppercase"
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Item {index + 1}</p>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              )}
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor={`product-${item.id}`}>Product name or description</Label>
                <Input
                  id={`product-${item.id}`}
                  value={item.product_name}
                  onChange={(e) => updateItem(item.id, 'product_name', e.target.value)}
                  placeholder="e.g. 20mm Ballast Aggregate"
                  required
                />
              </div>
              <div>
                <Label htmlFor={`qty-${item.id}`}>Quantity</Label>
                <Input
                  id={`qty-${item.id}`}
                  type="number"
                  min={1}
                  step={0.01}
                  value={item.quantity}
                  onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor={`notes-${item.id}`}>Notes (optional)</Label>
                <Input
                  id={`notes-${item.id}`}
                  value={item.notes}
                  onChange={(e) => updateItem(item.id, 'notes', e.target.value)}
                  placeholder="e.g. 25 kg bags"
                />
              </div>
            </div>
          </div>
        ))}

        <Button type="button" variant="outline" onClick={addItem} className="w-full">
          <Plus className="mr-2 h-4 w-4" />
          Add another item
        </Button>
      </div>

      <div>
        <Label htmlFor="quote-notes">Overall notes</Label>
        <Textarea
          id="quote-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Delivery instructions, preferred date, or anything else we should know."
          className="mt-2"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => router.push('/portal/quotes')}
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to quotes
        </button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit quote request
        </Button>
      </div>
    </form>
  )
}
