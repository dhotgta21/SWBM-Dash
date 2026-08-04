'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useCallback, useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DeletionPasswordDialog } from '@/components/ui/DeletionPasswordDialog'
import { CampaignStatusBadge } from './CampaignStatusBadge'
import { deleteCampaign, toggleCampaignPaused, type CampaignRow } from '@/lib/actions/campaigns'
import { formatSaleDate } from '@/lib/products/sale'
import { Tag, Play, Pause, Pencil, Trash2, Search, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CampaignsListProps {
  campaigns: CampaignRow[]
  canEdit: boolean
  canDelete: boolean
}

function ScheduleSummary({ campaign }: { campaign: CampaignRow }) {
  const starts = campaign.starts_at ? formatSaleDate(campaign.starts_at) : 'Immediately'
  const ends = campaign.ends_at ? formatSaleDate(campaign.ends_at) : 'Open-ended'
  return (
    <span className="text-muted-foreground">
      {starts} → {ends}
    </span>
  )
}

type CampaignFilter = 'all' | 'live' | 'scheduled' | 'paused' | 'ended' | 'draft'

const FILTER_OPTIONS: { value: CampaignFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'paused', label: 'Paused' },
  { value: 'ended', label: 'Ended' },
  { value: 'draft', label: 'Draft' },
]

export function CampaignsList({ campaigns, canEdit, canDelete }: CampaignsListProps) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<CampaignFilter>('all')
  const [search, setSearch] = useState('')

  const handleTogglePause = useCallback(
    async (campaign: CampaignRow) => {
      if (!canEdit || togglingId === campaign.id) return
      setTogglingId(campaign.id)
      const result = await toggleCampaignPaused(campaign.id, !campaign.is_paused)
      setTogglingId(null)
      if (result.error) {
        alert(result.error)
        return
      }
      router.refresh()
    },
    [canEdit, togglingId, router]
  )

  const handleConfirmDelete = useCallback(
    async (password: string) => {
      if (!deletingId || !canDelete) return { error: 'Not authorised' }
      const result = await deleteCampaign(deletingId, password)
      if (result.error) {
        return { error: result.error }
      }
      setDeletingId(null)
      router.refresh()
      return { error: undefined }
    },
    [deletingId, canDelete, router]
  )

  const filteredCampaigns = useMemo(() => {
    let rows = campaigns
    if (filter !== 'all') {
      rows = rows.filter((c) => c.status === filter)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.label ?? '').toLowerCase().includes(q)
      )
    }
    return rows
  }, [campaigns, filter, search])

  const renderDesktop = useCallback(
    (rows: CampaignRow[]) => (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[60px]">
              <span className="sr-only">Icon</span>
            </TableHead>
            <TableHead>Campaign</TableHead>
            <TableHead>Discount</TableHead>
            <TableHead>Products</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((campaign) => (
            <TableRow
              key={campaign.id}
              className={cn(
                campaign.status === 'live' && 'bg-success/[0.03]'
              )}
            >
              <TableCell>
                <div className="p-2 bg-primary-muted rounded-lg w-fit">
                  <Tag className="w-4 h-4 text-primary" />
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{campaign.name}</span>
                  {campaign.label && (
                    <span className="text-xs text-muted-foreground">{campaign.label}</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  −{campaign.discount_percent.toFixed(campaign.discount_percent % 1 === 0 ? 0 : 2)}%
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                <div className="flex items-center gap-2">
                  {campaign.product_count ?? 0} product{(campaign.product_count ?? 0) === 1 ? '' : 's'}
                  {(campaign.ineligible_product_count ?? 0) > 0 && (
                    <span
                      title={`${campaign.ineligible_product_count} product(s) are hidden from the discount because their display mode is not Show price`}
                      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                    >
                      <AlertTriangle className="w-3 h-3" />
                      {campaign.ineligible_product_count}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <CampaignStatusBadge status={campaign.status ?? 'draft'} />
              </TableCell>
              <TableCell>
                <ScheduleSummary campaign={campaign} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleTogglePause(campaign)}
                      disabled={togglingId === campaign.id || campaign.status === 'ended'}
                      title={campaign.is_paused ? 'Resume campaign' : 'Pause campaign'}
                      className={cn(
                        'h-9 w-9',
                        campaign.is_paused
                          ? 'text-success hover:text-success hover:bg-success/10'
                          : 'text-warning hover:text-warning hover:bg-warning/10'
                      )}
                    >
                      {campaign.is_paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                      <span className="sr-only">{campaign.is_paused ? 'Resume' : 'Pause'}</span>
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      asChild
                      className="h-9 w-9"
                      title="Edit campaign"
                    >
                      <Link href={`/admin/campaigns/${campaign.id}/edit`}>
                        <Pencil className="w-4 h-4" />
                        <span className="sr-only">Edit</span>
                      </Link>
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeletingId(campaign.id)}
                      title="Delete campaign"
                      className="h-9 w-9 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    ),
    [canEdit, canDelete, togglingId, handleTogglePause]
  )

  const renderMobile = useCallback(
    (campaign: CampaignRow) => (
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="p-1.5 bg-primary-muted rounded-md w-fit shrink-0">
              <Tag className="w-4 h-4 text-primary" />
            </div>
            <p className="font-medium text-foreground truncate">{campaign.name}</p>
            <CampaignStatusBadge status={campaign.status ?? 'draft'} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            −{campaign.discount_percent.toFixed(campaign.discount_percent % 1 === 0 ? 0 : 2)}% ·{' '}
            {campaign.product_count ?? 0} product{(campaign.product_count ?? 0) === 1 ? '' : 's'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            <ScheduleSummary campaign={campaign} />
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {canEdit && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => handleTogglePause(campaign)}
              disabled={togglingId === campaign.id || campaign.status === 'ended'}
              className={cn(
                'h-9 w-9',
                campaign.is_paused
                  ? 'text-success hover:text-success hover:bg-success/10'
                  : 'text-warning hover:text-warning hover:bg-warning/10'
              )}
            >
              {campaign.is_paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </Button>
          )}
          {canEdit && (
            <Button type="button" variant="ghost" size="icon" asChild className="h-9 w-9">
              <Link href={`/admin/campaigns/${campaign.id}/edit`}>
                <Pencil className="w-4 h-4" />
              </Link>
            </Button>
          )}
          {canDelete && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setDeletingId(campaign.id)}
              className="h-9 w-9 text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    ),
    [canEdit, canDelete, togglingId, handleTogglePause]
  )

  const table = useMemo(
    () => (
      <ResponsiveTable
        rows={filteredCampaigns}
        keyField="id"
        renderDesktop={renderDesktop}
        renderMobile={renderMobile}
      />
    ),
    [campaigns, renderDesktop, renderMobile]
  )

  return (
    <>
      <div className="flex flex-col gap-3 p-4 border-b border-border sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              variant={filter === opt.value ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search campaigns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 w-full sm:w-64"
          />
        </div>
      </div>
      {filteredCampaigns.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No campaigns match the selected filter.
        </div>
      ) : (
        table
      )}
      <DeletionPasswordDialog
        open={deletingId != null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null)
        }}
        title="Delete campaign"
        description="This campaign will be moved to Recently deleted. Type your deletion password to confirm."
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}
