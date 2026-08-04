// lib/about/loader.ts
// Server-only loaders for the data backing the new /about page sections:
// team, history milestones, and (via loadCompany) yard + opening hours.
// All functions return `[]` rather than throwing when the underlying
// rows are missing, so the public page always renders.

import 'server-only'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { YardSection } from '@/lib/company'

export interface TeamMember {
  id: string
  name: string
  role: string
  bio: string | null
  photoUrl: string | null
  sortOrder: number
}

export interface HistoryMilestone {
  id: string
  year: number
  title: string
  body: string
  imageUrl: string | null
  sortOrder: number
}

// 60s revalidate. Team / history changes are operator-driven and rare;
// a one-minute window keeps the public page snappy without forcing the
// operator to wait on a cache flush.
const TEAM_TTL = 60
const HISTORY_TTL = 60

async function loadTeamMembers(): Promise<TeamMember[]> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('team_members')
      .select('id, name, role, bio, photo_url, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) {
      console.warn('[about] team_members query failed:', error.message)
      return []
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      bio: row.bio ?? null,
      photoUrl: row.photo_url ?? null,
      sortOrder: row.sort_order ?? 0,
    }))
  } catch (err) {
    console.warn('[about] loadTeamMembers unexpected:', err)
    return []
  }
}

async function loadHistoryMilestones(): Promise<HistoryMilestone[]> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('history_milestones')
      .select('id, year, title, body, image_url, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('year', { ascending: true })
    if (error) {
      console.warn('[about] history_milestones query failed:', error.message)
      return []
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      year: row.year,
      title: row.title,
      body: row.body,
      imageUrl: row.image_url ?? null,
      sortOrder: row.sort_order ?? 0,
    }))
  } catch (err) {
    console.warn('[about] loadHistoryMilestones unexpected:', err)
    return []
  }
}

// Cached wrappers. Same dedupe / burst-tolerance pattern as other
// public loaders in the codebase.
export const getCachedTeamMembers = unstable_cache(
  loadTeamMembers,
  ['about-team'],
  { revalidate: TEAM_TTL, tags: ['team', 'about'] },
)

export const getCachedHistoryMilestones = unstable_cache(
  loadHistoryMilestones,
  ['about-history'],
  { revalidate: HISTORY_TTL, tags: ['history', 'about'] },
)

export type { YardSection }