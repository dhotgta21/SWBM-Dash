'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getTrackedProducts, updateProductStock, type TrackedProductRow } from '@/lib/actions/stock'

interface StockTakePanelProps {
  initialProducts: TrackedProductRow[]
  canEdit: boolean
}

export function StockTakePanel({ initialProducts, canEdit }: StockTakePanelProps) {
  const [products, setProducts] = useState<TrackedProductRow[]>(initialProducts)
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialProducts.map((p) => [p.id, p.stockQuantity]))
  )
  const [isPending, startTransition] = useTransition()

  async function handleSave(productId: string) {
    if (!canEdit) return
    const quantity = Math.round((quantities[productId] ?? 0) * 1000) / 1000
    if (!Number.isFinite(quantity) || quantity < 0) {
      toast.error('Stock quantity must be 0 or more.')
      return
    }

    startTransition(async () => {
      const result = await updateProductStock(productId, quantity)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Stock updated')
        setProducts((prev) =>
          prev.map((p) => (p.id === productId ? { ...p, stockQuantity: quantity } : p))
        )
      }
    })
  }

  function handleRefresh() {
    startTransition(async () => {
      const result = await getTrackedProducts()
      if (result.error) {
        toast.error(result.error)
      } else if (result.products) {
        setProducts(result.products)
        setQuantities(Object.fromEntries(result.products.map((p) => [p.id, p.stockQuantity])))
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Stock take</CardTitle>
            <CardDescription>Update quantities for tracked products.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleRefresh} disabled={isPending}>
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No products are set to track stock yet. Enable tracking on each product&apos;s Stock tab.
          </p>
        ) : (
          <ResponsiveTable
            rows={products}
            keyField="id"
            renderDesktop={(rows) => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="text-right">Current stock</TableHead>
                    <TableHead className="text-right">Reorder level</TableHead>
                    <TableHead className="text-right">New quantity</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.code}</TableCell>
                      <TableCell className="text-right">{p.stockQuantity}</TableCell>
                      <TableCell className="text-right">{p.reorderLevel}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          step={0.001}
                          className="w-28 ml-auto"
                          value={quantities[p.id]}
                          onChange={(e) =>
                            setQuantities((prev) => ({
                              ...prev,
                              [p.id]: parseFloat(e.target.value) || 0,
                            }))
                          }
                          disabled={!canEdit || isPending}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          disabled={!canEdit || isPending || Math.round((quantities[p.id] ?? 0) * 1000) / 1000 === p.stockQuantity}
                          onClick={() => handleSave(p.id)}
                        >
                          Save
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            renderMobile={(p) => (
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.code}</p>
                  </div>
                  <span className="text-sm text-muted-foreground">{p.stockQuantity} in stock</span>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={0}
                    step={0.001}
                    value={quantities[p.id]}
                    onChange={(e) =>
                      setQuantities((prev) => ({
                        ...prev,
                        [p.id]: parseFloat(e.target.value) || 0,
                      }))
                    }
                    disabled={!canEdit || isPending}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canEdit || isPending || Math.round((quantities[p.id] ?? 0) * 1000) / 1000 === p.stockQuantity}
                    onClick={() => handleSave(p.id)}
                  >
                    Save
                  </Button>
                </div>
              </div>
            )}
          />
        )}
      </CardContent>
    </Card>
  )
}
