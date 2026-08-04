'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getStockTakeLogs, type StockTakeLogRow } from '@/lib/actions/stock'

interface StockHistoryPanelProps {
  initialLogs: StockTakeLogRow[]
}

function sourceBadge(source: string) {
  switch (source) {
    case 'stock_take':
      return <Badge variant="info">Stock take</Badge>
    case 'opening':
      return <Badge variant="outline">Opening</Badge>
    case 'auto':
      return <Badge variant="default">Auto</Badge>
    default:
      return <Badge variant="outline">{source}</Badge>
  }
}

function formatWhen(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatQty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function actorName(row: StockTakeLogRow) {
  if (!row.changedBy) return 'System'
  return row.changedBy.full_name || row.changedBy.email || 'Unknown'
}

export function StockHistoryPanel({ initialLogs }: StockHistoryPanelProps) {
  const [logs, setLogs] = useState<StockTakeLogRow[]>(initialLogs)
  const [filter, setFilter] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleRefresh() {
    startTransition(async () => {
      const result = await getStockTakeLogs()
      if (result.error) {
        toast.error(result.error)
      } else {
        setLogs(result.logs ?? [])
      }
    })
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return logs
    return logs.filter((row) => {
      const product = row.product
        ? `${row.product.name} ${row.product.code}`.toLowerCase()
        : ''
      const actor = actorName(row).toLowerCase()
      return product.includes(q) || actor.includes(q) || row.source.toLowerCase().includes(q)
    })
  }, [logs, filter])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Stock audit</CardTitle>
            <CardDescription>
              History of every stock change — old quantity to new quantity, who changed it and when.
              Manual takes from the Stock take sub-tab are tagged “Stock take”.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleRefresh} disabled={isPending}>
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by product, code or person…"
            className="pl-9"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {logs.length === 0
              ? 'No stock changes recorded yet. Take stock from the Stock tab to start the audit trail.'
              : 'No history matches your filter.'}
          </p>
        ) : (
          <ResponsiveTable
            rows={filtered}
            keyField="id"
            renderDesktop={(rows) => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead>By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const up = row.delta > 0
                    const down = row.delta < 0
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatWhen(row.changedAt)}
                        </TableCell>
                        <TableCell>
                          {row.product ? (
                            <Link
                              href={`/admin/products/${row.product.id}/edit`}
                              className="font-medium hover:underline"
                            >
                              {row.product.name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">Deleted product</span>
                          )}
                          {row.product?.code ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {row.product.code}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>{sourceBadge(row.source)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <span className="text-muted-foreground">{formatQty(row.previousQuantity)}</span>
                          <span className="mx-1.5 text-muted-foreground">→</span>
                          <span className="font-medium">{formatQty(row.newQuantity)}</span>
                          <span
                            className={
                              'ml-2 text-xs font-medium ' +
                              (up
                                ? 'text-emerald-600'
                                : down
                                  ? 'text-destructive'
                                  : 'text-muted-foreground')
                            }
                          >
                            {up ? '+' : ''}
                            {formatQty(row.delta)}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{actorName(row)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
            renderMobile={(row) => {
              const up = row.delta > 0
              const down = row.delta < 0
              return (
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    {sourceBadge(row.source)}
                    <span className="text-xs text-muted-foreground">{formatWhen(row.changedAt)}</span>
                  </div>
                  <p className="font-medium text-foreground">
                    {row.product?.name || 'Deleted product'}
                    {row.product?.code ? (
                      <span className="ml-2 text-xs text-muted-foreground">{row.product.code}</span>
                    ) : null}
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">{formatQty(row.previousQuantity)}</span>
                    <span className="mx-1.5 text-muted-foreground">→</span>
                    <span className="font-medium">{formatQty(row.newQuantity)}</span>
                    <span
                      className={
                        'ml-2 text-xs font-medium ' +
                        (up ? 'text-emerald-600' : down ? 'text-destructive' : 'text-muted-foreground')
                      }
                    >
                      {up ? '+' : ''}
                      {formatQty(row.delta)}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">By {actorName(row)}</p>
                </div>
              )
            }}
          />
        )}
      </CardContent>
    </Card>
  )
}
