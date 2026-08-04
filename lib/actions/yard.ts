'use server'

// Server actions for yard + opening-hours fields on company_settings.
// Kept separate from lib/actions/settings.ts because these specific
// fields use JSONB / different shapes than the standard settings form.

import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireCompanyEditPermission } from '@/lib/supabase/access'
import { safeActionError } from '@/lib/errors'

// Yard sections are stored as a JSONB array on company_settings.yard_sections.
// Each entry: { name: string, icon: string, blurb: string }. icon is a
// Lucide name (e.g. "ToyBrick"); see components/about/YardSection.tsx
// for the allowed list.
export async function persistYardSectionsAction(formData: FormData) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }
    if (!(await requireCompanyEditPermission(supabase, user.id))) return { error: 'Not authorized' }

    const raw = formData.get('yard_sections')
    if (typeof raw !== 'string') {
      return { error: 'Missing yard_sections payload.' }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { error: 'Invalid yard_sections JSON.' }
    }

    if (!Array.isArray(parsed)) {
      return { error: 'yard_sections must be an array.' }
    }

    const cleaned = parsed
      .map((entry) => {
        if (typeof entry !== 'object' || entry === null) return null
        const e = entry as Record<string, unknown>
        const name = typeof e.name === 'string' ? e.name.trim() : ''
        const icon = typeof e.icon === 'string' ? e.icon.trim() : ''
        const blurb = typeof e.blurb === 'string' ? e.blurb.trim() : ''
        if (!name || !icon) return null
        return { name, icon, blurb }
      })
      .filter((e): e is { name: string; icon: string; blurb: string } => e !== null)

    const { error } = await supabase
      .from('company_settings')
      .upsert({ id: 1, yard_sections: cleaned, updated_by: user.id }, { onConflict: 'id' })

    if (error) {
      return {
        error: safeActionError('yard.persistYardSections', error, 'Could not save yard sections.'),
      }
    }

    revalidateTag('about', 'default')
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Could not save yard sections.',
    }
  }
}

// Persist the structured opening_hours JSONB array (shape matches
// lib/company.ts OpeningHourEntry). The human-readable text is updated
// by updateCompanySettings; this action covers only the JSON.
export async function persistOpeningHoursAction(formData: FormData) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }
    if (!(await requireCompanyEditPermission(supabase, user.id))) return { error: 'Not authorized' }

    const raw = formData.get('opening_hours')
    if (typeof raw !== 'string') {
      return { error: 'Missing opening_hours payload.' }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { error: 'Invalid opening_hours JSON.' }
    }

    if (!Array.isArray(parsed)) {
      return { error: 'opening_hours must be an array.' }
    }

    const cleaned = parsed
      .map((entry) => {
        if (typeof entry !== 'object' || entry === null) return null
        const e = entry as Record<string, unknown>
        const day = typeof e.day === 'string' ? e.day.toLowerCase().trim() : ''
        const open = typeof e.open === 'string' ? e.open.trim() : ''
        const close = typeof e.close === 'string' ? e.close.trim() : ''
        const closed = e.closed === true || e.closed === 'true'
        const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        if (!validDays.includes(day)) return null
        return { day, open, close, closed }
      })
      .filter((e): e is { day: string; open: string; close: string; closed: boolean } => e !== null)

    const { error } = await supabase
      .from('company_settings')
      .upsert({ id: 1, opening_hours: cleaned, updated_by: user.id }, { onConflict: 'id' })

    if (error) {
      return {
        error: safeActionError('yard.persistOpeningHours', error, 'Could not save opening hours.'),
      }
    }

    revalidateTag('about', 'default')
    revalidateTag('company', 'default')
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Could not save opening hours.',
    }
  }
}