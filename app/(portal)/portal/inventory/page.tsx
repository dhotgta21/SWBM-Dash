// app/(portal)/portal/inventory/page.tsx
// Client inventory tracking: what they bought and how much is left.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EyebrowChip } from '@/components/ui/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Package, AlertTriangle, Plus, ArrowRight } from 'lucide-react'
import { updateInventoryRemaining } from './actions'

export const metadata = {
  title: 'My Inventory',
}

interface InventoryRow {
  id: string
  quantity_purchased: number
  quantity_remaining: number
  reorder_threshold: number
  last_updated_at: string
  products: {
    id: string
    name: string
    code: string
    unit: string
  } | null
}

export default async function PortalInventoryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id')
    .eq('id', user.id)
    .maybeSingle()

  const clientId = profile?.client_id
  if (!clientId) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Your portal account is not linked to a customer record yet. Please contact us to finish
          setting up your account.
        </AlertDescription>
      </Alert>
    )
  }

  const { data: rows, error } = await supabase
    .from('client_inventory')
    .select(
      'id, quantity_purchased, quantity_remaining, reorder_threshold, last_updated_at, products(id, name, code, unit)'
    )
    .eq('client_id', clientId)
    .order('last_updated_at', { ascending: false })

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Could not load your inventory. Please try again later.</AlertDescription>
      </Alert>
    )
  }

  const inventory: InventoryRow[] = (rows as unknown as InventoryRow[]) ?? []
  const lowStock = inventory.filter(
    (item) => Number(item.quantity_remaining) <= Number(item.reorder_threshold)
  )

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 border-b border-border/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <EyebrowChip label="Tools" tone="info" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.7rem]">
            My inventory
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Track the materials you have bought and mark stock as it is used on site.
          </p>
        </div>
        <Link
          href="/portal/quotes/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" />
          Request a quote
        </Link>
      </header>

      {lowStock.length > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" />
              Low stock alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {lowStock.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-4">
                  <span className="font-medium">{item.products?.name ?? 'Unknown product'}</span>
                  <span className="text-muted-foreground">
                    {Number(item.quantity_remaining).toLocaleString()} {item.products?.unit ?? ''}{' '}
                    left
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {inventory.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <p className="mt-3 text-sm text-muted-foreground">
              No inventory on file yet. Once an invoice is delivered your purchased items will
              appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {inventory.map((item) => {
            const isLow = Number(item.quantity_remaining) <= Number(item.reorder_threshold)
            return (
              <Card
                key={item.id}
                className={isLow ? 'border-warning/30' : ''}
              >
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="font-semibold text-foreground">
                        {item.products?.name ?? 'Unknown product'}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {item.products?.code ?? ''}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Purchased: {Number(item.quantity_purchased).toLocaleString()}{' '}
                        {item.products?.unit ?? ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <p className="text-sm">
                        Remaining:{' '}
                        <span className={isLow ? 'font-semibold text-warning' : 'font-semibold'}>
                          {Number(item.quantity_remaining).toLocaleString()} {item.products?.unit ?? ''}
                        </span>
                      </p>
                      <form
                        action={async (formData) => {
                          'use server'
                          const remaining = Number(formData.get('remaining'))
                          await updateInventoryRemaining({
                            inventoryId: item.id,
                            quantityRemaining: remaining,
                          })
                        }}
                        className="flex items-center gap-2"
                      >
                        <Input
                          name="remaining"
                          type="number"
                          defaultValue={Number(item.quantity_remaining)}
                          min={0}
                          step={0.01}
                          className="w-28"
                        />
                        <Button type="submit" size="sm">
                          Update
                        </Button>
                      </form>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div className="flex justify-start">
        <Link
          href="/portal/tools"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
        >
          Back to tools
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
