'use server'

// Server actions for the About-page content (team, history) and the
// yard + opening-hours fields on company_settings. Same auth + retry
// pattern as lib/actions/settings.ts so an admin-only request against
// a partially-migrated environment degrades gracefully.

import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/supabase/access'
import { safeActionError } from '@/lib/errors'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUuid(value: string): boolean {
  return UUID_RE.test(value)
}

function normalizeText(value: string | null): string | null {
  const trimmed = (value || '').trim()
  return trimmed.length > 0 ? trimmed : null
}

// =============================================================================
// About-page basics (company narrative fields on company_settings)
// =============================================================================

export async function updateAboutPageBasics(formData: FormData) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }
    if (!(await isAdminUser(supabase, user.id))) return { error: 'Not authorized' }

    const rawFoundedYear = normalizeText(formData.get('founded_year') as string | null)
    const rawFleetSize = normalizeText(formData.get('fleet_size') as string | null)

    const rawId = formData.get('id')
    const settingsId = rawId && !Number.isNaN(Number(rawId)) ? Number(rawId) : 1

    const payload: Record<string, unknown> = {
      id: settingsId,
      yard_description: normalizeText(formData.get('yard_description') as string | null),
      opening_hours_text: normalizeText(formData.get('opening_hours_text') as string | null),
      updated_by: user.id,
    }

    if (rawFoundedYear !== null) {
      const n = Number.parseInt(rawFoundedYear, 10)
      if (Number.isFinite(n)) payload.founded_year = n
    } else {
      payload.founded_year = null
    }

    if (rawFleetSize !== null) {
      const n = Number.parseInt(rawFleetSize, 10)
      if (Number.isFinite(n)) payload.fleet_size = n
    } else {
      payload.fleet_size = null
    }

    const { error } = await supabase
      .from('company_settings')
      .upsert(payload, { onConflict: 'id' })

    if (error) {
      return {
        error: safeActionError('about.updateAboutPageBasics', error, 'Could not save About page settings.'),
      }
    }

    revalidateTag('about', 'default')
    revalidateTag('company', 'default')
    return { success: true }
  } catch (err) {
    console.error('saveAboutPageSettings error:', err)
    return {
      error: 'Something went wrong while saving About page settings.',
    }
  }
}

// =============================================================================
// Team members
// =============================================================================

export interface TeamMemberRow {
  id: string
  name: string
  role: string
  bio: string | null
  photo_url: string | null
  sort_order: number
  is_active: boolean
}

export async function listTeamMembersForAdmin(): Promise<TeamMemberRow[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const isAdmin = await isAdminUser(supabase, user.id)
  if (!isAdmin) return []

  const { data, error } = await supabase
    .from('team_members')
    .select('id, name, role, bio, photo_url, sort_order, is_active')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    console.warn('[about] listTeamMembersForAdmin:', error.message)
    return []
  }
  return (data ?? []) as TeamMemberRow[]
}

export async function upsertTeamMember(formData: FormData) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }
    if (!(await isAdminUser(supabase, user.id))) return { error: 'Not authorized' }

    const id = (formData.get('id') as string | null)?.trim() || null
    const name = (formData.get('name') as string | null)?.trim() || ''
    const role = (formData.get('role') as string | null)?.trim() || ''
    const bio = (formData.get('bio') as string | null)?.trim() || null
    const photoUrl = (formData.get('photo_url') as string | null)?.trim() || null
    const sortOrderRaw = (formData.get('sort_order') as string | null) ?? '0'
    const sortOrder = Number.parseInt(sortOrderRaw, 10) || 0
    const isActive = formData.get('is_active') === 'on'

    if (!name) return { error: 'Name is required.' }
    if (!role) return { error: 'Role is required.' }

    const payload = {
      name,
      role,
      bio,
      photo_url: photoUrl,
      sort_order: sortOrder,
      is_active: isActive,
      updated_by: user.id,
    }

    let error: { message?: string } | null = null
    if (id) {
      const result = await supabase.from('team_members').update(payload).eq('id', id)
      error = result.error
    } else {
      const result = await supabase.from('team_members').insert(payload)
      error = result.error
    }

    if (error) {
      return {
        error: safeActionError('about.upsertTeamMember', error, 'Could not save team member.'),
      }
    }

    revalidateTag('about', 'default')
    revalidateTag('team', 'default')
    return { success: true }
  } catch (err) {
    console.error('saveTeamMember error:', err)
    return {
      error: 'Something went wrong while saving the team member.',
    }
  }
}

export async function deleteTeamMember(id: string) {
  try {
    if (!isValidUuid(id)) return { error: 'Invalid team member ID.' }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }
    if (!(await isAdminUser(supabase, user.id))) return { error: 'Not authorized' }

    const { error } = await supabase.from('team_members').delete().eq('id', id)
    if (error) {
      return {
        error: safeActionError('about.deleteTeamMember', error, 'Could not delete team member.'),
      }
    }

    revalidateTag('about', 'default')
    revalidateTag('team', 'default')
    return { success: true }
  } catch (err) {
    console.error('deleteTeamMember error:', err)
    return {
      error: 'Could not delete team member.',
    }
  }
}

// =============================================================================
// History milestones
// =============================================================================

export interface HistoryMilestoneRow {
  id: string
  year: number
  title: string
  body: string
  image_url: string | null
  sort_order: number
  is_active: boolean
}

export async function listHistoryMilestonesForAdmin(): Promise<HistoryMilestoneRow[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const isAdmin = await isAdminUser(supabase, user.id)
  if (!isAdmin) return []

  const { data, error } = await supabase
    .from('history_milestones')
    .select('id, year, title, body, image_url, sort_order, is_active')
    .order('sort_order', { ascending: true })
    .order('year', { ascending: true })

  if (error) {
    console.warn('[about] listHistoryMilestonesForAdmin:', error.message)
    return []
  }
  return (data ?? []) as HistoryMilestoneRow[]
}

export async function upsertHistoryMilestone(formData: FormData) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }
    if (!(await isAdminUser(supabase, user.id))) return { error: 'Not authorized' }

    const id = (formData.get('id') as string | null)?.trim() || null
    const yearRaw = (formData.get('year') as string | null) ?? ''
    const year = Number.parseInt(yearRaw, 10)
    const title = (formData.get('title') as string | null)?.trim() || ''
    const body = (formData.get('body') as string | null)?.trim() || ''
    const imageUrl = (formData.get('image_url') as string | null)?.trim() || null
    const sortOrderRaw = (formData.get('sort_order') as string | null) ?? '0'
    const sortOrder = Number.parseInt(sortOrderRaw, 10) || 0
    const isActive = formData.get('is_active') === 'on'

    if (!Number.isFinite(year) || year < 1900 || year > 2100) {
      return { error: 'Year must be between 1900 and 2100.' }
    }
    if (!title) return { error: 'Title is required.' }
    if (!body) return { error: 'Body is required.' }

    const payload = {
      year,
      title,
      body,
      image_url: imageUrl,
      sort_order: sortOrder,
      is_active: isActive,
      updated_by: user.id,
    }

    let error: { message?: string } | null = null
    if (id) {
      const result = await supabase.from('history_milestones').update(payload).eq('id', id)
      error = result.error
    } else {
      const result = await supabase.from('history_milestones').insert(payload)
      error = result.error
    }

    if (error) {
      return {
        error: safeActionError('about.upsertHistoryMilestone', error, 'Could not save milestone.'),
      }
    }

    revalidateTag('about', 'default')
    revalidateTag('history', 'default')
    return { success: true }
  } catch (err) {
    console.error('saveHistoryMilestone error:', err)
    return {
      error: 'Something went wrong while saving the milestone.',
    }
  }
}

export async function deleteHistoryMilestone(id: string) {
  try {
    if (!isValidUuid(id)) return { error: 'Invalid milestone ID.' }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }
    if (!(await isAdminUser(supabase, user.id))) return { error: 'Not authorized' }

    const { error } = await supabase.from('history_milestones').delete().eq('id', id)
    if (error) {
      return {
        error: safeActionError('about.deleteHistoryMilestone', error, 'Could not delete milestone.'),
      }
    }

    revalidateTag('about', 'default')
    revalidateTag('history', 'default')
    return { success: true }
  } catch (err) {
    console.error('deleteHistoryMilestone error:', err)
    return {
      error: 'Could not delete milestone.',
    }
  }
}