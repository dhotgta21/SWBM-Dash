'use server'

// Server action for the social/profile links stored in
// company_settings.seo_same_as. Kept separate from the main company
// settings action so the Brand & content "Social media" tab can save
// just this field without dragging in phones, emails and bank details.

import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireCompanyEditPermission } from '@/lib/supabase/access'
import { safeActionError } from '@/lib/errors'

function normalizeText(value: string | null): string | null {
  const trimmed = (value || '').trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function updateSocialLinks(formData: FormData) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { error: 'Not authenticated' }
    }
    if (!(await requireCompanyEditPermission(supabase, user.id))) {
      return { error: 'Not authorized' }
    }

    const rawId = formData.get('id')
    const settingsId = rawId && !Number.isNaN(Number(rawId)) ? Number(rawId) : 1

    const seoSameAs = normalizeText(formData.get('seo_same_as') as string | null)

    const { error } = await supabase
      .from('company_settings')
      .upsert({ id: settingsId, seo_same_as: seoSameAs, updated_by: user.id }, { onConflict: 'id' })

    if (error) {
      return {
        error: safeActionError('social.updateSocialLinks', error, 'Could not save social media links.'),
      }
    }

    revalidateTag('company', 'default')
    revalidateTag('about', 'default')
    return { success: true }
  } catch (err) {
    console.error('updateSocialLinks error:', err)
    return {
      error: 'Something went wrong while saving social media links. Please try again.',
    }
  }
}
