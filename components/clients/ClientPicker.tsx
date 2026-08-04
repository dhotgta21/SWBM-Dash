'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createQuickClientRecord } from '@/lib/actions/clients'
import { buildClientSearchFilter, sanitizeLikeTerm } from '@/lib/search'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Search, Loader2, Zap, Plus } from 'lucide-react'

export interface Client {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  company_name: string | null
  account_number: string | null
  address_line_1: string | null
  address_line_2: string | null
  town: string | null
  county: string | null
  postcode: string | null
  is_temporary?: boolean
  payment_terms_days?: number | null
}

interface ClientPickerProps {
  selectedClientId?: string | null
  onSelect: (client: Client) => void
  disabled?: boolean
}

export function ClientPicker({ selectedClientId, onSelect, disabled }: ClientPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Client[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Client | null>(null)
  const [mode, setMode] = useState<'search' | 'create'>('search')
  // Inline capture from inside an invoice/quote ALWAYS creates a temporary
  // walk-in record. Operators who need a full permanent account use the
  // dedicated /clients/new page; the inline path stays minimal so the
  // invoice is never blocked by "fill out the full form first".
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newClient, setNewClient] = useState<{
    first_name: string
    last_name: string
    phone: string
  }>({
    first_name: '',
    last_name: '',
    phone: '',
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()
  // Track the id we last notified the parent about so the fetch effect
  // only fires onSelect when the selected id actually CHANGES (the
  // parent already knows the client it passed in on mount).
  const lastNotifiedIdRef = useRef(selectedClientId)

  useEffect(() => {
    const changed = lastNotifiedIdRef.current !== selectedClientId
    lastNotifiedIdRef.current = selectedClientId
    async function fetchSelected() {
      if (!selectedClientId) return
      const { data } = await supabase
        .from('clients')
        .select('*')
        .eq('id', selectedClientId)
        .is('deleted_at', null)
        .single()
      if (data) {
        setSelected(data)
        if (changed) onSelect(data)
      }
    }
    fetchSelected()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    let cancelled = false
    let requestId = 0

    async function search() {
      const q = sanitizeLikeTerm(query)
      if (!q) {
        if (!cancelled) {
          setResults([])
          setOpen(false)
        }
        return
      }

      const currentRequestId = ++requestId
      if (!cancelled) setLoading(true)

      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .is('deleted_at', null)
        .or(buildClientSearchFilter(q))
        .order('first_name', { ascending: true })
        .limit(8)

      if (cancelled || currentRequestId !== requestId) return

      if (error) {
        // Don't show "No clients found. Create one" on a failed query —
        // that invites a duplicate quick-add on a transient DB error.
        console.error('ClientPicker: search failed', error.message)
        setResults([])
        setOpen(false)
        setLoading(false)
        return
      }

      setResults(data || [])
      setOpen(true)
      setLoading(false)
    }

    const timeout = setTimeout(search, 200)
    return () => {
      clearTimeout(timeout)
      cancelled = true
    }
  }, [query, supabase])

  function handleSelect(client: Client) {
    if (disabled) return
    setSelected(client)
    onSelect(client)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  function handleClear() {
    if (disabled) return
    setSelected(null)
    onSelect({
      id: '',
      first_name: '',
      last_name: '',
      email: null,
      phone: null,
      company_name: null,
      account_number: null,
      address_line_1: null,
      address_line_2: null,
      town: null,
      county: null,
      postcode: null,
    })
  }

  function showCreateMode() {
    setMode('create')
    setOpen(false)
    setCreateError(null)
  }

  function showSearchMode() {
    setMode('search')
    setCreateError(null)
    setNewClient({
      first_name: '',
      last_name: '',
      phone: '',
    })
  }

  function updateNewClient(field: 'first_name' | 'last_name' | 'phone', value: string) {
    setNewClient((prev) => ({ ...prev, [field]: value }))
  }

  async function handleCreateClient(e: React.MouseEvent) {
    e.preventDefault()
    if (disabled || createLoading) return

    if (!newClient.first_name.trim() || !newClient.last_name.trim()) {
      setCreateError('First and last name are required')
      return
    }

    setCreateLoading(true)
    setCreateError(null)

    const result = await createQuickClientRecord({
      first_name: newClient.first_name,
      last_name: newClient.last_name,
      phone: newClient.phone || undefined,
    })
    setCreateLoading(false)

    if (result.error || !result.client) {
      setCreateError(result.error || 'Could not save the client.')
      return
    }

    const created: Client = {
      id: result.client.id,
      first_name: result.client.first_name,
      last_name: result.client.last_name,
      email: result.client.email,
      phone: result.client.phone,
      company_name: result.client.company_name,
      account_number: result.client.account_number,
      address_line_1: result.client.address_line_1,
      address_line_2: result.client.address_line_2,
      town: result.client.town,
      county: result.client.county,
      postcode: result.client.postcode,
    }

    setSelected(created)
    onSelect(created)
    showSearchMode()
  }

  // Prevent Enter in the inline creation inputs from submitting the parent form.
  function blockEnter(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
    }
  }

  if (selected) {
    return (
      <div className="p-3 border border-gray-200 rounded-lg bg-gray-50">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-medium text-gray-900">
              {selected.first_name} {selected.last_name}
            </p>
            {selected.company_name && <p className="text-sm text-gray-500">{selected.company_name}</p>}
            {selected.phone && <p className="text-sm text-gray-500">{selected.phone}</p>}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={handleClear} disabled={disabled}>
            Change
          </Button>
        </div>
      </div>
    )
  }

  if (mode === 'create') {
    return (
      <div
        ref={containerRef}
        className="space-y-4"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
          }
        }}
      >
        {createError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {createError}
          </div>
        )}

        {/* Quick-add banner — explicit about what happens on save so the
            operator never wonders why their quick-add row lives in
            "Temporary clients" instead of the main list. */}
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <Zap className="w-4 h-4 mt-0.5 text-amber-700 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground leading-tight">Quick add · temporary</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Saved to "Temporary clients" until contact details are filled in. Promote it to a
              full account from the Clients section.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="client-picker-first_name">First Name *</Label>
            <Input
              id="client-picker-first_name"
              value={newClient.first_name}
              onChange={(e) => updateNewClient('first_name', e.target.value)}
              onKeyDown={blockEnter}
              disabled={disabled || createLoading}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-picker-last_name">Last Name *</Label>
            <Input
              id="client-picker-last_name"
              value={newClient.last_name}
              onChange={(e) => updateNewClient('last_name', e.target.value)}
              onKeyDown={blockEnter}
              disabled={disabled || createLoading}
            />
          </div>
        </div>

        <div className="space-y-2 max-w-sm">
          <Label htmlFor="client-picker-phone">Phone (recommended)</Label>
          <Input
            id="client-picker-phone"
            type="tel"
            value={newClient.phone}
            onChange={(e) => updateNewClient('phone', e.target.value)}
            onKeyDown={blockEnter}
            disabled={disabled || createLoading}
          />
        </div>

        <div className="flex flex-wrap gap-3 pt-1">
          <Button
            type="button"
            onClick={handleCreateClient}
            disabled={disabled || createLoading}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {createLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Save temporary client
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={showSearchMode}
            disabled={disabled || createLoading}
          >
            <Search className="w-4 h-4 mr-2" />
            Search Existing
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.trim() && setOpen(true)}
            placeholder="Search clients..."
            disabled={disabled}
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Loading...</div>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={showCreateMode}
          disabled={disabled}
        >
          <Plus className="w-4 h-4 mr-1" />
          New
        </Button>
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {results.map((client) => (
            <button
              key={client.id}
              type="button"
              onClick={() => handleSelect(client)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-0"
            >
              <div className="font-medium text-gray-900 flex items-center gap-2">
                {client.first_name} {client.last_name}
                {client.is_temporary && (
                  <span className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                    Temporary
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500">
                {client.company_name && `${client.company_name} · `}
                {client.phone || client.email || 'No contact'}
              </div>
            </button>
          ))}
        </div>
      )}
      {open && query.trim() && !loading && results.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-sm text-gray-500">
          <div className="flex items-start justify-between gap-3">
            <span>No clients found.</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={showCreateMode}
              disabled={disabled}
              className="text-red-700 hover:text-red-800 hover:bg-red-50 -my-2 -mr-2"
            >
              <Plus className="w-4 h-4 mr-1" />
              Create one
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
