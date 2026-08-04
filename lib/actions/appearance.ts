'use server'

import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { requireCompanyEditPermission } from '@/lib/supabase/access'
import { safeActionError } from '@/lib/errors'
import {
  normalizeHex,
  DEFAULT_APPEARANCE,
  THEME_COLOR_KEYS,
  type LogoTextLayout,
  LOGO_TEXT_LAYOUTS,
} from '@/lib/appearance'
import { processLogo, restoreDefaultLogos, validateLogoFile } from '@/lib/logo-processor'

const ALLOWED_FONT_TYPES = new Set([
  'font/ttf',
  'font/otf',
  'font/woff',
  'font/woff2',
])

const MAX_FONT_SIZE_BYTES = 5 * 1024 * 1024

function getString(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

function sanitizeFontFamily(value: string | null): string | null {
  if (!value) return null
  const cleaned = value.trim().replace(/[^a-zA-Z0-9\-_.\s]/g, '').slice(0, 60)
  return cleaned || null
}

function deriveFontFamily(filename: string): string {
  const base = filename
    .replace(/\.(ttf|otf|woff|woff2)$/i, '')
    .replace(/[^a-zA-Z0-9\-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'custom-font'
  const hash = Math.random().toString(36).slice(2, 8)
  return `${base}-${hash}`
}

function validateLogoTextLayout(value: string | null): LogoTextLayout | null {
  if (!value) return null
  const valid = LOGO_TEXT_LAYOUTS.map((l) => l.value)
  return valid.includes(value as LogoTextLayout) ? (value as LogoTextLayout) : null
}

interface FontUploadResult {
  url: string
  family: string
}

async function uploadFont(
  supabase: Awaited<ReturnType<typeof createClient>>,
  file: File,
): Promise<{ success: true; result: FontUploadResult } | { success: false; error: string }> {
  if (!ALLOWED_FONT_TYPES.has(file.type)) {
    return { success: false, error: `Unsupported font type: ${file.type}. Use TTF, OTF, WOFF, or WOFF2.` }
  }
  if (file.size > MAX_FONT_SIZE_BYTES) {
    return { success: false, error: `Font must be smaller than 5 MB.` }
  }

  const extension = file.name.split('.').pop()?.toLowerCase() || 'woff2'
  const path = `fonts/${randomUUID()}.${extension}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { data, error } = await supabase.storage.from('appearance').upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  })

  if (error || !data) {
    console.error('[appearance] font upload failed:', error)
    return { success: false, error: `Could not upload font: ${error?.message || 'unknown error'}` }
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('appearance').getPublicUrl(data.path)

  return {
    success: true,
    result: {
      url: publicUrl,
      family: deriveFontFamily(file.name),
    },
  }
}

async function deleteFont(
  supabase: Awaited<ReturnType<typeof createClient>>,
  url: string | null,
): Promise<void> {
  if (!url) return
  try {
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/appearance/`
    if (!url.startsWith(base)) return
    const path = url.slice(base.length)
    await supabase.storage.from('appearance').remove([path])
  } catch (err) {
    console.warn('[appearance] failed to delete old font (non-fatal):', err)
  }
}

export async function updateAppearanceSettings(formData: FormData) {
  let requestId = 'unknown'
  try {
    requestId = randomUUID()

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return {
        error:
          'Server is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them to Vercel env, then retry.',
      }
    }

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { error: 'Not authenticated' }
    }

    const canEditCompany = await requireCompanyEditPermission(supabase, user.id)
    if (!canEditCompany) {
      return { error: 'Not authorized' }
    }

    // ── Load current settings so we can preserve fonts/logos and delete replaced files ─
    const { data: current } = await supabase
      .from('company_settings')
      .select('logo_url, primary_font_url, primary_font_family, secondary_font_url, secondary_font_family')
      .eq('id', 1)
      .maybeSingle()

    // ── Logo upload / restore ──────────────────────────────────────────────
    const removeLogo = getString(formData, 'remove_logo') === 'true'
    const logoFile = formData.get('logo')
    let logoUrl = current?.logo_url || null

    if (removeLogo) {
      const restoreResult = await restoreDefaultLogos()
      if (!restoreResult.success) {
        console.warn('[appearance] restore default logos failed:', restoreResult.error)
      }
      logoUrl = null
    } else if (logoFile instanceof File && logoFile.size > 0) {
      const validation = validateLogoFile(logoFile)
      if (!validation.ok) {
        return { error: validation.error }
      }

      const buffer = Buffer.from(await logoFile.arrayBuffer())
      const result = await processLogo(buffer, logoFile.type)
      if (!result.success) {
        return { error: result.error || 'Could not process the uploaded logo.' }
      }
      logoUrl = '/Logo.webp'
    }

    // ── Font uploads ────────────────────────────────────────────────────────
    const primaryFontFile = formData.get('primary_font')
    const secondaryFontFile = formData.get('secondary_font')

    let primaryFontUrl = current?.primary_font_url || null
    let primaryFontFamily = sanitizeFontFamily(current?.primary_font_family) || null
    let secondaryFontUrl = current?.secondary_font_url || null
    let secondaryFontFamily = sanitizeFontFamily(current?.secondary_font_family) || null

    if (primaryFontFile instanceof File && primaryFontFile.size > 0) {
      const upload = await uploadFont(supabase, primaryFontFile)
      if (!upload.success) return { error: upload.error }
      await deleteFont(supabase, current?.primary_font_url)
      primaryFontUrl = upload.result.url
      primaryFontFamily = upload.result.family
    }

    if (secondaryFontFile instanceof File && secondaryFontFile.size > 0) {
      const upload = await uploadFont(supabase, secondaryFontFile)
      if (!upload.success) return { error: upload.error }
      await deleteFont(supabase, current?.secondary_font_url)
      secondaryFontUrl = upload.result.url
      secondaryFontFamily = upload.result.family
    }

    // ── Reset to defaults ───────────────────────────────────────────────────
    const resetDefaults = getString(formData, 'reset_defaults') === 'true'

    // ── Build update object ─────────────────────────────────────────────────
    const updateData: Record<string, unknown> = {
      id: 1,
      updated_by: user.id,
    }

    if (resetDefaults) {
      updateData.logo_text_enabled = DEFAULT_APPEARANCE.logo_text_enabled
      updateData.logo_text_primary = DEFAULT_APPEARANCE.logo_text_primary
      updateData.logo_text_secondary = DEFAULT_APPEARANCE.logo_text_secondary
      updateData.logo_text_layout = DEFAULT_APPEARANCE.logo_text_layout
      updateData.primary_font_url = DEFAULT_APPEARANCE.primary_font_url
      updateData.primary_font_family = DEFAULT_APPEARANCE.primary_font_family
      updateData.secondary_font_url = DEFAULT_APPEARANCE.secondary_font_url
      updateData.secondary_font_family = DEFAULT_APPEARANCE.secondary_font_family
      for (const key of THEME_COLOR_KEYS) {
        updateData[key] = DEFAULT_APPEARANCE[key]
      }
      // Resetting appearance also restores the default brand mark and clears fonts.
      const restoreResult = await restoreDefaultLogos()
      if (!restoreResult.success) {
        console.warn('[appearance] restore default logos on reset failed:', restoreResult.error)
      }
      updateData.logo_url = null
      await deleteFont(supabase, current?.primary_font_url)
      await deleteFont(supabase, current?.secondary_font_url)
    } else {
      updateData.logo_text_enabled = getString(formData, 'logo_text_enabled') === 'true'
      updateData.logo_text_primary = getString(formData, 'logo_text_primary') || null
      updateData.logo_text_secondary = getString(formData, 'logo_text_secondary') || null
      updateData.logo_text_layout = validateLogoTextLayout(getString(formData, 'logo_text_layout')) ?? 'stacked'
      updateData.logo_url = logoUrl
      updateData.primary_font_url = primaryFontUrl
      updateData.primary_font_family = primaryFontFamily
      updateData.secondary_font_url = secondaryFontUrl
      updateData.secondary_font_family = secondaryFontFamily

      for (const key of THEME_COLOR_KEYS) {
        const raw = getString(formData, key)
        const normalized = normalizeHex(raw)
        if (raw && !normalized) {
          return { error: `Invalid colour for ${key}. Use a 3 or 6 digit hex code.` }
        }
        updateData[key] = normalized ?? DEFAULT_APPEARANCE[key]
      }
    }

    const { error } = await supabase.from('company_settings').upsert(updateData, { onConflict: 'id' })

    if (error) {
      console.error(`[appearance] company_settings upsert failed`, { requestId, error })
      const safe = safeActionError('appearance.updateAppearanceSettings', error, 'Could not save appearance settings.')
      return { error: safe }
    }

    return { success: true }
  } catch (err) {
    console.error(`[appearance] unexpected error`, { requestId, err })
    return { error: 'Something went wrong while saving appearance settings. Please try again.' }
  }
}
