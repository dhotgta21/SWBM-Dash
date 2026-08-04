// lib/opening-hours.ts
// Convert the structured opening_hours JSONB rows into the shape
// schema.org's OpeningHoursSpecification expects. Filters out "closed"
// days so Google doesn't see "opens: empty, closes: empty" entries.

import type { OpeningHourEntry } from '@/lib/company'

const DAY_TO_SCHEMA: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

/**
 * One OpeningHoursSpecification per non-closed day. Days marked
 * `closed: true` are omitted (Google treats absence as "we don't publish
 * hours for this day", which is honest).
 */
export function toOpeningHoursSpecification(
  hours: readonly OpeningHourEntry[],
): Array<{
  '@type': 'OpeningHoursSpecification'
  dayOfWeek: string[]
  opens: string
  closes: string
}> {
  return hours
    .filter((entry) => !entry.closed && entry.open && entry.close)
    .map((entry) => {
      const dayOfWeek = DAY_TO_SCHEMA[entry.day.toLowerCase()] ?? entry.day
      return {
        '@type': 'OpeningHoursSpecification' as const,
        dayOfWeek: [dayOfWeek],
        opens: entry.open,
        closes: entry.close,
      }
    })
}

/** Human-readable short string for nav chips ("Mon–Fri 7–5 · Sat 8–12"). */
export function toOpeningHoursShort(hours: readonly OpeningHourEntry[]): string {
  const openDays = hours.filter((e) => !e.closed && e.open && e.close)
  if (openDays.length === 0) return ''

  const dayShort: Record<string, string> = {
    monday: 'Mon',
    tuesday: 'Tue',
    wednesday: 'Wed',
    thursday: 'Thu',
    friday: 'Fri',
    saturday: 'Sat',
    sunday: 'Sun',
  }

  // Group days that share the same open/close into ranges (Mon–Fri etc.).
  const groups: Array<{ days: string[]; open: string; close: string }> = []
  for (const day of openDays) {
    const existing = groups.find(
      (g) => g.open === day.open && g.close === day.close,
    )
    if (existing) {
      existing.days.push(dayShort[day.day.toLowerCase()] ?? day.day)
    } else {
      groups.push({
        days: [dayShort[day.day.toLowerCase()] ?? day.day],
        open: day.open,
        close: day.close,
      })
    }
  }

  return groups
    .map((g) => {
      const dayLabel =
        g.days.length > 1 ? `${g.days[0]}–${g.days[g.days.length - 1]}` : g.days[0]
      return `${dayLabel} ${g.open}–${g.close}`
    })
    .join(' · ')
}