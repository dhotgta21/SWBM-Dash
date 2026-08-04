'use client'

import { formatCurrency } from '@/lib/utils'
import type { StatusBreakdownItem } from '@/lib/dashboard-types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { EmptyState } from './EmptyState'
import { ChartContainer } from './ChartContainer'
import { PieChart as PieChartIcon } from 'lucide-react'

interface StatusBreakdownProps {
  data: StatusBreakdownItem[]
}

export function StatusBreakdown({ data }: StatusBreakdownProps) {
  const activeData = data.filter((d) => d.count > 0)
  const totalAmount = data.reduce((sum, d) => sum + d.amount, 0)
  const totalCount = data.reduce((sum, d) => sum + d.count, 0)

  return (
    <Card className="h-full overflow-hidden border-border/70 p-0 shadow-none">
      <CardHeader className="border-b border-border/60 bg-gradient-to-b from-muted/40 to-transparent p-5 pb-4 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary">
            <PieChartIcon className="h-4 w-4" strokeWidth={2.25} />
          </div>
          <div>
            <CardTitle className="text-base font-semibold text-foreground">Invoice status</CardTitle>
            <CardDescription className="mt-1">Breakdown by payment state</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        {activeData.length === 0 ? (
          <EmptyState message="No invoice data yet" />
        ) : (
          <div className="space-y-5">
            <ChartContainer className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={activeData}
                    dataKey="amount"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={2}
                    stroke="var(--card)"
                    strokeWidth={2}
                  >
                    {activeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      borderColor: 'var(--border)',
                      borderRadius: 'var(--radius-lg)',
                      color: 'var(--foreground)',
                      fontSize: 12,
                    }}
                    formatter={(value, _name, props) => [
                      formatCurrency(value as number),
                      props.payload.label,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>

            <div className="space-y-2">
              {data.map((item) => {
                const share = totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0
                return (
                  <div key={item.status}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="font-medium text-foreground">{item.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.count} invoice{item.count === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                          {formatCurrency(item.amount)}
                        </span>
                        <span className="text-xs font-medium tabular-nums text-muted-foreground">
                          {share.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${share > 0 ? Math.max(2, share) : 0}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-sm">
              <span className="font-medium text-muted-foreground">Total</span>
              <div className="flex items-baseline gap-3">
                <span className="font-semibold tabular-nums text-foreground">
                  {formatCurrency(totalAmount)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {totalCount} invoice{totalCount === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}