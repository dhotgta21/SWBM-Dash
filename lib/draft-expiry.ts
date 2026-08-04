// Draft ageing rules — single source of truth shared by the list UI and the
// cleanup_stale_draft_invoices() cron job (migration 132).
//
//   day 2  → soft warning:  "Issue it or it will be deleted"
//   day 4  → hard warning
//   day 6  → cron soft-deletes the draft into Recently deleted
//
// Age is measured from updated_at (an edited draft earns more time).

export const DRAFT_WARN_DAYS = 2
export const DRAFT_HARD_WARN_DAYS = 4
export const DRAFT_DELETE_DAYS = 6

const DAY_MS = 24 * 60 * 60 * 1000

export type DraftWarningLevel = 'none' | 'warn' | 'hard'

export interface DraftExpiryInfo {
  ageDays: number
  daysLeft: number
  level: DraftWarningLevel
}

export function getDraftExpiryInfo(
  updatedAt: string | Date,
  now: Date = new Date()
): DraftExpiryInfo {
  const updated = typeof updatedAt === 'string' ? new Date(updatedAt) : updatedAt
  const ageDays = Math.floor((now.getTime() - updated.getTime()) / DAY_MS)
  const daysLeft = Math.max(DRAFT_DELETE_DAYS - ageDays, 0)
  const level: DraftWarningLevel =
    ageDays >= DRAFT_HARD_WARN_DAYS ? 'hard' : ageDays >= DRAFT_WARN_DAYS ? 'warn' : 'none'
  return { ageDays, daysLeft, level }
}
