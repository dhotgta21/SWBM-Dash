import type { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let companyName = 'Star Hawk Builders Merchant'
  // Hard-coded, optimised description so it cannot be overridden accidentally.
  const description =
    'Building materials, aggregates, bricks, timber, blocks & more from Star Hawk Builders Merchant. Same-day delivery across Greater London & the Home Counties.'

  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('company_settings')
      .select('company_name')
      .eq('id', 1)
      .maybeSingle()
    if (data?.company_name && typeof data.company_name === 'string' && data.company_name.trim()) {
      companyName = data.company_name.trim()
    }
  } catch {
    // Fall back to defaults if admin credentials are unavailable.
  }

  return {
    name: companyName,
    short_name: 'Star Hawk',
    description,
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#16a34a',
    orientation: 'portrait-primary',
    icons: [
      {
        // Smallest of the PWA icons — kept as PNG (≤ 2.4 KB already).
        // iOS Safari and older Android render PNG manifests more
        // reliably than WebP for these tiny tiles.
        src: '/icon-48x48.png',
        sizes: '48x48',
        type: 'image/png',
      },
      {
        // 192 px home-screen icon. WebP is supported by Android 7+;
        // we keep the PNG alongside for older devices / iOS PWA.
        src: '/icon-192x192.webp',
        sizes: '192x192',
        type: 'image/webp',
      },
      {
        // 512 px splash icon for Android install + desktop PWAs.
        src: '/icon-512x512.webp',
        sizes: '512x512',
        type: 'image/webp',
      },
    ],
  }
}
